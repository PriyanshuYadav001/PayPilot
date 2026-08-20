/**
 * Task executor: picks up pending tasks, renders templates, dispatches
 * communications, and handles retries/completion/failure.
 *
 * Uses atomic UPDATE ... WHERE status = 'pending' for concurrency control.
 * Each worker instance can safely process tasks in parallel without double-execution.
 */

import { supabaseServer } from '../../lib/supabaseClient';
import type { Database } from '../../../types/database.types';
import { logger } from '../../utils/logger';
import { communicationService } from '../communication/communicationService';
import { renderTemplate, renderSubject, type TemplateVariables } from './templateRenderer';
import type { CommunicationChannel } from '../communication/CommunicationProvider';
import { callService } from '../calls/callService';
import { postCallProcessor } from '../calls/postCallProcessor';

const BATCH_SIZE = 50;

interface PendingTask {
  id: string;
  organization_id: string;
  invoice_id: string;
  rule_id: string | null;
  channel: string;
  scheduled_for: string;
  retry_count: number;
  max_retries: number;
  metadata: Record<string, unknown>;
}

interface InvoiceData {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_number: string;
  due_date: string;
  amount_due: number;
  currency: string;
  status: string;
  is_follow_up_active: boolean;
}

interface RuleData {
  id: string;
  template_subject: string | null;
  template_body: string;
  include_payment_link: boolean;
}

interface CustomerData {
  id: string;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  contact_name: string | null;
  company_name: string | null;
  is_dnd: boolean;
}

interface OrgData {
  id: string;
  name: string;
}

/**
 * Atomically claim a batch of pending tasks.
 * Uses UPDATE ... SET status = 'processing' WHERE status = 'pending' RETURNING *
 * to prevent double-processing across workers.
 */
