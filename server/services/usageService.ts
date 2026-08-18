import { PLAN_LIMITS } from '@shared/constants';
import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';

export enum Metric {
  invoices_created = 'invoices_created',
  whatsapp_sent = 'whatsapp_sent',
  emails_sent = 'emails_sent',
  calls_made = 'calls_made',
  ai_analyses = 'ai_analyses',
}

export type MetricType = `${Metric}`;

export type UsageRecord = {
  id: string;
  organization_id: string;
  metric: MetricType;
  period_start: string;
  period_end: string;
  count: number;
  created_at: string;
  updated_at: string;
};

const metricProperties: Record<MetricType, string> = {
  [Metric.invoices_created]: 'maxInvoicesMonthly',
  [Metric.whatsapp_sent]: 'maxWhatsAppMonthly',
  [Metric.emails_sent]: 'maxEmailsMonthly',
  [Metric.calls_made]: 'maxCallsMonthly',
  [Metric.ai_analyses]: 'maxAiAnalysesMonthly',
};

/**
 * Get the current subscription plan for an organization.
 */
async function getPlanTier(
  organizationId: string,
): Promise<string> {
  const { data: subscription, error } = await supabaseServer
    .from('subscriptions')
    .select('plan_tier')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !subscription) {
    return 'free_trial';
  }

  return subscription.plan_tier as string;
}

/**
 * Get the current monthly usage period.
 *
 * UTC is used so the application behaves consistently
 * regardless of the server's local timezone.
 */
function getPeriodStartEnd(
  _metric: MetricType,
  now: Date,
): {
  period_start: string;
  period_end: string;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const periodStart = new Date(
    Date.UTC(year, month, 1, 0, 0, 0, 0),
  );

  const periodEnd = new Date(
    Date.UTC(year, month + 1, 1, 0, 0, 0, 0),
  );

  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
  };
}

/**
 * Get the limits configured for a plan.
 */
function getPlanLimits(planTier: string) {
  return PLAN_LIMITS[
    planTier as keyof typeof PLAN_LIMITS
  ];
}

/**
 * Get the numeric limit for a particular metric.
 */
function getMetricLimit(
  planTier: string,
  metric: MetricType,
): number {
  const planLimits = getPlanLimits(planTier);

  if (!planLimits) {
    return 0;
  }

  const propertyName = metricProperties[metric];

  const value = (
    planLimits as Record<string, unknown>
  )[propertyName];

  return typeof value === 'number' ? value : 0;
}

/**
 * Check whether an organization can consume additional usage.
 *
 * IMPORTANT:
 * This function ONLY checks the limit.
 * It does NOT record usage.
 */
export async function checkLimit(
  organizationId: string,
  metric: MetricType,
  count: number = 1,
): Promise<{
  exceeded: boolean;
  remaining: number;
  limit: number;
}> {
  if (count <= 0) {
    throw new Error(
      'Usage count must be greater than zero.',
    );
  }

  const now = new Date();

  const {
    period_start,
    period_end,
  } = getPeriodStartEnd(metric, now);

  const { data: records, error } = await supabaseServer
    .from('usage_records')
    .select(
      'count, period_start, period_end',
    )
    .eq('organization_id', organizationId)
    .eq('metric', metric)
    .gte('period_start', period_start)
    .lt('period_start', period_end);

  if (error) {
    logger.error('Usage limit check failed', {
      error: error.message,
      organizationId,
      metric,
    });

    /*
     * Fail closed.
     *
     * If usage cannot be verified, do not allow
     * additional usage.
     */
    return {
      exceeded: true,
      remaining: 0,
      limit: 0,
    };
  }

  const totalUsed = (records ?? []).reduce(
    (sum, record) =>
      sum + Number(record.count ?? 0),
    0,
  );

  const planTier =
    await getPlanTier(organizationId);

  const limitValue =
    getMetricLimit(planTier, metric);

  const remaining = Math.max(
    0,
    limitValue - totalUsed,
  );

  const exceeded =
    totalUsed + count > limitValue;

  return {
    exceeded,
    remaining,
    limit: limitValue,
  };
}

/**
 * Record usage for the current monthly period.
 *
 * This function ONLY records usage.
 * It does not check the subscription limit.
 */
