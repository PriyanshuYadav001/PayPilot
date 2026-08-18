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

export interface ClassifyResult {
  output: ClassifiedOutput;
  warnings: string[];
  injectionDetected: boolean;
}

// ─── Prompt Injection Guards ────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a|an|the)/i]

function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

// ─── Usage Limit Guards ────────────────────────────────────────────────────

async function canAnalyzeAI(
  organizationId: string
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  return checkAndRecordUsage(organizationId, Metric.ai_analyses, 1);
}

// ─── Output Sanitization & Business Rules ───────────────────────────────────

function sanitizeOutput(
  output: ClassifiedOutput,
  rawText: string,
): ClassifiedOutput {
  const sanitized = { ...output };

  sanitized.confidence = Math.max(0, Math.min(1, sanitized.confidence));
  sanitized.summary = sanitized.summary.trim().slice(0, 500);

  return sanitized;
}

interface BusinessRuleResult {
  warnings: string[];
  adjustedOutput: ClassifiedOutput;
}

function applyBusinessRules(
  output: ClassifiedOutput,
  input: ClassifyMessageInput,
): BusinessRuleResult {
  const warnings: string[] = [];
  const adjusted = { ...output };

  // Reject payment promises with dates in the past.
  if (adjusted.intent === 'PAYMENT_PROMISE') {
    const today = new Date().toISOString().split('T')[0];

    if (adjusted.promisedDate < today) {
      warnings.push(
        `Promised date ${adjusted.promisedDate} is in the past — excluding promise`,
      );

      return {
        warnings,
        adjustedOutput: {
          intent: 'OTHER',
          sentiment: adjusted.sentiment,
          confidence: Math.min(adjusted.confidence, 0.3),
          summary: '[Flagged] ' + adjusted.summary,
        } as ClassifiedOutput,
      };
    }
  }

  // Validate completed payment amount against invoice amount.
  if (
    adjusted.intent === 'PAYMENT_COMPLETED' &&
    input.amountDue !== undefined &&
    input.amountDue > 0 &&
    adjusted.amount !== undefined &&
    adjusted.amount > input.amountDue
  ) {
    warnings.push(
      `Payment amount ${adjusted.amount} exceeds amount due ${input.amountDue}`,
    );
  }

  // Stop-reminders requires human confirmation before changing reminder state.
  if (adjusted.intent === 'STOP_REMINDERS') {
    warnings.push('Stop-reminders request requires human confirmation');
  }

  // Enforce confidence bounds.
  adjusted.confidence = Math.max(0, Math.min(1, adjusted.confidence));

  return { warnings, adjustedOutput: adjusted };
}

// ─── AI Analysis with Usage Limit ────────────────────────────────────────────

export async function classifyMessage(input: ClassifyMessageInput, organizationId: string): Promise<ClassifyResult> {
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

if (injectionDetected) {
  return {
    output: {
      intent: 'OTHER',
      sentiment: 'neutral',
      confidence: 0.3,
      summary: '[Flagged] Prompt injection detected in customer message.',
    },
    warnings: ['Prompt injection detected'],
    injectionDetected: true,
  };
}

  // Check AI analysis usage limit before calling AI provider
  const { allowed } = await canAnalyzeAI(organizationId);
  if (!allowed) {
    logger.warn('AI analysis limit reached for organization', {
      organizationId,
    });
    // Return a default classified result indicating limit reached
    return {
      output: {
        intent: 'OTHER',
        sentiment: 'neutral',
        confidence: 1,
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