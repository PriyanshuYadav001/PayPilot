/**
 * Follow-up automation worker.
 * Runs separately from the HTTP server. Polls for pending tasks and schedules
 * new follow-ups based on configured rules.
 *
 * Usage:
 *   npm run worker           — production/development
 *   TICK_INTERVAL_MS=30000 npm run worker  — custom tick interval
 */

import dotenv from 'dotenv';
dotenv.config();

import { logger } from '../utils/logger';
import { createScheduler } from '../services/followup/scheduler';

const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS ?? '60000', 10);

const scheduler = createScheduler({
  tickIntervalMs: TICK_INTERVAL_MS,
  enableRuleMatching: true,
  enableTaskExecution: true,
});

// Graceful shutdown
function shutdown(signal: string): void {
  logger.info(`worker: received ${signal}, shutting down gracefully`);
  scheduler.stop();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logger.error('worker: uncaught exception', err);
  scheduler.stop();
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('worker: unhandled rejection', reason);
});

logger.info('worker: starting follow-up automation worker', {
  tickIntervalMs: TICK_INTERVAL_MS,
  pid: process.pid,
});

scheduler.start();
