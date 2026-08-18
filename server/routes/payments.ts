import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext, requireRole } from '../middleware/tenant';
import { validateBody, validateParams } from '../middleware/validate';
import { paymentLinkCreateSchema, paymentLinkIdParamSchema, paymentCreateSchema } from '../validators/payment';
import { paymentService, PaymentError } from '../services/payment/paymentService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

export const paymentLinkRouter = Router();
export const paymentRouter = Router();

paymentLinkRouter.use(requireAuth, requireOrgContext);
paymentRouter.use(requireAuth, requireOrgContext);

const canRead = requireRole(['owner', 'admin', 'member', 'viewer']);
const canWrite = requireRole(['owner', 'admin', 'member']);

function handleError(res: Response, err: unknown, context: string): void {
  if (err instanceof PaymentError) {
    sendError(res, err.message, err.code, err.statusCode);
    return;
  }
  logger.error(`${context}: unexpected error`, err);
  sendError(res, 'An unexpected error occurred.', 'INTERNAL_SERVER_ERROR', 500);
}

/**
 * POST /payment-links
 * Creates a payment link for an invoice. The amount is computed server-side
 * from the invoice balance (a partial amount may be requested but never
 * exceeds the balance).
 */
paymentLinkRouter.post('/', canWrite, validateBody(paymentLinkCreateSchema), async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;

  try {
    const paymentLink = await paymentService.createPaymentLink(organizationId, req.body);
    sendSuccess(res, { paymentLink }, 201);
  } catch (err) {
    handleError(res, err, 'createPaymentLink');
  }
});

/**
 * GET /payment-links/:id
 * Returns a payment link scoped to the current organization. Expired links are
 * reported with an effective status of 'expired'.
 */
paymentLinkRouter.get('/:id', canRead, validateParams(paymentLinkIdParamSchema), async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;
  const { id } = req.params as { id: string };

  try {
    const paymentLink = await paymentService.getPaymentLink(organizationId, id);
    if (!paymentLink) {
      sendError(res, 'Payment link not found.', 'NOT_FOUND', 404);
      return;
    }
    sendSuccess(res, { paymentLink });
  } catch (err) {
    handleError(res, err, 'getPaymentLink');
  }
});

/**
 * POST /payments/create
 * Creates a provider payment order for an invoice. The client never decides
 * success: only the provider webhook may transition the payment to
 * 'successful'. Retries are deduplicated via an optional idempotency key.
 */
paymentRouter.post('/create', canWrite, validateBody(paymentCreateSchema), async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;

  try {
    const result = await paymentService.createPayment(organizationId, req.body);
    sendSuccess(res, result, 201);
  } catch (err) {
    handleError(res, err, 'createPayment');
  }
});

/**
 * GET /invoices/:id/payments
 * Lists payments for an invoice, scoped to the current organization.
 */
paymentRouter.get('/invoices/:id/payments', canRead, async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;
  const { id } = req.params as { id: string };

  try {
    const payments = await paymentService.getInvoicePayments(
      organizationId,
      id
    );

    sendSuccess(res, { payments });
  } catch (err) {
    handleError(res, err, 'getInvoicePayments');
  }
});
