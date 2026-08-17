import { Router } from 'express';
import { healthRouter } from './health';
import analyticsRouter from './analytics';
import { authRouter } from './auth';
import { customerRouter } from './customers';
import { invoiceRouter } from './invoices';
import { communicationRouter } from './communications';
import { followUpRuleRouter } from './followUpRules';
import { paymentPromiseRouter } from './paymentPromises';
import { callsRouter } from './calls';
import { paymentLinkRouter, paymentRouter } from './payments';
import { publicRouter } from './public';
import { webhookRouter } from './webhooks';
import { whatsappWebhookRouter } from './whatsappWebhooks';
import { settingsRoutes } from './settingsRoutes';

export const apiRouter = Router();

// Mount Health Check endpoint
apiRouter.use('/health', healthRouter);

// Mount Analytics endpoints
apiRouter.use('/analytics', analyticsRouter);

// Mount Authentication endpoints
apiRouter.use('/auth', authRouter);

// Mount Customer Management endpoints
apiRouter.use('/customers', customerRouter);

// Mount Invoice Management endpoints
apiRouter.use('/invoices', invoiceRouter);

// Mount Unified Communication endpoints
apiRouter.use('/communications', communicationRouter);

// Mount Follow-Up Rule Management endpoints
apiRouter.use('/follow-up-rules', followUpRuleRouter);

// Mount Payment Promise Tracking endpoints
apiRouter.use('/payment-promises', paymentPromiseRouter);
apiRouter.use('/settings', settingsRoutes);
apiRouter.use('/subscription', subscriptionRoutes);

// Mount Payment Link endpoints
apiRouter.use('/payment-links', paymentLinkRouter);

// Mount Calls endpoints
apiRouter.use('/calls', callsRouter);

// Mount Payment endpoints
apiRouter.use('/payments', paymentRouter);

// Mount Provider Webhook endpoints (unauthenticated; signature-verified)
apiRouter.use('/webhooks', webhookRouter);

// Mount WhatsApp webhook endpoints (unauthenticated; HMAC signature-verified)
apiRouter.use('/webhooks', whatsappWebhookRouter);

// Mount Public Payment endpoints (unauthenticated; secure public_token)
apiRouter.use('/public', publicRouter);