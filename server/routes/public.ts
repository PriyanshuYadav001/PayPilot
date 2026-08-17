import { Router, Request, Response } from 'express';
import { validateParams } from '../middleware/validate';
import { publicPaymentTokenParamSchema } from '../validators/payment';
import { paymentService, PaymentError } from '../services/payment/paymentService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

/**
 * Public, unauthenticated payment endpoints for the customer payment page
 * (/pay/:token).
 *
 * Customers do NOT have a PayPilot account. They are identified only by the
 * secure `public_token` (a random UUID) stored on the payment link. Internal
 * ids (payment link id, invoice id, organization id) are never exposed, and
 * the payable amount is always resolved server-side.
 */
export const publicRouter = Router();

function handleError(res: Response, err: unknown): void {
  if (err instanceof PaymentError) {
    sendError(res, err.message, err.code, err.statusCode);
    return;
  }
  logger.error('Public payment endpoint error', err);
  sendError(res, 'An unexpected error occurred.', 'INTERNAL_SERVER_ERROR', 500);
}

publicRouter.get(
  '/payment-links/:token',
  validateParams(publicPaymentTokenParamSchema),
  async (req: Request, res: Response) => {
    const { token } = req.params as { token: string };
    try {
      const paymentPage = await paymentService.getPublicPaymentPage(token);
      if (!paymentPage) {
        sendError(res, 'Payment link not found or no longer available.', 'PAYMENT_LINK_NOT_FOUND', 404);
        return;
      }
      sendSuccess(res, { paymentPage });
    } catch (err) {
      handleError(res, err);
    }
  }
);

publicRouter.post(
  '/payment-links/:token/payments',
  validateParams(publicPaymentTokenParamSchema),
  async (req: Request, res: Response) => {
    const { token } = req.params as { token: string };
    try {
      // The request body is deliberately ignored: the payable amount is always
      // derived from the stored payment link and current invoice balance.
      const checkout = await paymentService.createPublicCheckout(token);
      sendSuccess(res, { checkout }, 201);
    } catch (err) {
      handleError(res, err);
    }
  }
);
