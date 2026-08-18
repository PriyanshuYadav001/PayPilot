/**
 * WhatsApp follow-up service.
 *
 * Sends WhatsApp messages for invoice reminders, overdue notices, payment links,
 * and payment promise reminders.
 *
 * All messages are dispatched through the unified communication service,
 * which records them in the communications timeline.
 *
 * Uses text-based messages rather than Meta templates.
 */

import { supabaseServer } from '../../lib/supabaseClient';
import { logger } from '../../utils/logger';
import { communicationService } from '../communication/communicationService';
import { invoiceService } from '../invoiceService';
import { checkAndRecordUsage } from '../../services/usageService';
import type { Invoice, Customer } from '../../../shared/types';

const MAX_WHATSAPP_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FollowUpWhatsAppContext {
  organizationId: string;
  customerId: string;
  invoiceId: string;
}

interface LoadedWhatsAppContext extends FollowUpWhatsAppContext {
  customer: Customer;
  invoice: Invoice;
  businessName: string;
}

/**
 * Loads and validates the invoice/customer context used by all
 * WhatsApp follow-up operations.
 */
async function loadWhatsAppContext(
  input: FollowUpWhatsAppContext,
): Promise<LoadedWhatsAppContext> {
  const invoice = await invoiceService.getInvoice(
    input.organizationId,
    input.invoiceId,
  );

  if (!invoice) {
    throw new Error(
      `Invoice ${input.invoiceId} not found in organization ${input.organizationId}`,
    );
  }

  const customer = invoice.customer;

  if (!customer) {
    throw new Error(`Customer not found for invoice ${input.invoiceId}`);
  }

  const phone = customer.whatsappNumber ?? customer.phone;

  if (!phone) {
    throw new Error(
      `Customer ${customer.id} has no WhatsApp or phone number`,
    );
  }

  if (customer.isDnd) {
    throw new Error(
      `Customer ${customer.id} has opted out of communications (Do Not Disturb)`,
    );
  }

  const { data: orgData } = await supabaseServer
    .from('organizations')
    .select('name')
    .eq('id', input.organizationId)
    .maybeSingle();

  const businessName =
    (orgData as Record<string, unknown> | null)?.name as string ??
    'PayPilot Business';

  return {
    ...input,
    customer,
    invoice,
    businessName,
  };
}

/**
 * Checks and records WhatsApp usage.
 *
 * This is intentionally kept inside the service so every WhatsApp
 * sending operation is subject to the organization's subscription limit.
 */
async function checkWhatsAppUsage(organizationId: string) {
  return checkAndRecordUsage(
    organizationId,
    'whatsapp_sent' as const,
    1,
  );
}

/**
 * Gets the amount currently due on an invoice.
 *
 * amountDue is the correct value for payment reminders because it represents
 * the outstanding amount after payments have already been applied.
 */
