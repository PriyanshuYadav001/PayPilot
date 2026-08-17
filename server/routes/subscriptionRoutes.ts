import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';
import {
  getSubscriptionDetails,
  getSubscriptionUsage,
  createCheckoutSession,
  cancelSubscription,
  handleWebhookEvent,
} from '../services/subscriptionService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

export const subscriptionRouter = Router();

subscriptionRouter.use(requireAuth, requireOrgContext);

/**
 * GET /api/subscription
 * Returns the current subscription details for the organization.
 */
subscriptionRouter.get(
  '/',
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const details = await getSubscriptionDetails(organizationId);

      if (!details) {
        return sendError(res, 'No subscription found for this organization.', 'NO_SUBSCRIPTION', 404);
      }

      sendSuccess(res, { subscription: details });
    } catch (err) {
      logger.error('Failed to get subscription', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to retrieve subscription.', 'SUBSCRIPTION_RETRIEVE_FAILED', 500);
    }
  }
);

/**
 * GET /api/subscription/usage
 * Returns usage metrics for the current subscription period.
 */
subscriptionRouter.get(
  '/usage',
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const usage = await getSubscriptionUsage(organizationId);

      if (!usage) {
        return sendError(res, 'Failed to retrieve usage metrics.', 'USAGE_RETRIEVE_FAILED', 500);
      }

      sendSuccess(res, { usage });
    } catch (err) {
      logger.error('Failed to get subscription usage', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to retrieve usage metrics.', 'USAGE_RETRIEVE_FAILED', 500);
    }
  }
);

/**
 * POST /api/subscription/checkout
 * Creates a checkout session for plan upgrade/downgrade/renewal.
 */
subscriptionRouter.post(
  '/checkout',
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const { planTier } = req.body as { planTier: string };

      if (!planTier) {
        return sendError(res, 'Plan tier is required.', 'MISSING_PLAN_TIER', 400);
      }

      // Validate plan tier
      const validPlanTiers = ['free_trial', 'starter', 'growth', 'pro', 'enterprise'];
      if (!validPlanTiers.includes(planTier)) {
        return sendError(res, 'Invalid plan tier specified.', 'INVALID_PLAN_TIER', 400);
      }

      const successUrl = `${process.env.FRONTEND_URL}/subscription/success?plan=${planTier}`;
      const cancelUrl = `${process.env.FRONTEND_URL}/subscription/cancel`;

      const session = await createCheckoutSession(
        organizationId,
        planTier,
        successUrl,
        cancelUrl,
      );

      if (!session) {
        return sendError(res, 'Failed to create checkout session.', 'CHECKOUT_SESSION_FAILED', 500);
      }

      sendSuccess(res, { session });
    } catch (err) {
      logger.error('Failed to create checkout session', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to create checkout session.', 'CHECKOUT_SESSION_FAILED', 500);
    }
  }
);

/**
 * POST /api/subscription/cancel
 * Cancels the subscription at the end of the current billing period.
 */
subscriptionRouter.post(
  '/cancel',
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const result = await cancelSubscription(organizationId);

      if (!result.success) {
        return sendError(res, result.message, 'SUBSCRIPTION_CANCEL_FAILED', 400);
      }

      sendSuccess(res, {
        subscription: {
          status: result.status,
          message: result.message,
        },
      });
    } catch (err) {
      logger.error('Failed to cancel subscription', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to cancel subscription.', 'SUBSCRIPTION_CANCEL_FAILED', 500);
    }
  }
);

/**
 * POST /api/webhooks/subscription
 * Handle webhook events from the payment provider.
 * This endpoint is publicly accessible (signature verified by middleware).
 */
subscriptionRouter.post(
  '/webhooks/subscription',
  async (req: Request, res: Response) => {
    try {
      const { event, payload } = req.body;

      if (!event) {
        return sendError(res, 'Event type is required.', 'MISSING_EVENT', 400);
      }

      const result = await handleWebhookEvent(event, payload);

      if (!result.success) {
        return sendError(res, result.message, 'WEBHOOK_PROCESSING_FAILED', 500);
      }

      sendSuccess(res, { action: result.action, message: result.message });
    } catch (err) {
      logger.error('Failed to handle webhook event', {
        error: err instanceof Error ? err.message : String(err),
      });
      sendError(res, 'Failed to handle webhook event.', 'WEBHOOK_PROCESSING_FAILED', 500);
    }
  }
);

export const subscriptionRoutes = subscriptionRouter;
