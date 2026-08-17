/**
 * Post-call processor — Phase 21: AI analysis of call transcripts.
 *
 * Pipeline:
 *   Call result → transcript → AI analysis (transcriptAnalyzer) → structured extraction
 *   → create/update payment_promises → create/update disputes → store summary → communication history
 *
 * Uses the dedicated transcriptAnalyzer (not the generic messageClassifier)
 * because call transcripts can contain MULTIPLE intents in a single conversation.
 *
 * CRITICAL INVARIANT:
 *   AI NEVER marks a payment as received. Only verified payment records
 *   (webhook-confirmed entries in the `payments` table) can mark payment received.
 *   Customer claims of payment are flagged for verification only.
 */

import { supabaseServer } from '../../lib/supabaseClient';
import { logger } from '../../utils/logger';
import { communicationService } from '../communication/communicationService';
import { paymentPromiseService } from '../paymentPromiseService';
import { callService } from './callService';
import { transcriptAnalyzer } from './transcriptAnalyzer';
import type { Call } from '../../../shared/types';
import type { ExtractedPromise, ExtractedDispute } from '../../validators/callTranscript';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PostCallProcessInput {
  callId: string;
  organizationId: string;
  customerId: string;
  invoiceId?: string;
  followUpTaskId?: string;
}

export interface PostCallProcessResult {
  callId: string;
  transcriptFound: boolean;
  analysis: {
    primaryIntent: string;
    sentiment: string;
    confidence: number;
    summary: string;
    promiseCount: number;
    disputeCount: number;
    concernCount: number;
    injectionDetected: boolean;
    warnings: string[];
    promiseIds: string[];
    disputeIds: string[];
  } | null;
  communicationRecorded: boolean;
}

// ─── Promise Processing ────────────────────────────────────────────────────

async function processExtractedPromises(
  promises: ExtractedPromise[],
  orgId: string,
  invoiceId: string | undefined,
  customerId: string,
): Promise<{ promiseIds: string[]; warnings: string[] }> {
  const promiseIds: string[] = [];
  const warnings: string[] = [];

  if (!invoiceId) {
    if (promises.length > 0) {
      warnings.push('No invoice context — cannot create payment promises from transcript');
    }
    return { promiseIds, warnings };
  }

  // Check if there's an existing pending promise for this invoice
  const existingPromise = await paymentPromiseService.findPendingPromiseForInvoice(orgId, invoiceId);

  for (const extracted of promises) {
    try {
      if (existingPromise) {
        // Update existing promise with new date/amount
        const updated = await paymentPromiseService.updatePromise(orgId, existingPromise.id, {
          promisedDate: extracted.promisedDate,
          promisedAmount: extracted.promisedAmount,
          notes: `Updated by transcript analysis. Original quote: "${extracted.quote}"`,
        });
        if (updated) {
          promiseIds.push(updated.id);
          logger.info('Payment promise updated from transcript', {
            promiseId: updated.id,
            promisedDate: extracted.promisedDate,
            confidence: extracted.confidence,
          });
        }
      } else {
        // Create new promise
        const created = await paymentPromiseService.createPromise(orgId, {
          invoiceId,
          customerId,
          promisedDate: extracted.promisedDate,
          promisedAmount: extracted.promisedAmount,
          source: 'ai_transcript',
          confidenceScore: extracted.confidence,
          aiExtractedQuote: extracted.quote,
          notes: `Extracted from call transcript. Confidence: ${extracted.confidence}`,
        });
        promiseIds.push(created.id);
        logger.info('Payment promise created from transcript', {
          promiseId: created.id,
          promisedDate: extracted.promisedDate,
          confidence: extracted.confidence,
        });
      }
    } catch (err) {
      logger.error('Failed to process extracted promise', {
        error: err instanceof Error ? err.message : String(err),
        promisedDate: extracted.promisedDate,
      });
      warnings.push(`Failed to process promise for ${extracted.promisedDate}`);
    }
  }

  return { promiseIds, warnings };
}

// ─── Dispute Processing ────────────────────────────────────────────────────