function getAmountDue(invoice: Invoice): number {
  const invoiceRecord = invoice as unknown as Record<string, unknown>;

  const amountDue = invoiceRecord.amountDue;

  if (typeof amountDue === 'number') {
    return amountDue;
  }

  if (typeof amountDue === 'string') {
    const parsed = Number(amountDue);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  // Fallback for older invoice objects.
  const totalAmount = invoiceRecord.totalAmount;

  if (typeof totalAmount === 'number') {
    return totalAmount;
  }

  if (typeof totalAmount === 'string') {
    const parsed = Number(totalAmount);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

/**
 * Formats an amount using Indian number formatting.
 *
 * Example:
 * 10000 -> 10,000
 * 125000 -> 1,25,000
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formats an ISO date into the human-readable format used by WhatsApp messages.
 *
 * Example:
 * 2026-08-25 -> 25 August 2026
 */
function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Finds an active payment link for an invoice.
 *
 * The service first tries the payment_links table. If the query fails
 * or no active link exists, null is returned so callers can decide
 * whether to continue without a link.
 */
async function getExistingPaymentLink(
  organizationId: string,
  invoiceId: string,
): Promise<string | null> {
  try {
    const result = await supabaseServer
      .from('payment_links')
      .select('short_url, status, expires_at')
      .eq('organization_id', organizationId)
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const data = result?.data as
      | {
          short_url?: string | null;
          status?: string | null;
          expires_at?: string | null;
        }
      | null
      | undefined;

    if (!data?.short_url) {
      return null;
    }

    if (data.status && data.status !== 'active') {
      return null;
    }

    if (data.expires_at) {
      const expiresAt = new Date(data.expires_at);

      if (
        !Number.isNaN(expiresAt.getTime()) &&
        expiresAt.getTime() <= Date.now()
      ) {
        return null;
      }
    }

    return data.short_url;
  } catch (error) {
    logger.warn('Unable to load existing payment link', {
      organizationId,
      invoiceId,
      error: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

/**
 * Attempts to find the latest payment promise for an invoice.
 *
 * This query is deliberately defensive because older deployments may not
 * have payment_promises populated yet.
 */
async function getPaymentPromiseDate(
  organizationId: string,
  invoiceId: string,
): Promise<string | null> {
  try {
    const result = await supabaseServer
      .from('payment_promises')
      .select(
        'promised_date, promise_date, promised_payment_date, payment_date, status, created_at',
      )
      .eq('organization_id', organizationId)
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const data = result?.data as
      | {
          promised_date?: string | null;
          promise_date?: string | null;
          promised_payment_date?: string | null;
          payment_date?: string | null;
          status?: string | null;
        }
      | null
      | undefined;

    if (!data) {
      return null;
    }

    if (
      data.status &&
      ['cancelled', 'canceled', 'fulfilled', 'paid'].includes(
        data.status.toLowerCase(),
      )
    ) {
      return null;
    }

    return (
      data.promised_date ??
      data.promise_date ??
      data.promised_payment_date ??
      data.payment_date ??
      null
    );
  } catch (error) {
    logger.debug?.('No payment promise found', {
      organizationId,
      invoiceId,
      error: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

/**
 * Sends an invoice reminder through WhatsApp.
 */
export async function sendInvoiceReminder(
  input: FollowUpWhatsAppContext,
): Promise<void> {
  const { organizationId } = input;

  const { allowed } = await checkWhatsAppUsage(organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending WhatsApp messages.',
    );
  }

  const ctx = await loadWhatsAppContext(input);

  const amountDue = getAmountDue(ctx.invoice);
  const formattedAmount = formatAmount(amountDue);

  const dueDate = formatDate(
    (ctx.invoice as unknown as Record<string, unknown>).dueDate as
      | string
      | undefined,
  );

  const paymentUrl = await getExistingPaymentLink(
    organizationId,
    ctx.invoice.id,
  );

  const dueDateLine = dueDate
    ? `\nPayment due date: ${dueDate}.`
    : '';

  const paymentLine = paymentUrl
    ? `\n\nPay now: ${paymentUrl}`
    : '';

  const message = `Hello ${ctx.customer.contactName},

This is a payment reminder for invoice #${ctx.invoice.invoiceNumber} amounting to ₹${formattedAmount}.${dueDateLine}${paymentLine}

Please complete the payment at your earliest convenience.

Thank you!`;

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    message,
    {
      type: 'invoice_reminder',
      amountDue,
      paymentUrl,
    },
  );
}

/**
 * Sends an overdue invoice reminder through WhatsApp.
 */
export async function sendOverdueReminder(
  input: FollowUpWhatsAppContext,
): Promise<void> {
  const { organizationId } = input;

  const { allowed } = await checkWhatsAppUsage(organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending WhatsApp messages.',
    );
  }

  const ctx = await loadWhatsAppContext(input);

  const amountDue = getAmountDue(ctx.invoice);
  const formattedAmount = formatAmount(amountDue);

  const paymentUrl = await getExistingPaymentLink(
    organizationId,
    ctx.invoice.id,
  );

  const paymentLine = paymentUrl
    ? `\n\nPay now: ${paymentUrl}`
    : '';

  const message = `Hello ${ctx.customer.contactName},

Your payment for invoice #${ctx.invoice.invoiceNumber} (₹${formattedAmount}) is overdue.${paymentLine}

Please complete the payment immediately to avoid further action.

Thank you!`;

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    message,
    {
      type: 'overdue_reminder',
      amountDue,
      paymentUrl,
    },
  );
}

/**
 * Sends an invoice payment link through WhatsApp.
 *
 * The second argument may be an actual payment URL. If it is not a URL,
 * the service treats it as a legacy/organization argument and loads the
 * active payment link from the database.
 */
export async function sendPaymentLink(
  input: FollowUpWhatsAppContext,
  paymentUrl?: string,
): Promise<void> {
  const { organizationId } = input;

  const { allowed } = await checkWhatsAppUsage(organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending WhatsApp messages.',
    );
  }

  const ctx = await loadWhatsAppContext(input);

  let resolvedPaymentUrl: string | null = null;

  if (
    paymentUrl &&
    /^https?:\/\//i.test(paymentUrl)
  ) {
    resolvedPaymentUrl = paymentUrl;
  } else {
    resolvedPaymentUrl = await getExistingPaymentLink(
      organizationId,
      ctx.invoice.id,
    );
  }

  if (!resolvedPaymentUrl) {
    throw new Error(
      `No active payment link found for invoice ${ctx.invoice.invoiceNumber}`,
    );
  }

  const amountDue = getAmountDue(ctx.invoice);
  const formattedAmount = formatAmount(amountDue);

  const message = `Hello ${ctx.customer.contactName},

Click here to pay your invoice #${ctx.invoice.invoiceNumber} (₹${formattedAmount}).

Pay securely: ${resolvedPaymentUrl}

Thank you!`;

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    message,
    {
      type: 'payment_link',
      amountDue,
      paymentUrl: resolvedPaymentUrl,
    },
  );
}

/**
 * Sends a WhatsApp message with retry handling.
 */
async function sendWithRetry(
  organizationId: string,
  customerId: string,
  invoiceId: string | undefined,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= MAX_WHATSAPP_RETRIES;
    attempt++
  ) {
    try {
      await communicationService.sendMessage(organizationId, {
        customerId,
        invoiceId,
        channel: 'whatsapp',
        message,
        metadata: {
          ...metadata,
          retryAttempt: attempt,
        },
      });

      logger.info('WhatsApp message sent successfully', {
        organizationId,
        customerId,
        attempt,
      });

      return;
    } catch (err) {
      lastError = err;

      logger.warn('WhatsApp send attempt failed', {
        organizationId,
        customerId,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });

      if (attempt < MAX_WHATSAPP_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }

  logger.error(
    'WhatsApp message send failed after all retries',
    {
      organizationId,
      customerId,
      error:
        lastError instanceof Error
          ? lastError.message
          : String(lastError),
    },
  );

  throw lastError;
}

/**
 * Sends a reminder after a customer has promised to make payment.
 */
export async function sendPaymentPromiseReminder(
  input: FollowUpWhatsAppContext,
): Promise<void> {
  const { organizationId } = input;

  const { allowed } = await checkWhatsAppUsage(organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending WhatsApp messages.',
    );
  }

  const ctx = await loadWhatsAppContext(input);

  const promiseDateRaw = await getPaymentPromiseDate(
    organizationId,
    ctx.invoice.id,
  );

  const promiseDate = formatDate(promiseDateRaw);

  const invoiceDueDate = formatDate(
    (ctx.invoice as unknown as Record<string, unknown>).dueDate as
      | string
      | undefined,
  );

  const amountDue = getAmountDue(ctx.invoice);
  const formattedAmount = formatAmount(amountDue);

  let message: string;

  if (promiseDate) {
    message = `Hello ${ctx.customer.contactName},

You promised to pay invoice #${ctx.invoice.invoiceNumber} on ${promiseDate}. We are following up because the payment is still pending.

The outstanding amount is ₹${formattedAmount}.

Please complete the payment at your earliest convenience.

Thank you!`;
  } else {
    message = `Hello ${ctx.customer.contactName},

You promised to pay invoice #${ctx.invoice.invoiceNumber}, and we are still awaiting payment.

The outstanding amount is ₹${formattedAmount}.

Please complete the payment at your earliest convenience.${invoiceDueDate ? ` The invoice due date was ${invoiceDueDate}.` : ''}

Thank you!`;
  }

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    message,
    {
      type: 'payment_promise_reminder',
      amountDue,
      promiseDate,
    },
  );
}

export const whatsappService = {
  sendInvoiceReminder,
  sendOverdueReminder,
  sendPaymentLink,
  sendPaymentPromiseReminder,
};
