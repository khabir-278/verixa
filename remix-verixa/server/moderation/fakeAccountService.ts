/**
 * VERIXA Fake Account Risk Evaluation Service
 *
 * Evaluates account authenticity probability from observable platform behaviors:
 * - Account age (fresh account vs established profile)
 * - Posting frequency (burst velocity vs organic cadence)
 * - Comment frequency (spam velocity distribution)
 * - Follower/following ratio (asymmetry anomalies)
 * - Community report history (prior infractions/flags)
 * - Login patterns (session churn, rapid device hopping)
 * - Interaction patterns (one-way outbound actions, uncustomized profile)
 *
 * Strict Compliance:
 * - Does NOT call an account "fake" with absolute certainty.
 * - Uses probabilistic risk terminology: "Low Risk of Inauthentic Activity", "Elevated Risk of Inauthentic Behavior", etc.
 */

import {
  FakeAccountRiskEvaluation,
  AccountRiskLevel,
  ObservedBehavioralFactors,
} from './types';
import { supabase } from '../../src/lib/supabase';

export interface UserObservableData {
  userId: string;
  username?: string;
  createdAt?: string | Date;
  postsCount?: number;
  commentsCount?: number;
  followersCount?: number;
  followingCount?: number;
  reportsCount?: number;
  hasCustomAvatar?: boolean;
  hasBio?: boolean;
  recentLoginCount?: number;
  outboundLikesCount?: number;
  inboundLikesCount?: number;
}

