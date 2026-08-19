import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext } from '../middleware/tenant';
import { communicationService } from '../services/communication/communicationService';
import { InvoiceService } from '../services/invoiceService';
import { paymentPromiseService } from '../services/paymentPromiseService';
import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import { sendSuccess, sendError } from '../utils/response';

const analyticsRouter = Router();

// All analytics endpoints require an authenticated, org-scoped request.
analyticsRouter.use(requireAuth, requireOrgContext);

// ─── Helper: safe number parsing ────────────────────────────────────────────

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

// ─── Endpoint: GET /analytics/overview ─────────────────────────────────────

analyticsRouter.get('/overview', async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;
  try {
    const invoicesResult = await InvoiceService.getInvoices(organizationId, undefined, undefined, undefined, 1, 100);
    const allInvoices = invoicesResult.data || [];

    let totalOutstanding = 0;
    let totalOverdue = 0;
    let totalCollected = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let totalDsoDays = 0;
    let dsoCount = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const inv of allInvoices) {
      const status = inv.status as string | undefined;
      const amountDue = safeNum(inv.amountDue);
      const amountPaid = safeNum(inv.amountPaid);
      const dueDate = inv.dueDate as string | undefined;

      if (status === 'paid') {
        totalCollected += amountPaid;
        paidCount++;
        continue;
      }
      if (status === 'cancelled') continue;

      pendingCount++;
      totalOutstanding += amountDue;

      // isOverdue check
      let isOverdue = false;
      if (dueDate && amountDue > 0) {
        const invDue = new Date(dueDate);
        const invToday = new Date(today);
        const days = Math.max(0, Math.round((invToday.getTime() - invDue.getTime()) / 86400000));
        isOverdue = days > 0;
      }
      if (isOverdue) {
        totalOverdue += amountDue;
        overdueCount++;
      }

      // DSO calc
      if (dueDate) {
        const invDue = new Date(dueDate);
        const invToday = new Date(today);
        const days = Math.max(0, Math.round((invToday.getTime() - invDue.getTime()) / 86400000));
        totalDsoDays += days;
        dsoCount++;
      }
    }

    const collectionEfficiencyRate =
      totalOutstanding > 0 || totalCollected > 0
        ? (totalCollected / (totalCollected + totalOutstanding)) * 100
        : 0;
    const averageDsoDays = dsoCount > 0 ? Math.round(totalDsoDays / dsoCount) : 0;

    sendSuccess(res, {
      totalOutstanding: Math.round(totalOutstanding),
      overdueAmount: Math.round(totalOverdue),
      averageDsoDays,
      collectionEfficiencyRate: Math.round(collectionEfficiencyRate * 100) / 100,
    });
  } catch (err) {
    logger.error('analytics:overview failed', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    sendError(res, 'Failed to load analytics overview.', 'ANALYTICS_OVERVIEW_FAILED', 500);
  }
});

// ─── Endpoint: GET /analytics/aging-buckets ────────────────────────────────

analyticsRouter.get('/aging-buckets', async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;
  try {
    const invoicesResult = await InvoiceService.getInvoices(organizationId, undefined, undefined, undefined, 1, 100);
    const allInvoices = invoicesResult.data || [];

    const today = new Date().toISOString().split('T')[0];

    let current = 0;
    let bucket1_30 = 0;
    let bucket31_60 = 0;
    let bucket90Plus = 0;

    for (const inv of allInvoices) {
      const status = inv.status as string | undefined;
      const amountDue = safeNum(inv.amountDue);
      const dueDate = inv.dueDate as string | undefined;

      if (status === 'paid' || status === 'cancelled') continue;
      if (!dueDate || amountDue === 0) continue;

      const invDue = new Date(dueDate);
      const invToday = new Date(today);
      const daysOverdue = Math.max(0, Math.round((invToday.getTime() - invDue.getTime()) / 86400000));

      if (daysOverdue <= 0) {
        current += amountDue;
      } else if (daysOverdue <= 30) {
        bucket1_30 += amountDue;
      } else if (daysOverdue <= 60) {
        bucket31_60 += amountDue;
      } else {
        bucket90Plus += amountDue;
      }
    }

    sendSuccess(res, {
      current: Math.round(current),
      bucket1_30: Math.round(bucket1_30),
      bucket31_60: Math.round(bucket31_60),
      bucket90Plus: Math.round(bucket90Plus),
    });
  } catch (err) {
    logger.error('analytics:aging-buckets failed', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    sendError(res, 'Failed to load aging buckets.', 'ANALYTICS_AGING_BUCKETS_FAILED', 500);
  }
});

// ─── Endpoint: GET /analytics/channel-performance ──────────────────────────

analyticsRouter.get('/channel-performance', async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;
  try {
    const historyResult = await communicationService.getCommunicationHistory(organizationId, {
      page: 1,
      limit: 100,
    });
    const comms = historyResult.communications || [];

    let emailSent = 0, emailDelivered = 0;
    let whatsappSent = 0, whatsappDelivered = 0;
    let callSent = 0, callDelivered = 0;

    for (const c of comms) {
      const channel = c.channel as string | undefined;
      const direction = c.direction as string | undefined;
      if (!channel || !direction) continue;

      const isOutbound = direction === 'outbound';

      if (channel === 'email') {
        if (isOutbound) {
          emailSent++;
        } else {
          emailDelivered++;
        }
      } else if (channel === 'whatsapp') {
        if (isOutbound) {
          whatsappSent++;
        } else {
          whatsappDelivered++;
        }
      } else if (channel === 'call') {
        if (isOutbound) {
          callSent++;
        } else {
          callDelivered++;
        }
      }
    }

    const emailConversion = emailSent > 0 ? Math.round((emailDelivered / emailSent) * 100) : 0;
    const whatsappConversion = whatsappSent > 0 ? Math.round((whatsappDelivered / whatsappSent) * 100) : 0;
    const callConversion = callSent > 0 ? Math.round((callDelivered / callSent) * 100) : 0;

    sendSuccess(res, {
      emailConversion,
      whatsappConversion,
      callConversion,
    });
  } catch (err) {
    logger.error('analytics:channel-performance failed', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    sendError(res, 'Failed to load channel performance.', 'ANALYTICS_CHANNEL_PERF_FAILED', 500);
  }
});

