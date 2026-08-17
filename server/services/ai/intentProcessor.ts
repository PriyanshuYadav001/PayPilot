/**
 * Intent processor — bridges AI classification output to business actions.
 *
 * Architecture:
 *   AI classified output → intent processor → database actions (payment_promises, disputes, etc.)
 *
 * CRITICAL INVARIANT:
 *   A customer saying "I paid" NEVER marks the invoice as paid.
 *   Only verified payment records (via webhook-confirmed payment entries) can mark payment received.
 *   This processor creates payment_promises records, disputes, etc. — never invoice status changes.
 */

import { supabaseServer } from '../../lib/supabaseClient';
import { logger } from '../../utils/logger';
import { classifyMessage, type ClassifyResult } from './messageClassifier';
import { paymentPromiseService } from '../paymentPromiseService';
import type { ClassifiedOutput, PaymentPromiseData, PaymentDelayData, DisputeData } from '../../validators/ai';

// ─── Context for intent processing ─────────────────────────────────────────

export interface IntentProcessingContext {
  organizationId: string;
  customerId: string;
  invoiceId?: string;
  communicationId?: string;
  channel: 'email' | 'whatsapp' | 'call_transcript';
  rawMessage: string;
  customerName?: string;
}

// ─── Result types ──────────────────────────────────────────────────────────

export interface IntentProcessingResult {
  intent: string;
  actionTaken: string;
  promiseId?: string;
  disputeId?: string;
  warnings: string[];
  injectionDetected: boolean;
}

// ─── Intent handlers ───────────────────────────────────────────────────────

async function handlePaymentPromise(
  output: PaymentPromiseData,
  ctx: IntentProcessingContext,
): Promise<Omit<IntentProcessingResult, 'intent' | 'injectionDetected'>> {
  if (!ctx.invoiceId) {
    return {
      actionTaken: 'skipped',
      warnings: ['No invoice context — cannot create payment promise'],
    };
  }

  // Create the payment promise record
  const promise = await paymentPromiseService.createPromise(ctx.organizationId, {
    invoiceId: ctx.invoiceId,
    customerId: ctx.customerId,
    promisedDate: output.promisedDate,
    promisedAmount: output.promisedAmount,
    source: 'ai_extracted',
    confidenceScore: output.confidence,
    aiExtractedQuote: output.summary,
    communicationId: ctx.communicationId,
    notes: `AI classified as PAYMENT_PROMISE (confidence: ${output.confidence}). Channel: ${ctx.channel}`,
  });

  logger.info('Payment promise created from AI classification', {
    promiseId: promise.id,
    organizationId: ctx.organizationId,
    invoiceId: ctx.invoiceId,
    customerId: ctx.customerId,
    promisedDate: output.promisedDate,
    promisedAmount: output.promisedAmount,
    confidence: output.confidence,
  });

  return {
    actionTaken: 'promise_created',
    promiseId: promise.id,
    warnings: [],
  };
}

async function handlePaymentCompleted(
  output: ClassifiedOutput,
  ctx: IntentProcessingContext,
): Promise<Omit<IntentProcessingResult, 'intent' | 'injectionDetected'>> {
  // NEVER mark invoice as paid from AI output alone.
  // Only verified payment records (webhook-confirmed) can mark payment received.
  // We log this for human review.

  logger.info('Payment completed claim received — flagged for verification', {
    organizationId: ctx.organizationId,
    customerId: ctx.customerId,
    invoiceId: ctx.invoiceId,
    summary: output.summary,
    channel: ctx.channel,
  });

  return {
    actionTaken: 'flagged_for_verification',
    warnings: [
      'Customer claims payment was made. Requires verification against payment records before marking invoice as paid.',
    ],
  };
}

async function handlePaymentDelay(
  output: PaymentDelayData,
  ctx: IntentProcessingContext,
): Promise<Omit<IntentProcessingResult, 'intent' | 'injectionDetected'>> {
  // Log the delay request. If there's a new expected date, create a payment promise
  // so the missed-promise checker can follow up.
  if (output.newExpectedDate && ctx.invoiceId) {
    const promise = await paymentPromiseService.createPromise(ctx.organizationId, {
      invoiceId: ctx.invoiceId,
      customerId: ctx.customerId,
      promisedDate: output.newExpectedDate,
      source: 'ai_extracted',
      confidenceScore: output.confidence,
      aiExtractedQuote: output.summary,
      communicationId: ctx.communicationId,
      notes: `AI classified as PAYMENT_DELAY. Reason: ${output.reason ?? 'Not specified'}. New expected date: ${output.newExpectedDate}`,
    });

    return {
      actionTaken: 'delay_promise_created',
      promiseId: promise.id,
      warnings: [],
    };
  }

  return {
    actionTaken: 'delay_logged',
    warnings: output.newExpectedDate
      ? []
      : ['No new expected date provided — logged for follow-up'],
  };
}

