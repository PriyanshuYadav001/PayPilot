import { Router, Request, Response } from 'express';
import { sendSuccess } from '../utils/response';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  sendSuccess(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'paypilot-api',
    environment: process.env.NODE_ENV || 'development',
  });
});
