import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext, requireRole } from '../middleware/tenant';
import { validateBody, validateQuery, validateParams } from '../middleware/validate';
import {
  paymentPromiseCreateSchema,
  paymentPromiseUpdateSchema,
  paymentPromiseListQuerySchema,
  paymentPromiseIdParamSchema,
} from '../validators/paymentPromise';
import { PaymentPromiseError, paymentPromiseService } from '../services/paymentPromiseService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

export const paymentPromiseRouter = Router();

paymentPromiseRouter.use(requireAuth, requireOrgContext);

const canRead = requireRole(['owner', 'admin', 'member', 'viewer']);
const canWrite = requireRole(['owner', 'admin', 'member']);

function handleError(res: Response, err: unknown, context: string): void {
  if (err instanceof PaymentPromiseError) {
    sendError(res, err.message, err.code, err.statusCode);
    return;
  }
  logger.error(`${context}: unexpected error`, err);
  sendError(res, 'An unexpected error occurred.', 'INTERNAL_SERVER_ERROR', 500);
}

/**
 * GET /payment-promises
 * List payment promises with optional status, customer, invoice filters.
 */
paymentPromiseRouter.get('/', canRead, validateQuery(paymentPromiseListQuerySchema), async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;
  const params = req.query as unknown as {
    page: number;
    limit: number;
    status?: string;
    customerId?: string;
    invoiceId?: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  };

  try {
    const result = await paymentPromiseService.listPromises(organizationId, params);
    sendSuccess(res, { promises: result.promises }, 200, {
      page: result.page,
      limit: result.limit,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
    });
  } catch (err) {
    handleError(res, err, 'listPromises');
  }
});

/**
 * GET /payment-promises/:id
 * Get a single payment promise.
 */
paymentPromiseRouter.get('/:id', canRead, validateParams(paymentPromiseIdParamSchema), async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;
  const { id } = req.params as { id: string };

  try {
    const promise = await paymentPromiseService.getPromise(organizationId, id);
    if (!promise) {
      sendError(res, 'Payment promise not found.', 'NOT_FOUND', 404);
      return;
    }
    sendSuccess(res, { promise });
  } catch (err) {
    handleError(res, err, 'getPromise');
  }
});

/**
 * POST /payment-promises
 * Create a new payment promise.
 */
paymentPromiseRouter.post('/', canWrite, validateBody(paymentPromiseCreateSchema), async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;

  try {
    const promise = await paymentPromiseService.createPromise(organizationId, req.body);
    sendSuccess(res, { promise }, 201);
  } catch (err) {
    handleError(res, err, 'createPromise');
  }
});

/**
 * PATCH /payment-promises/:id
 * Update a payment promise (e.g., mark as fulfilled, missed, cancelled).
 */
paymentPromiseRouter.patch(
  '/:id',
  canWrite,
  validateParams(paymentPromiseIdParamSchema),
  validateBody(paymentPromiseUpdateSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = req.tenant!;
    const { id } = req.params as { id: string };

    try {
      const promise = await paymentPromiseService.updatePromise(organizationId, id, req.body);
      if (!promise) {
        sendError(res, 'Payment promise not found.', 'NOT_FOUND', 404);
        return;
      }
      sendSuccess(res, { promise });
    } catch (err) {
      handleError(res, err, 'updatePromise');
    }
  },
);

/**
 * DELETE /payment-promises/:id
 * Delete a payment promise.
 */
paymentPromiseRouter.delete(
  '/:id',
  canWrite,
  validateParams(paymentPromiseIdParamSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = req.tenant!;
    const { id } = req.params as { id: string };

    try {
      const promise = await paymentPromiseService.deletePromise(organizationId, id);
      if (!promise) {
        sendError(res, 'Payment promise not found.', 'NOT_FOUND', 404);
        return;
      }
      sendSuccess(res, { promise });
    } catch (err) {
      handleError(res, err, 'deletePromise');
    }
  },
);
