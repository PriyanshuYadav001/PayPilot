import { Router, Request, Response } from 'express';

import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';

import {
  invoiceService,
  InvoiceError,
} from '../services/invoiceService';

import {
  invoiceFileService,
  InvoiceFileError,
} from '../services/invoiceFileService';

import { uploadInvoiceDocument } from '../middleware/upload';

import {
  validateBody,
  validateParams,
} from '../middleware/validate';

import {
  invoiceCreateSchema,
  invoiceIdParamSchema,
  invoiceUpdateSchema,
} from '../validators/invoice';

import {
  sendSuccess,
  sendError,
} from '../utils/response';

import { logger } from '../utils/logger';
import { requirePermission } from '../services/permissionService';

export const invoiceRouter = Router();

/* =========================================================
   INVOICE ERROR HANDLER
   ========================================================= */

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

/* =========================================================
   INVOICE FILE ERROR HANDLER
   ========================================================= */

function handleInvoiceFileError(
  res: Response,
  err: unknown,
  fallbackMessage: string,
  fallbackCode: string
) {
  if (err instanceof InvoiceFileError) {
    return sendError(
      res,
      err.message,
      err.code,
      err.statusCode
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

/* =========================================================
   AUTH + TENANT CONTEXT
   ========================================================= */

invoiceRouter.use(
  requireAuth,
  requireOrgContext
);

/* =========================================================
   GET INVOICES
   ========================================================= */

/**
 * GET /api/v1/invoices
 *
 * List invoices.
 *
 * OWNER, ADMIN, MEMBER can read.
 */
invoiceRouter.get(
  '/',
  requirePermission('invoices.read'),
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const { organizationId } =
        req.tenant!;

      const page =
        Number(req.query.page) || 1;

      const limit =
        Number(req.query.limit) || 20;

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

      const result =
        await invoiceService.listInvoices(
          organizationId,
          customerId,
          status,
          searchTerm,
          page,
          limit
        );

      return sendSuccess(
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
      logger.error(
        'Failed to list invoices',
        {
          error:
            err instanceof Error
              ? err.message
              : String(err),

          organizationId:
            req.tenant!.organizationId,
        }
      );

      return sendError(
        res,
        'Failed to list invoices.',
        'LIST_INVOICES_FAILED',
        500
      );
    }
  }
);

/* =========================================================
   GET SINGLE INVOICE
   ========================================================= */

/**
 * GET /api/v1/invoices/:id
 *
 * Get a specific invoice.
 *
 * OWNER, ADMIN, MEMBER can read.
 */
invoiceRouter.get(
  '/:id',
  requirePermission('invoices.read'),
  validateParams(invoiceIdParamSchema),
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const { organizationId } =
        req.tenant!;

      const invoice =
        await invoiceService.getInvoice(
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

      return sendSuccess(
        res,
        { invoice }
      );
    } catch (err) {
      logger.error(
        'Failed to get invoice',
        {
          error:
            err instanceof Error
              ? err.message
              : String(err),

          organizationId:
            req.tenant!.organizationId,
        }
      );

      return sendError(
        res,
        'Failed to get invoice.',
        'GET_INVOICE_FAILED',
        500
      );
    }
  }
);

/* =========================================================
   CREATE INVOICE
   ========================================================= */

/**
 * POST /api/v1/invoices
 *
 * Create an invoice.
 *
 * OWNER, ADMIN can write.
 */
invoiceRouter.post(
  '/',
  requirePermission('invoices.write'),
  validateBody(invoiceCreateSchema),
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const {
        organizationId,
        userId,
      } = req.tenant!;

      const invoice =
        await invoiceService.createInvoice(
          organizationId,
          userId,
          req.body as any
        );

      return sendSuccess(
        res,
        { invoice },
        201
      );
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

/* =========================================================
   UPDATE INVOICE
   ========================================================= */

/**
 * PATCH /api/v1/invoices/:id
 *
 * Update an invoice.
 *
 * OWNER, ADMIN can write.
 */
invoiceRouter.patch(
  '/:id',
  requirePermission('invoices.write'),
  validateParams(invoiceIdParamSchema),
  validateBody(invoiceUpdateSchema),
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const { organizationId } =
        req.tenant!;

      const invoice =
        await invoiceService.updateInvoice(
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

      return sendSuccess(
        res,
        { invoice }
      );
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

/* =========================================================
   UPLOAD INVOICE FILE
   ========================================================= */

/**
 * POST /api/v1/invoices/:id/upload
 *
 * Upload or replace an invoice document.
 *
 * OWNER, ADMIN can write.
 *
 * IMPORTANT:
 * requirePermission runs BEFORE multer so viewers
 * receive 403 without processing the uploaded file.
 */
invoiceRouter.post(
  '/:id/upload',
  requirePermission('invoices.write'),
  validateParams(invoiceIdParamSchema),
  uploadInvoiceDocument,
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const { organizationId } =
        req.tenant!;

      if (!req.file) {
        return sendError(
          res,
          'No file uploaded.',
          'VALIDATION_ERROR',
          400
        );
      }

      const file =
        await invoiceFileService.uploadInvoiceFile(
          organizationId,
          req.params.id as string,
          {
            buffer: req.file.buffer,
            originalName: req.file.originalname,
            contentType: req.file.mimetype,
            size: req.file.size,
          }
        );

      return sendSuccess(
        res,
        { file },
        201
      );
    } catch (err) {
      return handleInvoiceFileError(
        res,
        err,
        'Failed to upload invoice file.',
        'FILE_UPLOAD_FAILED'
      );
    }
  }
);

/* =========================================================
   GET INVOICE FILE
   ========================================================= */

/**
 * GET /api/v1/invoices/:id/file
 *
 * Generate a signed URL for the stored invoice document.
 *
 * OWNER, ADMIN, MEMBER can read.
 */
invoiceRouter.get(
  '/:id/file',
  requirePermission('invoices.read'),
  validateParams(invoiceIdParamSchema),
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const { organizationId } =
        req.tenant!;

      const file =
        await invoiceFileService.getInvoiceFileSignedUrl(
          organizationId,
          req.params.id as string
        );

      return sendSuccess(
        res,
        { file }
      );
    } catch (err) {
      return handleInvoiceFileError(
        res,
        err,
        'Failed to get invoice file.',
        'GET_INVOICE_FILE_FAILED'
      );
    }
  }
);

/* =========================================================
   DELETE INVOICE
   ========================================================= */

/**
 * DELETE /api/v1/invoices/:id
 *
 * Delete an invoice.
 *
 * OWNER, ADMIN can write according to the
 * invoices.write permission.
 */
invoiceRouter.delete(
  '/:id',
  requirePermission('invoices.write'),
  validateParams(invoiceIdParamSchema),
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const { organizationId } =
        req.tenant!;

      const invoice =
        await invoiceService.deleteInvoice(
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

      return sendSuccess(
        res,
        { invoice }
      );
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