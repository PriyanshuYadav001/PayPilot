import { PLAN_LIMITS } from '@shared/constants';
import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import { sendError, sendSuccess } from '../utils/response';
import { Request, Response } from 'express';

export type Metric = 'invoices_created' | 'whatsapp_sent' | 'emails_sent' | 'calls_made' | 'ai_analyses';

type UsageRecord = {
  id: string;
  organization_id: string;
  metric: Metric;
  period_start: string;
  period_end: string;
  count: number;
  created_at: string;
  updated_at: string;
};

/** Map metric to the PLAN_LIMITS property name */
const metricProperties: Record<Metric, string> = {
  invoices_created: 'maxInvoicesMonthly',
  whatsapp_sent: 'maxWhatsAppMonthly',
  emails_sent: 'maxEmailsMonthly',
  calls_made: 'maxCallsMonthly',
  ai_analyses: 'maxAiAnalysesMonthly',
};

/** Get the plan tier for an organization */
async function getPlanTier(organizationId: string): Promise<string> {
  const { data: subscription, error } = await supabaseServer
    .from('subscriptions')
    .select('plan_tier')
    .eq('organization_id', organizationId)
    .single();

  if (error || !subscription) return 'free_trial';
  return subscription.plan_tier as string;
}

/** Get the period start/end for a metric and date */
function getPeriodStartEnd(metric: Metric, now: Date): { period_start: string; period_end: string } {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periodStart = new Date(year, month - 1, 1).toISOString();
  const periodEnd = new Date(year, month, 1, 0, 0, 0).toISOString();
  return { period_start: periodStart, period_end: periodEnd };
}

/** Get plan limits for a given tier, returns the limits object */
function getPlanLimits(planTier: string) {
  const limits = PLAN_LIMITS[planTier as keyof typeof PLAN_LIMITS];
  return limits;
}

/** Check whether the organization has exceeded its usage limit for the given metric */
export async function checkLimit(
  organizationId: string,
  metric: Metric,
  count: number = 1,
): Promise<{ exceeded: boolean; remaining: number; limit: number }> {
  const now = new Date();
  const { period_start, period_end } = getPeriodStartEnd(metric, now);

  // Query usage records for this organization and metric (current and previous periods)
  const { data: records, error } = await supabaseServer
    .from('usage_records')
    .select('count')
    .eq('organization_id', organizationId)
    .eq('metric', metric);

  if (error) {
    logger.error('Usage limit check failed', { error: error.message, organizationId, metric });
    return { exceeded: true, remaining: 0, limit: 0 };
  }

  // Calculate total usage for this period by filtering records client-side
  let totalUsed = 0;
  const recordsArray = records || [];
  for (const record of recordsArray) {
    const recordPeriodStart = new Date(record.period_start);
    const recordPeriodEnd = new Date(record.period_end);
    if (recordPeriodStart >= period_start && recordPeriodEnd <= period_end) {
      totalUsed += (record as { count: number }).count;
    }
  }

  // Get the plan tier and limit
  const planTier = await getPlanTier(organizationId);
  const planLimits = getPlanLimits(planTier);
  const limitValue = planLimits
    ? (planLimits as any)[metricProperties[metric]]
    : 0;

  const remaining = Math.max(0, limitValue - totalUsed);
  const exceeded = totalUsed + count > (limitValue || 0);

  return { exceeded, remaining, limit: typeof limitValue === 'number' ? limitValue : 0 };
}

/** Record usage increment for the given metric */
export async function recordUsage(
  organizationId: string,
  metric: Metric,
  count: number = 1,
): Promise<UsageRecord | null> {
  const now = new Date();
  const { period_start, period_end } = getPeriodStartEnd(metric, now);

  // Check if there's already a record for this period
  const { data: existingRecord, error: existingError } = await supabaseServer
    .from('usage_records')
    .select('id, count')
    .eq('organization_id', organizationId)
    .eq('metric', metric)
    .gte('period_start', period_start)
    .lt('period_end', period_end)
    .single();

  if (existingError || !existingRecord) {
    // Create new record
    const { data, error } = await supabaseServer
      .from('usage_records')
      .insert({
        organization_id: organizationId,
        metric,
        period_start: period_start,
        period_end: period_end,
        count,
      })
      .select()
      .single();

    if (error) {
      logger.error('Usage record creation failed', { error: error.message, organizationId, metric });
      return null;
    }

    return data as UsageRecord;
  } else {
    // Update existing record
    const newCount = (existingRecord as { count: number }).count + count;
    const { data, error } = await supabaseServer
      .from('usage_records')
      .update({ count: newCount })
      .eq('id', existingRecord.id)
      .select()
      .single();

    if (error) {
      logger.error('Usage record update failed', { error: error.message, organizationId, metric });
      return null;
    }

    return data as UsageRecord;
  }
}

/** Get usage history for the given metric */
export async function getUsage(
  organizationId: string,
  metric: Metric,
  limit: number = 12,
): Promise<UsageRecord[]> {
  const { data, error } = await supabaseServer
    .from('usage_records')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('metric', metric)
    .order('period_start', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to get usage history', { error: error.message, organizationId, metric });
    return [];
  }

  return data as UsageRecord[];
}

/** Get remaining usage for the given metric */
export async function getRemainingUsage(
  organizationId: string,
  metric: Metric,
  includeLimit: boolean = true,
) {
  const now = new Date();
  const { period_start, period_end } = getPeriodStartEnd(metric, now);

  // Query usage records for this period
  const { data: records, error } = await supabaseServer
    .from('usage_records')
    .select('count')
    .eq('organization_id', organizationId)
    .eq('metric', metric)
    .gte('period_start', period_start)
    .lt('period_end', period_end);

  if (error) {
    logger.error('Failed to get remaining usage', { error: error.message, organizationId, metric });
    return { remaining: 0, limit: 0, used: 0, metric };
  }

  // Calculate total used
  let totalUsed = 0;
  const recordsArray = records || [];
  for (const record of recordsArray) {
    totalUsed += (record as { count: number }).count;
  }

  // Get the plan tier and limit
  const planTier = await getPlanTier(organizationId);
  const planLimits = getPlanLimits(planTier);
  const limitValue = planLimits
    ? (planLimits as any)[metricProperties[metric]]
    : 0;

  return {
    remaining: Math.max(0, limitValue - totalUsed),
    limit: typeof limitValue === 'number' ? limitValue : 0,
    used: totalUsed,
    metric,
  };
}

/** Convenience: check limit and record usage in one call */
export async function checkAndRecordUsage(
  organizationId: string,
  metric: Metric,
  count: number = 1,
) {
  const { exceeded, remaining, limit: limitValue } = await checkLimit(organizationId, metric, count);

  if (!exceeded) {
    await recordUsage(organizationId, metric, count);
  }

  return { allowed: !exceeded, remaining: remaining, limit: limitValue };
}