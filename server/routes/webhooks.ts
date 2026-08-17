import { Router, Request, Response } from 'express';
import { paymentService, PaymentError } from '../services/payment/paymentService';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

/**
 * Provider webhook listener.
 *
 * These routes deliberately bypass authentication and org-context middleware:
 * authenticity is established by the provider's signature (e.g. Razorpay's
 * HMAC-SHA256 `x-razorpay-signature` header over the raw request body).
 */
export const webhookRouter = Router();

webhookRouter.post(
  '/payment',
  async (req: Request, res: Response) => {
    const provider = String((req.body as { provider?: unknown } | undefined)?.provider ?? 'razorpay');
    const signature = String(req.headers['x-razorpay-signature'] ?? '');

    try {
      const result = await paymentService.handlePaymentWebhook(
        (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(''),
        signature,
        provider
      );
      sendSuccess(res, { handled: true, event: result.event });
    } catch (err) {
      if (err instanceof PaymentError) {
        sendError(res, err.message, err.code, err.statusCode);
        return;
      }
      logger.error('Payment webhook error', err);
      sendError(res, 'An unexpected error occurred.', 'INTERNAL_SERVER_ERROR', 500);
    }
  }
);
