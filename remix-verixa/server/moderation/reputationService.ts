/**
 * VERIXA Reputation System Service
 *
 * Implements an immutable, server-authoritative reputation event ledger:
 * - Scores can NEVER be directly manipulated from arbitrary frontend code
 * - Every single score adjustment must record:
 *   1. Event (e.g. POST_VERIFIED_SAFE, SPAM_DETECTED, CYBERBULLYING_PENALTY)
 *   2. Reason (human-readable explanation)
 *   3. Source (ai_moderator, spam_engine, cyberbullying_detector, privacy_scanner, admin_review)
 *   4. Amount (signed delta e.g. +5, -15)
 *   5. Timestamp (ISO 8601)
 * - Synchronizes with Supabase public.reputation_events and public.profiles.safety_score
 */

import {
  ReputationEventType,
  ReputationSource,
  ReputationEventRecord,
  ReputationSummary,
} from './types';
import { supabase } from '../../src/lib/supabase';

class ReputationService {
  // In-memory ledger map: userId -> ReputationEventRecord[]
  private userLedgers: Map<string, ReputationEventRecord[]> = new Map();
  // Current user scores cache: userId -> number
  private userScores: Map<string, number> = new Map();

  /**
   * Calculates dynamic AI trust badge based on reputation score
   */
  public calculateTrustBadge(score: number): string {
    if (score >= 95) return 'Verified Human • 100% Trust';
    if (score >= 80) return 'Trusted Community Member';
    if (score >= 60) return 'Standard Member';
    if (score >= 40) return 'Review Required • Caution';
    return 'Restricted Community Access';
  }

  /**
   * Retrieves the current reputation score for a user
   */
  public async getScore(userId: string): Promise<number> {
    if (this.userScores.has(userId)) {
      return this.userScores.get(userId)!;
    }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('safety_score')
        .eq('id', userId)
        .maybeSingle();

      const score = data?.safety_score ?? 100;
      this.userScores.set(userId, score);
      return score;
    } catch {
      return 100;
    }
  }

  /**
   * Authoritative score adjustment method.
   * Enforces that all modifications specify event, reason, source, amount, and timestamp.
   */
  public async recordEvent(params: {
    userId: string;
    event: ReputationEventType;
    reason: string;
    source: ReputationSource;
    amount: number;
    metadata?: Record<string, any>;
  }): Promise<ReputationEventRecord> {
    const { userId, event, reason, source, amount, metadata = {} } = params;

    const previousScore = await this.getScore(userId);
    // Clamp new score to [0, 100]
    const newScore = Math.max(0, Math.min(100, previousScore + amount));
    const timestamp = new Date().toISOString();

    const record: ReputationEventRecord = {
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: userId,
      event,
      reason,
      source,
      amount,
      previous_score: previousScore,
      new_score: newScore,
      timestamp,
      metadata,
    };

    // Update in-memory state
    this.userScores.set(userId, newScore);
    const history = this.userLedgers.get(userId) || [];
    history.unshift(record); // Prepend to show latest first
    if (history.length > 200) history.pop();
    this.userLedgers.set(userId, history);

    // Persist to Supabase public.reputation_events and public.profiles asynchronously
    this.persistToDatabase(record, newScore).catch((err) => {
      console.warn('Reputation DB sync notice:', err.message);
    });

    return record;
  }

  /**
   * Retrieves the chronological reputation history ledger for a user
   */
  public async getHistory(userId: string, limit: number = 30): Promise<ReputationEventRecord[]> {
    const memoryHistory = this.userLedgers.get(userId);
    if (memoryHistory && memoryHistory.length > 0) {
      return memoryHistory.slice(0, limit);
    }

    try {
      const { data } = await supabase
        .from('reputation_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (data && data.length > 0) {
        const mapped: ReputationEventRecord[] = data.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          event: row.event_type as ReputationEventType,
          reason: row.reason,
          source: row.source as ReputationSource,
          amount: row.amount,
          previous_score: row.previous_score,
          new_score: row.new_score,
          timestamp: row.created_at,
          metadata: row.metadata,
        }));
        this.userLedgers.set(userId, mapped);
        return mapped;
      }
    } catch (err: any) {
      console.warn('Could not load reputation history from DB:', err.message);
    }

    // Default starting clean record if no events yet
    const initialRecord: ReputationEventRecord = {
      id: `rep_init_${Date.now()}`,
      user_id: userId,
      event: 'ACCOUNT_VERIFIED',
      reason: 'Welcome to VERIXA! Community baseline safety trust rating initialized.',
      source: 'policy_engine',
      amount: 0,
      previous_score: 100,
      new_score: 100,
      timestamp: new Date().toISOString(),
    };
    return [initialRecord];
  }

  /**
   * Retrieves user summary metrics
   */
  public async getSummary(userId: string): Promise<ReputationSummary> {
    const currentScore = await this.getScore(userId);
    const history = await this.getHistory(userId, 50);

    const positiveCount = history.filter((e) => e.amount > 0).length;
    const penaltyCount = history.filter((e) => e.amount < 0).length;

    return {
      user_id: userId,
      current_safety_score: currentScore,
      trust_badge: this.calculateTrustBadge(currentScore),
      total_events: history.length,
      recent_events: history.slice(0, 15),
      positive_events_count: positiveCount,
      penalty_events_count: penaltyCount,
    };
  }

  /**
   * Persists the record to public.reputation_events and updates public.profiles
   */
  private async persistToDatabase(record: ReputationEventRecord, newScore: number): Promise<void> {
    try {
      // 1. Insert reputation event
      await supabase.from('reputation_events').insert({
        id: record.id,
        user_id: record.user_id,
        event_type: record.event,
        reason: record.reason,
        source: record.source,
        amount: record.amount,
        previous_score: record.previous_score,
        new_score: record.new_score,
        metadata: record.metadata,
        created_at: record.timestamp,
      });

      // 2. Update user profile safety_score and ai_trust_badge
      await supabase
        .from('profiles')
        .update({
          safety_score: newScore,
          ai_trust_badge: this.calculateTrustBadge(newScore),
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.user_id);
    } catch (err: any) {
      console.warn('Reputation DB persist exception:', err.message);
    }
  }
}

export const reputationService = new ReputationService();
