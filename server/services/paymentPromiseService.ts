import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type { PaymentPromise, PromiseStatus } from '../../shared/types';

export class PaymentPromiseError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'PaymentPromiseError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface PromiseRow {
  id: string;
  organization_id: string;
  invoice_id: string;
  customer_id: string;
  communication_id: string | null;
  promised_date: string;
  promised_amount: number | null;
  confidence_score: number | null;
  status: string;
  source: string;
  ai_extracted_quote: string | null;
  notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapPromise(row: PromiseRow): PaymentPromise {
  return {
    id: row.id,
    organizationId: row.organization_id,
    invoiceId: row.invoice_id,
    customerId: row.customer_id,
    communicationId: row.communication_id ?? undefined,
    promisedDate: row.promised_date,
    promisedAmount: row.promised_amount ?? undefined,
    confidenceScore: row.confidence_score ?? undefined,
    status: row.status as PromiseStatus,
    source: row.source as PaymentPromise['source'],
    aiExtractedQuote: row.ai_extracted_quote ?? undefined,
    notes: row.notes ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface PromiseListParams {
  page: number;
  limit: number;
  status?: string;
  customerId?: string;
  invoiceId?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface PromiseListResult {
  promises: PaymentPromise[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  promised_date: 'promised_date',
  created_at: 'created_at',
  status: 'status',
};

export async function listPromises(organizationId: string, params: PromiseListParams): Promise<PromiseListResult> {
  const { page, limit, status, customerId, invoiceId, sortBy, sortOrder } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseServer
    .from('payment_promises')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId);

  if (status) query = query.eq('status', status as 'pending' | 'fulfilled' | 'missed' | 'cancelled');
  if (customerId) query = query.eq('customer_id', customerId);
  if (invoiceId) query = query.eq('invoice_id', invoiceId);

  const sortColumn = SORTABLE_COLUMNS[sortBy] ?? 'promised_date';
  query = query.order(sortColumn, { ascending: sortOrder === 'asc' });
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    logger.error('listPromises failed', error.message);
    throw new PaymentPromiseError('Failed to list payment promises.', 'PROMISE_LIST_FAILED', 500);
  }

  const rows = (data ?? []) as PromiseRow[];
  return {
    promises: rows.map(mapPromise),
    totalCount: count ?? rows.length,
    page,
    limit,
    totalPages: Math.ceil((count ?? rows.length) / limit),
  };
}

export async function getPromise(organizationId: string, promiseId: string): Promise<PaymentPromise | null> {
  const { data, error } = await supabaseServer
    .from('payment_promises')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', promiseId)
    .maybeSingle();

  if (error) {
    logger.error('getPromise failed', error.message);
    throw new PaymentPromiseError('Failed to load payment promise.', 'PROMISE_READ_FAILED', 500);
  }

  return data ? mapPromise(data as PromiseRow) : null;
}

export async function createPromise(
  organizationId: string,
  input: {
    invoiceId: string;
    customerId: string;
    promisedDate: string;
    promisedAmount?: number;
    source?: string;
    notes?: string;
    communicationId?: string;
    confidenceScore?: number;
    aiExtractedQuote?: string;
  },
): Promise<PaymentPromise> {
  const { data, error } = await supabaseServer
    .from('payment_promises')
    .insert({
      organization_id: organizationId,
      invoice_id: input.invoiceId,
      customer_id: input.customerId,
      promised_date: input.promisedDate,
      promised_amount: input.promisedAmount ?? undefined,
      source: (input.source ?? 'manual') as 'manual' | 'ai_extracted' | 'customer_portal' | 'webhook',
      notes: input.notes ?? undefined,
      communication_id: input.communicationId ?? undefined,
      confidence_score: input.confidenceScore ?? undefined,
      ai_extracted_quote: input.aiExtractedQuote ?? undefined,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    logger.error('createPromise failed', error.message);
    throw new PaymentPromiseError('Failed to create payment promise.', 'PROMISE_CREATE_FAILED', 500);
  }

  return mapPromise(data as PromiseRow);
}

export async function updatePromise(
  organizationId: string,
  promiseId: string,
  input: Partial<{
    status: PromiseStatus;
    promisedDate: string;
    promisedAmount: number;
    notes: string;
    resolvedAt: string;
  }>,
): Promise<PaymentPromise | null> {
  const dbInput: Record<string, unknown> = {};
  if (input.status !== undefined) dbInput.status = input.status;
  if (input.promisedDate !== undefined) dbInput.promised_date = input.promisedDate;
  if (input.promisedAmount !== undefined) dbInput.promised_amount = input.promisedAmount;
  if (input.notes !== undefined) dbInput.notes = input.notes;
  if (input.resolvedAt !== undefined) dbInput.resolved_at = input.resolvedAt;

  if (Object.keys(dbInput).length === 0) return null;

  const { data, error } = await supabaseServer
    .from('payment_promises')
    .update(dbInput)
    .eq('organization_id', organizationId)
    .eq('id', promiseId)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('updatePromise failed', error.message);
    throw new PaymentPromiseError('Failed to update payment promise.', 'PROMISE_UPDATE_FAILED', 500);
  }

  return data ? mapPromise(data as PromiseRow) : null;
}

export async function deletePromise(organizationId: string, promiseId: string): Promise<PaymentPromise | null> {
  const { data, error } = await supabaseServer
    .from('payment_promises')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', promiseId)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('deletePromise failed', error.message);
    throw new PaymentPromiseError('Failed to delete payment promise.', 'PROMISE_DELETE_FAILED', 500);
  }

  return data ? mapPromise(data as PromiseRow) : null;
}

/**
 * Find the most recent pending promise for a given invoice.
 * Used by the transcript analyzer to decide whether to create or update.
 */
export async function findPendingPromiseForInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<PaymentPromise | null> {
  const { data, error } = await supabaseServer
    .from('payment_promises')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('invoice_id', invoiceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('findPendingPromiseForInvoice failed', error.message);
    return null;
  }

  return data ? mapPromise(data as PromiseRow) : null;
}

/**
 * Check for missed promises: active promises whose promised_date has passed
 * without a verified payment. Marks them as 'missed', creates follow-up tasks,
 * and continues the collection workflow.
 *
 * Prevents duplicate tasks by checking for existing tasks on the same invoice+date.
 * Returns the number of promises marked as missed.
 */
export async function checkMissedPromises(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];

  // Find all pending promises whose date has passed
  const { data: missedPromises, error: queryErr } = await supabaseServer
    .from('payment_promises')
    .select('*')
    .eq('status', 'pending')
    .lt('promised_date', today);

  if (queryErr) {
    logger.error('checkMissedPromises: query failed', queryErr.message);
    return 0;
  }

  const promises = (missedPromises ?? []) as PromiseRow[];
  if (promises.length === 0) return 0;

  let missedCount = 0;

  for (const promise of promises) {
    // Verify no payment has been received since the promise was made
    const { data: payments } = await supabaseServer
      .from('payments')
      .select('id')
      .eq('invoice_id', promise.invoice_id)
      .eq('status', 'successful')
      .gte('created_at', promise.created_at)
      .limit(1);

    if (payments && payments.length > 0) {
      // Payment received — mark promise as fulfilled instead
      await supabaseServer
        .from('payment_promises')
        .update({ status: 'fulfilled', resolved_at: new Date().toISOString() })
        .eq('id', promise.id);
      continue;
    }

    // Mark promise as missed
    const { error: updateErr } = await supabaseServer
      .from('payment_promises')
      .update({ status: 'missed', resolved_at: new Date().toISOString() })
      .eq('id', promise.id);

    if (updateErr) {
      logger.error(`checkMissedPromises: failed to mark promise ${promise.id} as missed`, updateErr.message);
      continue;
    }

    // Check for duplicate follow-up task on same invoice+date
    const { data: existingTask } = await supabaseServer
      .from('follow_up_tasks')
      .select('id')
      .eq('organization_id', promise.organization_id)
      .eq('invoice_id', promise.invoice_id)
      .gte('created_at', today)
      .maybeSingle();

    if (existingTask) continue;

    // Create a follow-up task to continue collection
    const { error: taskErr } = await supabaseServer
      .from('follow_up_tasks')
      .insert({
        organization_id: promise.organization_id,
        invoice_id: promise.invoice_id,
        rule_id: undefined,
        channel: 'email',
        scheduled_for: new Date().toISOString(),
        status: 'pending',
        retry_count: 0,
        max_retries: 3,
        metadata: {
          type: 'missed_payment_promise',
          promiseId: promise.id,
          promisedDate: promise.promised_date,
          promisedAmount: promise.promised_amount,
        },
      });

    if (taskErr) {
      logger.error(`checkMissedPromises: failed to create follow-up task for promise ${promise.id}`, taskErr.message);
      continue;
    }

    missedCount++;
    logger.info(`checkMissedPromises: marked promise ${promise.id} as missed, created follow-up task`, {
      organizationId: promise.organization_id,
      invoiceId: promise.invoice_id,
      promisedDate: promise.promised_date,
    });
  }

  return missedCount;
}

export const paymentPromiseService = {
  listPromises,
  getPromise,
  createPromise,
  updatePromise,
  deletePromise,
  findPendingPromiseForInvoice,
  checkMissedPromises,
};
