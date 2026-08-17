import { Router, Request, Response } from 'express';
import { requireAuth, requireOrgContext } from '../middleware/auth';
import { invoiceService } from '../services/invoiceService';
import { validateBody, validateParams } from '../middleware/validate';
import { customerCreateSchema, customerUpdateSchema, customerIdParamSchema } from '../validators/customer';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { requirePermission } from '../services/permissionService';

export const customerRouter = Router();

customerRouter.use(requireAuth, requireOrgContext);

/**
 * GET /api/customers
 * List customers - OWNER, ADMIN, MEMBER can read
 */
customerRouter.get(
  '/',
  requirePermission('customers.read'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      // In a real implementation, we'd query the customers table
      // For now, return empty with pagination
      sendSuccess(res, { customers: [], total: 0 });
    } catch (err) {
      logger.error('Failed to list customers', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to list customers.', 'LIST_CUSTOMERS_FAILED', 500);
    }
  }
);

/**
 * GET /api/customers/:id
 * Get a specific customer - OWNER, ADMIN, MEMBER can read
 */
customerRouter.get(
  '/:id',
  requirePermission('customers.read'),
  validateParams(customerIdParamSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      sendSuccess(res, { customer: null }); // Placeholder
    } catch (err) {
      logger.error('Failed to get customer', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to get customer.', 'GET_CUSTOMER_FAILED', 500);
    }
  }
);

/**
 * POST /api/customers
 * Create a customer - OWNER, ADMIN can write
 */
customerRouter.post(
  '/',
  requirePermission('customers.write'),
  validateBody(customerCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, userId } = req.tenant!;
      sendSuccess(res, { customer: null }, 201); // Placeholder
    } catch (err) {
      logger.error('Failed to create customer', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to create customer.', 'CREATE_CUSTOMER_FAILED', 500);
    }
  }
);

/**
 * PUT /api/customers/:id
 * Update a customer - OWNER, ADMIN can write
 */
customerRouter.put(
  '/:id',
  requirePermission('customers.write'),
  validateParams(customerIdParamSchema),
  validateBody(customerUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      sendSuccess(res, { customer: null }); // Placeholder
    } catch (err) {
      logger.error('Failed to update customer', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to update customer.', 'UPDATE_CUSTOMER_FAILED', 500);
    }
  }
);

