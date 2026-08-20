import { PLAN_LIMITS } from '../../shared/constants';
import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import { sendError, sendSuccess } from '../utils/response';
import { Request, Response, NextFunction } from 'express';

type PlanFeatures = {
  customers: boolean;
  invoices: boolean;
  email: boolean;
  whatsapp: boolean;
  calls: boolean;
  automation: boolean;
  ai: boolean;
  analytics: boolean;
};

const planFeaturesMap: Record<string, PlanFeatures> = {
  free_trial: {
    customers: true,
    invoices: true,
    email: true,
    whatsapp: false,
    calls: false,
    automation: false,
    ai: false,
    analytics: false,
  },
  starter: {
    customers: true,
    invoices: true,
    email: true,
    whatsapp: false,
    calls: false,
    automation: false,
    ai: false,
    analytics: false,
  },
  growth: {
    customers: true,
    invoices: true,
    email: true,
    whatsapp: true,
    calls: true,
    automation: true,
    ai: false,
    analytics: false,
  },
  pro: {
    customers: true,
    invoices: true,
    email: true,
    whatsapp: true,
    calls: true,
    automation: true,
    ai: true,
    analytics: true,
  },
  enterprise: {
    customers: true,
    invoices: true,
    email: true,
    whatsapp: true,
    calls: true,
    automation: true,
    ai: true,
    analytics: true,
  },
};

export function getPlanFeatures(planTier: string): PlanFeatures {
  return planFeaturesMap[planTier] || planFeaturesMap.free_trial;
}

export function canAccessFeature(planTier: string, feature: keyof PlanFeatures): boolean {
  const features = getPlanFeatures(planTier);
  return features[feature];
}

export function getPlanPriceInr(planTier: string): number {
  return (PLAN_LIMITS[planTier as keyof typeof PLAN_LIMITS] as { priceInr: number }).priceInr;
}

export interface SubscriptionDetails {
  id: string;
  organization_id: string;
  plan_tier: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
  trial_start: string | null;
  trial_end: string | null;
}

export interface SubscriptionUsage {
  organization_id: string;
  current_period_usage: number;
  current_period_limit: number;
  remaining: number;
  metrics: Record<string, { used: number; limit: number; remaining: number }>;
}

export interface CheckoutSession {
  session_id: string;
  url: string;
  status_url: string;
}

export interface CancelSubscriptionResponse {
  success: boolean;
  status: string;
  message: string;
}