async function claimPendingTasks(): Promise<PendingTask[]> {
  // First, select IDs of pending tasks that are due
  const { data: candidates, error: selectErr } = await supabaseServer
    .from('follow_up_tasks')
    .select('id')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(BATCH_SIZE);

  if (selectErr || !candidates || candidates.length === 0) {
    return [];
  }

  const claimedTasks: PendingTask[] = [];

  for (const candidate of candidates) {
    // Atomic claim: update status from pending to processing
    const { data: claimed, error: claimErr } = await supabaseServer
      .from('follow_up_tasks')
      .update({ status: 'processing' })
      .eq('id', candidate.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (!claimErr && claimed) {
      claimedTasks.push(claimed as unknown as PendingTask);
    }
  }

  return claimedTasks;
}

async function loadInvoiceData(invoiceId: string, organizationId: string): Promise<InvoiceData | null> {
  const { data, error } = await supabaseServer
    .from('invoices')
    .select('id, organization_id, customer_id, invoice_number, due_date, amount_due, currency, status, is_follow_up_active')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as InvoiceData;
}

async function loadRuleData(ruleId: string): Promise<RuleData | null> {
  const { data, error } = await supabaseServer
    .from('follow_up_rules')
    .select('id, template_subject, template_body, include_payment_link')
    .eq('id', ruleId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as RuleData;
}

async function loadCustomerData(customerId: string, organizationId: string): Promise<CustomerData | null> {
  const { data, error } = await supabaseServer
    .from('customers')
    .select('id, email, phone, whatsapp_number, contact_name, company_name, is_dnd')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as CustomerData;
}

async function loadOrgData(orgId: string): Promise<OrgData | null> {
  const { data, error } = await supabaseServer
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as OrgData;
}

async function getPaymentLinkUrl(organizationId: string, invoiceId: string): Promise<string> {
  try {
    const { data } = await supabaseServer
      .from('payment_links')
      .select('short_url')
      .eq('organization_id', organizationId)
      .eq('invoice_id', invoiceId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.short_url) return data.short_url as string;

    const { createPaymentLink } = await import('../payment/paymentService');
    const link = await createPaymentLink(organizationId, { invoiceId });
    return link.shortUrl;
  } catch {
    return '';
  }
}

async function markTaskCompleted(taskId: string): Promise<void> {
  await supabaseServer
    .from('follow_up_tasks')
    .update({
      status: 'completed',
      executed_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

async function markTaskFailed(taskId: string, errorMessage: string, retryCount: number, maxRetries: number): Promise<void> {
  const newStatus = retryCount >= maxRetries ? 'failed' : 'pending';
  const nextRetryDelay = retryCount < maxRetries
    ? Math.pow(2, retryCount) * 60 * 1000 // exponential: 1min, 2min, 4min
    : 0;

  const scheduledFor = newStatus === 'pending'
    ? new Date(Date.now() + nextRetryDelay).toISOString()
    : undefined;

  const update: Database['public']['Tables']['follow_up_tasks']['Update'] = {
    status: newStatus,
    retry_count: retryCount + 1,
    error_message: errorMessage,
  };

  if (scheduledFor) {
    update.scheduled_for = scheduledFor;
  }

  await supabaseServer
    .from('follow_up_tasks')
    .update(update)
    .eq('id', taskId);
}

async function updateInvoiceFollowUpTimestamp(invoiceId: string): Promise<void> {
  await supabaseServer
    .from('invoices')
    .update({ last_follow_up_at: new Date().toISOString() })
    .eq('id', invoiceId);
}

/**
 * Execute a single pending task: verify payment status, render template,
 * dispatch communication, and record outcome.
 */
async function executeTask(task: PendingTask): Promise<void> {
  const { organization_id: orgId, invoice_id: invoiceId, rule_id: ruleId, channel } = task;

  // 1. Load invoice
  const invoice = await loadInvoiceData(invoiceId, orgId);
  if (!invoice) {
    logger.warn(`taskExecutor: invoice ${invoiceId} not found, skipping task ${task.id}`);
    await markTaskCompleted(task.id);
    return;
  }

  // 2. Verify invoice is still unpaid
  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    logger.info(`taskExecutor: invoice ${invoice.invoice_number} is ${invoice.status}, cancelling task ${task.id}`);
    await supabaseServer
      .from('follow_up_tasks')
      .update({ status: 'cancelled' })
      .eq('id', task.id);
    return;
  }

  // 3. Load customer
  const customer = await loadCustomerData(invoice.customer_id, orgId);
  if (!customer) {
    logger.warn(`taskExecutor: customer not found for invoice ${invoiceId}, failing task ${task.id}`);
    await markTaskFailed(task.id, 'Customer not found', task.retry_count, task.max_retries);
    return;
  }

  // 4. Check DND
  if (customer.is_dnd) {
    logger.info(`taskExecutor: customer ${customer.id} is DND, skipping task ${task.id}`);
    await supabaseServer
      .from('follow_up_tasks')
      .update({ status: 'skipped' })
      .eq('id', task.id);
    return;
  }

  // 5. Load rule (optional — task may be manually created)
  let rule: RuleData | null = null;
  if (ruleId) {
    rule = await loadRuleData(ruleId);
  }

  // 6. Load org for business name
  const org = await loadOrgData(orgId);

  // 7. Resolve payment link
  const metadata = task.metadata as Record<string, unknown>;
  let paymentLinkUrl = '';
  if (rule?.include_payment_link !== false) {
    paymentLinkUrl = await getPaymentLinkUrl(orgId, invoiceId);
  }

  // 8. Build template variables
  const dueDateFormatted = new Date(invoice.due_date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const variables: TemplateVariables = {
    contactName: (customer.contact_name as string) || (metadata.customerName as string) || 'Customer',
    companyName: (org?.name as string) || (metadata.companyName as string) || 'Business',
    invoiceNumber: invoice.invoice_number,
    amount: `${invoice.currency} ${Number(invoice.amount_due).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    dueDate: dueDateFormatted,
    paymentLink: paymentLinkUrl,
  };

  // 9. Render message
  const ruleTemplateBody = rule?.template_body ?? 'Payment reminder for invoice {{invoice_number}} for {{amount}}.';
  const ruleTemplateSubject = rule?.template_subject ?? undefined;
  const renderedBody = renderTemplate(ruleTemplateBody, variables);
  const renderedSubject = renderSubject(ruleTemplateSubject, variables);

  // 10. Send communication (or initiate call)
  try {
    if (channel === 'call') {
      // Call channel: initiate call and process post-call asynchronously
      const call = await callService.createCall({
        organizationId: orgId,
        customerId: customer.id,
        invoiceId: invoice.id,
        followUpTaskId: task.id,
        to: (customer.phone as string) || '',
        scriptText: renderedBody,
        metadata: {
          followUpTaskId: task.id,
          followUpRuleId: ruleId,
          type: 'follow_up_automated',
        },
      });

      // Process the call result (fetches recording/transcript, runs AI)
      // For immediate processing — in production, this would be triggered by a webhook callback
      postCallProcessor.processCompletedCall({
        callId: call.id,
        organizationId: orgId,
        customerId: customer.id,
        invoiceId: invoice.id,
        followUpTaskId: task.id,
      }).catch((err) => {
        logger.error(`taskExecutor: post-call processing failed for call ${call.id}`, err);
      });

      await markTaskCompleted(task.id);
      await updateInvoiceFollowUpTimestamp(invoiceId);

      logger.info(`taskExecutor: call initiated for task ${task.id}`, {
        callId: call.id,
        invoiceNumber: invoice.invoice_number,
      });
    } else {
      // Email/WhatsApp: send through communication service
      await communicationService.sendMessage(orgId, {
        customerId: customer.id,
        invoiceId: invoice.id,
        channel: channel as CommunicationChannel,
        subject: renderedSubject,
        message: renderedBody,
        metadata: {
          followUpTaskId: task.id,
          followUpRuleId: ruleId,
          type: 'follow_up_automated',
        },
      });

      await markTaskCompleted(task.id);
      await updateInvoiceFollowUpTimestamp(invoiceId);

      logger.info(`taskExecutor: task ${task.id} completed`, {
        invoiceNumber: invoice.invoice_number,
        channel,
        ruleName: rule?.template_body ? 'rule-based' : 'manual',
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`taskExecutor: task ${task.id} failed`, { error: errorMsg });
    await markTaskFailed(task.id, errorMsg, task.retry_count, task.max_retries);
  }
}

/**
 * Process a batch of pending tasks. Called by the scheduler loop.
 * Returns the number of tasks processed (completed or failed permanently).
 */
export async function processPendingTasks(): Promise<number> {
  const tasks = await claimPendingTasks();
  if (tasks.length === 0) return 0;

  logger.info(`taskExecutor: processing ${tasks.length} tasks`);

  let processed = 0;
  for (const task of tasks) {
    try {
      await executeTask(task);
    } catch (err) {
      logger.error(`taskExecutor: unexpected error processing task ${task.id}`, err);
      await markTaskFailed(task.id, 'Unexpected error', task.retry_count, task.max_retries);
    }
    processed++;
  }

  return processed;
}
