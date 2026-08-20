/**
 * WhatsApp webhook handler for Meta Cloud API callbacks.
 *
 * Handles:
 *   - Incoming messages (customer replies)
 *   - Delivery status updates (sent, delivered, read)
 *   - Failed message notifications
 *
 * All events are verified via HMAC-SHA256 signature and processed
 * idempotently using the webhook_events table (provider_event_id unique key).
 *
 * Never fakes delivery — only updates based on actual provider callbacks.
 */

import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import { toJson } from '../utils/json';
import { sendSuccess, sendError } from '../utils/response';

export const whatsappWebhookRouter = Router();

const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 */
function verifySignature(rawBody: Buffer, signature: string): boolean {
  if (!WHATSAPP_APP_SECRET) {
    logger.warn('WHATSAPP_APP_SECRET not configured — skipping webhook verification');
    return false;
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

/**
 * Meta webhook verification endpoint (GET).
 * Called by Meta to verify the webhook URL during setup.
 */
whatsappWebhookRouter.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified by Meta');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('WhatsApp webhook verification failed', { mode, token });
  res.sendStatus(403);
});

/**
 * WhatsApp webhook event receiver (POST).
 * Processes incoming messages, delivery status, and failure notifications.
 */
whatsappWebhookRouter.post('/whatsapp', async (req: Request, res: Response) => {
  // Verify HMAC signature
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  if (!rawBody || !signature) {
    sendError(res, 'Missing request body or signature.', 'MISSING_SIGNATURE', 400);
    return;
  }

  if (!verifySignature(rawBody, signature)) {
    sendError(res, 'Invalid webhook signature.', 'INVALID_SIGNATURE', 401);
    return;
  }

  // Always respond 200 quickly to acknowledge receipt
  res.sendStatus(200);

  // Process asynchronously
  try {
    const body = req.body as Record<string, unknown>;
    const entries = (body.entry ?? []) as Array<Record<string, unknown>>;

    for (const entry of entries) {
      const changes = (entry.changes ?? []) as Array<Record<string, unknown>>;

      for (const change of changes) {
        const value = change.value as Record<string, unknown> | undefined;
        if (!value) continue;

        const phoneNumberId = value['phone_number_id'] as string | undefined;

        // Process status updates
        const statuses = (value.statuses ?? []) as Array<Record<string, unknown>>;
        for (const status of statuses) {
          await processStatusUpdate(status, phoneNumberId);
        }

        // Process incoming messages
        const messages = (value.messages ?? []) as Array<Record<string, unknown>>;
        for (const message of messages) {
          await processIncomingMessage(message, value, phoneNumberId);
        }
      }
    }
  } catch (err) {
    logger.error('WhatsApp webhook processing failed', err);
  }
});

async function processStatusUpdate(
  status: Record<string, unknown>,
  phoneNumberId: string | undefined,
): Promise<void> {
  const providerEventId = status.id as string;
  const statusField = status.status as string; // 'sent', 'delivered', 'read', 'failed'
  const timestamp = status.timestamp as string;
  const recipientId = status.recipient_id as string;
  const errors = (status.errors ?? []) as Array<Record<string, unknown>>;

  if (!providerEventId) return;

  // Idempotency: check if already processed
  const { data: existing } = await supabaseServer
    .from('webhook_events')
    .select('id')
    .eq('provider', 'meta_whatsapp')
    .eq('provider_event_id', providerEventId)
    .maybeSingle();

  if (existing) {
    logger.debug('WhatsApp status event already processed', { providerEventId });
    return;
  }

  // Map Meta status to our communication status
  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  };
  const mappedStatus = statusMap[statusField] ?? 'sent';

  // Record the webhook event
  await supabaseServer
    .from('webhook_events')
    .insert({
      provider: 'meta_whatsapp',
      event_type: `status.${statusField}`,
      provider_event_id: providerEventId,
      payload: {
        status: statusField,
        recipient_id: recipientId,
        phone_number_id: phoneNumberId,
        errors: errors.length > 0 ? toJson(errors) : undefined,
      },
      is_processed: true,
      processed_at: new Date().toISOString(),
    });

  // Update the communication record with the actual provider status
  if (providerEventId) {
    const { error: updateErr } = await supabaseServer
      .from('communications')
      .update({
        status: mappedStatus as 'queued' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'bounced',
        metadata: {
          provider_status: statusField,
          updated_via: 'webhook',
          errors: errors.length > 0 ? toJson(errors) : undefined,
        },
      })
      .eq('provider_message_id', providerEventId)
      .eq('channel', 'whatsapp');

    if (updateErr) {
      logger.error('Failed to update communication status from WhatsApp webhook', {
        providerEventId,
        status: statusField,
        error: updateErr.message,
      });
    } else {
      logger.info('WhatsApp delivery status updated', {
        providerEventId,
        status: statusField,
        recipientId,
      });
    }
  }
}