async function processExtractedDisputes(
  disputes: ExtractedDispute[],
  orgId: string,
  invoiceId: string | undefined,
  customerId: string,
): Promise<{ disputeIds: string[]; warnings: string[] }> {
  const disputeIds: string[] = [];
  const warnings: string[] = [];

  if (!invoiceId) {
    if (disputes.length > 0) {
      warnings.push('No invoice context — cannot create dispute records from transcript');
    }
    return { disputeIds, warnings };
  }

  for (const extracted of disputes) {
    try {
      // Find an existing open dispute for this invoice + category to update.
      // Prevents duplicate dispute records when the customer calls about the
      // same issue again (e.g., a follow-up call about an ongoing dispute).
      const { data: existing } = await supabaseServer
        .from('disputes')
        .select('*')
        .eq('organization_id', orgId)
        .eq('invoice_id', invoiceId)
        .eq('customer_id', customerId)
        .eq('category', extracted.category)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Update existing dispute with the latest reason + AI metadata
        const { data: updated, error: updateErr } = await supabaseServer
          .from('disputes')
          .update({
            reason: extracted.reason,
            metadata: {
              confidence: extracted.confidence,
              quote: extracted.quote,
              analysisSource: 'call_transcript',
            },
          })
          .eq('id', (existing as { id: string }).id)
          .select('id')
          .maybeSingle();

        if (updateErr) {
          logger.error('Failed to update dispute from transcript', updateErr.message);
          warnings.push(`Failed to update dispute: ${extracted.category}`);
          continue;
        }

        const disputeId = (updated as { id: string } | null)?.id;
        if (disputeId) {
          disputeIds.push(disputeId);
          logger.info('Dispute updated from transcript', {
            disputeId,
            category: extracted.category,
            confidence: extracted.confidence,
          });
        }
      } else {
        // Create new dispute record (customer raised a new issue)
        const { data, error } = await supabaseServer
          .from('disputes')
          .insert({
            organization_id: orgId,
            invoice_id: invoiceId,
            customer_id: customerId,
            category: extracted.category,
            reason: extracted.reason,
            status: 'open',
            source: 'ai_transcript',
            metadata: {
              confidence: extracted.confidence,
              quote: extracted.quote,
              analysisSource: 'call_transcript',
            },
          })
          .select('id')
          .maybeSingle();

        if (error) {
          logger.error('Failed to create dispute from transcript', error.message);
          warnings.push(`Failed to create dispute: ${extracted.category}`);
          continue;
        }

        const disputeId = (data as { id: string } | null)?.id;
        if (disputeId) {
          disputeIds.push(disputeId);
          logger.info('Dispute created from transcript', {
            disputeId,
            category: extracted.category,
            confidence: extracted.confidence,
          });
        }
      }
    } catch (err) {
      logger.error('Failed to process extracted dispute', {
        error: err instanceof Error ? err.message : String(err),
        category: extracted.category,
      });
      warnings.push(`Failed to process dispute: ${extracted.category}`);
    }
  }

  return { disputeIds, warnings };
}

// ─── Main Processor ────────────────────────────────────────────────────────

/**
 * Process a completed call: fetch transcript, run AI analysis,
 * extract promises/disputes/concerns, store summary, and record in history.
 *
 * This function is idempotent — calling it on a call that already has
 * a summary will skip AI processing and return the existing result.
 */
