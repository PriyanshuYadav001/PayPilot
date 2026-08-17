import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';
import { checkAndRecordUsage, recordUsage } from '../services/usageService';
import { callService } from '../services/calls/callService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

export const callsRouter = Router();

// All call endpoints require an authenticated, org-scoped request.
callsRouter.use(requireAuth, requireOrgContext);

// POST /calls - Create a new call
callsRouter.post(
  '/',
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      // Check and record usage before creating the call
      const { allowed } = await checkAndRecordUsage(
        organizationId,
        'calls_made' as const,
        1,
      );

      if (!allowed) {
        return sendError(
          res,
          'Plan limit reached: Your subscription does not include call making.',
          'PLAN_LIMIT_REACHED',
          403,
        );
      }

      const call = await callService.createCall(req.body as any);

      sendSuccess(res, { call }, 201);
    } catch (err) {
      logger.error('call creation failed', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to create call.', 'CREATE_CALL_FAILED', 500);
    }
  }
);

// GET /calls - List calls
callsRouter.get(
  '/',
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const calls = await callService.listCalls(organizationId, {
        page: 1,
        limit: 50,
      });
      sendSuccess(res, { calls });
    } catch (err) {
      logger.error('Failed to list calls', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to list calls.', 'LIST_CALLS_FAILED', 500);
    }
  }
);

// GET /calls/:id - Get a specific call
callsRouter.get(
  '/:id',
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const call = await callService.getCallResult(req.params.id as string, organizationId);

      if (!call) {
        return sendError(res, 'Call not found.', 'NOT_FOUND', 404);
      }

      sendSuccess(res, { call });
    } catch (err) {
      logger.error('Failed to get call', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to get call.', 'GET_CALL_FAILED', 500);
    }
  }
);

// POST /calls/:id/record-usage - Record call usage
callsRouter.post(
  '/:id/record-usage',
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      await recordUsage(organizationId, 'calls_made' as const, 1);
      sendSuccess(res, { success: true });
    } catch (err) {
      logger.error('Failed to record call usage', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to record call usage.', 'RECORD_USAGE_FAILED', 500);
    }
  }
);