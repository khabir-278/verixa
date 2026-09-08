/**
 * VERIXA AI Guardian Mode - Central Behavioral Risk Engine
 *
 * The primary behavioral USP of VERIXA. Aggregates multi-source safety signals:
 * - Toxicity, hate speech, harassment
 * - Cyberbullying multi-interaction patterns
 * - Spam, duplicate content, velocity, bots
 * - NSFW & deepfake upload attempts
 * - Fake account heuristics & profile anomalies
 * - Privacy violations (PII leaks)
 * - Community reports & flags
 * - Positive community engagement & recovery time-decay
 * - Successful appeals
 *
 * Core Guarantees:
 * - Server-authoritative calculations
 * - Never makes irreversible bans from a single AI prediction
 * - Multi-signal requirement for high-severity tiers
 * - Recovery through healthy participation & appeals
 * - Safe user-facing explainability without leaking sensitive internal logic
 */

import {
  GuardianRiskLevel,
  GuardianEventType,
  GuardianActionType,
  GuardianSeverity,
  GuardianExplainability,
  GuardianExplainabilityFactor,
  GuardianScoreRecord,
  GuardianEventRecord,
  GuardianActionRecord,
  UserRestrictionRecord,
  GuardianAppealRecord,
} from './types';
import { supabase } from '../../src/lib/supabase';

export interface RecordGuardianEventInput {
  userId: string;
  eventType: GuardianEventType;
  severity?: GuardianSeverity;
  impact?: number;
  weight?: number; // Ergonomic alias for impact
  confidence?: number;
  source?: string;
  reason?: string;
  description?: string; // Ergonomic alias for reason
  metadata?: Record<string, any>;
}

class GuardianService {
  // In-memory cache of user events: userId -> GuardianEventRecord[]
  private userEvents: Map<string, GuardianEventRecord[]> = new Map();
  // In-memory cache of user scores: userId -> GuardianScoreRecord
  private userScores: Map<string, GuardianScoreRecord> = new Map();
  // In-memory cache of user restrictions: userId -> UserRestrictionRecord
  private userRestrictions: Map<string, UserRestrictionRecord> = new Map();
  // In-memory cache of appeals: appealId -> GuardianAppealRecord
  private appeals: Map<string, GuardianAppealRecord> = new Map();
  // In-memory timestamps of last user actions for cooldown tracking: `${userId}_${action}` -> number
  private lastActionTimes: Map<string, number> = new Map();

  private readonly SLIDING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14-day evaluation window
  private readonly MAX_EVENTS_PER_USER = 1000;

  /**
   * Evaluates the Guardian risk level based on the score
   */
  public getRiskLevel(score: number): GuardianRiskLevel {
    if (score >= 80) return 'SAFE';
    if (score >= 60) return 'WATCH_LIST';
    if (score >= 40) return 'HIGH_RISK';
    if (score >= 20) return 'RESTRICTED';
    return 'CRITICAL';
  }

  /**
   * Allowed actions based on risk level
   */
  public getAllowedActionsForTier(riskLevel: GuardianRiskLevel): string[] {
    switch (riskLevel) {
      case 'SAFE':
        return ['read', 'post', 'comment', 'dm', 'upload', 'stream'];
      case 'WATCH_LIST':
        return ['read', 'post', 'comment', 'dm', 'upload'];
      case 'HIGH_RISK':
        return ['read', 'post_with_review', 'comment_with_review', 'dm', 'upload_verified'];
      case 'RESTRICTED':
        return ['read', 'post_cooldown_300s', 'comment_cooldown_60s', 'dm_restricted', 'appeal'];
      case 'CRITICAL':
        return ['read_only', 'appeal'];
      default:
        return ['read'];
    }
  }

