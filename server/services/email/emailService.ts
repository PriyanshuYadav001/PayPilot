import { supabaseServer } from '../../lib/supabaseClient';
import { logger } from '../../utils/logger';
import { communicationService } from '../communication/communicationService';
import { invoiceService } from '../invoiceService';
import { checkAndRecordUsage, Metric } from '../../services/usageService';
import type { Invoice, Customer } from '../../../shared/types';
import {
  buildInvoiceReminderEmail,
  buildOverdueReminderEmail,
  buildPaymentLinkEmail,
  buildPaymentConfirmationEmail,
  buildPaymentPromiseReminderEmail,
  type EmailTemplateData,
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
}

interface LoadedContext extends FollowUpEmailContext {
  customer: Customer;
  invoice: Invoice;
  businessName: string;
}

async function loadEmailContext(input: FollowUpEmailContext): Promise<LoadedContext> {
  const invoice = await invoiceService.getInvoice(input.organizationId, input.invoiceId);
  if (!invoice) {
    throw new Error(`Invoice ${input.invoiceId} not found in organization ${input.organizationId}`);
  }

  const customer = invoice.customer;
  if (!customer) {
    throw new Error(`Customer not found for invoice ${input.invoiceId}`);
  }

  if (!customer.email) {
    throw new Error(`Customer ${customer.id} has no email address`);
  }

  if (customer.isDnd) {
    throw new Error(`Customer ${customer.id} has opted out of communications (Do Not Disturb)`);
  }

  const { data: orgData } = await supabaseServer
    .from('organizations')
    .select('name')
    .eq('id', input.organizationId)
    .maybeSingle();

  const businessName = (orgData as Record<string, unknown> | null)?.name as string ?? 'PayPilot Business';

  return {
    ...input,
    customer,
    invoice,
    businessName,
  };
}

async function resolvePaymentLinkUrl(organizationId: string, invoiceId: string): Promise<string | undefined> {
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

    return (existing as Record<string, unknown>).short_url as string;
  } catch (err) {
    logger.error('Failed to resolve payment link URL', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
      invoiceId,
    });
    return undefined;
  }
}

async function canSendEmails(
  organizationId: string,
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  return await checkAndRecordUsage(
    organizationId,
    Metric.emails_sent,
    1,
  );
}

// Check if the organization has remaining email quota before sending
async function checkEmailUsage(
  organizationId: string,
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  return await checkAndRecordUsage(
    organizationId,
    Metric.emails_sent,
    1,
  );
}

export async function sendInvoiceReminder(input: FollowUpEmailContext): Promise<void> {
  const { organizationId } = input;

  // Check email usage limit before sending
  const { allowed } = await checkEmailUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include sending emails.');
  }

  const ctx = await loadEmailContext(input);
  const email = buildInvoiceReminderEmail({
    customerName: ctx.customer.contactName,
    invoiceNumber: ctx.invoice.invoiceNumber,
    amountDue: ctx.invoice.amountDue,
    currency: ctx.invoice.currency,
    dueDate: ctx.invoice.dueDate,
    businessName: ctx.businessName,
  });

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    email.subject,
    email.html,
    email.text,
    {},
  );
}

export async function sendOverdueReminder(input: FollowUpEmailContext): Promise<void> {
  const { organizationId } = input;

  // Check email usage limit before sending
  const { allowed } = await checkEmailUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include sending emails.');
  }

  const ctx = await loadEmailContext(input);
  const email = buildOverdueReminderEmail({
    customerName: ctx.customer.contactName,
    invoiceNumber: ctx.invoice.invoiceNumber,
    amountDue: ctx.invoice.amountDue,
    currency: ctx.invoice.currency,
    dueDate: ctx.invoice.dueDate,
    businessName: ctx.businessName,
  });

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    email.subject,
    email.html,
    email.text,
    {},
  );
}

export async function sendPaymentLink(input: FollowUpEmailContext): Promise<void> {
  const { organizationId } = input;

  // Check email usage limit before sending
  const { allowed } = await checkEmailUsage(organizationId);
  if (!allowed) {
    throw new Error('Plan limit reached: Your subscription does not include sending emails.');
  }

  const ctx = await loadEmailContext(input);
  const paymentUrl = await resolvePaymentLinkUrl(organizationId, ctx.invoice.id);

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
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    email.subject,
    email.html,
    email.text,
    { paymentUrl },
  );
}

export async function sendPaymentPromiseReminder(input: FollowUpEmailContext): Promise<void> {
  const { organizationId } = input;

  const { allowed } = await checkEmailUsage(organizationId);

  if (!allowed) {
    throw new Error(
      'Plan limit reached: Your subscription does not include sending emails.',
    );
  }

  const ctx = await loadEmailContext(input);

  const email = buildPaymentPromiseReminderEmail({
    customerName: ctx.customer.contactName,
    businessName: ctx.businessName,
    invoiceNumber: ctx.invoice.invoiceNumber,
    amountDue: ctx.invoice.amountDue,
    currency: ctx.invoice.currency,
    dueDate: ctx.invoice.dueDate,
  });

  await sendWithRetry(
    organizationId,
    ctx.customer.id,
    ctx.invoice.id,
    email.subject,
    email.html,
    email.text,
    {},
  );
}

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

  for (let attempt = 1; attempt <= MAX_EMAIL_RETRIES; attempt++) {
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

      logger.info('Email sent successfully', {
        organizationId,
        customerId,
        attempt,
      });
      return;
    } catch (err) {
      lastError = err;
      logger.warn('Email send attempt failed', {
        organizationId,
        customerId,
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
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError;
}