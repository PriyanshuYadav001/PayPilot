import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';
import {
  invoiceService,
  InvoiceError,
} from '../services/invoiceService';
import { validateBody, validateParams } from '../middleware/validate';
import {
  invoiceCreateSchema,
  invoiceIdParamSchema,
  invoiceUpdateSchema,
} from '../validators/invoice';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { requirePermission } from '../services/permissionService';

export const invoiceRouter = Router();

function handleInvoiceError(
  res: Response,
  err: unknown,
  fallbackMessage: string,
  fallbackCode: string
) {
  if (err instanceof InvoiceError) {
    return sendError(
      res,
      err.message,
      err.code,
      err.status
    );
  }

  logger.error(fallbackMessage, {
    error:
      err instanceof Error
        ? err.message
        : String(err),
  });

  return sendError(
    res,
    fallbackMessage,
    fallbackCode,
    500
  );
}

invoiceRouter.use(requireAuth, requireOrgContext);

/**
 * GET /api/invoices
 * List invoices - OWNER, ADMIN, MEMBER can read
 */
invoiceRouter.get(
  '/',
  requirePermission('invoices.read'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;

      const searchTerm =
        typeof req.query.search === 'string'
          ? req.query.search
          : undefined;

      const customerId =
        typeof req.query.customerId === 'string'
          ? req.query.customerId
          : undefined;

      const status =
        typeof req.query.status === 'string'
          ? (req.query.status as any)
          : undefined;

      const result = await invoiceService.listInvoices(
        organizationId,
        customerId,
        status,
        searchTerm,
        page,
        limit
      );

      sendSuccess(
        res,
        {
          invoices: result.data,
        },
        200,
        {
          page: result.page,
          limit: result.limit,
          totalCount: result.total,
          totalPages: result.totalPages,
        }
      );
    } catch (err) {
      logger.error('Failed to list invoices', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });

      sendError(
        res,
        'Failed to list invoices.',
        'LIST_INVOICES_FAILED',
        500
      );
    }
  }
);

/**
 * GET /api/invoices/:id
 * Get a specific invoice - OWNER, ADMIN, MEMBER can read
 */
invoiceRouter.get(
  '/:id',
  requirePermission('invoices.read'),
  validateParams(invoiceIdParamSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const invoice = await invoiceService.getInvoice(
        organizationId,
        req.params.id as string
      );

      if (!invoice) {
        return sendError(
          res,
          'Invoice not found.',
          'NOT_FOUND',
          404
        );
      }

      sendSuccess(res, { invoice });
    } catch (err) {
      logger.error('Failed to get invoice', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });

      sendError(
        res,
        'Failed to get invoice.',
        'GET_INVOICE_FAILED',
        500
      );
    }
  }
);

/**
 * POST /api/invoices
 * Create an invoice - OWNER, ADMIN can write
 */
invoiceRouter.post(
  '/',
  requirePermission('invoices.write'),
  validateBody(invoiceCreateSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, userId } = req.tenant!;

      const invoice = await invoiceService.createInvoice(
        organizationId,
        userId,
        req.body as any
      );

      sendSuccess(res, { invoice }, 201);
    } catch (err) {
      return handleInvoiceError(
    res,
    err,
    'Failed to create invoice.',
    'CREATE_INVOICE_FAILED'
  );
    }
  }
);

/**
 * PATCH /api/invoices/:id
 * Update an invoice - OWNER, ADMIN can write
 */
invoiceRouter.patch(
  '/:id',
  requirePermission('invoices.write'),
  validateParams(invoiceIdParamSchema),
  validateBody(invoiceUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const invoice = await invoiceService.updateInvoice(
        organizationId,
        req.params.id as string,
        req.body as any
      );

      if (!invoice) {
        return sendError(
          res,
          'Invoice not found.',
          'INVOICE_NOT_FOUND',
          404
        );
      }

      sendSuccess(res, { invoice });
    } catch (err) {
  return handleInvoiceError(
    res,
    err,
    'Failed to update invoice.',
    'UPDATE_INVOICE_FAILED'
  );
}
  }
);

/**
 * DELETE /api/invoices/:id
 * Delete an invoice - OWNER only
 */
invoiceRouter.delete(
  '/:id',
  requirePermission('invoices.write'),
  validateParams(invoiceIdParamSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;

      const invoice = await invoiceService.deleteInvoice(
        organizationId,
        req.params.id as string
      );

      if (!invoice) {
        return sendError(
          res,
          'Invoice not found.',
          'NOT_FOUND',
          404
        );
      }

      sendSuccess(res, { invoice });
        } catch (err) {
      return handleInvoiceError(
        res,
        err,
        'Failed to delete invoice.',
        'DELETE_INVOICE_FAILED'
      );
    }
  }
);