export async function recordUsage(
  organizationId: string,
  metric: MetricType,
  count: number = 1,
): Promise<UsageRecord | null> {
  if (count <= 0) {
    throw new Error(
      'Usage count must be greater than zero.',
    );
  }

  const now = new Date();

  const {
    period_start,
    period_end,
  } = getPeriodStartEnd(metric, now);

  const {
    data: existingRecord,
    error: existingError,
  } = await supabaseServer
    .from('usage_records')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('metric', metric)
    .eq('period_start', period_start)
    .eq('period_end', period_end)
    .maybeSingle();

  if (existingError) {
    logger.error(
      'Usage record lookup failed',
      {
        error: existingError.message,
        organizationId,
        metric,
      },
    );

    return null;
  }

  /*
   * No usage record exists for this period.
   * Create one.
   */
  if (!existingRecord) {
    const {
      data,
      error,
    } = await supabaseServer
      .from('usage_records')
      .insert({
        organization_id: organizationId,
        metric,
        period_start,
        period_end,
        count,
      })
      .select('*')
      .single();

    if (error) {
      logger.error(
        'Usage record creation failed',
        {
          error: error.message,
          organizationId,
          metric,
        },
      );

      return null;
    }

    return data as UsageRecord;
  }

  /*
   * Usage record already exists.
   * Increment its count.
   */
  const newCount =
    Number(existingRecord.count ?? 0) +
    count;

  const {
    data,
    error,
  } = await supabaseServer
    .from('usage_records')
    .update({
      count: newCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingRecord.id)
    .select('*')
    .single();

  if (error) {
    logger.error(
      'Usage record update failed',
      {
        error: error.message,
        organizationId,
        metric,
      },
    );

    return null;
  }

  return data as UsageRecord;
}

/**
 * Get usage history for a metric.
 */
export async function getUsage(
  organizationId: string,
  metric: MetricType,
  limit: number = 12,
): Promise<UsageRecord[]> {
  const {
    data,
    error,
  } = await supabaseServer
    .from('usage_records')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('metric', metric)
    .order('period_start', {
      ascending: false,
    })
    .limit(limit);

  if (error) {
    logger.error(
      'Failed to get usage history',
      {
        error: error.message,
        organizationId,
        metric,
      },
    );

    return [];
  }

  return (data ?? []) as UsageRecord[];
}

/**
 * Get current-period usage and remaining quota.
 */
export async function getRemainingUsage(
  organizationId: string,
  metric: MetricType,
) {
  const now = new Date();

  const {
    period_start,
    period_end,
  } = getPeriodStartEnd(metric, now);

  const {
    data: records,
    error,
  } = await supabaseServer
    .from('usage_records')
    .select('count')
    .eq('organization_id', organizationId)
    .eq('metric', metric)
    .gte('period_start', period_start)
    .lt('period_start', period_end);

  if (error) {
    logger.error(
      'Failed to get remaining usage',
      {
        error: error.message,
        organizationId,
        metric,
      },
    );

    return {
      remaining: 0,
      limit: 0,
      used: 0,
      metric,
    };
  }

  const totalUsed = (records ?? []).reduce(
    (sum, record) =>
      sum + Number(record.count ?? 0),
    0,
  );

  const planTier =
    await getPlanTier(organizationId);

  const limitValue =
    getMetricLimit(planTier, metric);

  return {
    remaining: Math.max(
      0,
      limitValue - totalUsed,
    ),
    limit: limitValue,
    used: totalUsed,
    metric,
  };
}

/**
 * Check usage limit and then record usage.
 *
 * This remains available for services where the operation
 * should consume usage immediately after the check.
 *
 * For operations such as email sending, prefer:
 *
 *   checkLimit()
 *   perform operation
 *   recordUsage()
 *
 * This prevents failed operations from consuming usage.
 */
export async function checkAndRecordUsage(
  organizationId: string,
  metric: MetricType,
  count: number = 1,
): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const result = await checkLimit(
    organizationId,
    metric,
    count,
  );

  if (result.exceeded) {
    return {
      allowed: false,
      remaining: result.remaining,
      limit: result.limit,
    };
  }

  const recorded = await recordUsage(
    organizationId,
    metric,
    count,
  );

  if (!recorded) {
    return {
      allowed: false,
      remaining: result.remaining,
      limit: result.limit,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(
      0,
      result.remaining - count,
    ),
    limit: result.limit,
  };
}