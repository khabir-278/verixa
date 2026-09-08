/**
 * VERIXA Spam Detection Service
 *
 * Implements independent multi-vector spam detection:
 * - Repeated comments (exact match or >=85% similarity)
 * - Repeated posts (duplicate captions/media in short intervals)
 * - Advertising spam (crypto, forex, buy followers, telegram trading)
 * - Fake giveaways (cashapp, free iphone, reward claim phishing)
 * - Referral spam (query parameters, affiliate invite codes)
 * - Link spam (URL stuffing, suspicious shorteners)
 * - Abnormal posting frequency (velocity spikes)
 * - Bot-like behavior (sub-second or mechanical timing)
 */

import { SpamType, SpamCheckResult } from './types';
import { supabase } from '../../src/lib/supabase';

interface UserActionTimestamp {
  timestamp: number;
  content: string;
  type: 'post' | 'comment';
  contentHash: string;
}

class SpamService {
  // Recent user action history: userId -> Array of recent actions
  private userActionHistory: Map<string, UserActionTimestamp[]> = new Map();
  private readonly HISTORY_LIMIT = 50;
  private readonly VELOCITY_WINDOW_MS = 60 * 1000; // 1 minute

  /**
   * Simple hash for quick string equality comparison
   */
  private hashContent(text: string): string {
    let hash = 0;
    const clean = text.toLowerCase().trim().replace(/\s+/g, ' ');
    for (let i = 0; i < clean.length; i++) {
      hash = (hash << 5) - hash + clean.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString();
  }

  /**
   * Computes Jaccard word-level similarity between two texts (0.0 to 1.0)
   */
  private computeSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter(Boolean));
    const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter(Boolean));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    const union = wordsA.size + wordsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Evaluates content for all spam vectors
   */
  public evaluateSpam(
    userId: string,
    content: string,
    contentType: 'post' | 'comment',
    options: {
      contentId?: string;
      submissionTimeMs?: number;
    } = {}
  ): SpamCheckResult {
    const now = options.submissionTimeMs || Date.now();
    const cleanText = content.trim();
    const lowerText = cleanText.toLowerCase();
    const contentHash = this.hashContent(cleanText);

    const detectedSpamTypes: SpamType[] = [];
    let spamScore = 0;
    const reasons: string[] = [];

    // Retrieve and clean user action history
    let userHistory = this.userActionHistory.get(userId) || [];
    userHistory = userHistory.filter((a) => now - a.timestamp < 15 * 60 * 1000); // 15-minute history window

    // --- 1. Velocity & Frequency Metrics ---
    const recentMinuteActions = userHistory.filter((a) => now - a.timestamp <= this.VELOCITY_WINDOW_MS);
    const recentPostsCount = recentMinuteActions.filter((a) => a.type === 'post').length;
    const recentCommentsCount = recentMinuteActions.filter((a) => a.type === 'comment').length;

    // Calculate average interval between consecutive actions
    let avgIntervalSeconds = 60;
    if (recentMinuteActions.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recentMinuteActions.length; i++) {
        intervals.push((recentMinuteActions[i].timestamp - recentMinuteActions[i - 1].timestamp) / 1000);
      }
      avgIntervalSeconds = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    }

    // --- 2. Bot-Like Behavior Detection ---
    if (userHistory.length > 0) {
      const lastAction = userHistory[userHistory.length - 1];
      const deltaMs = now - lastAction.timestamp;

      // Sub-second action interval (< 600ms) indicates automated script
      if (deltaMs < 600) {
        detectedSpamTypes.push('bot_like_behavior');
        spamScore += 50;
        reasons.push(`Sub-second submission latency (${deltaMs}ms) matches automated bot profile`);
      }

      // Check for mechanical fixed-interval timing (e.g. multiple actions spaced by exactly same seconds)
      if (userHistory.length >= 3) {
        const last3Intervals = [
          Math.round((userHistory[userHistory.length - 1].timestamp - userHistory[userHistory.length - 2].timestamp) / 100),
          Math.round((userHistory[userHistory.length - 2].timestamp - userHistory[userHistory.length - 3].timestamp) / 100),
        ];
        if (Math.abs(last3Intervals[0] - last3Intervals[1]) <= 1) {
          detectedSpamTypes.push('bot_like_behavior');
          spamScore += 35;
          reasons.push('Mechanical fixed-cadence intervals detected');
        }
      }
    }

    // --- 3. Abnormal Posting Frequency Detection ---
    if (contentType === 'comment' && recentCommentsCount >= 4) {
      detectedSpamTypes.push('abnormal_frequency');
      spamScore += 40;
      reasons.push(`Abnormal comment frequency (${recentCommentsCount + 1} comments within 60 seconds)`);
    } else if (contentType === 'post' && recentPostsCount >= 2) {
      detectedSpamTypes.push('abnormal_frequency');
      spamScore += 45;
      reasons.push(`Abnormal post frequency (${recentPostsCount + 1} posts within 60 seconds)`);
    }

    // --- 4. Repeated Comments / Duplicate Content ---
    if (contentType === 'comment') {
      const recentComments = userHistory.filter((a) => a.type === 'comment');
      let duplicateFound = false;

      for (const past of recentComments) {
        if (past.contentHash === contentHash) {
          duplicateFound = true;
          break;
        }
        if (this.computeSimilarity(past.content, cleanText) >= 0.85) {
          duplicateFound = true;
          break;
        }
      }

      if (duplicateFound) {
        detectedSpamTypes.push('repeated_comments');
        spamScore += 45;
        reasons.push('Duplicate or near-identical comment posted across multiple targets');
      }
    }

    // --- 5. Repeated Posts ---
    if (contentType === 'post') {
      const recentPosts = userHistory.filter((a) => a.type === 'post');
      let duplicatePostFound = false;

      for (const past of recentPosts) {
        if (past.contentHash === contentHash || this.computeSimilarity(past.content, cleanText) >= 0.9) {
          duplicatePostFound = true;
          break;
        }
      }

      if (duplicatePostFound) {
        detectedSpamTypes.push('repeated_posts');
        spamScore += 50;
        reasons.push('Identical or near-identical post submitted repeatedly');
      }
    }

    // --- 6. Advertising Spam Detection ---
    const adKeywords = [
      'buy followers', 'cheap likes', 'boost account', 'crypto signals',
      'forex profit', 'passive income daily', 'whatsapp trading', 'binance profit',
      'guaranteed 100x', 'free robux', 'join my telegram', 'dm for promo',
      'discount code at checkout', 'promo code'
    ];
    for (const ak of adKeywords) {
      if (lowerText.includes(ak)) {
        detectedSpamTypes.push('advertising_spam');
        spamScore += 40;
        reasons.push(`Commercial advertising keyword detected: "${ak}"`);
        break;
      }
    }

    // --- 7. Fake Giveaways Detection ---
    const giveawayKeywords = [
      'giving away $', 'cashapp giveaway', 'first 50 people to dm',
      'dm to claim your reward', 'free iphone 15', 'free iphone 16',
      'congratulations you have won', 'congratulations you won',
      'claim your free gift card', 'send me $10 get $100'
    ];
    for (const gk of giveawayKeywords) {
      if (lowerText.includes(gk)) {
        detectedSpamTypes.push('fake_giveaway');
        spamScore += 55;
        reasons.push(`Fake giveaway / phishing solicitation pattern detected: "${gk}"`);
        break;
      }
    }

    // --- 8. Referral Spam Detection ---
    const referralRegex = /[?&](ref|aff|referral|invite|affiliate)=|invite_code=|t\.me\/|t\.co\/|bit\.ly\/|tinyurl\.com\//i;
    if (referralRegex.test(content)) {
      detectedSpamTypes.push('referral_spam');
      spamScore += 35;
      reasons.push('Affiliate referral link or URL shortener detected in user content');
    }

    // --- 9. Link Spam Detection ---
    const urlMatches = content.match(/https?:\/\/[^\s]+/gi) || [];
    if (urlMatches.length >= 3) {
      detectedSpamTypes.push('link_spam');
      spamScore += 45;
      reasons.push(`Excessive link stuffing (${urlMatches.length} URLs in single submission)`);
    } else if (urlMatches.length >= 1 && cleanText.length < 35) {
      // Very short comment consisting almost entirely of a URL
      detectedSpamTypes.push('link_spam');
      spamScore += 30;
      reasons.push('Unsolicited solitary URL comment');
    }

    // Record this action into history
    userHistory.push({
      timestamp: now,
      content: cleanText,
      type: contentType,
      contentHash,
    });
    if (userHistory.length > this.HISTORY_LIMIT) {
      userHistory.shift();
    }
    this.userActionHistory.set(userId, userHistory);

    const finalSpamScore = Math.min(100, spamScore);
    const isSpam = detectedSpamTypes.length > 0 && finalSpamScore >= 45;
    const confidence = Math.min(99, 65 + detectedSpamTypes.length * 10);

    let actionTaken: 'allow' | 'warn' | 'block' | 'rate_limit' = 'allow';
    if (finalSpamScore >= 75) {
      actionTaken = 'block';
    } else if (detectedSpamTypes.includes('abnormal_frequency')) {
      actionTaken = 'rate_limit';
    } else if (isSpam) {
      actionTaken = 'warn';
    }

    const summaryReason = isSpam
      ? `Spam detected (${detectedSpamTypes.join(', ')}): ${reasons.join('; ')}`
      : 'Content passed spam checks.';

    if (isSpam) {
      this.persistSpamEvent(userId, options.contentId, contentType, finalSpamScore, detectedSpamTypes, summaryReason);
    }

    return {
      is_spam: isSpam,
      spam_score: finalSpamScore,
      spam_types: detectedSpamTypes,
      reason: summaryReason,
      confidence,
      action_taken: actionTaken,
      velocity_metrics: {
        posts_last_minute: recentPostsCount + (contentType === 'post' ? 1 : 0),
        comments_last_minute: recentCommentsCount + (contentType === 'comment' ? 1 : 0),
        avg_interval_seconds: Math.round(avgIntervalSeconds * 10) / 10,
      },
    };
  }

  /**
   * Persists detected spam to database
   */
  private async persistSpamEvent(
    userId: string,
    contentId: string | undefined,
    contentType: string,
    score: number,
    types: SpamType[],
    reason: string
  ): Promise<void> {
    try {
      await supabase.from('spam_events').insert({
        user_id: userId,
        content_id: contentId || null,
        content_type: contentType,
        spam_score: score,
        spam_types: types,
        reason,
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn('Could not insert spam_events record into Supabase:', err.message);
    }
  }
}

export const spamService = new SpamService();