  /**
   * Derives default impact penalty/reward for an event type if not explicitly specified
   */
  private getDefaultImpact(eventType: GuardianEventType, severity: GuardianSeverity): number {
    const sev = (severity || 'low').toString().toLowerCase();
    switch (eventType) {
      case 'HATE_SPEECH':
        return sev === 'critical' ? -35 : sev === 'high' ? -25 : -18;
      case 'CYBERBULLYING':
        return sev === 'critical' ? -35 : sev === 'high' ? -25 : -15;
      case 'HARASSMENT':
        return sev === 'critical' ? -25 : sev === 'high' ? -20 : -12;
      case 'NSFW_UPLOAD_ATTEMPT':
        return sev === 'critical' ? -30 : sev === 'high' ? -22 : -15;
      case 'DEEPFAKE_SUSPICION':
      case 'DEEPFAKE_HIGH_RISK':
        return sev === 'high' ? -25 : -15;
      case 'TOXICITY':
      case 'TOXICITY_SPIKE':
        return sev === 'high' ? -15 : -8;
      case 'SPAM_DETECTED':
        return sev === 'high' ? -18 : -10;
      case 'DUPLICATE_MEDIA_ABUSE':
        return -10;
      case 'FAKE_ACCOUNT_SIGNAL':
        return sev === 'high' ? -25 : -15;
      case 'PRIVACY_VIOLATION':
        return sev === 'high' ? -18 : -10;
      case 'REPORT_RECEIVED':
        return sev === 'high' ? -15 : -8;
      case 'SUCCESSFUL_APPEAL':
        return 25; // Positive recovery
      case 'POSITIVE_COMMUNITY_PARTICIPATION':
      case 'POSITIVE_COMMUNITY_ENGAGEMENT':
        return 3; // Positive organic behavior
      case 'RECOVERY_TIME_DECAY':
        return 8; // Good behavior recovery credit
      case 'REPUTATION_CHANGE':
        return 0; // Dynamic based on reputation delta
      case 'MANUAL_OVERRIDE':
        return 0;
      default:
        return -5;
    }
  }

  /**
   * Returns a user-friendly label for explainability without leaking internal detection regexes/secrets
   */
  private getFactorLabel(eventType: GuardianEventType): string {
    switch (eventType) {
      case 'TOXICITY_SPIKE':
        return 'Offensive comments';
      case 'HATE_SPEECH':
        return 'Severe hate speech policy violation';
      case 'HARASSMENT':
        return 'Hostile interaction patterns';
      case 'CYBERBULLYING':
        return 'Targeted harassment or bullying incidents';
      case 'SPAM_DETECTED':
        return 'Spam activity or excessive posting rate';
      case 'NSFW_UPLOAD_ATTEMPT':
        return 'Sensitive / adult media upload attempts';
      case 'DEEPFAKE_HIGH_RISK':
        return 'Synthetic or unverified media markers';
      case 'DUPLICATE_MEDIA_ABUSE':
        return 'Repetitive duplicate media uploads';
      case 'FAKE_ACCOUNT_SIGNAL':
        return 'Inauthentic behavioral indicators';
      case 'PRIVACY_VIOLATION':
        return 'Personal data or sensitive PII disclosure';
      case 'REPORT_RECEIVED':
        return 'Community safety reports confirmed';
      case 'SUCCESSFUL_APPEAL':
        return 'Successful appeal';
      case 'POSITIVE_COMMUNITY_ENGAGEMENT':
        return 'Positive interactions';
      case 'RECOVERY_TIME_DECAY':
        return 'Good behavior recovery credit';
      default:
        return 'Community safety adjustment';
    }
  }

