import { z } from 'zod';

// ─── Intent Enum ───────────────────────────────────────────────────────────

export const IntentEnum = z.enum([
  'PAYMENT_PROMISE',
  'PAYMENT_COMPLETED',
  'PAYMENT_DELAY',
  'DISPUTE',
  'REQUEST_INVOICE',
  'REQUEST_PAYMENT_LINK',
  'QUESTION',
  'STOP_REMINDERS',
  'OTHER',
]);

export type ClassifiedIntent = z.infer<typeof IntentEnum>;

// ─── Sentiment ─────────────────────────────────────────────────────────────

export const SentimentEnum = z.enum(['positive', 'neutral', 'frustrated', 'angry']);

// ─── Base classified output (all intents share these fields) ───────────────

const BaseClassifiedOutput = z.object({
  intent: IntentEnum,
  sentiment: SentimentEnum,
  confidence: z.number().min(0).max(1),
  summary: z.string().max(500),
});

// ─── Per-intent output schemas ─────────────────────────────────────────────

const PaymentPromiseOutput = BaseClassifiedOutput.extend({
  intent: z.literal('PAYMENT_PROMISE'),
  promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  promisedAmount: z.number().positive().optional(),
});

const PaymentCompletedOutput = BaseClassifiedOutput.extend({
  intent: z.literal('PAYMENT_COMPLETED'),
  amount: z.number().positive().optional(),
  referenceNumber: z.string().optional(),
});

const PaymentDelayOutput = BaseClassifiedOutput.extend({
  intent: z.literal('PAYMENT_DELAY'),
  newExpectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  reason: z.string().max(500).optional(),
});

const DisputeOutput = BaseClassifiedOutput.extend({
  intent: z.literal('DISPUTE'),
  category: z.enum(['wrong_amount', 'service_issue', 'tax_error', 'unauthorized', 'other']),
  disputeReason: z.string().max(1000),
});

const RequestInvoiceOutput = BaseClassifiedOutput.extend({
  intent: z.literal('REQUEST_INVOICE'),
});

const RequestPaymentLinkOutput = BaseClassifiedOutput.extend({
  intent: z.literal('REQUEST_PAYMENT_LINK'),
});

const QuestionOutput = BaseClassifiedOutput.extend({
  intent: z.literal('QUESTION'),
  questionTopic: z.string().max(200).optional(),
});

const StopRemindersOutput = BaseClassifiedOutput.extend({
  intent: z.literal('STOP_REMINDERS'),
});

const OtherOutput = BaseClassifiedOutput.extend({
  intent: z.literal('OTHER'),
});

// ─── Discriminated union ───────────────────────────────────────────────────

export const ClassifiedOutputSchema = z.discriminatedUnion('intent', [
  PaymentPromiseOutput,
  PaymentCompletedOutput,
  PaymentDelayOutput,
  DisputeOutput,
  RequestInvoiceOutput,
  RequestPaymentLinkOutput,
  QuestionOutput,
  StopRemindersOutput,
  OtherOutput,
]);

export type ClassifiedOutput = z.infer<typeof ClassifiedOutputSchema>;

// ─── Intent-specific sub-types for downstream business rules ───────────────

export type PaymentPromiseData = z.infer<typeof PaymentPromiseOutput>;
export type PaymentCompletedData = z.infer<typeof PaymentCompletedOutput>;
export type PaymentDelayData = z.infer<typeof PaymentDelayOutput>;
export type DisputeData = z.infer<typeof DisputeOutput>;

// ─── Input schema for the classifier ───────────────────────────────────────

export const ClassifyMessageInputSchema = z.object({
  rawText: z.string().min(1).max(10000),
  channel: z.enum(['email', 'whatsapp', 'call_transcript']),
  customerName: z.string().optional(),
  invoiceNumber: z.string().optional(),
  amountDue: z.number().optional(),
  currency: z.string().optional(),
  dueDate: z.string().optional(),
});

export type ClassifyMessageInput = z.infer<typeof ClassifyMessageInputSchema>;
