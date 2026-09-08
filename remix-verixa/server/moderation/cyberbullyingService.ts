/**
 * VERIXA Cyberbullying Detection Service
 *
 * Implements independent, multi-interaction pattern analysis:
 * - Repeated attacks across interactions
 * - Targeted harassment (hostile focus on specific user)
 * - Escalating hostility gradients
 * - Repeated insults toward the same user
 * - Coordinated harassment patterns (brigading/pile-ons)
 *
 * Stores bullying events with target user, actor user, evidence references,
 * risk score, confidence, and timestamps.
 */

import {
  CyberbullyingPatternType,
  BullyingEvidenceReference,
  CyberbullyingEvent,
  InteractionRecord,
  BullyingAnalysisResult,
} from './types';
import { supabase } from '../../src/lib/supabase';

class CyberbullyingService {
  // In-memory sliding window of interactions (up to 5000 recent interactions)
  private interactions: InteractionRecord[] = [];
  // In-memory store of detected bullying events
  private events: CyberbullyingEvent[] = [];
  private readonly MAX_HISTORY_ITEMS = 5000;
  private readonly TIME_WINDOW_MS = 72 * 60 * 60 * 1000; // 72-hour sliding window

  /**
   * Records a user interaction (comment, mention, tag, DM)
   */
  public recordInteraction(data: {
    id?: string;
    actor_user_id: string;
    actor_username?: string;
    target_user_id: string;
    target_username?: string;
    content: string;
    toxicity_score: number;
    interaction_type?: 'comment' | 'dm' | 'mention' | 'tag';
  }): InteractionRecord {
    const record: InteractionRecord = {
      id: data.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actor_user_id: data.actor_user_id,
      actor_username: data.actor_username || 'User',
      target_user_id: data.target_user_id,
      target_username: data.target_username || 'User',
      content: data.content,
      toxicity_score: data.toxicity_score,
      timestamp: Date.now(),
      interaction_type: data.interaction_type || 'comment',
    };

    this.interactions.push(record);
    if (this.interactions.length > this.MAX_HISTORY_ITEMS) {
      this.interactions.shift();
    }

    return record;
  }