async function handleDispute(
  output: DisputeData,
  ctx: IntentProcessingContext,
): Promise<Omit<IntentProcessingResult, 'intent' | 'injectionDetected'>> {
  if (!ctx.invoiceId) {
    return {
      actionTaken: 'skipped',
      warnings: ['No invoice context — cannot create dispute record'],
    };
  }

  // Create dispute record
  const { data, error } = await supabaseServer
    .from('disputes')
    .insert({
      organization_id: ctx.organizationId,
      invoice_id: ctx.invoiceId,
      customer_id: ctx.customerId,
      category: output.category,
      reason: output.disputeReason,
      status: 'open',
      source: 'ai_extracted',
      communication_id: ctx.communicationId ?? null,
      metadata: {
        confidence: output.confidence,
        sentiment: output.sentiment,
        channel: ctx.channel,
      },
    })
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('Failed to create dispute from AI classification', error.message);
    return {
      actionTaken: 'dispute_create_failed',
      warnings: ['Failed to persist dispute record'],
    };
  }

  const disputeId = (data as { id: string } | null)?.id;

  logger.info('Dispute created from AI classification', {
    disputeId,
    organizationId: ctx.organizationId,
    invoiceId: ctx.invoiceId,
    category: output.category,
  });

  return {
    actionTaken: 'dispute_created',
    disputeId,
    warnings: [],
  };
}

async function handleStopReminders(
  ctx: IntentProcessingContext,
): Promise<Omit<IntentProcessingResult, 'intent' | 'injectionDetected'>> {
  // Flag for human confirmation — never auto-opt-out
  logger.info('STOP_REMINDERS intent — requires human confirmation', {
    organizationId: ctx.organizationId,
    customerId: ctx.customerId,
    channel: ctx.channel,
  });

  return {
    actionTaken: 'flagged_for_human_review',
    warnings: ['Customer requested to stop reminders — requires human confirmation before opting out'],
  };
}

async function handleOther(
  output: ClassifiedOutput,
  ctx: IntentProcessingContext,
): Promise<Omit<IntentProcessingResult, 'intent' | 'injectionDetected'>> {
  logger.info('OTHER intent — no action taken', {
    organizationId: ctx.organizationId,
    summary: output.summary,
  });

  return {
    actionTaken: 'none',
    warnings: [],
  };
}

// ─── Main processor ────────────────────────────────────────────────────────

/**
 * Process a classified AI output and execute the appropriate business action.
 *
 * Pipeline:
 *   1. Classify the raw message via AI (or accept pre-classified output)
 *   2. Route to the appropriate intent handler
 *   3. Execute database actions (create promises, disputes, etc.)
 *   4. NEVER modify invoice payment status from AI output
 *
 * Returns a result describing what action was taken, without side effects
 * on invoice status.
 */
export async function processIntent(
  ctx: IntentProcessingContext,
  preClassified?: ClassifyResult,
): Promise<IntentProcessingResult> {
  // Step 1: Classify if not pre-classified
  let classifyResult: ClassifyResult;
  if (preClassified) {
    classifyResult = preClassified;
  } else {
    classifyResult = await classifyMessage({
      rawText: ctx.rawMessage,
      channel: ctx.channel,
      customerName: ctx.customerName,
    }, ctx.organizationId);
  }

  const { output, warnings, injectionDetected } = classifyResult;

  // Step 2: Route to intent handler
  let handlerResult: Omit<IntentProcessingResult, 'intent' | 'injectionDetected'>;

  switch (output.intent) {
    case 'PAYMENT_PROMISE':
      handlerResult = await handlePaymentPromise(output as PaymentPromiseData, ctx);
      break;
    case 'PAYMENT_COMPLETED':
      handlerResult = await handlePaymentCompleted(output, ctx);
      break;
    case 'PAYMENT_DELAY':
      handlerResult = await handlePaymentDelay(output as PaymentDelayData, ctx);
      break;
    case 'DISPUTE':
      handlerResult = await handleDispute(output as DisputeData, ctx);
      break;
    case 'STOP_REMINDERS':
      handlerResult = await handleStopReminders(ctx);
      break;
    case 'QUESTION':
    case 'REQUEST_INVOICE':
    case 'REQUEST_PAYMENT_LINK':
    case 'OTHER':
    default:
      handlerResult = await handleOther(output, ctx);
      break;
  }

  return {
    intent: output.intent,
    injectionDetected,
    ...handlerResult,
    warnings: [...warnings, ...handlerResult.warnings],
  };
}

export const intentProcessor = {
  processIntent,
};
