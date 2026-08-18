import { supabaseServer } from '../../lib/supabaseClient';
import { logger } from '../../utils/logger';
import { communicationService } from '../communication/communicationService';
import { invoiceService } from '../invoiceService';
import {
  checkLimit,
  recordUsage,
  Metric,
} from '../usageService';
import type { Invoice, Customer } from '../../../shared/types';
import {
  buildInvoiceReminderEmail,
  buildOverdueReminderEmail,
  buildPaymentLinkEmail,
  buildPaymentConfirmationEmail,
  buildPaymentPromiseReminderEmail,
} from './emailTemplates';

const MAX_EMAIL_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FollowUpEmailContext {
  organizationId: string;
  customerId: string;
  invoiceId: string;
  amountPaid?: number;
  promiseDate?: string;
}

interface LoadedContext extends FollowUpEmailContext {
  customer: Customer;
  invoice: Invoice;
  businessName: string;
}

/**
 * Loads and validates all data required to send an email.
 *
 * Validation is intentionally done before checking email usage.
 * This means errors such as "invoice not found", "no email address",
 * or "DND enabled" are returned correctly instead of being hidden
 * behind a subscription error.
 */
async function loadEmailContext(
  input: FollowUpEmailContext,
): Promise<LoadedContext> {
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
    throw new Error(
      `Customer not found for invoice ${input.invoiceId}`,
    );
  }

  if (!customer.email) {
    throw new Error(
      `Customer ${customer.id} has no email address`,
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
 * Finds an active payment link for an invoice.
 */
async function resolvePaymentLinkUrl(
  organizationId: string,
  invoiceId: string,
): Promise<string | undefined> {
  try {
    const { data: existing } = await supabaseServer
      .from('payment_links')
      .select('short_url, status, expires_at')
      .eq('organization_id', organizationId)
      .eq('invoice_id', invoiceId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return undefined;
    }

    return (existing as Record<string, unknown>).short_url as
      | string
      | undefined;
  } catch (err) {
    logger.error('Failed to resolve payment link URL', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
      invoiceId,
    });

    return undefined;
  }
}

/**
 * Checks whether the organization is allowed to send an email.
 *
 * IMPORTANT:
 * This function only checks the quota before the actual send.
 * The usage record is handled after a successful send.
 */
async function checkEmailUsage(
  organizationId: string,
): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const result = await checkLimit(
    organizationId,
    Metric.emails_sent,
    1,
  );

  return {
    allowed: !result.exceeded,
    remaining: result.remaining,
    limit: result.limit,
  };
}

async function recordEmailUsage(
  organizationId: string,
): Promise<void> {
  const result = await recordUsage(
    organizationId,
    Metric.emails_sent,
    1,
  );

  if (!result) {
    throw new Error(
      'Failed to record email usage.',
    );
  }
}

/**
 * Sends an invoice reminder email.
 */
export async function sendInvoiceReminder(
  input: FollowUpEmailContext,
): Promise<void> {
  const ctx = await loadEmailContext(input);

  const { allowed } = await checkEmailUsage(input.organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending emails.',
    );
  }

  const email = buildInvoiceReminderEmail({
    customerName: ctx.customer.contactName,
    invoiceNumber: ctx.invoice.invoiceNumber,
    amountDue: ctx.invoice.amountDue,
    currency: ctx.invoice.currency,
    dueDate: ctx.invoice.dueDate,
    businessName: ctx.businessName,
  });

  await sendWithRetry(
    input.organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    email.subject,
    email.html,
    email.text,
    {
      type: 'invoice_reminder',
    },
  );
}

/**
 * Sends an overdue invoice reminder email.
 */
export async function sendOverdueReminder(
  input: FollowUpEmailContext,
): Promise<void> {
  const ctx = await loadEmailContext(input);

  const { allowed } = await checkEmailUsage(input.organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending emails.',
    );
  }

  const daysRelativeToDue = calculateDaysRelativeToDue(
    ctx.invoice.dueDate,
  );

  const email = buildOverdueReminderEmail({
    customerName: ctx.customer.contactName,
    invoiceNumber: ctx.invoice.invoiceNumber,
    amountDue: ctx.invoice.amountDue,
    currency: ctx.invoice.currency,
    dueDate: ctx.invoice.dueDate,
    businessName: ctx.businessName,
  });

  await sendWithRetry(
    input.organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    email.subject,
    email.html,
    email.text,
    {
      type: 'overdue_reminder',
      daysRelativeToDue,
    },
  );
}

/**
 * Sends a payment-link email.
 */
