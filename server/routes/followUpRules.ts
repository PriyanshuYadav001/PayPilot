import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';
import { followUpRulesService } from '../services/followUpRulesService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { requirePermission } from '../services/permissionService';

export const followUpRuleRouter = Router();

followUpRuleRouter.use(requireAuth, requireOrgContext);

/**
 * GET /api/follow-up-rules
 * List follow-up rules - OWNER, ADMIN, MEMBER can read
 */
followUpRuleRouter.get(
  '/',
  requirePermission('followups.read'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const rules = await followUpRulesService.listRules(organizationId);
      sendSuccess(res, { rules });
    } catch (err) {
      logger.error('Failed to list follow-up rules', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to list follow-up rules.', 'LIST_FOLLOW_UP_RULES_FAILED', 500);
    }
  }
);

/**
 * POST /api/follow-up-rules
 * Create a follow-up rule - OWNER, ADMIN can write
 */
followUpRuleRouter.post(
  '/',
  requirePermission('followups.write'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const rule = await followUpRulesService.createRule(organizationId, req.body as any);
      sendSuccess(res, { rule }, 201);
    } catch (err) {
      logger.error('Failed to create follow-up rule', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to create follow-up rule.', 'CREATE_FOLLOW_UP_RULE_FAILED', 500);
    }
  }
);

/**
 * PUT /api/follow-up-rules/:id
 * Update a follow-up rule - OWNER, ADMIN can write
 */
followUpRuleRouter.put(
  '/:id',
  requirePermission('followups.write'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const rule = await followUpRulesService.updateRule(organizationId, req.params.id as string, req.body as any);

      if (!rule) {
        return sendError(res, 'Follow-up rule not found.', 'FOLLOW_UP_RULE_NOT_FOUND', 404);
      }

      sendSuccess(res, { rule });
    } catch (err) {
      logger.error('Failed to update follow-up rule', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to update follow-up rule.', 'UPDATE_FOLLOW_UP_RULE_FAILED', 500);
    }
  }
);

/**
 * DELETE /api/follow-up-rules/:id
 * Delete a follow-up rule - OWNER only
 */
followUpRuleRouter.delete(
  '/:id',
  requirePermission('followups.write'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const result = await followUpRulesService.deleteRule(organizationId, req.params.id as string);

      if (result) {
        sendSuccess(res, { success: true });
      } else {
        sendError(res, 'Follow-up rule not found.', 'FOLLOW_UP_RULE_NOT_FOUND', 404);
      }
    } catch (err) {
      logger.error('Failed to delete follow-up rule', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to delete follow-up rule.', 'DELETE_FOLLOW_UP_RULE_FAILED', 500);
    }
  }
);

