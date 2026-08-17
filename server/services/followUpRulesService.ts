import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import type { FollowUpRule, FollowUpTask } from '../../shared/types';

export class FollowUpRuleError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'FollowUpRuleError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface FollowUpRuleRow {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  days_relative_to_due: number;
  channel: string;
  template_subject: string | null;
  template_body: string;
  template_id_external: string | null;
  escalation_priority: number;
  include_payment_link: boolean;
  include_qr_code: boolean;
  created_at: string;
  updated_at: string;
}

function mapRule(row: FollowUpRuleRow): FollowUpRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    isActive: row.is_active,
    daysRelativeToDue: row.days_relative_to_due,
    channel: row.channel as FollowUpRule['channel'],
    templateSubject: row.template_subject ?? undefined,
    templateBody: row.template_body,
    templateIdExternal: row.template_id_external ?? undefined,
    escalationPriority: row.escalation_priority,
    includePaymentLink: row.include_payment_link,
    includeQrCode: row.include_qr_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface RuleListParams {
  page: number;
  limit: number;
  isActive?: 'true' | 'false';
  channel?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface RuleListResult {
  rules: FollowUpRule[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  name: 'name',
  days_relative_to_due: 'days_relative_to_due',
  escalation_priority: 'escalation_priority',
  created_at: 'created_at',
};

export async function listRules(organizationId: string, params: RuleListParams): Promise<RuleListResult> {
  const { page, limit, isActive, channel, sortBy, sortOrder } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseServer
    .from('follow_up_rules')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId);

  if (isActive !== undefined) {
    query = query.eq('is_active', isActive === 'true');
  }
  if (channel) {
    query = query.eq('channel', channel);
  }

  const sortColumn = SORTABLE_COLUMNS[sortBy] ?? 'escalation_priority';
  query = query.order(sortColumn, { ascending: sortOrder === 'asc' });
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    logger.error('listRules failed', error.message);
    throw new FollowUpRuleError('Failed to list follow-up rules.', 'RULE_LIST_FAILED', 500);
  }

  const rows = (data ?? []) as FollowUpRuleRow[];
  return {
    rules: rows.map(mapRule),
    totalCount: count ?? rows.length,
    page,
    limit,
    totalPages: Math.ceil((count ?? rows.length) / limit),
  };
}

export async function getRule(organizationId: string, ruleId: string): Promise<FollowUpRule | null> {
  const { data, error } = await supabaseServer
    .from('follow_up_rules')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', ruleId)
    .maybeSingle();

  if (error) {
    logger.error('getRule failed', error.message);
    throw new FollowUpRuleError('Failed to load follow-up rule.', 'RULE_READ_FAILED', 500);
  }

  return data ? mapRule(data as FollowUpRuleRow) : null;
}

export async function createRule(
  organizationId: string,
  input: {
    name: string;
    daysRelativeToDue: number;
    channel: string;
    templateSubject?: string;
    templateBody: string;
    templateIdExternal?: string;
    escalationPriority?: number;
    includePaymentLink?: boolean;
    includeQrCode?: boolean;
    isActive?: boolean;
  },
): Promise<FollowUpRule> {
  const { data, error } = await supabaseServer
    .from('follow_up_rules')
    .insert({
      organization_id: organizationId,
      name: input.name,
      is_active: input.isActive ?? true,
      days_relative_to_due: input.daysRelativeToDue,
      channel: input.channel,
      template_subject: input.templateSubject ?? null,
      template_body: input.templateBody,
      template_id_external: input.templateIdExternal ?? null,
      escalation_priority: input.escalationPriority ?? 1,
      include_payment_link: input.includePaymentLink ?? true,
      include_qr_code: input.includeQrCode ?? true,
    })
    .select('*')
    .single();

  if (error) {
    logger.error('createRule failed', error.message);
    throw new FollowUpRuleError('Failed to create follow-up rule.', 'RULE_CREATE_FAILED', 500);
  }

  return mapRule(data as FollowUpRuleRow);
}

export async function updateRule(
  organizationId: string,
  ruleId: string,
  input: Partial<{
    name: string;
    daysRelativeToDue: number;
    channel: string;
    templateSubject: string | null;
    templateBody: string;
    templateIdExternal: string | null;
    escalationPriority: number;
    includePaymentLink: boolean;
    includeQrCode: boolean;
    isActive: boolean;
  }>,
): Promise<FollowUpRule | null> {
  const dbInput: Record<string, unknown> = {};
  if (input.name !== undefined) dbInput.name = input.name;
  if (input.daysRelativeToDue !== undefined) dbInput.days_relative_to_due = input.daysRelativeToDue;
  if (input.channel !== undefined) dbInput.channel = input.channel;
  if (input.templateSubject !== undefined) dbInput.template_subject = input.templateSubject;
  if (input.templateBody !== undefined) dbInput.template_body = input.templateBody;
  if (input.templateIdExternal !== undefined) dbInput.template_id_external = input.templateIdExternal;
  if (input.escalationPriority !== undefined) dbInput.escalation_priority = input.escalationPriority;
  if (input.includePaymentLink !== undefined) dbInput.include_payment_link = input.includePaymentLink;
  if (input.includeQrCode !== undefined) dbInput.include_qr_code = input.includeQrCode;
  if (input.isActive !== undefined) dbInput.is_active = input.isActive;

  if (Object.keys(dbInput).length === 0) return null;

  const { data, error } = await supabaseServer
    .from('follow_up_rules')
    .update(dbInput)
    .eq('organization_id', organizationId)
    .eq('id', ruleId)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('updateRule failed', error.message);
    throw new FollowUpRuleError('Failed to update follow-up rule.', 'RULE_UPDATE_FAILED', 500);
  }

  return data ? mapRule(data as FollowUpRuleRow) : null;
}

export async function deleteRule(organizationId: string, ruleId: string): Promise<FollowUpRule | null> {
  const { data, error } = await supabaseServer
    .from('follow_up_rules')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', ruleId)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('deleteRule failed', error.message);
    throw new FollowUpRuleError('Failed to delete follow-up rule.', 'RULE_DELETE_FAILED', 500);
  }

  return data ? mapRule(data as FollowUpRuleRow) : null;
}

export const followUpRulesService = {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
};