export async function sendPaymentLink(
  input: FollowUpEmailContext,
): Promise<void> {
  const ctx = await loadEmailContext(input);

  const { allowed } = await checkEmailUsage(input.organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending emails.',
    );
  }

  const paymentUrl = await resolvePaymentLinkUrl(
    input.organizationId,
    ctx.invoice.id,
  );

  const email = buildPaymentLinkEmail({
    customerName: ctx.customer.contactName,
    businessName: ctx.businessName,
    invoiceNumber: ctx.invoice.invoiceNumber,
    amountDue: ctx.invoice.amountDue,
    currency: ctx.invoice.currency,
    dueDate: ctx.invoice.dueDate,
    paymentLinkUrl: paymentUrl,
  });

  await sendWithRetry(
    input.organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    email.subject,
    email.html,
    email.text,
    {
      type: 'payment_link',
      paymentUrl,
    },
  );
}

/**
 * Sends a payment confirmation email.
 */
export async function sendPaymentConfirmation(
  input: FollowUpEmailContext,
): Promise<void> {
  const ctx = await loadEmailContext(input);

  const { allowed } = await checkEmailUsage(input.organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending emails.',
    );
  }

  const email = buildPaymentConfirmationEmail({
    customerName: ctx.customer.contactName,
    businessName: ctx.businessName,
    invoiceNumber: ctx.invoice.invoiceNumber,
    amountDue: input.amountPaid ?? ctx.invoice.amountDue,
    currency: ctx.invoice.currency,
    dueDate: ctx.invoice.dueDate,
  });

  await sendWithRetry(
    input.organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    email.subject,
    email.html,
    email.text,
    {
      type: 'payment_confirmation',
    },
  );
}

/**
 * Sends a payment promise reminder email.
 */
export async function sendPaymentPromiseReminder(
  input: FollowUpEmailContext,
): Promise<void> {
  const ctx = await loadEmailContext(input);

  const { allowed } = await checkEmailUsage(input.organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending emails.',
    );
  }

  const email = buildPaymentPromiseReminderEmail({
  customerName: ctx.customer.contactName,
  businessName: ctx.businessName,
  invoiceNumber: ctx.invoice.invoiceNumber,
  amountDue: ctx.invoice.amountDue,
  currency: ctx.invoice.currency,
  dueDate: ctx.invoice.dueDate,
  promiseDate: input.promiseDate,
});

  await sendWithRetry(
    input.organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    email.subject,
    email.html,
    email.text,
    {
      type: 'payment_promise_reminder',
      promiseDate: input.promiseDate,
    },
  );
}

/**
 * Sends an email with retry support.
 *
 * Usage is recorded exactly once after the email is successfully sent.
 * Failed attempts do not consume email quota.
 */
async function sendWithRetry(
  organizationId: string,
  customerId: string,
  invoiceId: string | undefined,
  subject: string,
  html: string,
  text: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= MAX_EMAIL_RETRIES;
    attempt++
  ) {
    try {
      await communicationService.sendMessage(organizationId, {
        customerId,
        invoiceId,
        channel: 'email',
        subject,
        message: html,
        metadata: {
          ...metadata,
          textContent: text,
          retryAttempt: attempt,
        },
      });

      /*
       * Only record usage after a successful send.
       *
       * This is deliberately outside the retry loop so that:
       * - 1 successful email = 1 usage
       * - 3 failed attempts = 0 usage
       */
      try {
        await recordEmailUsage(organizationId);
      } catch (usageError) {
        /*
         * The email was already successfully sent.
         * We don't want to tell the caller that the email failed
         * merely because usage accounting had an issue.
         */
        logger.error('Failed to record email usage after successful send', {
          organizationId,
          customerId,
          invoiceId,
          error:
            usageError instanceof Error
              ? usageError.message
              : String(usageError),
        });
      }

      logger.info('Email sent successfully', {
        organizationId,
        customerId,
        invoiceId,
        attempt,
      });

      return;
    } catch (err) {
      lastError = err;

      logger.warn('Email send attempt failed', {
        organizationId,
        customerId,
        invoiceId,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });

      if (attempt < MAX_EMAIL_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }

  logger.error('Email send failed after all retries', {
    organizationId,
    customerId,
    invoiceId,
    error:
      lastError instanceof Error
        ? lastError.message
        : String(lastError),
  });

  throw lastError;
}

/**
 * Calculates how many days the current date is relative to
 * the invoice due date.
 *
 * Positive value = overdue.
 * Negative value = before due date.
 * Zero = due today.
 */
function calculateDaysRelativeToDue(
  dueDate: string,
): number {
  const today = new Date();
  const due = new Date(dueDate);

  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const difference =
    today.getTime() - due.getTime();

  return Math.floor(
    difference / (1000 * 60 * 60 * 24),
  );
}