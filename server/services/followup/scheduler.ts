/**
 * Follow-up scheduler: the main loop that periodically runs rule matching
 * and task execution. Designed to run as a separate worker process.
 *
 * Uses database-backed scheduling — no setTimeout for production scheduling.
 * The worker polls at a configurable interval (default 60 seconds).
 */

import { logger } from '../../utils/logger';
import { matchRulesAndCreateTasks } from './ruleMatcher';
import { processPendingTasks } from './taskExecutor';
import { checkMissedPromises } from '../paymentPromiseService';

export interface SchedulerConfig {
  /** Interval in milliseconds between scheduler ticks (default: 60000 = 1 min) */
  tickIntervalMs: number;
  /** Whether to run rule matching on each tick (default: true) */
  enableRuleMatching: boolean;
  /** Whether to run task execution on each tick (default: true) */
  enableTaskExecution: boolean;
  /** Whether to check for missed payment promises on each tick (default: true) */
  enableMissedPromiseCheck: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  tickIntervalMs: 60_000,
  enableRuleMatching: true,
  enableTaskExecution: true,
  enableMissedPromiseCheck: true,
};

export function createScheduler(overrides?: Partial<SchedulerConfig>) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  let running = false;
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  async function tick(): Promise<void> {
    try {
      if (config.enableRuleMatching) {
        await matchRulesAndCreateTasks();
      }
    } catch (err) {
      logger.error('scheduler: rule matching tick failed', err);
    }

    try {
      if (config.enableTaskExecution) {
        await processPendingTasks();
      }
    } catch (err) {
      logger.error('scheduler: task execution tick failed', err);
    }

    try {
      if (config.enableMissedPromiseCheck) {
        await checkMissedPromises();
      }
    } catch (err) {
      logger.error('scheduler: missed promise check tick failed', err);
    }
  }

  function start(): void {
    if (running) {
      logger.warn('scheduler: already running');
      return;
    }

    running = true;
    logger.info('scheduler: starting', {
      tickIntervalMs: config.tickIntervalMs,
      ruleMatching: config.enableRuleMatching,
      taskExecution: config.enableTaskExecution,
      missedPromiseCheck: config.enableMissedPromiseCheck,
    });

    // Run first tick immediately
    tick();

    // Schedule subsequent ticks
    tickTimer = setInterval(() => {
      tick();
    }, config.tickIntervalMs);
  }

  function stop(): void {
    if (!running) return;

    running = false;
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    logger.info('scheduler: stopped');
  }

  function isRunning(): boolean {
    return running;
  }

  return { start, stop, isRunning, tick };
}
