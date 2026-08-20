import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';
import { requirePermission } from '../services/permissionService';
import { validateQuery } from '../middleware/validate';
import { followUpTaskListQuerySchema } from '../validators/followUpTask';
import { listFollowUpTasks } from '../services/followUpTaskService';
import { sendError, sendSuccess } from '../utils/response';
import { logger } from '../utils/logger';

export const followUpTasksRouter = Router();
followUpTasksRouter.use(requireAuth, requireOrgContext);

followUpTasksRouter.get(
  '/',
  requirePermission('followups.read'),
  validateQuery(followUpTaskListQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const result = await listFollowUpTasks(req.tenant!.organizationId, req.query as never);
      sendSuccess(res, { tasks: result.tasks }, 200, {
        page: result.page,
        limit: result.limit,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      });
    } catch (err) {
      logger.error('Failed to list follow-up tasks', err);
      sendError(res, 'Failed to list follow-up tasks.', 'LIST_FOLLOW_UP_TASKS_FAILED', 500);
    }
  },
);
