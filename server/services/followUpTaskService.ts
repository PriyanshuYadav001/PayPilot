import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type { FollowUpTask, FollowUpRule, Invoice, Customer } from '../../shared/types';

export interface FollowUpTaskListItem extends FollowUpTask {
  invoiceNumber: string;
  customerName: string;
  ruleName?: string;
}

export interface FollowUpTaskListParams {
  page: number;
  limit: number;
  status?: string;
  invoiceId?: string;
  sortOrder: 'asc' | 'desc';
}

export interface FollowUpTaskListResult {
  tasks: FollowUpTaskListItem[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

function mapTask(row: Record<string, unknown>): FollowUpTaskListItem {
  const invoice = row.invoice as (Pick<Invoice, 'invoiceNumber'> & { customer?: Pick<Customer, 'companyName' | 'contactName'> }) | undefined;
  const rule = row.rule as Pick<FollowUpRule, 'name'> | undefined;
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    invoiceId: row.invoice_id as string,
    ruleId: (row.rule_id as string | null) ?? undefined,
    channel: row.channel as FollowUpTask['channel'],
    scheduledFor: row.scheduled_for as string,
    executedAt: (row.executed_at as string | null) ?? undefined,
    status: row.status as FollowUpTask['status'],
    retryCount: Number(row.retry_count),
    maxRetries: Number(row.max_retries),
    errorMessage: (row.error_message as string | null) ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    invoiceNumber: invoice?.invoiceNumber ?? '',
    customerName: invoice?.customer?.companyName ?? invoice?.customer?.contactName ?? '',
    ruleName: rule?.name,
  };
}

export async function listFollowUpTasks(
  organizationId: string,
  params: FollowUpTaskListParams,
): Promise<FollowUpTaskListResult> {
  const from = (params.page - 1) * params.limit;
  const to = from + params.limit - 1;
  let query = supabaseServer
    .from('follow_up_tasks')
    .select('*, invoice:invoices(invoice_number, customer:customers(company_name, contact_name)), rule:follow_up_rules(name)', { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('scheduled_for', { ascending: params.sortOrder === 'asc' })
    .range(from, to);

  if (params.status) query = query.eq('status', params.status as 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'skipped');
  if (params.invoiceId) query = query.eq('invoice_id', params.invoiceId);

  const { data, error, count } = await query;
  if (error) {
    logger.error('listFollowUpTasks failed', error.message);
    throw new Error('Failed to list follow-up tasks.');
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const totalCount = count ?? rows.length;
  return {
    tasks: rows.map(mapTask),
    totalCount,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(totalCount / params.limit),
  };
}
