import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgContext, requireRole } from '../middleware/tenant';
import { validateBody, validateQuery } from '../middleware/validate';
import { communicationSendSchema, communicationListQuerySchema } from '../validators/communication';
import { communicationService } from '../services/communication/communicationService';
import { CommunicationError } from '../services/communication';
import { sendSuccess, sendError } from '../utils/response';
import { logger } from '../utils/logger';

export const communicationRouter = Router();

// All communication endpoints require an authenticated, org-scoped request.
communicationRouter.use(requireAuth, requireOrgContext);

const canRead = requireRole(['owner', 'admin', 'member', 'viewer']);
const canWrite = requireRole(['owner', 'admin', 'member']);

function handleError(res: Response, err: unknown, context: string): void {
  if (err instanceof CommunicationError) {
    sendError(res, err.message, err.code, err.statusCode);
    return;
  }
  logger.error(`${context}: unexpected error`, err instanceof Error ? err.message : err);
  sendError(res, 'An unexpected error occurred.', 'INTERNAL_SERVER_ERROR', 500);
}

/**
 * GET /communications
 * Unified, org-scoped audit trail of sent and received messages, filterable
 * by channel, customer, invoice and direction.
 */
communicationRouter.get(
  '/',
  canRead,
  validateQuery(communicationListQuerySchema),
  async (req: Request, res: Response) => {
    const { organizationId } = req.tenant!;
    const params = req.query as unknown as {
      page: number;
      limit: number;
      channel?: string;
      customerId?: string;
      invoiceId?: string;
      direction?: string;
    };

    try {
      const result = await communicationService.getCommunicationHistory(organizationId, {
        page: params.page,
        limit: params.limit,
        channel: params.channel as 'email' | 'whatsapp' | 'call' | undefined,
        customerId: params.customerId,
        invoiceId: params.invoiceId,
        direction: params.direction as 'outbound' | 'inbound' | undefined,
      });
      sendSuccess(
        res,
        { communications: result.communications },
        200,
        {
          page: result.page,
          limit: result.limit,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
        }
      );
    } catch (err) {
      handleError(res, err, 'listCommunications');
    }
  }
);

/**
 * POST /communications/send
 * Sends an outbound message via the channel's provider and records it in the
 * unified timeline. The amount of provider-specific detail in this route is
 * zero: it only forwards a validated, org-scoped request to the service.
 */
communicationRouter.post(
  '/send',
  canWrite,
  validateBody(communicationSendSchema),
  async (req: Request, res: Response) => {
    const { organizationId } = req.tenant!;

    try {
      const communication = await communicationService.sendMessage(organizationId, req.body);
      sendSuccess(res, { communication }, 201);
    } catch (err) {
      handleError(res, err, 'sendMessage');
    }
  }
);
