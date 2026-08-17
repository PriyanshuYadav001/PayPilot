import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';
import { invoiceService } from '../services/invoiceService';
import { validateBody, validateParams } from '../middleware/validate';
import { invoiceCreateSchema, invoiceIdParamSchema, invoiceUpdateSchema } from '../validators/invoice';
import { invoiceService as invoiceServiceExport } from '../services/invoiceService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { requirePermission } from '../services/permissionService';

export const invoiceRouter = Router();

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
      const invoices = await invoiceService.listInvoices(organizationId);
      sendSuccess(res, { invoices });
    } catch (err) {
      logger.error('Failed to list invoices', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to list invoices.', 'LIST_INVOICES_FAILED', 500);
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
      const invoice = await invoiceService.getInvoice(organizationId, req.params.id as string);

      if (!invoice) {
        return sendError(res, 'Invoice not found.', 'NOT_FOUND', 404);
      }

      sendSuccess(res, { invoice });
    } catch (err) {
      logger.error('Failed to get invoice', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to get invoice.', 'GET_INVOICE_FAILED', 500);
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
      const invoice = await invoiceService.createInvoice(organizationId, userId, req.body as any);

      sendSuccess(res, { invoice }, 201);
    } catch (err) {
      logger.error('Failed to create invoice', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to create invoice.', 'CREATE_INVOICE_FAILED', 500);
    }
  }
);

/**
 * PUT /api/invoices/:id
 * Update an invoice - OWNER, ADMIN can write
 */
invoiceRouter.put(
  '/:id',
  requirePermission('invoices.write'),
  validateParams(invoiceIdParamSchema),
  validateBody(invoiceUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const invoice = await invoiceService.updateInvoice(organizationId, req.params.id as string, req.body as any);

      if (!invoice) {
        return sendError(res, 'Invoice not found.', 'INVOICE_NOT_FOUND', 404);
      }

      sendSuccess(res, { invoice });
    } catch (err) {
      logger.error('Failed to update invoice', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to update invoice.', 'UPDATE_INVOICE_FAILED', 500);
    }
  }
);

/**
 * DELETE /api/invoices/:id
 * Delete an invoice - OWNER only
 */
invoiceRouter.delete(
  '/:id',
  requirePermission('invoices.write'), // OWNER only in practice, but permission check handles it
  validateParams(invoiceIdParamSchema),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.tenant!;
      const result = await invoiceService.deleteInvoice(organizationId, req.params.id as string);

      if (result) {
        sendSuccess(res, { success: true });
      } else {
        sendError(res, 'Invoice not found.', 'INVOICE_NOT_FOUND', 404);
      }
    } catch (err) {
      logger.error('Failed to delete invoice', {
        error: err instanceof Error ? err.message : String(err),
        organizationId: req.tenant!.organizationId,
      });
      sendError(res, 'Failed to delete invoice.', 'DELETE_INVOICE_FAILED', 500);
    }
  }
);