class FakeAccountService {
  /**
   * Calculates probabilistic inauthenticity risk score from observable behavior metrics
   */
  public evaluateAccountRisk(data: UserObservableData): FakeAccountRiskEvaluation {
    const now = Date.now();
    const createdDate = data.createdAt ? new Date(data.createdAt).getTime() : now - 30 * 86400 * 1000;
    const accountAgeDays = Math.max(0.05, (now - createdDate) / (1000 * 60 * 60 * 24));

    const postsCount = data.postsCount ?? 0;
    const commentsCount = data.commentsCount ?? 0;
    const followers = data.followersCount ?? 0;
    const following = data.followingCount ?? 0;
    const reports = data.reportsCount ?? 0;

    const postsPerDay = postsCount / accountAgeDays;
    const commentsPerDay = commentsCount / accountAgeDays;
    const followerRatio = following > 0 ? followers / following : followers > 0 ? 10 : 1;

    let cumulativeRisk = 0;
    const riskIndicators: string[] = [];
    const loginNotes: string[] = [];
    const interactionNotes: string[] = [];

    // --- 1. Account Age Evaluation ---
    if (accountAgeDays < 1) {
      cumulativeRisk += 25;
      riskIndicators.push('Brand new account registered within the last 24 hours');
    } else if (accountAgeDays < 7) {
      cumulativeRisk += 12;
      riskIndicators.push('Recent account registered within the last 7 days');
    } else if (accountAgeDays > 60) {
      cumulativeRisk -= 15; // Established profile credit
    }

    // --- 2. Posting Frequency Anomalies ---
    if (postsPerDay > 20) {
      cumulativeRisk += 22;
      riskIndicators.push(`Abnormally high post velocity (${Math.round(postsPerDay)} posts/day)`);
    } else if (postsPerDay > 8) {
      cumulativeRisk += 10;
    }

    // --- 3. Comment Frequency Anomalies ---
    if (commentsPerDay > 50) {
      cumulativeRisk += 25;
      riskIndicators.push(`High comment velocity (${Math.round(commentsPerDay)} comments/day)`);
    } else if (commentsPerDay > 15 && accountAgeDays < 3) {
      cumulativeRisk += 15;
      riskIndicators.push('High-frequency commenting on fresh account');
    }

    // --- 4. Follower / Following Asymmetry ---
    if (following >= 200 && followers <= 2) {
      cumulativeRisk += 25;
      riskIndicators.push(`Extreme follow asymmetry (${following} following vs ${followers} followers)`);
    } else if (following >= 800 && followers < 15) {
      cumulativeRisk += 20;
      riskIndicators.push('High following count with minimal reciprocation');
    } else if (followers > 500 && following === 0 && accountAgeDays < 3) {
      cumulativeRisk += 30;
      riskIndicators.push('Sudden follower influx on newly created account without following activity');
    }

    // --- 5. Report History ---
    if (reports >= 3) {
      cumulativeRisk += 30;
      riskIndicators.push(`Multiple community reports on record (${reports} reports)`);
    } else if (reports >= 1) {
      cumulativeRisk += 15;
      riskIndicators.push(`Community safety report recorded (${reports} report)`);
    }

    // --- 6. Profile Personalization & Interaction Patterns ---
    if (data.hasCustomAvatar === false && data.hasBio === false) {
      cumulativeRisk += 15;
      interactionNotes.push('Default system avatar and empty profile bio');
    }

    if ((data.outboundLikesCount ?? 0) > 100 && (data.inboundLikesCount ?? 0) === 0) {
      cumulativeRisk += 12;
      interactionNotes.push('One-way engagement pattern with zero inbound community interactions');
    }

    // --- 7. Login Pattern Notes ---
    if ((data.recentLoginCount ?? 1) > 15) {
      cumulativeRisk += 10;
      loginNotes.push('High session churn rate recorded');
    } else {
      loginNotes.push('Standard authentication session behavior');
    }

    // Clamp score to [0, 100]
    const finalRiskScore = Math.max(0, Math.min(100, Math.round(cumulativeRisk)));

    // Categorize into non-definitive probability terminology
    let riskLevel: AccountRiskLevel = 'LOW';
    let probabilityLabel = `Low Risk of Inauthentic Activity (${finalRiskScore}%)`;
    let trustClassification = 'Likely Authentic Member';

    if (finalRiskScore >= 75) {
      riskLevel = 'HIGH';
      probabilityLabel = `High Risk Profile for Inauthentic / Automated Behavior (${finalRiskScore}%)`;
      trustClassification = 'Elevated Suspicious Activity Profile';
    } else if (finalRiskScore >= 50) {
      riskLevel = 'ELEVATED';
      probabilityLabel = `Elevated Inauthenticity Risk (${finalRiskScore}%)`;
      trustClassification = 'Requires Pattern Verification';
    } else if (finalRiskScore >= 25) {
      riskLevel = 'MODERATE';
      probabilityLabel = `Moderate Risk of Inauthentic or Coordinated Patterns (${finalRiskScore}%)`;
      trustClassification = 'Active Community Participant';
    }

    const confidence = Math.min(95, 60 + (accountAgeDays > 3 ? 15 : 5) + riskIndicators.length * 6);

    const observedFactors: ObservedBehavioralFactors = {
      account_age_days: Math.round(accountAgeDays * 10) / 10,
      posting_frequency_per_day: Math.round(postsPerDay * 10) / 10,
      comment_frequency_per_day: Math.round(commentsPerDay * 10) / 10,
      follower_following_ratio: Math.round(followerRatio * 100) / 100,
      followers_count: followers,
      following_count: following,
      reports_count: reports,
      login_pattern_notes: loginNotes,
      interaction_pattern_notes: interactionNotes,
      burst_activity_detected: postsPerDay > 15 || commentsPerDay > 30,
    };

    return {
      user_id: data.userId,
      username: data.username,
      risk_score: finalRiskScore,
      confidence,
      risk_level: riskLevel,
      probability_label: probabilityLabel,
      trust_classification: trustClassification,
      observed_factors: observedFactors,
      risk_indicators: riskIndicators.length > 0 ? riskIndicators : ['No anomalous behavioral patterns observed.'],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Evaluates account risk by querying live Supabase profile and engagement data
   */
  public async evaluateUserFromDatabase(userId: string): Promise<FakeAccountRiskEvaluation> {
    try {
      // Query profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // Query report count
      const { count: reportsCount } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('target_id', userId);

      const observable: UserObservableData = {
        userId,
        username: profile?.username || 'User',
        createdAt: profile?.created_at,
        postsCount: profile?.posts_count ?? 0,
        followersCount: profile?.followers_count ?? 0,
        followingCount: profile?.following_count ?? 0,
        reportsCount: reportsCount ?? 0,
        hasCustomAvatar: Boolean(profile?.avatar && !profile.avatar.includes('photo-1535713875002')),
        hasBio: Boolean(profile?.bio && profile.bio.trim().length > 5),
      };

      return this.evaluateAccountRisk(observable);
    } catch (err: any) {
      console.warn('Could not query user for fake account risk evaluation:', err.message);
      return this.evaluateAccountRisk({
        userId,
        createdAt: new Date(Date.now() - 14 * 86400 * 1000),
      });
    }
  }
}

export const fakeAccountService = new FakeAccountService();