  /**
   * Records a behavioral safety event into the Guardian system
   */
  public async recordGuardianEvent(input: RecordGuardianEventInput): Promise<GuardianEventRecord> {
    const { userId, eventType } = input;
    const rawSeverity = (input.severity || 'low').toString().toLowerCase() as 'low' | 'medium' | 'high' | 'critical';
    const severity: GuardianSeverity = rawSeverity;
    const confidence = input.confidence ?? 85;
    const isPositiveType =
      eventType === 'SUCCESSFUL_APPEAL' ||
      eventType === 'POSITIVE_COMMUNITY_ENGAGEMENT' ||
      eventType === 'POSITIVE_COMMUNITY_PARTICIPATION' ||
      eventType === 'RECOVERY_TIME_DECAY';

    let impact: number;
    if (eventType === 'REPUTATION_CHANGE' || eventType === 'MANUAL_OVERRIDE') {
      impact = input.impact !== undefined ? input.impact : (input.weight !== undefined ? input.weight : 0);
    } else if (input.impact !== undefined) {
      impact = isPositiveType ? Math.abs(input.impact) : -Math.abs(input.impact);
    } else if (input.weight !== undefined) {
      impact = isPositiveType ? Math.abs(input.weight) : -Math.abs(input.weight);
    } else {
      impact = this.getDefaultImpact(eventType, severity);
    }

    const source = input.source || 'system';
    const reason = input.reason || input.description || 'Safety event logged';
    const now = new Date().toISOString();

    const eventRecord: GuardianEventRecord = {
      id: `gev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: userId,
      event_type: eventType,
      severity,
      impact,
      confidence,
      source,
      reason,
      metadata: input.metadata || {},
      created_at: now,
    };

    // Update in-memory user events
    const events = this.userEvents.get(userId) || [];
    events.unshift(eventRecord);
    if (events.length > this.MAX_EVENTS_PER_USER) {
      events.pop();
    }
    this.userEvents.set(userId, events);

    // Persist to Supabase asynchronously
    this.persistEventToDatabase(eventRecord).catch((err) =>
      console.warn('Guardian event database sync notice:', err.message)
    );

    // Automatically recalculate Guardian score & update restrictions
    await this.calculateGuardianScore(userId);

    return eventRecord;
  }

  /**
   * Calculates the authoritative Guardian score for a user
   */
  public async calculateGuardianScore(userId: string): Promise<GuardianScoreRecord> {
    const nowMs = Date.now();
    const cutoffMs = nowMs - this.SLIDING_WINDOW_MS;

    let events = this.userEvents.get(userId) || [];
    // Filter to active sliding window
    events = events.filter((e) => new Date(e.created_at).getTime() >= cutoffMs);

    let baseScore = 100;
    const signalsSummary: Record<string, number> = {};
    const categoryDeltas: Map<GuardianEventType, { totalImpact: number; count: number; latest: string }> = new Map();

    for (const evt of events) {
      // Track counts by event type
      signalsSummary[evt.event_type] = (signalsSummary[evt.event_type] || 0) + 1;

      // Group for explainability
      const current = categoryDeltas.get(evt.event_type) || { totalImpact: 0, count: 0, latest: evt.created_at };
      current.totalImpact += evt.impact;
      current.count += 1;
      categoryDeltas.set(evt.event_type, current);
    }

    // Apply multi-signal and confidence weighting
    let aggregatePenalty = 0;
    let aggregateCredit = 0;
    const distinctViolationCategories = new Set<string>();

    for (const [type, data] of categoryDeltas.entries()) {
      if (data.totalImpact < 0) {
        distinctViolationCategories.add(type);
        aggregatePenalty += Math.abs(data.totalImpact);
      } else {
        aggregateCredit += data.totalImpact;
      }
    }

    // Safeguard: Do NOT make irreversible critical decisions from a single AI prediction
    // If there is only 1 isolated violation category and it wasn't manual override,
    // cap the penalty to prevent dropping straight into CRITICAL (<20) or RESTRICTED (<40)
    if (distinctViolationCategories.size === 1) {
      const singleType = Array.from(distinctViolationCategories)[0];
      if (singleType !== 'MANUAL_OVERRIDE') {
        aggregatePenalty = Math.min(aggregatePenalty, 40); // Leaves user at minimum 60 (WATCH_LIST)
      }
    }

    // Calculate preliminary score
    let calculatedScore = Math.round(baseScore - aggregatePenalty + aggregateCredit);

    // Apply organic clean-standing credit if user has at least 3 positive events and 0 recent severe violations
    const hasSevereViolation = events.some(
      (e) => (e.severity === 'critical' || e.severity === 'high') && e.impact < 0
    );
    if (!hasSevereViolation && (signalsSummary['POSITIVE_COMMUNITY_ENGAGEMENT'] ?? 0) >= 3) {
      calculatedScore = Math.min(100, calculatedScore + 5);
    }

    // Strict clamping to [0, 100]
    const finalScore = Math.max(0, Math.min(100, calculatedScore));
    const riskLevel = this.getRiskLevel(finalScore);

    // Average confidence across contributing events
    const avgConfidence =
      events.length > 0
        ? Math.round(events.reduce((sum, e) => sum + e.confidence, 0) / events.length)
        : 100;

    // Generate explainability breakdown
    const factors: GuardianExplainabilityFactor[] = [];
    for (const [type, data] of categoryDeltas.entries()) {
      factors.push({
        label: this.getFactorLabel(type),
        impact: data.totalImpact,
        category: type,
        count: data.count,
        latest_incident: data.latest,
      });
    }

    // Sort factors: negative penalties first, then positive credits
    factors.sort((a, b) => a.impact - b.impact);

    let summary = 'Your account safety rating is currently in good standing.';
    const recoveryTips: string[] = [];

    if (riskLevel === 'CRITICAL') {
      summary =
        'Critical Safety Alert: Your account has accumulated multiple severe policy violations. Publishing actions are temporarily suspended pending review or appeal.';
      recoveryTips.push('Submit an appeal via the Account Safety Certificate modal.');
      recoveryTips.push('Review the VERIXA Community Guidelines.');
    } else if (riskLevel === 'RESTRICTED') {
      summary =
        'Account Restrictions Active: Due to repeated safety warnings or spam flags, posting and comment rate limits are currently in effect.';
      recoveryTips.push('Wait for cooldown periods between posts and comments.');
      recoveryTips.push('Avoid repetitive phrasing, unsolicited links, or hostile remarks.');
    } else if (riskLevel === 'HIGH_RISK') {
      summary =
        'Elevated Risk Notice: Recent actions have flagged safety concerns. Content submitted will undergo enhanced verification checks.';
      recoveryTips.push('Ensure all uploaded media complies with zero-tolerance nudity and weapons policies.');
      recoveryTips.push('Engage respectfully to rebuild community trust.');
    } else if (riskLevel === 'WATCH_LIST') {
      summary =
        'Watch List Advisory: Minor behavioral flags or isolated comments have been detected. Continue positive interactions to return to Safe standing.';
      recoveryTips.push('Keep comments constructive and friendly.');
      recoveryTips.push('Verified safe posts will steadily recover your safety rating.');
    } else {
      recoveryTips.push('Maintain clean community participation.');
      recoveryTips.push('Protected by VERIXA AI Guardian real-time intelligence.');
    }

    const explainability: GuardianExplainability = {
      safety_score: finalScore,
      risk_level: riskLevel,
      factors,
      summary,
      recovery_tips: recoveryTips,
      detailed_signals: {
        total_events: events.length,
        distinct_violation_types: Array.from(distinctViolationCategories),
        aggregate_penalty: aggregatePenalty,
        aggregate_credit: aggregateCredit,
        window_days: 14,
        confidence: avgConfidence,
      },
    };

    const nowIso = new Date().toISOString();
    const scoreRecord: GuardianScoreRecord = {
      id: `gsc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: userId,
      guardian_score: finalScore,
      score: finalScore,
      risk_level: riskLevel,
      confidence: avgConfidence,
      explainability,
      signals_summary: signalsSummary,
      allowed_actions: this.getAllowedActionsForTier(riskLevel),
      positive_factor_sum: aggregateCredit,
      penalty_factor_sum: aggregatePenalty,
      last_calculated_at: nowIso,
      last_updated: nowIso,
      updated_at: nowIso,
    };

    this.userScores.set(userId, scoreRecord);

    // Synchronize policy restrictions based on new risk tier
    await this.updateUserRestrictions(userId, riskLevel, summary);

    // Persist score to Supabase
    this.persistScoreToDatabase(scoreRecord).catch((err) =>
      console.warn('Guardian score database sync notice:', err.message)
    );

    return scoreRecord;
  }

