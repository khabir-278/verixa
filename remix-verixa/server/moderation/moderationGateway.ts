import {
  ModerationRequestInput,
  NormalizedModerationResponse,
  ModerationEventRecord,
} from './types';
import {
  processNormalization,
  validatePayloadSize,
  detectContentType,
} from './normalizer';
import { executeAIAnalysis } from './aiAnalyzer';
import { evaluatePolicy } from './policyEngine';
import { persistModerationEvent, getPersistedEvents } from './persistence';
import { reviewService } from './reviewService';


/**
 * VERIXA Centralized AI Moderation Gateway
 *
 * Implements the required pipeline:
 * CONTENT
 *   ↓
 * Content Type Detection
 *   ↓
 * Normalization
 *   ↓
 * Language Detection
 *   ↓
 * Text/Media Analysis
 *   ↓
 * Category Classification
 *   ↓
 * Confidence Calculation
 *   ↓
 * Moderation Policy Engine
 *   ↓
 * ALLOW / WARNING / QUARANTINE / BLOCK
 *   ↓
 * Persist Moderation Event
 *   ↓
 * Publish only if allowed
 */
export class ModerationGateway {
  /**
   * Main pipeline entry point
   */
  async moderate(input: ModerationRequestInput): Promise<NormalizedModerationResponse> {
    const rawContent = input.content || '';

    // Step 1: Content Type Detection
    const detectedType = detectContentType(input.content_type, input.mime_type, rawContent);

    // Step 1.5: Payload Size Validation
    const sizeCheck = validatePayloadSize(rawContent, detectedType);
    if (!sizeCheck.valid) {
      const failResponse: NormalizedModerationResponse = {
        decision: 'BLOCK',
        allowed: false,
        status: 'BLOCKED',
        state: 'REJECTED',
        timestamp: new Date().toISOString(),
        content_type: detectedType,
        language: 'N/A',
        language_detected: 'N/A',
        categories: ['PAYLOAD_TOO_LARGE'],
        toxicity_score: 100,
        confidence: 100,
        risk_score: 100,
        reason: sizeCheck.error || 'Payload exceeded maximum allowed size.',
        safe_rewrite: null,
        model: 'gateway-validator',
        model_version: '1.0',
        analysis_id: `err_size_${Date.now()}`,
        toxicityScore: 100,
        category: 'PAYLOAD_TOO_LARGE',
        message: sizeCheck.error,
        safe: false,
      };

      await persistModerationEvent(failResponse, rawContent, 'payload_too_large', {
        userId: input.user_id,
        username: input.username,
        targetId: input.target_id,
        contentId: input.content_id || input.target_id,
      });

      return failResponse;
    }

    // Step 2: Normalization & Anti-Prompt Injection
    const normalizedInput = processNormalization(rawContent, detectedType, input.mime_type);

    // Step 3 & 4 & 5 & 6: Language Detection, Text/Media Analysis, Category Classification & Confidence Calculation
    const analysisResult = await executeAIAnalysis(
      normalizedInput,
      input.mime_type,
      input.context || detectedType,
      {
        frames: input.frames,
        intervalSeconds: input.interval_seconds,
        contentId: input.content_id || input.target_id,
      }
    );

    // Step 7 & 8: Moderation Policy Engine -> ALLOW / WARNING / QUARANTINE / BLOCK
    const policyDecision = evaluatePolicy(analysisResult, detectedType);

    // Step 9: Persist Moderation Event
    await persistModerationEvent(
      policyDecision,
      rawContent,
      normalizedInput.contentHash,
      {
        userId: input.user_id,
        username: input.username,
        targetId: input.target_id,
        contentId: input.content_id || input.target_id,
      }
    );

    // Auto-enqueue to Review Queue if decision is QUARANTINE
    if (policyDecision.decision === 'QUARANTINE') {
      try {
        reviewService.enqueueQuarantineItem(
          policyDecision.analysis_id,
          input.content_id || input.target_id || policyDecision.analysis_id,
          detectedType,
          input.user_id || 'anonymous',
          policyDecision.risk_score || policyDecision.toxicity_score || 50,
          policyDecision.categories[0] || 'QUARANTINED_CONTENT',
          rawContent.slice(0, 160)
        );
      } catch {
        // Non-blocking
      }
    }

    // Step 10: Return normalized response. Caller uses policyDecision.allowed to determine publication.
    return policyDecision;
  }

  /**
   * Retrieves logged moderation events
   */
  getEvents(limit?: number): ModerationEventRecord[] {
    return getPersistedEvents(limit);
  }
}

// Global Singleton Instance
export const moderationGateway = new ModerationGateway();