// ─── Endpoint: GET /analytics/promise-accuracy ─────────────────────────────

analyticsRouter.get('/promise-accuracy', async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;
  try {
    const promisesResult = await paymentPromiseService.listPromises(organizationId, {
      page: 1,
      limit: 100,
      sortBy: 'promised_date',
      sortOrder: 'asc',
    });
    const allPromises = promisesResult.promises || [];

    const totalPromises = allPromises.length;
    if (totalPromises === 0) {
      sendSuccess(res, {
        totalPromises: 0,
        keptPercentage: 0,
        brokenPercentage: 0,
      });
      return;
    }

    let keptCount = 0;
    let missedCount = 0;

    for (const p of allPromises) {
      const status = p.status as string | undefined;
      if (status === 'fulfilled') keptCount++;
      else if (status === 'missed') missedCount++;
    }

    const keptPercentage = Math.round((keptCount / totalPromises) * 100);
    const brokenPercentage = Math.round((missedCount / totalPromises) * 100);

    sendSuccess(res, {
      totalPromises,
      keptPercentage,
      brokenPercentage,
    });
  } catch (err) {
    logger.error('analytics:promise-accuracy failed', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    sendError(res, 'Failed to load promise accuracy.', 'ANALYTICS_PROMISE_ACCURACY_FAILED', 500);
  }
});

// ─── Endpoint: GET /analytics/summary ──────────────────────────────────────

analyticsRouter.get('/summary', async (req: Request, res: Response) => {
  const { organizationId } = req.tenant!;
  try {
    const invoicesResult = await InvoiceService.getInvoices(organizationId, undefined, undefined, undefined, 1, 100);
    const allInvoices = invoicesResult.data || [];

    const communicationsResult = await communicationService.getCommunicationHistory(organizationId, {
      page: 1,
      limit: 100,
    });
    const comms = communicationsResult.communications || [];

    const promisesResult = await paymentPromiseService.listPromises(organizationId, {
      page: 1,
      limit: 100,
      sortBy: 'promised_date',
      sortOrder: 'asc',
    });
    const allPromises = promisesResult.promises || [];

    const today = new Date().toISOString().split('T')[0];

    let totalOutstanding = 0;
    let totalOverdue = 0;
    let totalCollected = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let totalDsoDays = 0;
    let dsoCount = 0;
    let followupsSent = 0;

    for (const c of comms) {
      if (c.channel === 'email' || c.channel === 'whatsapp' || c.channel === 'call') {
        if (c.direction === 'outbound') followupsSent++;
      }
    }

    const totalPromises = allPromises.length;
    let keptCount = 0;
    let missedCount = 0;

    for (const p of allPromises) {
      const status = p.status as string | undefined;
      if (status === 'fulfilled') keptCount++;
      else if (status === 'missed') missedCount++;
    }

    for (const inv of allInvoices) {
      const status = inv.status as string | undefined;
      const amountDue = safeNum(inv.amountDue);
      const amountPaid = safeNum(inv.amountPaid);
      const dueDate = inv.dueDate as string | undefined;

      if (status === 'paid') {
        totalCollected += amountPaid;
        paidCount++;
        continue;
      }
      if (status === 'cancelled') continue;

      pendingCount++;
      totalOutstanding += amountDue;

      // isOverdue check
      let isOverdue = false;
      if (dueDate && amountDue > 0) {
        const invDue = new Date(dueDate);
        const invToday = new Date(today);
        const days = Math.max(0, Math.round((invToday.getTime() - invDue.getTime()) / 86400000));
        isOverdue = days > 0;
      }
      if (isOverdue) {
        totalOverdue += amountDue;
        overdueCount++;
      }

      // DSO calc
      if (dueDate) {
        const invDue = new Date(dueDate);
        const invToday = new Date(today);
        const days = Math.max(0, Math.round((invToday.getTime() - invDue.getTime()) / 86400000));
        totalDsoDays += days;
        dsoCount++;
      }
    }

    const collectionEfficiencyRate =
      totalOutstanding > 0 || totalCollected > 0
        ? (totalCollected / (totalCollected + totalOutstanding)) * 100
        : 0;
    const averageDsoDays = dsoCount > 0 ? Math.round(totalDsoDays / dsoCount) : 0;

    sendSuccess(res, {
      totalOutstanding: Math.round(totalOutstanding),
      overdueAmount: Math.round(totalOverdue),
      collectionEfficiencyRate: Math.round(collectionEfficiencyRate * 100) / 100,
      averageDsoDays,
      followupsSent,
      totalPromises,
      keptCount,
      missedCount,
      paidCount,
      pendingCount,
      overdueCount,
    });
  } catch (err) {
    logger.error('analytics:summary failed', {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    sendError(res, 'Failed to load analytics summary.', 'ANALYTICS_SUMMARY_FAILED', 500);
  }
});

export default analyticsRouter;