/**
 * WhatsApp follow-up service.
 *
 * Sends WhatsApp messages for invoice reminders, overdue notices, payment links,
 * and payment promise reminders. All messages are dispatched through the unified
 * communication service (which records in the communications timeline).
 *
 * Uses text-based messages rather than Meta templates (templates require
 * Meta pre-approval). Template support is available via the client for
 * organizations that have approved templates.
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

async function loadWhatsAppContext(input: FollowUpWhatsAppContext): Promise<LoadedWhatsAppContext> {
  const invoice = await invoiceService.getInvoice(input.organizationId, input.invoiceId);
  if (!invoice) {
    throw new Error(`Invoice ${input.invoiceId} not found in organization ${input.organizationId}`);
  }

  const customer = invoice.customer;
  if (!customer) {
    throw new Error(`Customer not found for invoice ${input.invoiceId}`);
  }

  const phone = customer.whatsappNumber ?? customer.phone;
  if (!phone) {
    throw new Error(`Customer ${customer.id} has no WhatsApp or phone number`);
  }

  if (customer.isDnd) {
    throw new Error(`Customer ${customer.id} has opted out of communications (Do Not Disturb)`);
  }

  const { data: orgData } = await supabaseServer
    .from('organizations')
    .select('name')
    .eq('id', input.organizationId)
    .maybeSingle();

  const businessName = (orgData as Record<string, unknown> | null)?.contactName as string ?? 'PayPilot Business';

  return { ...input, customer, invoice, businessName };
}

function checkWhatsAppUsage(organizationId: string) {
  return checkAndRecordUsage(organizationId, 'whatsapp_sent' as const, 1);
}

export async function sendInvoiceReminder(input: FollowUpWhatsAppContext): Promise<void> {
  const { organizationId } = input;

  // Check WhatsApp usage limit before sending
  const { allowed } = await checkWhatsAppUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include sending WhatsApp messages.');
  }

  const ctx = await loadWhatsAppContext(input);

  const amountInr = ctx.invoice.totalAmount;
  const message = `Hello ${ctx.customer.contactName},\n\nThis is a payment reminder for invoice #${ctx.invoice.invoiceNumber} amounting to ₹${amountInr}.\n\nPlease complete the payment at your earliest convenience.\n\nThank you!`;

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    message,
    {},
  );
}

export async function sendOverdueReminder(input: FollowUpWhatsAppContext): Promise<void> {
  const { organizationId } = input;

  // Check WhatsApp usage limit before sending
  const { allowed } = await checkWhatsAppUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include sending WhatsApp messages.');
  }

  const ctx = await loadWhatsAppContext(input);

  const amountInr = ctx.invoice.totalAmount;
  const message = `Hello ${ctx.customer.contactName},\n\nYour payment for invoice #${ctx.invoice.invoiceNumber} (₹${amountInr}) is overdue.\n\nPlease complete the payment immediately to avoid further action.\n\nThank you!`;

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    message,
    {},
  );
}

export async function sendPaymentLink(input: FollowUpWhatsAppContext, paymentUrl: string): Promise<void> {
  const { organizationId } = input;

  // Check WhatsApp usage limit before sending
  const { allowed } = await checkWhatsAppUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include sending WhatsApp messages.');
  }

  const ctx = await loadWhatsAppContext(input);

  const amountInr = ctx.invoice.totalAmount;
  const message = `Hello ${ctx.customer.contactName},\n\nClick here to pay your invoice #${ctx.invoice.invoiceNumber} (₹${amountInr}): ${paymentUrl}\n\nThank you!`;

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    message,
    { paymentUrl },
  );
}

async function sendWithRetry(
  organizationId: string,
  customerId: string,
  invoiceId: string | undefined,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_WHATSAPP_RETRIES; attempt++) {
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

  logger.error('WhatsApp message send failed after all retries', {
    organizationId,
    customerId,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError;
}



export async function sendPaymentPromiseReminder(input: FollowUpWhatsAppContext): Promise<void> {
  const { organizationId } = input;

  // Check WhatsApp usage limit before sending
  const { allowed } = await checkWhatsAppUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include sending WhatsApp messages.');
  }

  const ctx = await loadWhatsAppContext(input);

  const message = `Hello ${ctx.customer.contactName},

Your payment was promised and is now due.

Please complete the payment to keep your account in good standing.

Thank you!`;

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    message,
    {},
  );
}
export const whatsappService = {
  sendInvoiceReminder,
  sendOverdueReminder,
  sendPaymentLink,
  sendPaymentPromiseReminder,
}