  /**
   * Updates user restrictions in memory and in Supabase based on the risk level
   */
  private async updateUserRestrictions(
    userId: string,
    riskLevel: GuardianRiskLevel,
    reason: string
  ): Promise<UserRestrictionRecord> {
    const existing = this.userRestrictions.get(userId);
    const now = new Date().toISOString();

    let uploadRestricted = false;
    let commentRestricted = false;
    let messagingRestricted = false;
    let accountSuspended = false;
    let uploadCooldownSeconds = 0;
    let commentCooldownSeconds = 0;

    switch (riskLevel) {
      case 'CRITICAL':
        accountSuspended = true;
        uploadRestricted = true;
        commentRestricted = true;
        messagingRestricted = true;
        uploadCooldownSeconds = 86400; // 24h
        commentCooldownSeconds = 86400;
        break;
      case 'RESTRICTED':
        uploadRestricted = true;
        commentRestricted = true;
        messagingRestricted = false;
        uploadCooldownSeconds = 300; // 5-minute cooldown between posts
        commentCooldownSeconds = 60; // 60-second cooldown between comments
        break;
      case 'HIGH_RISK':
        uploadRestricted = false;
        commentRestricted = false;
        uploadCooldownSeconds = 30; // Mild cadence
        commentCooldownSeconds = 15;
        break;
      case 'WATCH_LIST':
        uploadRestricted = false;
        commentRestricted = false;
        uploadCooldownSeconds = 0;
        commentCooldownSeconds = 0;
        break;
      case 'SAFE':
      default:
        uploadRestricted = false;
        commentRestricted = false;
        messagingRestricted = false;
        accountSuspended = false;
        uploadCooldownSeconds = 0;
        commentCooldownSeconds = 0;
        break;
    }

    const restrictionRecord: UserRestrictionRecord = {
      id: existing?.id || `rst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: userId,
      risk_level: riskLevel,
      upload_restricted: uploadRestricted,
      comment_restricted: commentRestricted,
      messaging_restricted: messagingRestricted,
      account_suspended: accountSuspended,
      upload_cooldown_seconds: uploadCooldownSeconds,
      comment_cooldown_seconds: commentCooldownSeconds,
      reason,
      appeal_status: existing?.appeal_status || 'NONE',
      appeal_id: existing?.appeal_id,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    this.userRestrictions.set(userId, restrictionRecord);

    // Record Guardian Action if state changed
    if (!existing || existing.risk_level !== riskLevel) {
      const actionType: GuardianActionType =
        riskLevel === 'CRITICAL'
          ? 'SUSPENSION'
          : riskLevel === 'RESTRICTED'
          ? 'RATE_LIMIT_APPLIED'
          : riskLevel === 'HIGH_RISK'
          ? 'STRICT_UPLOAD_CHECKS'
          : riskLevel === 'WATCH_LIST'
          ? 'WARNING'
          : 'NORMAL_OPERATION';

      const actionRecord: GuardianActionRecord = {
        id: `gact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        user_id: userId,
        action_type: actionType,
        risk_level: riskLevel,
        enforcement_details: {
          upload_restricted: uploadRestricted,
          comment_restricted: commentRestricted,
          cooldowns: { upload: uploadCooldownSeconds, comment: commentCooldownSeconds },
        },
        active: riskLevel !== 'SAFE',
        issued_at: now,
      };

      this.persistActionToDatabase(actionRecord).catch((err) =>
        console.warn('Guardian action database sync notice:', err.message)
      );
    }