/** Get current subscription details for an organization */
export async function getSubscriptionDetails(organizationId: string): Promise<SubscriptionDetails | null> {
  try {
    const { data: subscription, error } = await supabaseServer
      .from('subscriptions')
      .select(`
        id,
        organization_id,
        plan_tier,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        created_at,
        updated_at,
        trial_start,
        trial_end
      `)
      .eq('organization_id', organizationId)
      .single();

    if (error) {
      logger.error('Failed to get subscription details', { error: error.message, organizationId });
      return null;
    }

    return subscription as SubscriptionDetails;
  } catch (err) {
    logger.error('Exception in getSubscriptionDetails', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    return null;
  }
}

/** Get usage metrics for an organization's current subscription */
export async function getSubscriptionUsage(organizationId: string): Promise<SubscriptionUsage | null> {
  try {
    // Get current subscription plan
    const { data: subscription, error: subError } = await supabaseServer
      .from('subscriptions')
      .select('plan_tier')
      .eq('organization_id', organizationId)
      .single();

    if (subError || !subscription) {
      logger.error('Failed to get subscription', { error: subError.message, organizationId });
      return null;
    }

    const planTier = subscription.plan_tier as string;
    const planLimits = PLAN_LIMITS[planTier as keyof typeof PLAN_LIMITS];
    if (!planLimits) {
      logger.error('Unknown plan tier', { planTier });
      return null;
    }

    // Get usage records for current period
    const now = new Date();
    const { period_start, period_end } = getPeriodStartEnd('monthly', now);

    const { data: records, error: usageError } = await supabaseServer
      .from('usage_records')
      .select('metric, count')
      .eq('organization_id', organizationId)
      .gte('period_start', period_start)
      .lt('period_end', period_end);

    if (usageError) {
      logger.error('Failed to get usage records', { error: usageError.message, organizationId });
      return null;
    }

    // Calculate usage per metric
    const usageMap: Record<string, number> = {};
    for (const record of records || []) {
      const metric = record.metric as keyof typeof PLAN_LIMITS['starter'];
      if (!usageMap[metric]) {
        usageMap[metric] = 0;
      }
      usageMap[metric] += (record as { count: number }).count;
    }

    // Build usage summary for each metric in PLAN_LIMITS
    const metrics = [
      'maxInvoicesMonthly',
      'maxWhatsAppMonthly',
      'maxEmailsMonthly',
      'maxCallsMonthly',
      'maxAiAnalysesMonthly',
    ];

    const usageSummary: Record<string, number> = {};
    for (const metric of metrics) {
      const used = usageMap[metric] || 0;
      usageSummary[metric] = Math.min(used, planLimits[metric as keyof typeof planLimits] || 0);
    }

    return {
      organization_id: organizationId,
      metrics: { current: { used: 0, limit: 0, remaining: 0 } },
      current_period_usage: Object.values(usageSummary).reduce((a, b) => a + b, 0),
      current_period_limit: Object.values(usageSummary).reduce((a, b) => a + b, 0),
      remaining: 0, // Will be calculated per metric
    };
  } catch (err) {
    logger.error('Exception in getSubscriptionUsage', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    return null;
  }
}

/** Create a checkout session for subscription upgrade/downgrade */
export async function createCheckoutSession(
  organizationId: string,
  planTier: string,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutSession | null> {
  try {
    // Verify organization exists and has no active subscription conflict
    const { data: org, error: orgError } = await supabaseServer
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .single();

    if (orgError) {
      logger.error('Organization not found', { error: orgError.message, organizationId });
      return null;
    }

    // In a real implementation, this would call Stripe/Mollie/etc API
    // For now, create a mock session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      session_id: sessionId,
      url: `/mock-checkout/${sessionId}`,
      status_url: `/webhooks/subscription`,
    };
  } catch (err) {
    logger.error('Exception in createCheckoutSession', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
      planTier,
    });
    return null;
  }
}

/** Cancel subscription at period end */
export async function cancelSubscription(organizationId: string): Promise<CancelSubscriptionResponse> {
  try {
    // Verify subscription exists
    const { data: subscription, error: subError } = await supabaseServer
      .from('subscriptions')
      .select('id, plan_tier, status')
      .eq('organization_id', organizationId)
      .single();

    if (subError || !subscription) {
      return {
        success: false,
        status: 'error',
        message: 'No active subscription found.',
      };
    }

    // Update subscription to cancel at period end
    const { error: updateError } = await supabaseServer
      .from('subscriptions')
      .update({ status: 'canceled', cancel_at_period_end: true })
      .eq('organization_id', organizationId);

    if (updateError) {
      logger.error('Failed to cancel subscription', { error: updateError.message, organizationId });
      return {
        success: false,
        status: 'error',
        message: 'Failed to cancel subscription. Please try again.',
      };
    }

    return {
      success: true,
      status: 'canceled',
      message: 'Subscription will cancel at the end of the current billing period.',
    };
  } catch (err) {
    logger.error('Exception in cancelSubscription', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    return {
      success: false,
      status: 'error',
      message: 'An error occurred while canceling the subscription.',
    };
  }
}

/** Handle webhook events from payment provider */
export async function handleWebhookEvent(
  event: string,
  payload: any,
): Promise<{ success: boolean; action: string; message: string }> {
  try {
    switch (event) {
      case 'checkout.session.completed': {
        const { customer, subscription, amount_total, currency } = payload;
        // Update or create subscription record
        const organizationId = customer?.metadata?.organization_id;

        if (!organizationId) {
          return { success: false, action: 'skip', message: 'No organization ID in payload' };
        }

        // Upsert subscription record
        const { error } = await supabaseServer
          .from('subscriptions')
          .upsert({
            organization_id: organizationId,
            plan_tier: subscription?.plan?.terms?.optional?.features?.plan_tier || 'starter',
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            cancel_at_period_end: false,
          })
          .select()
          .single();

        if (error) {
          logger.error('Failed to upsert subscription after webhook', { error: error.message, organizationId });
          return { success: false, action: 'error', message: 'Failed to update subscription' };
        }

        return { success: true, action: 'subscription_created', message: 'Subscription activated' };
      }

      case 'invoice.payment_failed': {
        const { customer, subscription } = payload;
        const organizationId = customer?.metadata?.organization_id;

        if (!organizationId) {
          return { success: false, action: 'skip', message: 'No organization ID in payload' };
        }

        // Update subscription status
        const { error } = await supabaseServer
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('organization_id', organizationId);

        if (error) {
          logger.error('Failed to update subscription past_due', { error: error.message, organizationId });
          return { success: false, action: 'error', message: 'Failed to update subscription status' };
        }

        return { success: true, action: 'payment_failed', message: 'Payment failed - status updated to past_due' };
      }

      case 'invoice.payment_succeeded': {
        const { customer, subscription } = payload;
        const organizationId = customer?.metadata?.organization_id;

        if (!organizationId) {
          return { success: false, action: 'skip', message: 'No organization ID in payload' };
        }

        // Update subscription status
        const { error } = await supabaseServer
          .from('subscriptions')
          .update({ status: 'active' })
          .eq('organization_id', organizationId);

        if (error) {
          logger.error('Failed to update subscription active', { error: error.message, organizationId });
          return { success: false, action: 'error', message: 'Failed to update subscription status' };
        }

        return { success: true, action: 'payment_succeeded', message: 'Payment succeeded - status updated to active' };
      }

      case 'customer.subscription.deleted': {
        const { customer, subscription } = payload;
        const organizationId = customer?.metadata?.organization_id;

        if (!organizationId) {
          return { success: false, action: 'skip', message: 'No organization ID in payload' };
        }

        // Update subscription status
        const { error } = await supabaseServer
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('organization_id', organizationId);

        if (error) {
          logger.error('Failed to update subscription canceled', { error: error.message, organizationId });
          return { success: false, action: 'error', message: 'Failed to update subscription status' };
        }

        return { success: true, action: 'canceled', message: 'Subscription canceled' };
      }

      default:
        logger.warn('Unhandled webhook event', { event });
        return { success: true, action: 'unhandled', message: 'Event received but not processed' };
    }
  } catch (err) {
    logger.error('Exception in handleWebhookEvent', {
      error: err instanceof Error ? err.message : String(err),
      event,
    });
    return { success: false, action: 'error', message: 'Unexpected webhook error' };
  }
}

/** Get the period start/end dates */
function getPeriodStartEnd(frequency: 'monthly' | 'yearly', now: Date): { period_start: string; period_end: string } {
  if (frequency === 'monthly') {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const periodStart = new Date(year, month - 1, 1).toISOString();
    const periodEnd = new Date(year, month, 1, 0, 0, 0).toISOString();
    return { period_start: periodStart, period_end: periodEnd };
  }
  // yearly
  const year = now.getFullYear();
  const periodStart = new Date(year, 0, 1).toISOString();
  const periodEnd = new Date(year + 1, 0, 1, 0, 0, 0).toISOString();
  return { period_start: periodStart, period_end: periodEnd };
}

/** Convenience: get plan limits for a tier */
function getPlanLimits(planTier: string) {
  return PLAN_LIMITS[planTier as keyof typeof PLAN_LIMITS];
}