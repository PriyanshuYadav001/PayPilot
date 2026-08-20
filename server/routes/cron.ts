import { Router, Request, Response } from 'express';
import { matchRulesAndCreateTasks } from '../services/followup/ruleMatcher';
import { processPendingTasks } from '../services/followup/taskExecutor';
import { checkMissedPromises } from '../services/paymentPromiseService';
import { logger } from '../utils/logger';
import { sendError, sendSuccess } from '../utils/response';
import { isValidCronSecret } from './cronAuth';

export const cronRouter = Router();
let inFlight = false;

cronRouter.post('/process-followups', async (_req: Request, res: Response) => {
  if (!process.env.CRON_SECRET) {
    sendError(res, 'CRON_SECRET is not configured.', 'CRON_SECRET_NOT_CONFIGURED', 503);
    return;
  }

  if (!isValidCronSecret(_req.header('x-cron-secret'))) {
    sendError(res, 'Invalid or missing cron secret.', 'UNAUTHORIZED', 401);
    return;
  }

  if (inFlight) {
    sendError(res, 'A follow-up pass is already running.', 'CRON_ALREADY_RUNNING', 409);
    return;
  }

  inFlight = true;
  try {
    const tasksCreated = await matchRulesAndCreateTasks();
    const tasksProcessed = await processPendingTasks();
    const missedPromises = await checkMissedPromises();
    logger.info('cron: follow-up pass completed', { tasksCreated, tasksProcessed, missedPromises });
    sendSuccess(res, { tasksCreated, tasksProcessed, missedPromises });
  } catch (err) {
    logger.error('cron: follow-up pass failed', err);
    sendError(res, 'Failed to process follow-ups.', 'CRON_PROCESS_FOLLOWUPS_FAILED', 500);
  } finally {
    inFlight = false;
  }
});