async function processIncomingMessage(
  message: Record<string, unknown>,
  value: Record<string, unknown>,
  phoneNumberId: string | undefined,
): Promise<void> {
  const providerMessageId = message.id as string;
  const from = message.from as string; // Customer phone number
  const timestamp = message.timestamp as string;
  const messageType = message.type as string;

  if (!providerMessageId || !from) return;

  // Idempotency: check if already processed
  const { data: existing } = await supabaseServer
    .from('webhook_events')
    .select('id')
    .eq('provider', 'meta_whatsapp')
    .eq('provider_event_id', providerMessageId)
    .maybeSingle();

  if (existing) {
    logger.debug('WhatsApp incoming message already processed', { providerMessageId });
    return;
  }

  // Extract message body
  let messageBody = '';
  if (messageType === 'text') {
    const textObj = message.text as Record<string, unknown> | undefined;
    messageBody = (textObj?.body as string) ?? '';
  } else if (messageType === 'image') {
    messageBody = '[Image received]';
  } else if (messageType === 'document') {
    messageBody = '[Document received]';
  } else if (messageType === 'audio') {
    messageBody = '[Audio received]';
  } else {
    messageBody = `[${messageType} message]`;
  }

  // Try to match the incoming phone number to a customer
  const normalizedFrom = from.replace(/[\s()-]/g, '');
  const phonePatterns = [normalizedFrom, `+${normalizedFrom}`, from];

  let matchedCustomerId: string | null = null;
  let matchedOrganizationId: string | null = null;

  for (const phone of phonePatterns) {
    const { data: customer } = await supabaseServer
      .from('customers')
      .select('id, organization_id')
      .or(`whatsapp_number.eq.${phone},phone.eq.${phone}`)
      .maybeSingle();

    if (customer) {
      matchedCustomerId = customer.id as string;
      matchedOrganizationId = customer.organization_id as string;
      break;
    }
  }

  // Record the webhook event
  await supabaseServer
    .from('webhook_events')
    .insert({
      provider: 'meta_whatsapp',
      event_type: 'message.incoming',
      provider_event_id: providerMessageId,
      payload: {
        from,
        type: messageType,
        body: messageBody,
        phone_number_id: phoneNumberId,
      },
      organization_id: matchedOrganizationId ?? undefined,
      is_processed: true,
      processed_at: new Date().toISOString(),
    });

  // Record in communications if we matched a customer
  if (matchedCustomerId && matchedOrganizationId) {
    const { data: commInsert } = await supabaseServer
      .from('communications')
      .insert({
        organization_id: matchedOrganizationId,
        customer_id: matchedCustomerId,
        channel: 'whatsapp',
        direction: 'inbound',
        message: messageBody,
        status: 'delivered',
        provider_message_id: providerMessageId,
        recipient_identifier: phoneNumberId ?? '',
        sender_identifier: from,
        sent_at: new Date(Number(timestamp) * 1000).toISOString(),
        metadata: {
          type: messageType,
          from,
          updated_via: 'webhook',
        },
      })
      .select('id')
      .maybeSingle();

    const communicationId = (commInsert as { id: string } | null)?.id ?? undefined;

    logger.info('WhatsApp inbound message recorded', {
      providerMessageId,
      from,
      customerId: matchedCustomerId,
      organizationId: matchedOrganizationId,
      type: messageType,
    });

    // Run AI classification + intent processing asynchronously
    // Failures here are logged but do not affect the webhook response
    if (messageType === 'text' && messageBody.trim().length > 0) {
      try {
        const { processIntent } = await import('../services/ai/intentProcessor');
        const result = await processIntent({
          organizationId: matchedOrganizationId,
          customerId: matchedCustomerId,
          communicationId,
          channel: 'whatsapp',
          rawMessage: messageBody,
        });

        logger.info('AI intent processed', {
          intent: result.intent,
          actionTaken: result.actionTaken,
          injectionDetected: result.injectionDetected,
          customerId: matchedCustomerId,
          organizationId: matchedOrganizationId,
          promiseId: result.promiseId,
          warnings: result.warnings,
        });
      } catch (aiErr) {
        // AI processing failure must not break the webhook
        logger.error('AI intent processing failed', {
          error: aiErr instanceof Error ? aiErr.message : String(aiErr),
          customerId: matchedCustomerId,
          organizationId: matchedOrganizationId,
        });
      }
    }
  } else {
    logger.warn('WhatsApp inbound message — no matching customer found', {
      providerMessageId,
      from,
    });
  }
}
