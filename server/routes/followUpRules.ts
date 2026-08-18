import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../middleware/validate';
import {
  followUpRuleCreateSchema,
  followUpRuleUpdateSchema,
  followUpRuleListQuerySchema,
  followUpRuleIdParamSchema,
} from '../validators/followUpRule';
import { followUpRulesService } from '../services/followUpRulesService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { requirePermission } from '../services/permissionService';

export const followUpRuleRouter = Router();

followUpRuleRouter.use(requireAuth, requireOrgContext);

/**
 * GET /api/v1/follow-up-rules
 */
followUpRuleRouter.get(
  '/',
  requirePermission('followups.read'),
  validateQuery(followUpRuleListQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const rules = await followUpRulesService.listRules(
        organizationId,
        req.query as any,
      );

      sendSuccess(res, {
        rules: rules.rules,
        totalCount: rules.totalCount,
        page: rules.page,
        limit: rules.limit,
        totalPages: rules.totalPages,
      });
    } catch (err) {
      logger.error('Failed to list follow-up rules', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });

      sendError(
        res,
        'Failed to list follow-up rules.',
        'LIST_FOLLOW_UP_RULES_FAILED',
        500,
      );
    }
  },
);

/**
 * GET /api/v1/follow-up-rules/:id
 */
followUpRuleRouter.get(
  '/:id',
  requirePermission('followups.read'),
  validateParams(followUpRuleIdParamSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const rule = await followUpRulesService.getRule(
        organizationId,
        req.params.id as string,
      );

      if (!rule) {
        return sendError(
          res,
          'Follow-up rule not found.',
          'FOLLOW_UP_RULE_NOT_FOUND',
          404,
        );
      }

      sendSuccess(res, { rule });
    } catch (err) {
      logger.error('Failed to get follow-up rule', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });

      sendError(
        res,
        'Failed to load follow-up rule.',
        'GET_FOLLOW_UP_RULE_FAILED',
        500,
      );
    }
  },
);

/**
 * POST /api/v1/follow-up-rules
 */
followUpRuleRouter.post(
  '/',
  requirePermission('followups.write'),
  validateBody(followUpRuleCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const rule = await followUpRulesService.createRule(
        organizationId,
        req.body,
      );

      sendSuccess(res, { rule }, 201);
    } catch (err) {
      logger.error('Failed to create follow-up rule', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });

      sendError(
        res,
        'Failed to create follow-up rule.',
        'CREATE_FOLLOW_UP_RULE_FAILED',
        500,
      );
    }
  },
);

/**
 * PATCH /api/v1/follow-up-rules/:id
 */
followUpRuleRouter.patch(
  '/:id',
  requirePermission('followups.write'),
  validateParams(followUpRuleIdParamSchema),
  validateBody(followUpRuleUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const rule = await followUpRulesService.updateRule(
        organizationId,
        req.params.id as string,
        req.body,
      );

      if (!rule) {
        return sendError(
          res,
          'Follow-up rule not found.',
          'FOLLOW_UP_RULE_NOT_FOUND',
          404,
        );
      }

      sendSuccess(res, { rule });
    } catch (err) {
      logger.error('Failed to update follow-up rule', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });

      sendError(
        res,
        'Failed to update follow-up rule.',
        'UPDATE_FOLLOW_UP_RULE_FAILED',
        500,
      );
    }
  },
);

/**
 * DELETE /api/v1/follow-up-rules/:id
 */
followUpRuleRouter.delete(
  '/:id',
  requirePermission('followups.write'),
  validateParams(followUpRuleIdParamSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const rule = await followUpRulesService.deleteRule(
        organizationId,
        req.params.id as string,
      );

      if (!rule) {
        return sendError(
          res,
          'Follow-up rule not found.',
          'FOLLOW_UP_RULE_NOT_FOUND',
          404,
        );
      }

      sendSuccess(res, { rule });
    } catch (err) {
      logger.error('Failed to delete follow-up rule', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });

      sendError(
        res,
        'Failed to delete follow-up rule.',
        'DELETE_FOLLOW_UP_RULE_FAILED',
        500,
      );
    }
  },
);