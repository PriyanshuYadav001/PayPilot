/**
 * AI provider abstraction.
 *
 * Concrete providers (OpenAI, Anthropic, etc.) implement this interface.
 * Business logic depends only on this interface — never on a specific model.
 * The provider is registered at startup via registerAIProvider() and can be
 * swapped without changing any downstream code.
 */

import type { ClassifiedOutput, ClassifyMessageInput } from '../../validators/ai';
import type { AnalyzeTranscriptInput, TranscriptAnalysis } from '../../validators/callTranscript';

// ─── Provider Interface ────────────────────────────────────────────────────

export interface IAIProvider {
  /**
   * Classify a customer message into one of 9 intents with structured output.
   * Returns raw JSON — the caller (messageClassifier) validates with Zod.
   */
  classifyMessage(input: ClassifyMessageInput): Promise<ClassifiedOutput>;

  /**
   * Analyze a call transcript for intent, promises, disputes, and concerns.
   * Returns raw JSON — the caller (transcriptAnalyzer) validates with Zod.
   */
  analyzeTranscript(input: AnalyzeTranscriptInput): Promise<TranscriptAnalysis>;

  /**
   * Generate a personalized payment reminder with tone control.
   */
  generateReminder(context: {
    customerName: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    daysOverdue: number;
    paymentLink: string;
    tone: 'gentle' | 'formal' | 'urgent' | 'legal_notice';
  }): Promise<{ subject: string; body: string }>;
}

// ─── Provider Registry ─────────────────────────────────────────────────────

let providerInstance: IAIProvider | null = null;

export function registerAIProvider(provider: IAIProvider): void {
  providerInstance = provider;
}

export function getAIProvider(): IAIProvider {
  if (!providerInstance) {
    throw new Error('No AI provider configured. Call registerAIProvider() at startup.');
  }
  return providerInstance;
}

export function clearAIProvider(): void {
  providerInstance = null;
}
