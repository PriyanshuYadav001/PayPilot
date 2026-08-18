import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';
import { customerService, CustomerError } from '../services/customerService';
import { validateBody, validateParams } from '../middleware/validate';
import {
  customerCreateSchema,
  customerUpdateSchema,
  customerIdParamSchema,
} from '../validators/customer';
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
    const { organizationId } = req.tenant!;

    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(
        Math.max(Number(req.query.limit) || 20, 1),
        100
      );

      const result = await customerService.listCustomers(organizationId, {
        page,
        limit,
        search:
          typeof req.query.search === 'string'
            ? req.query.search
            : undefined,
        isDnd:
          req.query.isDnd === 'true' || req.query.isDnd === 'false'
            ? req.query.isDnd
            : undefined,
        sortBy:
          typeof req.query.sortBy === 'string'
            ? req.query.sortBy
            : undefined,
        sortOrder:
          req.query.sortOrder === 'asc' || req.query.sortOrder === 'desc'
            ? req.query.sortOrder
            : undefined,
      });

      return sendSuccess(
        res,
        {
          customers: result.customers,
        },
        200,
        {
          page: result.page,
          limit: result.limit,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
        }
      );
    } catch (err) {
      if (err instanceof CustomerError) {
        return sendError(
          res,
          err.message,
          err.code,
          err.statusCode
        );
      }

      logger.error('Failed to list customers', {
        error: err instanceof Error ? err.message : String(err),
        organizationId,
      });

      return sendError(
        res,
        'Failed to list customers.',
        'LIST_CUSTOMERS_FAILED',
        500
      );
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
    const { organizationId } = req.tenant!;
    const id = req.params.id as string;

    try {
      const customer = await customerService.getCustomer(
        organizationId,
        id
      );

      if (!customer) {
        return sendError(
          res,
          'Customer not found.',
          'NOT_FOUND',
          404
        );
      }

      return sendSuccess(res, { customer });
    } catch (err) {
      if (err instanceof CustomerError) {
        return sendError(
          res,
          err.message,
          err.code,
          err.statusCode
        );
      }

      logger.error('Failed to get customer', {
        error: err instanceof Error ? err.message : String(err),
        organizationId,
        customerId: id,
      });

      return sendError(
        res,
        'Failed to get customer.',
        'GET_CUSTOMER_FAILED',
        500
      );
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
    const { organizationId } = req.tenant!;

    try {
      const customer = await customerService.createCustomer(
        organizationId,
        req.body
      );

      return sendSuccess(res, { customer }, 201);
    } catch (err) {
      if (err instanceof CustomerError) {
        return sendError(
          res,
          err.message,
          err.code,
          err.statusCode
        );
      }

      logger.error('Failed to create customer', {
        error: err instanceof Error ? err.message : String(err),
        organizationId,
      });

      return sendError(
        res,
        'Failed to create customer.',
        'CREATE_CUSTOMER_FAILED',
        500
      );
    }
  }
);

/**
 * PATCH /api/customers/:id
 * Update a customer - OWNER, ADMIN can write
 */
customerRouter.patch(
  '/:id',
  requirePermission('customers.write'),
  validateParams(customerIdParamSchema),
  validateBody(customerUpdateSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = req.tenant!;
    const id = req.params.id as string;

    try {
      const customer = await customerService.updateCustomer(
        organizationId,
        id,
        req.body
      );

      if (!customer) {
        return sendError(
          res,
          'Customer not found.',
          'NOT_FOUND',
          404
        );
      }

      return sendSuccess(res, { customer });
    } catch (err) {
      if (err instanceof CustomerError) {
        return sendError(
          res,
          err.message,
          err.code,
          err.statusCode
        );
      }

      logger.error('Failed to update customer', {
        error: err instanceof Error ? err.message : String(err),
        organizationId,
        customerId: id,
      });

      return sendError(
        res,
        'Failed to update customer.',
        'UPDATE_CUSTOMER_FAILED',
        500
      );
    }
  }
);

/**
 * DELETE /api/customers/:id
 * Delete a customer - OWNER, ADMIN can write
 */
customerRouter.delete(
  '/:id',
  requirePermission('customers.write'),
  validateParams(customerIdParamSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = req.tenant!;
    const id = req.params.id as string;

    try {
      const customer = await customerService.deleteCustomer(
        organizationId,
        id
      );

      if (!customer) {
        return sendError(
          res,
          'Customer not found.',
          'NOT_FOUND',
          404
        );
      }

      return sendSuccess(res, { customer });
    } catch (err) {
      if (err instanceof CustomerError) {
        return sendError(
          res,
          err.message,
          err.code,
          err.statusCode
        );
      }

      logger.error('Failed to delete customer', {
        error: err instanceof Error ? err.message : String(err),
        organizationId,
        customerId: id,
      });

      return sendError(
        res,
        'Failed to delete customer.',
        'DELETE_CUSTOMER_FAILED',
        500
      );
    }
  }
);
