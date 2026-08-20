import { supabaseServer } from '../../lib/supabaseClient';
import { logger } from '../../utils/logger';
import type { Communication } from '../../../shared/types';
import {
  CommunicationError,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  ProviderDispatchResult,
} from './CommunicationProvider';
import { getCommunicationProvider } from './index';
import type { EmailPayload, EmailDeliveryResult } from './EmailProvider';
import type { WhatsAppDirectMessagePayload, WhatsAppDeliveryResult } from './WhatsAppProvider';
import type { OutboundCallRequest, OutboundCallResponse } from './CallProvider';
import { toJson } from '../../utils/json';

export interface SendMessageInput {
  customerId: string;
  invoiceId?: string;
  channel: CommunicationChannel;
  message: string;
  subject?: string;
  metadata?: Record<string, unknown>;
}

export interface RecordCommunicationInput {
  customerId: string;
  invoiceId?: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  message: string;
  status: CommunicationStatus;
  subject?: string;
  providerMessageId?: string;
  recipientIdentifier?: string;
  senderIdentifier?: string;
  sentAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CommunicationListParams {
  page: number;
  limit: number;
  channel?: CommunicationChannel;
  customerId?: string;
  invoiceId?: string;
  direction?: CommunicationDirection;
}

export interface CommunicationListResult {
  communications: Communication[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CustomerRow {
  id: string;
  email?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
}

function mapCommunication(row: Record<string, unknown>): Communication {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    customerId: row.customer_id as string,
    invoiceId: (row.invoice_id as string | null) ?? undefined,
    channel: row.channel as CommunicationChannel,
    direction: row.direction as CommunicationDirection,
    message: row.message as string,
    status: row.status as CommunicationStatus,
    providerMessageId: (row.provider_message_id as string | null) ?? undefined,
    sentAt: row.sent_at as string,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: row.created_at as string,
  };
}

function normalizePhone(value: string): string {
  const digits = value.replace(/[\s()-]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function channelRecipient(customer: CustomerRow, channel: CommunicationChannel): string {
  if (channel === 'email') return customer.email ?? '';
  if (channel === 'whatsapp') return customer.whatsapp_number ?? customer.phone ?? '';
  return customer.phone ?? '';
}

async function loadCustomer(organizationId: string, customerId: string): Promise<CustomerRow> {
  const { data, error } = await supabaseServer
    .from('customers')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', customerId)
    .maybeSingle();

  if (error) {
    logger.error('loadCustomer failed for communication', error.message);
    throw new CommunicationError('Failed to load customer.', 'COMMUNICATION_READ_FAILED', 500);
  }
  if (!data) {
    throw new CommunicationError('Customer not found in this organization.', 'CUSTOMER_NOT_FOUND', 404);
  }
  return data as CustomerRow;
}

async function assertInvoiceScoped(organizationId: string, invoiceId?: string): Promise<void> {
  if (!invoiceId) return;
  const { data, error } = await supabaseServer
    .from('invoices')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) {
    logger.error('assertInvoiceScoped failed', error.message);
    throw new CommunicationError('Failed to validate invoice.', 'COMMUNICATION_READ_FAILED', 500);
  }
  if (!data) {
    throw new CommunicationError('Invoice not found in this organization.', 'INVOICE_NOT_FOUND', 404);
  }
}

function buildEmailPayload(customer: CustomerRow, input: SendMessageInput): EmailPayload {
  if (!customer.email) {
    throw new CommunicationError('Customer has no email address.', 'CUSTOMER_NO_EMAIL', 400);
  }
  return {
    to: customer.email,
    subject: input.subject ?? 'Reminder from PayPilot',
    html: input.message,
    text: input.message,
    trackingId: typeof input.metadata?.trackingId === 'string' ? input.metadata.trackingId : undefined,
  };
}

function buildWhatsAppPayload(customer: CustomerRow, input: SendMessageInput): WhatsAppDirectMessagePayload {
  const phone = customer.whatsapp_number ?? customer.phone;
  if (!phone) {
    throw new CommunicationError('Customer has no phone number.', 'CUSTOMER_NO_PHONE', 400);
  }
  return { to: normalizePhone(phone), body: input.message };
}

function buildCallPayload(customer: CustomerRow, input: SendMessageInput): OutboundCallRequest {
  if (!customer.phone) {
    throw new CommunicationError('Customer has no phone number.', 'CUSTOMER_NO_PHONE', 400);
  }
  return {
    to: normalizePhone(customer.phone),
    scriptText: input.message,
    metadata: input.metadata as Record<string, string> | undefined,
  };
}

function mapWhatsAppStatus(status: WhatsAppDeliveryResult['status']): 'queued' | 'sent' | 'failed' {
  if (status === 'failed') return 'failed';
  if (status === 'accepted') return 'queued';
  return 'sent';
}

function mapCallStatus(status: OutboundCallResponse['status']): 'queued' | 'sent' | 'failed' {
  if (status === 'completed' || status === 'in-progress') return 'sent';
  if (status === 'failed' || status === 'busy' || status === 'no-answer') return 'failed';
  return 'queued';
}

async function dispatchChannel(customer: CustomerRow, input: SendMessageInput): Promise<ProviderDispatchResult> {
  const provider = getCommunicationProvider(input.channel);

  switch (input.channel) {
    case 'email': {
      if (!('sendEmail' in provider)) {
        throw new CommunicationError('Email provider is not configured.', 'COMMUNICATION_PROVIDER_NOT_CONFIGURED', 503);
      }
      const result: EmailDeliveryResult = await provider.sendEmail(buildEmailPayload(customer, input));
      return {
        providerMessageId: result.messageId,
        status: result.status,
        timestamp: result.timestamp,
        rawStatus: result.status,
      };
    }
    case 'whatsapp': {
      if (!('sendTextMessage' in provider)) {
        throw new CommunicationError(
          'WhatsApp provider is not configured.',
          'COMMUNICATION_PROVIDER_NOT_CONFIGURED',
          503
        );
      }
      const result: WhatsAppDeliveryResult = await provider.sendTextMessage(buildWhatsAppPayload(customer, input));
      return {
        providerMessageId: result.providerMessageId,
        status: mapWhatsAppStatus(result.status),
        timestamp: result.timestamp,
        rawStatus: result.status,
      };
    }
    case 'call': {
      if (!('initiateOutboundCall' in provider)) {
        throw new CommunicationError('Call provider is not configured.', 'COMMUNICATION_PROVIDER_NOT_CONFIGURED', 503);
      }
      const result: OutboundCallResponse = await provider.initiateOutboundCall(buildCallPayload(customer, input));
      return {
        providerMessageId: result.providerCallId,
        status: mapCallStatus(result.status),
        timestamp: result.timestamp,
        rawStatus: result.status,
      };
    }
  }
}

/**
 * Send an outbound message through the channel's provider and record the
 * outcome in the unified communications timeline. The customer (and optional
 * invoice) are always scoped to the organization — nothing outside the tenant
 * can be addressed. Provider dispatch lives here, never in routes.
 */
export async function sendMessage(organizationId: string, input: SendMessageInput): Promise<Communication> {
  const customer = await loadCustomer(organizationId, input.customerId);
  await assertInvoiceScoped(organizationId, input.invoiceId);
  const dispatch = await dispatchChannel(customer, input);

  return recordCommunication(organizationId, {
    customerId: customer.id,
    invoiceId: input.invoiceId,
    channel: input.channel,
    direction: 'outbound',
    message: input.message,
    subject: input.subject,
    status: dispatch.status,
    providerMessageId: dispatch.providerMessageId,
    recipientIdentifier: channelRecipient(customer, input.channel),
    sentAt: dispatch.timestamp.toISOString(),
    metadata: { ...(input.metadata ?? {}), providerStatus: dispatch.rawStatus ?? dispatch.status },
  });
}

/**
 * Persist a communication row. Used by `sendMessage` after a successful
 * dispatch and directly by inbound webhook handlers. Callers must pass
 * tenant-scoped ids.
 */
export async function recordCommunication(
  organizationId: string,
  input: RecordCommunicationInput
): Promise<Communication> {
  const { data, error } = await supabaseServer
    .from('communications')
    .insert({
      organization_id: organizationId,
      customer_id: input.customerId,
      invoice_id: input.invoiceId ?? undefined,
      channel: input.channel,
      direction: input.direction,
      message: input.message,
      subject: input.subject ?? undefined,
      status: input.status,
      provider_message_id: input.providerMessageId ?? undefined,
      recipient_identifier: input.recipientIdentifier ?? '',
      sender_identifier: input.senderIdentifier ?? undefined,
      sent_at: input.sentAt ?? new Date().toISOString(),
    metadata: input.metadata ? toJson(input.metadata) : {},
    })
    .select('*')
    .single();

  if (error) {
    logger.error('recordCommunication failed', error.message);
    throw new CommunicationError('Failed to record communication.', 'COMMUNICATION_WRITE_FAILED', 500);
  }

  return mapCommunication(data as Record<string, unknown>);
}

/**
 * Unified, org-scoped audit trail of sent and received messages, filterable by
 * channel, customer, invoice and direction.
 */
export async function getCommunicationHistory(
  organizationId: string,
  params: CommunicationListParams
): Promise<CommunicationListResult> {
  const { page, limit } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseServer.from('communications').select('*', { count: 'exact' });
  query = query.eq('organization_id', organizationId);

  if (params.channel) query = query.eq('channel', params.channel);
  if (params.customerId) query = query.eq('customer_id', params.customerId);
  if (params.invoiceId) query = query.eq('invoice_id', params.invoiceId);
  if (params.direction) query = query.eq('direction', params.direction);

  query = query.order('created_at', { ascending: false });
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    logger.error('getCommunicationHistory failed', error.message);
    throw new CommunicationError('Failed to list communications.', 'COMMUNICATION_LIST_FAILED', 500);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const totalCount = count ?? rows.length;

  return {
    communications: rows.map(mapCommunication),
    totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
  };
}

export const communicationService = {
  sendMessage,
  recordCommunication,
  getCommunicationHistory,
};
