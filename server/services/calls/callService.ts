/**
 * Call service — manages the lifecycle of outbound calls for follow-up.
 *
 * Creates call records, tracks status, retrieves recordings/transcripts,
 * and feeds completed call data into the post-call processor.
 *
 * CRITICAL: Calls are never faked. If the provider is unavailable,
 * the service throws a clear error. No mock data is persisted.
 */

import { supabaseServer } from '../../lib/supabaseClient';
import { logger } from '../../utils/logger';
import type { Call, CallStatus } from '../../../shared/types';
import { getCallProvider } from './CallProvider';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateCallInput {
  organizationId: string;
  customerId: string;
  invoiceId?: string;
  followUpTaskId?: string;
  to: string;
  from?: string;
  scriptText?: string;
  metadata?: Record<string, unknown>;
}

export interface CallListParams {
  page: number;
  limit: number;
  status?: CallStatus;
  customerId?: string;
  invoiceId?: string;
}

export interface CallListResult {
  calls: Call[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Row mapping ───────────────────────────────────────────────────────────

interface CallRow {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_id: string | null;
  follow_up_task_id: string | null;
  provider: string;
  provider_call_id: string | null;
  from_number: string;
  to_number: string;
  status: string;
  duration_seconds: number;
  recording_url: string | null;
  transcript: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

function mapCall(row: CallRow): Call {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    invoiceId: row.invoice_id ?? undefined,
    followUpTaskId: row.follow_up_task_id ?? undefined,
    provider: row.provider,
    providerCallId: row.provider_call_id ?? undefined,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    status: row.status as CallStatus,
    durationSeconds: row.duration_seconds,
    recordingUrl: row.recording_url ?? undefined,
    transcript: row.transcript ?? undefined,
    summary: row.summary ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    createdAt: row.created_at,
  };
}

function normalizePhone(value: string): string {
  const digits = value.replace(/[\s()-]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

// ─── Service functions ─────────────────────────────────────────────────────

/**
 * Create a call record and initiate the outbound call via the provider.
 * Returns the created call with the provider's call ID.
 */
export async function createCall(input: CreateCallInput): Promise<Call> {
  const provider = getCallProvider();

  // Get the organization's phone number (from_number)
  const { data: orgData } = await supabaseServer
    .from('organizations')
    .select('support_phone, metadata')
    .eq('id', input.organizationId)
    .maybeSingle();

  const fromNumber = input.from
    ?? (orgData as Record<string, unknown> | null)?.support_phone as string
    ?? process.env.CALL_FROM_NUMBER
    ?? '';

  if (!fromNumber) {
    throw new Error('No from number configured. Set CALL_FROM_NUMBER or organization support_phone.');
  }

  // Initiate the call via provider
  const callResult = await provider.initiateCall({
    to: normalizePhone(input.to),
    from: normalizePhone(fromNumber),
    scriptText: input.scriptText,
    recordCall: true,
    metadata: input.metadata as Record<string, string> | undefined,
  });

  // Persist the call record
  const { data, error } = await supabaseServer
    .from('calls')
    .insert({
      organization_id: input.organizationId,
      customer_id: input.customerId,
      invoice_id: input.invoiceId ?? null,
      follow_up_task_id: input.followUpTaskId ?? null,
      provider: 'custom',
      provider_call_id: callResult.providerCallId,
      from_number: normalizePhone(fromNumber),
      to_number: normalizePhone(input.to),
      status: callResult.status,
      duration_seconds: 0,
      metadata: input.metadata ?? {},
      started_at: callResult.status === 'in_progress' ? new Date().toISOString() : null,
    })
    .select('*')
    .single();

  if (error) {
    logger.error('createCall: failed to persist call record', error.message);
    throw new Error(`Failed to create call record: ${error.message}`);
  }

  const call = mapCall(data as CallRow);

  logger.info('Call created', {
    callId: call.id,
    providerCallId: callResult.providerCallId,
    organizationId: input.organizationId,
    customerId: input.customerId,
    status: callResult.status,
  });

  return call;
}

/**
 * Poll the provider for the current status of a call.
 * Updates the local record with the latest status.
 */
export async function getCallStatus(callId: string, organizationId: string): Promise<Call | null> {
  // Load existing call
  const { data: existing } = await supabaseServer
    .from('calls')
    .select('*')
    .eq('id', callId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!existing) return null;

  const callRow = existing as CallRow;
  if (!callRow.provider_call_id) return mapCall(callRow);

  // Poll provider for latest status
  try {
    const provider = getCallProvider();
    const statusResult = await provider.getCallStatus(callRow.provider_call_id);

    // Map provider status to our enum
    const statusMap: Record<string, string> = {
      queued: 'queued',
      ringing: 'ringing',
      'in-progress': 'in_progress',
      in_progress: 'in_progress',
      completed: 'completed',
      busy: 'busy',
      'no-answer': 'no_answer',
      no_answer: 'no_answer',
      failed: 'failed',
    };
    const mappedStatus = (statusMap[statusResult.status] ?? statusResult.status) as CallStatus;

    // Update local record
    const updateData: Record<string, unknown> = { status: mappedStatus };
    if (statusResult.startedAt) updateData.started_at = statusResult.startedAt.toISOString();
    if (statusResult.endedAt) updateData.ended_at = statusResult.endedAt.toISOString();
    if (statusResult.durationSeconds !== undefined) updateData.duration_seconds = statusResult.durationSeconds;

    const { data: updated } = await supabaseServer
      .from('calls')
      .update(updateData)
      .eq('id', callId)
      .select('*')
      .single();

    return updated ? mapCall(updated as CallRow) : mapCall(callRow);
  } catch (err) {
    logger.error('getCallStatus: provider poll failed', {
      callId,
      error: err instanceof Error ? err.message : String(err),
    });
    return mapCall(callRow);
  }
}

/**
 * Get the full call result including recording, transcript, and AI summary.
 * Fetches recording from the provider if the call is completed and not yet retrieved.
 */
export async function getCallResult(callId: string, organizationId: string): Promise<Call | null> {
  const { data: existing } = await supabaseServer
    .from('calls')
    .select('*')
    .eq('id', callId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!existing) return null;

  const callRow = existing as CallRow;

  // If call is completed and we don't have transcript yet, fetch from provider
  if (callRow.status === 'completed' && !callRow.transcript && callRow.provider_call_id) {
    try {
      const provider = getCallProvider();
      const recording = await provider.getCallRecording(callRow.provider_call_id);

      if (recording) {
        const updateData: Record<string, unknown> = {
          recording_url: recording.recordingUrl,
          duration_seconds: recording.durationSeconds,
        };
        if (recording.transcript) updateData.transcript = recording.transcript;

        const { data: updated } = await supabaseServer
          .from('calls')
          .update(updateData)
          .eq('id', callId)
          .select('*')
          .single();

        if (updated) return mapCall(updated as CallRow);
      }
    } catch (err) {
      logger.error('getCallResult: recording fetch failed', {
        callId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return mapCall(callRow);
}

/**
 * Update the AI summary and transcript on a call record.
 * Called by the post-call processor after AI analysis.
 */
export async function updateCallResult(
  callId: string,
  organizationId: string,
  data: { transcript?: string; summary?: string; metadata?: Record<string, unknown> },
): Promise<Call | null> {
  const updateData: Record<string, unknown> = {};
  if (data.transcript !== undefined) updateData.transcript = data.transcript;
  if (data.summary !== undefined) updateData.summary = data.summary;
  if (data.metadata !== undefined) updateData.metadata = data.metadata;

  if (Object.keys(updateData).length === 0) return null;

  const { data: updated, error } = await supabaseServer
    .from('calls')
    .update(updateData)
    .eq('id', callId)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('updateCallResult failed', error.message);
    return null;
  }

  return updated ? mapCall(updated as CallRow) : null;
}

/**
 * List calls with pagination and optional filters.
 */
export async function listCalls(organizationId: string, params: CallListParams): Promise<CallListResult> {
  const { page, limit, status, customerId, invoiceId } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseServer
    .from('calls')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId);

  if (status) query = query.eq('status', status);
  if (customerId) query = query.eq('customer_id', customerId);
  if (invoiceId) query = query.eq('invoice_id', invoiceId);

  query = query.order('created_at', { ascending: false });
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    logger.error('listCalls failed', error.message);
    throw new Error('Failed to list calls.');
  }

  const rows = (data ?? []) as CallRow[];
  return {
    calls: rows.map(mapCall),
    totalCount: count ?? rows.length,
    page,
    limit,
    totalPages: Math.ceil((count ?? rows.length) / limit),
  };
}

export const callService = {
  createCall,
  getCallStatus,
  getCallResult,
  updateCallResult,
  listCalls,
};
