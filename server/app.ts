import express, { Express } from 'express';
import cors from 'cors';
import { apiRouter } from './routes';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  // Standard middleware
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));

  // Capture the raw request body before express.json parses it. Provider
  // webhook signatures (e.g. Razorpay HMAC) are computed over these bytes.
  // Only JSON payloads are captured so multipart uploads (multer/busboy) are
  // never disturbed.
  app.use((req, _res, next) => {
    if ((req.headers['content-type'] ?? '').includes('application/json')) {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        req.rawBody = Buffer.concat(chunks);
      });
    }
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Root health check
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'paypilot-backend',
    });
  });

  // Mount API v1 router
  app.use('/api/v1', apiRouter);

  // Error handling middleware
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