    // Persist restriction to database
    this.persistRestrictionToDatabase(restrictionRecord).catch((err) =>
      console.warn('User restriction database sync notice:', err.message)
    );

    return restrictionRecord;
  }

  /**
   * Evaluates whether a requested user action (post, comment, dm, upload) is allowed
   */
  /**
   * Evaluates whether a requested user action (post, comment, dm, upload, story, reel) is allowed
   */
  public async checkActionAllowed(
    userId: string,
    action: 'post' | 'comment' | 'dm' | 'upload' | 'story' | 'reel'
  ): Promise<{
    allowed: boolean;
    risk_level: GuardianRiskLevel;
    restriction?: string;
    reason?: string;
    cooldown_seconds_remaining?: number;
    cooldownRemainingSeconds?: number;
    appeal_available?: boolean;
  }> {
    // Guest users bypass restrictions unless IP blocked
    if (!userId || userId === 'user_guest') {
      return { allowed: true, risk_level: 'SAFE' };
    }

    const normalizedAction = action === 'story' || action === 'reel' ? 'upload' : action;

    // Fetch current restrictions
    let restrictions = this.userRestrictions.get(userId);
    if (!restrictions) {
      // Initialize or fetch score
      const scoreRecord = await this.getGuardianScore(userId);
      restrictions = this.userRestrictions.get(userId)!;
    }

    const riskLevel = restrictions?.risk_level || 'SAFE';

    // 1. Check account suspension (CRITICAL tier)
    if (restrictions?.account_suspended) {
      const msg = 'Account Temporary Suspension: Publishing features are suspended due to severe community safety violations. You may file an appeal.';
      return {
        allowed: false,
        risk_level: riskLevel,
        restriction: msg,
        reason: msg,
        appeal_available: true,
      };
    }

    // 2. Check messaging restriction
    if (normalizedAction === 'dm' && restrictions?.messaging_restricted) {
      const msg = 'Direct messaging restricted under current safety risk tier.';
      return {
        allowed: false,
        risk_level: riskLevel,
        restriction: msg,
        reason: msg,
        appeal_available: true,
      };
    }

    // 3. Check upload restriction
    if ((normalizedAction === 'post' || normalizedAction === 'upload') && restrictions?.upload_restricted) {
      const key = `${userId}_upload`;
      const restrictionTime = restrictions.updated_at ? new Date(restrictions.updated_at).getTime() : Date.now();
      const lastTime = this.lastActionTimes.get(key) ?? restrictionTime;
      const elapsed = Math.floor((Date.now() - lastTime) / 1000);
      const cooldown = restrictions.upload_cooldown_seconds || 300;

      if (elapsed < cooldown) {
        const remaining = Math.max(1, cooldown - elapsed);
        const msg = `Upload Rate Limit Active: Please wait ${remaining} seconds before sharing another post.`;
        return {
          allowed: false,
          risk_level: riskLevel,
          restriction: msg,
          reason: msg,
          cooldown_seconds_remaining: remaining,
          cooldownRemainingSeconds: remaining,
          appeal_available: riskLevel === 'RESTRICTED',
        };
      }
    }

    // 4. Check comment restriction
    if (normalizedAction === 'comment' && restrictions?.comment_restricted) {
      const key = `${userId}_comment`;
      const restrictionTime = restrictions.updated_at ? new Date(restrictions.updated_at).getTime() : Date.now();
      const lastTime = this.lastActionTimes.get(key) ?? restrictionTime;
      const elapsed = Math.floor((Date.now() - lastTime) / 1000);
      const cooldown = restrictions.comment_cooldown_seconds || 60;

      if (elapsed < cooldown) {
        const remaining = Math.max(1, cooldown - elapsed);
        const msg = `Comment Rate Limit Active: Please wait ${remaining} seconds before posting another comment.`;
        return {
          allowed: false,
          risk_level: riskLevel,
          restriction: msg,
          reason: msg,
          cooldown_seconds_remaining: remaining,
          cooldownRemainingSeconds: remaining,
          appeal_available: riskLevel === 'RESTRICTED',
        };
      }
    }

    // Action is permitted: update cadence timestamp
    if (normalizedAction === 'post' || normalizedAction === 'upload') {
      this.lastActionTimes.set(`${userId}_upload`, Date.now());
    } else if (normalizedAction === 'comment') {
      this.lastActionTimes.set(`${userId}_comment`, Date.now());
    }

    return {
      allowed: true,
      risk_level: riskLevel,
    };
  }

  /**
   * Retrieves the current Guardian Score and Explainability for a user
   */
  public async getGuardianScore(userId: string, isAdmin: boolean = false): Promise<GuardianScoreRecord> {
    if (!this.userScores.has(userId)) {
      await this.calculateGuardianScore(userId);
    }

    const record = this.userScores.get(userId)!;

    if (!isAdmin) {
      // Strip internal raw telemetry for regular users to prevent leaking sensitive model weights
      return {
        ...record,
        explainability: {
          ...record.explainability,
          detailed_signals: undefined,
          is_admin_view: false,
        },
      };
    }

    return {
      ...record,
      explainability: {
        ...record.explainability,
        is_admin_view: true,
      },
    };
  }

  /**
   * Explainability breakdown getter
   */
  public async getExplainability(userId: string, isAdmin: boolean = false): Promise<GuardianExplainability> {
    const scoreRecord = await this.getGuardianScore(userId, isAdmin);
    return scoreRecord.explainability;
  }

  /**
   * Active restrictions getter alias
   */
  public async getActiveRestrictions(userId: string): Promise<UserRestrictionRecord> {
    return this.getRestrictions(userId);
  }

  /**
   * Submits a user appeal against active restrictions
   */
  public async submitAppeal(
    userId: string,
    param2: string,
    param3?: string,
    evidence?: string
  ): Promise<GuardianAppealRecord> {
    const appealId = `apl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const restrictions = this.userRestrictions.get(userId);

    const reason = param3 ? param2 : 'Restriction appeal';
    const appealText = param3 ? `${param3}${evidence ? ` (Evidence: ${evidence})` : ''}` : param2;

    const appeal: GuardianAppealRecord = {
      id: appealId,
      user_id: userId,
      restriction_id: restrictions?.id,
      reason,
      appeal_text: appealText,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };

    this.appeals.set(appealId, appeal);

    // Update restriction record with appeal status
    if (restrictions) {
      restrictions.appeal_status = 'PENDING';
      restrictions.appeal_id = appealId;
      this.userRestrictions.set(userId, restrictions);
    }

    // Persist to database
    this.persistAppealToDatabase(appeal).catch((err) =>
      console.warn('Guardian appeal database sync notice:', err.message)
    );

    return appeal;
  }

  /**
   * Resolves a user appeal (admin operation)
   * Approving an appeal awards score recovery credit and recalculates status.
   */
  public async resolveAppeal(
    appealId: string,
    resolution: 'approve' | 'reject' | 'APPROVED' | 'REJECTED',
    param3?: string,
    param4?: string
  ): Promise<{ success: boolean; scoreDelta: number; newScore?: number; newRiskLevel?: GuardianRiskLevel; appeal?: GuardianAppealRecord }> {
    const appeal = this.appeals.get(appealId);
    if (!appeal) {
      return { success: false, scoreDelta: 0 };
    }

    const isApprove = resolution.toString().toUpperCase() === 'APPROVED' || resolution.toString().toLowerCase() === 'approve';
    const reviewerId = param4 ? param3! : (param3 && !param4 && !param3.includes(' ') ? param3 : 'admin');
    const notes = param4 ? param4 : (param3 && param3.includes(' ') ? param3 : 'Resolved by moderator');

    appeal.status = isApprove ? 'APPROVED' : 'REJECTED';
    appeal.reviewer_id = reviewerId;
    appeal.reviewer_notes = notes;
    appeal.resolved_at = new Date().toISOString();
    this.appeals.set(appealId, appeal);

    let scoreDelta = 0;
    let newScoreRecord: GuardianScoreRecord | undefined;

    if (isApprove) {
      scoreDelta = 30; // Meaningful score recovery
      // Record SUCCESSFUL_APPEAL event
      await this.recordGuardianEvent({
        userId: appeal.user_id,
        eventType: 'SUCCESSFUL_APPEAL',
        severity: 'low',
        impact: scoreDelta,
        confidence: 100,
        source: 'appeal_system',
        reason: `Appeal approved by safety moderator: ${notes || 'Sanction overturned upon community review.'}`,
      });

      newScoreRecord = await this.getGuardianScore(appeal.user_id, true);

      // Lift suspension and reset appeal status
      const restrictions = this.userRestrictions.get(appeal.user_id);
      if (restrictions) {
        restrictions.appeal_status = 'APPROVED';
        restrictions.account_suspended = false;
        restrictions.upload_restricted = false;
        restrictions.comment_restricted = false;
        this.userRestrictions.set(appeal.user_id, restrictions);
      }
    } else {
      const restrictions = this.userRestrictions.get(appeal.user_id);
      if (restrictions) {
        restrictions.appeal_status = 'REJECTED';
        this.userRestrictions.set(appeal.user_id, restrictions);
      }
    }

    // Persist resolution to database
    this.persistAppealToDatabase(appeal).catch((err) =>
      console.warn('Guardian appeal update database sync notice:', err.message)
    );

    return {
      success: true,
      scoreDelta,
      newScore: newScoreRecord?.guardian_score,
      newRiskLevel: newScoreRecord?.risk_level,
      appeal,
    };
  }

  /**
   * Returns list of pending appeals for administrative review
   */
  public getPendingAppeals(): GuardianAppealRecord[] {
    return Array.from(this.appeals.values()).filter((a) => a.status === 'PENDING');
  }

  /**
   * Returns active restrictions for a user
   */
  public async getRestrictions(userId: string): Promise<UserRestrictionRecord> {
    if (!this.userRestrictions.has(userId)) {
      await this.calculateGuardianScore(userId);
    }
    return this.userRestrictions.get(userId)!;
  }

  // ============================================================================
  // DATABASE PERSISTENCE HELPERS
  // ============================================================================

  private async persistEventToDatabase(event: GuardianEventRecord): Promise<void> {
    try {
      await supabase.from('guardian_events').insert({
        id: event.id,
        user_id: event.user_id,
        event_type: event.event_type,
        severity: event.severity,
        impact: event.impact,
        confidence: event.confidence,
        source: event.source,
        reason: event.reason,
        metadata: event.metadata,
        created_at: event.created_at,
      });
    } catch {
      // Non-blocking
    }
  }

  private async persistScoreToDatabase(score: GuardianScoreRecord): Promise<void> {
    try {
      await supabase.from('guardian_scores').upsert({
        user_id: score.user_id,
        guardian_score: score.guardian_score,
        risk_level: score.risk_level,
        confidence: score.confidence,
        explainability: score.explainability,
        signals_summary: score.signals_summary,
        last_calculated_at: score.last_calculated_at,
        updated_at: score.updated_at,
      }, { onConflict: 'user_id' });
    } catch {
      // Non-blocking
    }
  }

  private async persistActionToDatabase(action: GuardianActionRecord): Promise<void> {
    try {
      await supabase.from('guardian_actions').insert({
        id: action.id,
        user_id: action.user_id,
        action_type: action.action_type,
        risk_level: action.risk_level,
        enforcement_details: action.enforcement_details,
        active: action.active,
        issued_at: action.issued_at,
        expires_at: action.expires_at,
      });
    } catch {
      // Non-blocking
    }
  }

  private async persistRestrictionToDatabase(restriction: UserRestrictionRecord): Promise<void> {
    try {
      await supabase.from('user_restrictions').upsert({
        user_id: restriction.user_id,
        risk_level: restriction.risk_level,
        upload_restricted: restriction.upload_restricted,
        comment_restricted: restriction.comment_restricted,
        messaging_restricted: restriction.messaging_restricted,
        account_suspended: restriction.account_suspended,
        upload_cooldown_seconds: restriction.upload_cooldown_seconds,
        comment_cooldown_seconds: restriction.comment_cooldown_seconds,
        reason: restriction.reason,
        appeal_status: restriction.appeal_status,
        appeal_id: restriction.appeal_id,
        updated_at: restriction.updated_at,
      }, { onConflict: 'user_id' });
    } catch {
      // Non-blocking
    }
  }

  private async persistAppealToDatabase(appeal: GuardianAppealRecord): Promise<void> {
    try {
      await supabase.from('guardian_appeals').upsert({
        id: appeal.id,
        user_id: appeal.user_id,
        restriction_id: appeal.restriction_id,
        reason: appeal.reason,
        appeal_text: appeal.appeal_text,
        status: appeal.status,
        reviewer_id: appeal.reviewer_id,
        reviewer_notes: appeal.reviewer_notes,
        resolved_at: appeal.resolved_at,
      }, { onConflict: 'id' });
    } catch {
      // Non-blocking
    }
  }
}

export const guardianService = new GuardianService();
