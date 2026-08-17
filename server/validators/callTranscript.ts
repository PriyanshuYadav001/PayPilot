/**
 * Call transcript analysis schema — structured Zod validation for
 * AI-extracted data from call transcripts.
 *
 * A call transcript may contain MULTIPLE intents (e.g., a dispute AND a promise).
 * This schema captures all structured data in a single validated output.
 *
 * CRITICAL: AI NEVER marks a payment as received. Only verified payment records
 * (webhook-confirmed entries in the `payments` table) can mark an invoice as paid.
 */

import { z } from 'zod';

// ─── Structured sub-objects ────────────────────────────────────────────────

export const ExtractedPromiseSchema = z.object({
  promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  promisedAmount: z.number().positive().optional(),
  confidence: z.number().min(0).max(1),
  quote: z.string().max(500).describe('Exact customer quote supporting this promise'),
});

export type ExtractedPromise = z.infer<typeof ExtractedPromiseSchema>;

export const ExtractedDisputeSchema = z.object({
  category: z.enum(['wrong_amount', 'service_issue', 'tax_error', 'unauthorized', 'other']),
  reason: z.string().min(5).max(1000),
  confidence: z.number().min(0).max(1),
  quote: z.string().max(500).describe('Exact customer quote supporting this dispute'),
});

export type ExtractedDispute = z.infer<typeof ExtractedDisputeSchema>;

export const CustomerConcernSchema = z.object({
  topic: z.string().max(200),
  detail: z.string().max(1000),
  quote: z.string().max(500).optional(),
});

export type CustomerConcern = z.infer<typeof CustomerConcernSchema>;

// ─── Top-level transcript analysis ─────────────────────────────────────────

export const TranscriptAnalysisSchema = z.object({
  /** Primary intent — the dominant action the customer is communicating */
  primaryIntent: z.enum([
    'PAYMENT_PROMISE',
    'PAYMENT_COMPLETED',
    'PAYMENT_DELAY',
    'DISPUTE',
    'REQUEST_INVOICE',
    'REQUEST_PAYMENT_LINK',
    'QUESTION',
    'STOP_REMINDERS',
    'OTHER',
  ]),

  /** Overall sentiment of the call */
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'angry']),

  /** AI confidence in the analysis (0-1) */
  confidence: z.number().min(0).max(1),

  /** 1-3 sentence summary of the call */
  summary: z.string().min(1).max(500),

  /** All payment promises extracted from the transcript (may be 0, 1, or more) */
  extractedPromises: z.array(ExtractedPromiseSchema).max(3),

  /** All disputes extracted from the transcript (may be 0, 1, or more) */
  extractedDisputes: z.array(ExtractedDisputeSchema).max(3),

  /** Customer concerns that don't rise to the level of a dispute */
  customerConcerns: z.array(CustomerConcernSchema).max(5),

  /** Whether a prompt injection pattern was detected in the transcript */
  injectionDetected: z.boolean(),

  /** Any warnings about the analysis (e.g., low confidence, ambiguous statements) */
  warnings: z.array(z.string()),
});

export type TranscriptAnalysis = z.infer<typeof TranscriptAnalysisSchema>;

// ─── Input for transcript analysis ─────────────────────────────────────────

export const AnalyzeTranscriptInputSchema = z.object({
  transcript: z.string().min(1).max(50000),
  customerName: z.string().optional(),
  invoiceNumber: z.string().optional(),
  amountDue: z.number().optional(),
  currency: z.string().optional(),
  dueDate: z.string().optional(),
});

export type AnalyzeTranscriptInput = z.infer<typeof AnalyzeTranscriptInputSchema>;