  /**
   * Analyzes multi-interaction patterns between actor and target,
   * as well as community-wide coordinated harassment against target.
   */
  public async evaluateInteraction(
    actorId: string,
    targetId: string,
    content: string,
    toxicityScore: number,
    options: {
      actorUsername?: string;
      targetUsername?: string;
      interactionType?: 'comment' | 'dm' | 'mention' | 'tag';
    } = {}
  ): Promise<BullyingAnalysisResult> {
    // 1. Record current interaction
    const currentRecord = this.recordInteraction({
      actor_user_id: actorId,
      actor_username: options.actorUsername,
      target_user_id: targetId,
      target_username: options.targetUsername,
      content,
      toxicity_score: toxicityScore,
      interaction_type: options.interactionType,
    });

    // If target is self or empty, no bullying
    if (!targetId || actorId === targetId) {
      return {
        has_bullying: false,
        risk_score: 0,
        confidence: 95,
        patterns_detected: [],
        evidence_references: [],
        recommended_action: 'none',
        reason: 'Self-interaction or empty target.',
      };
    }

    const cutoff = Date.now() - this.TIME_WINDOW_MS;
    // Interactions between this actor and this target in the window
    const pairHistory = this.interactions.filter(
      (i) =>
        i.actor_user_id === actorId &&
        i.target_user_id === targetId &&
        i.timestamp >= cutoff
    );

    // All interactions targeting this target across all actors in last 2 hours (for brigading detection)
    const recentTargetHistory = this.interactions.filter(
      (i) =>
        i.target_user_id === targetId &&
        i.timestamp >= Date.now() - 2 * 60 * 60 * 1000
    );

    // All interactions by this actor anywhere in window (for target focus ratio)
    const actorTotalHistory = this.interactions.filter(
      (i) => i.actor_user_id === actorId && i.timestamp >= cutoff
    );

    const patternsDetected: CyberbullyingPatternType[] = [];
    const evidenceReferences: BullyingEvidenceReference[] = [];
    let cumulativeRisk = 0;

    // --- PATTERN 1: Repeated Attacks ---
    // Multiple toxic comments (toxicity >= 40) directed at target
    const toxicInteractions = pairHistory.filter((i) => i.toxicity_score >= 40);
    if (toxicInteractions.length >= 2) {
      patternsDetected.push('repeated_attacks');
      cumulativeRisk += Math.min(40, toxicInteractions.length * 15);
      for (const ti of toxicInteractions) {
        this.addEvidence(evidenceReferences, ti, 'Repeated hostile interaction directed at user');
      }
    }

    // --- PATTERN 2: Targeted Harassment (Obsessive Negative Focus) ---
    // If actor has >= 3 negative interactions and > 50% are focused on this specific user
    const actorNegativeTotal = actorTotalHistory.filter((i) => i.toxicity_score >= 35);
    if (actorNegativeTotal.length >= 3) {
      const focusRatio = toxicInteractions.length / actorNegativeTotal.length;
      if (focusRatio >= 0.5 && toxicInteractions.length >= 2) {
        patternsDetected.push('targeted_harassment');
        cumulativeRisk += 30;
        this.addEvidence(
          evidenceReferences,
          currentRecord,
          `Actor is disproportionately targeting user (${Math.round(focusRatio * 100)}% of actor hostility)`
        );
      }
    }

    // --- PATTERN 3: Escalating Hostility ---
    // Toxicity scores increasing in severity across chronological interactions
    if (pairHistory.length >= 3) {
      const recentScores = pairHistory.slice(-4).map((i) => i.toxicity_score);
      let isEscalating = true;
      for (let s = 1; s < recentScores.length; s++) {
        if (recentScores[s] < recentScores[s - 1] - 5) {
          isEscalating = false;
          break;
        }
      }
      if (isEscalating && recentScores[recentScores.length - 1] >= 60 && recentScores[0] < 50) {
        patternsDetected.push('escalating_hostility');
        cumulativeRisk += 25;
        this.addEvidence(
          evidenceReferences,
          currentRecord,
          `Escalating hostility gradient detected (${recentScores.join(' -> ')})`
        );
      }
    }

    // --- PATTERN 4: Repeated Insults Toward the Same User ---
    // Recurring derogatory / offensive terms directed at the target
    const insultKeywords = [
      'ugly', 'stupid', 'idiot', 'loser', 'fat', 'worthless', 'freak',
      'trash', 'bitch', 'whore', 'bastard', 'pathetic', 'clown', 'pig',
      'shut up', 'get lost', 'die', 'kill yourself', 'nobody likes you'
    ];
    let insultCount = 0;
    const matchedInsults: string[] = [];
    for (const record of pairHistory) {
      const lower = record.content.toLowerCase();
      for (const kw of insultKeywords) {
        if (lower.includes(kw)) {
          insultCount++;
          matchedInsults.push(kw);
          this.addEvidence(evidenceReferences, record, `Repeated insult keyword: "${kw}"`);
          break;
        }
      }
    }
    if (insultCount >= 2) {
      patternsDetected.push('repeated_insults');
      cumulativeRisk += Math.min(35, insultCount * 12);
    }

    // --- PATTERN 5: Coordinated Harassment Patterns (Brigading / Pile-On) ---
    // Multiple distinct actors attacking the same target in a short 2-hour window
    const distinctHostileActors = new Set(
      recentTargetHistory
        .filter((i) => i.toxicity_score >= 45)
        .map((i) => i.actor_user_id)
    );
    if (distinctHostileActors.size >= 3) {
      patternsDetected.push('coordinated_harassment');
      cumulativeRisk += 40;
      this.addEvidence(
        evidenceReferences,
        currentRecord,
        `Coordinated burst detected: ${distinctHostileActors.size} distinct actors targeting user within 2 hours`
      );
    }

    // Final risk evaluation
    const finalRiskScore = Math.min(100, Math.round(cumulativeRisk + (toxicityScore > 50 ? toxicityScore * 0.3 : 0)));
    const hasBullying = patternsDetected.length > 0 && finalRiskScore >= 45;
    const confidence = Math.min(98, 70 + patternsDetected.length * 8);

    let recommendedAction: 'none' | 'warning' | 'quarantine' | 'block_interaction' | 'reputation_penalty' = 'none';
    let reason = 'Normal interaction; no multi-interaction harassment patterns detected.';

    if (hasBullying) {
      if (finalRiskScore >= 80 || patternsDetected.includes('coordinated_harassment')) {
        recommendedAction = 'block_interaction';
        reason = `High-severity cyberbullying detected (${patternsDetected.join(', ')}). Interaction blocked.`;
      } else if (finalRiskScore >= 65) {
        recommendedAction = 'reputation_penalty';
        reason = `Cyberbullying pattern detected: ${patternsDetected.join(', ')}. Reputation penalized.`;
      } else {
        recommendedAction = 'warning';
        reason = `Early-stage harassment pattern detected: ${patternsDetected.join(', ')}.`;
      }

      // Create and persist Cyberbullying Event
      const event: CyberbullyingEvent = {
        id: `cbe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        target_user_id: targetId,
        target_username: options.targetUsername || 'Target',
        actor_user_id: actorId,
        actor_username: options.actorUsername || 'Actor',
        pattern_type: patternsDetected[0],
        risk_score: finalRiskScore,
        confidence,
        evidence_references: evidenceReferences,
        timestamps: {
          detected_at: new Date().toISOString(),
          first_incident: new Date(pairHistory[0]?.timestamp || Date.now()).toISOString(),
          latest_incident: new Date().toISOString(),
        },
      };

      this.events.push(event);
      this.persistEventToDatabase(event).catch((err) =>
        console.warn('Cyberbullying DB sync notice:', err.message)
      );

      return {
        has_bullying: true,
        risk_score: finalRiskScore,
        confidence,
        patterns_detected: patternsDetected,
        event,
        evidence_references: evidenceReferences,
        recommended_action: recommendedAction,
        reason,
      };
    }

    return {
      has_bullying: false,
      risk_score: finalRiskScore,
      confidence,
      patterns_detected: [],
      evidence_references: [],
      recommended_action: 'none',
      reason,
    };
  }

  /**
   * Helper to deduplicate evidence references
   */
  private addEvidence(
    evidenceList: BullyingEvidenceReference[],
    record: InteractionRecord,
    context: string
  ): void {
    if (!evidenceList.some((e) => e.interaction_id === record.id)) {
      evidenceList.push({
        interaction_id: record.id,
        timestamp: new Date(record.timestamp).toISOString(),
        content_snippet: record.content.slice(0, 120),
        toxicity_score: record.toxicity_score,
        context,
        actor_user_id: record.actor_user_id,
        target_user_id: record.target_user_id,
      });
    }
  }

  /**
   * Retrieves active bullying events for a given target user
   */
  public getEventsForTarget(targetUserId: string): CyberbullyingEvent[] {
    return this.events.filter((e) => e.target_user_id === targetUserId);
  }

  /**
   * Retrieves active bullying events for a given actor user
   */
  public getEventsByActor(actorUserId: string): CyberbullyingEvent[] {
    return this.events.filter((e) => e.actor_user_id === actorUserId);
  }

  /**
   * Persists event to Supabase public.cyberbullying_events
   */
  private async persistEventToDatabase(event: CyberbullyingEvent): Promise<void> {
    try {
      await supabase.from('cyberbullying_events').insert({
        id: event.id,
        target_user_id: event.target_user_id,
        target_username: event.target_username,
        actor_user_id: event.actor_user_id,
        actor_username: event.actor_username,
        pattern_type: event.pattern_type,
        risk_score: event.risk_score,
        confidence: event.confidence,
        evidence_references: event.evidence_references,
        created_at: event.timestamps.detected_at,
      });
    } catch (err: any) {
      console.warn('Could not insert cyberbullying_events record into Supabase:', err.message);
    }
  }
}

export const cyberbullyingService = new CyberbullyingService();
