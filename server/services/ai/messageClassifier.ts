/**
 * Message classifier — the orchestration layer between AI and business logic.
 *
 * Architecture:
 *   Customer message → AI → structured output → Zod validation → business rules → database
 *
 * CRITICAL: AI NEVER directly writes to the database.
 * This module validates AI output, applies business rules, and returns
 * a classified result that the caller (route handler / webhook processor)
 * uses to decide what to persist.
 */

import { logger } from '../../utils/logger';
import { getAIProvider } from './AIProvider';
import {
  ClassifyMessageInputSchema,
  ClassifiedOutputSchema,
  type ClassifyMessageInput,
  type ClassifiedOutput,
  type PaymentPromiseData,
  type PaymentCompletedData,
  type PaymentDelayData,
  type DisputeData,
} from '../../validators/ai';
import { checkAndRecordUsage, Metric } from '../../services/usageService';

// ─── Prompt Injection Guards ────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a|an|the)/i]

// ─── Usage Limit Guards ────────────────────────────────────────────────────

function canAnalyzeAI(organizationId: string): { allowed: boolean; remaining: number; limit: number } {
  return checkAndRecordUsage(organizationId, Metric.ai_analyses, 1);
}

// ─── AI Analysis with Usage Limit ────────────────────────────────────────────

export async function classifyMessage(input: ClassifyMessageInput): Promise<ClassifyResult> {
  // Validate input
  const validatedInput = ClassifyMessageInputSchema.parse(input);

  // Sanitize input text for prompt injection
  const injectionDetected = detectPromptInjection(validatedInput.rawText);
  if (injectionDetected) {
    logger.warn('Prompt injection pattern detected in customer message', {
      channel: validatedInput.channel,
      textLength: validatedInput.rawText.length,
    });
  }

  // Check AI analysis usage limit before calling AI provider
  const { allowed } = await canAnalyzeAI(validatedInput.organizationId);
  if (!allowed) {
    logger.warn('AI analysis limit reached for organization', {
      organizationId: validatedInput.organizationId,
    });
    // Return a default classified result indicating limit reached
    return {
      output: {
        intent: 'OTHER',
        sentiment: 'neutral',
        confidence: 1,
        entities: {},
        summary: 'AI analysis limit reached for your subscription plan.',
      },
      warnings: ['AI analysis limit reached'],
      injectionDetected,
    };
  }

  // Call AI provider
  const provider = getAIProvider();
  const rawOutput = await provider.classifyMessage(validatedInput);

  // Validate AI output with Zod
  const validatedOutput = ClassifiedOutputSchema.parse(rawOutput);

  // Sanitize output (handle injection, bounds)
  const sanitizedOutput = sanitizeOutput(validatedOutput, validatedInput.rawText);

  // Apply business rules
  const { warnings, adjustedOutput } = applyBusinessRules(sanitizedOutput, validatedInput);

  logger.info('Message classified', {
    intent: adjustedOutput.intent,
    sentiment: adjustedOutput.sentiment,
    confidence: adjustedOutput.confidence,
    channel: validatedInput.channel,
    injectionDetected,
    warningCount: warnings.length,
  });

  return {
    output: adjustedOutput,
    warnings,
    injectionDetected,
  };
}

export const messageClassifier = {
  classifyMessage,
};