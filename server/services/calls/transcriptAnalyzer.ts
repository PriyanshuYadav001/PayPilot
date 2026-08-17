/**
 * Call transcript analyzer — dedicated AI pipeline for call transcript analysis.
 *
 * Architecture:
 *   Raw transcript → AI (specialized prompt) → structured JSON → Zod validation
 *   → injection protection → business rules → structured analysis
 *
 * Unlike the generic messageClassifier (designed for short emails/WhatsApp messages),
 * this analyzer:
 *   - Handles long, multi-turn transcripts
 *   - Extracts MULTIPLE intents from a single call
 *   - Captures structured promises, disputes, and concerns
 *   - Applies call-specific business rules
 *
 * CRITICAL: AI NEVER marks a payment as received. Only verified payment records
 * (webhook-confirmed entries in the `payments` table) can mark an invoice as paid.
 */

import { logger } from '../../utils/logger';
import { getAIProvider } from '../ai/AIProvider';
import {
  TranscriptAnalysisSchema,
  AnalyzeTranscriptInputSchema,
  type TranscriptAnalysis,
  type AnalyzeTranscriptInput,
} from '../../validators/callTranscript';

// ─── Prompt Injection Protection ────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a|an|the)/i,
  /system\s*:\s*/i,
  /act\s+as\s+(if|though)/i,
  /pretend\s+(you|that|to)/i,
  /disregard\s+(all|your|the)/i,
  /override\s+(your|the|all)/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\|system\|>/i,
  /\{\{system\}\}/i,
];

function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

// ─── Business Rules ────────────────────────────────────────────────────────

interface BusinessRuleResult {
  warnings: string[];
  adjustedAnalysis: TranscriptAnalysis;
}

function applyBusinessRules(
  analysis: TranscriptAnalysis,
  input: AnalyzeTranscriptInput,
): BusinessRuleResult {
  const warnings: string[] = [...analysis.warnings];
  const adjusted = { ...analysis };

  // 1. Reject past promised dates
  const today = new Date().toISOString().split('T')[0];
  adjusted.extractedPromises = analysis.extractedPromises.filter((promise) => {
    if (promise.promisedDate < today) {
      warnings.push(`Promised date ${promise.promisedDate} is in the past — excluding promise`);
      return false;
    }
    return true;
  });

  // 2. Validate promise amounts against invoice
  const amountDue = input.amountDue;
  if (amountDue !== undefined && amountDue > 0) {
    adjusted.extractedPromises = adjusted.extractedPromises.map((promise) => {
      if (promise.promisedAmount) {
        const ratio = promise.promisedAmount / amountDue;
        if (ratio > 2 || ratio < 0.01) {
          warnings.push(
            `Promised amount ${promise.promisedAmount} is suspiciously different from amount due ${amountDue}`,
          );
        }
      }
      return promise;
    });
  }

  // 3. Cap confidence if prompt injection detected
  if (adjusted.injectionDetected) {
    adjusted.confidence = Math.min(adjusted.confidence, 0.3);
    if (adjusted.primaryIntent !== 'OTHER') {
      logger.warn('Prompt injection detected in transcript — reclassifying', {
        originalIntent: adjusted.primaryIntent,
      });
      (adjusted as { primaryIntent: string }).primaryIntent = 'OTHER';
      adjusted.summary = '[Flagged] ' + adjusted.summary;
    }
  }

  // 4. Enforce confidence bounds
  adjusted.confidence = Math.max(0, Math.min(1, adjusted.confidence));

  // 5. Truncate summary
  if (adjusted.summary.length > 500) {
    adjusted.summary = adjusted.summary.slice(0, 497) + '...';
  }

  return { warnings, adjustedAnalysis: adjusted };
}

// ─── Main Analysis Function ────────────────────────────────────────────────

export interface TranscriptAnalysisResult {
  analysis: TranscriptAnalysis;
  injectionDetected: boolean;
}

/**
 * Analyze a call transcript through the AI pipeline:
 *   transcript → AI (specialized prompt) → Zod validation → business rules
 *
 * NEVER writes to the database. Returns a validated, structured analysis
 * that the caller uses to decide persistence (create/update promises, disputes).
 */
export async function analyzeTranscript(input: AnalyzeTranscriptInput): Promise<TranscriptAnalysisResult> {
  // Validate input
  const validatedInput = AnalyzeTranscriptInputSchema.parse(input);

  // Detect prompt injection
  const injectionDetected = detectPromptInjection(validatedInput.transcript);
  if (injectionDetected) {
    logger.warn('Prompt injection pattern detected in call transcript', {
      textLength: validatedInput.transcript.length,
    });
  }

  // Call AI provider for transcript analysis
  const provider = getAIProvider();
  const rawOutput = await provider.analyzeTranscript(validatedInput);

  // Validate AI output with Zod
  const validatedOutput = TranscriptAnalysisSchema.parse(rawOutput);

  // Merge injection detection result
  const analysisWithInjection: TranscriptAnalysis = {
    ...validatedOutput,
    injectionDetected: injectionDetected || validatedOutput.injectionDetected,
  };

  // Apply business rules
  const { warnings, adjustedAnalysis } = applyBusinessRules(analysisWithInjection, validatedInput);

  const finalAnalysis: TranscriptAnalysis = {
    ...adjustedAnalysis,
    warnings,
  };

  logger.info('Transcript analyzed', {
    primaryIntent: finalAnalysis.primaryIntent,
    sentiment: finalAnalysis.sentiment,
    confidence: finalAnalysis.confidence,
    promiseCount: finalAnalysis.extractedPromises.length,
    disputeCount: finalAnalysis.extractedDisputes.length,
    concernCount: finalAnalysis.customerConcerns.length,
    injectionDetected,
    warningCount: warnings.length,
  });

  return {
    analysis: finalAnalysis,
    injectionDetected,
  };
}

export const transcriptAnalyzer = {
  analyzeTranscript,
};