export async function processCompletedCall(input: PostCallProcessInput): Promise<PostCallProcessResult> {
  // Step 1: Load the call record
  const call = await callService.getCallResult(input.callId, input.organizationId);
  if (!call) {
    logger.warn('postCallProcessor: call not found', { callId: input.callId });
    return {
      callId: input.callId,
      transcriptFound: false,
      analysis: null,
      communicationRecorded: false,
    };
  }

  // Step 2: If call already has a summary, skip re-processing (idempotent)
  if (call.summary && call.transcript) {
    logger.info('postCallProcessor: call already processed, skipping', { callId: input.callId });
    return {
      callId: input.callId,
      transcriptFound: true,
      analysis: null,
      communicationRecorded: false,
    };
  }

  // Step 3: Check for transcript
  const transcript = call.transcript;
  if (!transcript || transcript.trim().length === 0) {
    logger.warn('postCallProcessor: no transcript available', {
      callId: input.callId,
      status: call.status,
    });

    await recordCallAsCommunication(call, input);

    return {
      callId: input.callId,
      transcriptFound: false,
      analysis: null,
      communicationRecorded: true,
    };
  }

  // Step 4: Run AI transcript analysis
  let analysisResult;
  try {
    analysisResult = await transcriptAnalyzer.analyzeTranscript({
      transcript,
      invoiceNumber: input.invoiceId,
    });
  } catch (err) {
    logger.error('postCallProcessor: transcript analysis failed', {
      callId: input.callId,
      error: err instanceof Error ? err.message : String(err),
    });

    await recordCallAsCommunication(call, input);

    return {
      callId: input.callId,
      transcriptFound: true,
      analysis: null,
      communicationRecorded: true,
    };
  }

  const { analysis, injectionDetected } = analysisResult;

  // Step 5: Process extracted promises (create or update)
  let promiseIds: string[] = [];
  let promiseWarnings: string[] = [];
  if (analysis.extractedPromises.length > 0) {
    const result = await processExtractedPromises(
      analysis.extractedPromises,
      input.organizationId,
      input.invoiceId,
      input.customerId,
    );
    promiseIds = result.promiseIds;
    promiseWarnings = result.warnings;
  }

  // Step 6: Process extracted disputes (create)
  let disputeIds: string[] = [];
  let disputeWarnings: string[] = [];
  if (analysis.extractedDisputes.length > 0) {
    const result = await processExtractedDisputes(
      analysis.extractedDisputes,
      input.organizationId,
      input.invoiceId,
      input.customerId,
    );
    disputeIds = result.disputeIds;
    disputeWarnings = result.warnings;
  }

  // Step 7: Handle PAYMENT_COMPLETED intent (flag for verification — NEVER auto-mark)
  if (analysis.primaryIntent === 'PAYMENT_COMPLETED') {
    logger.info('postCallProcessor: payment claim in transcript — flagged for verification', {
      callId: input.callId,
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      summary: analysis.summary,
    });
  }

  // Step 8: Store full analysis against the call record
  const allWarnings = [...analysis.warnings, ...promiseWarnings, ...disputeWarnings];

  await callService.updateCallResult(input.callId, input.organizationId, {
    summary: analysis.summary,
    metadata: {
      analysis: {
        primaryIntent: analysis.primaryIntent,
        sentiment: analysis.sentiment,
        confidence: analysis.confidence,
        injectionDetected,
        promiseCount: analysis.extractedPromises.length,
        disputeCount: analysis.extractedDisputes.length,
        concernCount: analysis.customerConcerns.length,
        promiseIds,
        disputeIds,
        warnings: allWarnings,
        processedAt: new Date().toISOString(),
      },
    },
  });

  // Step 9: Record the call in communication history
  await recordCallAsCommunication(call, input);

  logger.info('postCallProcessor: completed', {
    callId: input.callId,
    primaryIntent: analysis.primaryIntent,
    promiseCount: promiseIds.length,
    disputeCount: disputeIds.length,
    concernCount: analysis.customerConcerns.length,
  });

  return {
    callId: input.callId,
    transcriptFound: true,
    analysis: {
      primaryIntent: analysis.primaryIntent,
      sentiment: analysis.sentiment,
      confidence: analysis.confidence,
      summary: analysis.summary,
      promiseCount: promiseIds.length,
      disputeCount: disputeIds.length,
      concernCount: analysis.customerConcerns.length,
      injectionDetected,
      warnings: allWarnings,
      promiseIds,
      disputeIds,
    },
    communicationRecorded: true,
  };
}

/**
 * Record a completed call as a communication in the unified timeline.
 */
async function recordCallAsCommunication(call: Call, input: PostCallProcessInput): Promise<void> {
  try {
    const message = call.summary
      ? `[Call Summary] ${call.summary}`
      : call.transcript
        ? `[Call Transcript] ${call.transcript.slice(0, 500)}`
        : `[Call] Duration: ${call.durationSeconds}s — Status: ${call.status}`;

    await communicationService.recordCommunication(input.organizationId, {
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      channel: 'call',
      direction: 'outbound',
      message,
      status: call.status === 'completed' ? 'delivered' : 'failed',
      providerMessageId: call.providerCallId,
      recipientIdentifier: call.toNumber,
      senderIdentifier: call.fromNumber,
      sentAt: call.startedAt ?? call.createdAt,
      metadata: {
        callId: call.id,
        duration: call.durationSeconds,
        recordingUrl: call.recordingUrl,
        status: call.status,
      },
    });
  } catch (err) {
    logger.error('postCallProcessor: failed to record communication', {
      callId: call.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const postCallProcessor = {
  processCompletedCall,
};
