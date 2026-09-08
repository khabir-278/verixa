/**
 * VERIXA Personalized Feed Engine - Ranking Strategies
 *
 * Implements the Strategy Pattern:
 * - TransparentHeuristicRanker: 11-vector transparent weighted scoring with human explainability
 * - MLModelRanker: Extensible interface for future trained neural/embedding recommendation models
 *
 * Hard Guardrails:
 * - Never recommend blocked, quarantined, or unsafe content (ai_safety_score < 60)
 * - Never use Guardian score to discriminate against ordinary content access
 */

import {
  PostCandidate,
  ViewerContext,
  FeedScoringWeights,
  DEFAULT_FEED_WEIGHTS,
  RankedPostItem,
  FeedRankingStrategy,
  RecommendationFactor,
} from './types';

export class TransparentHeuristicRanker implements FeedRankingStrategy {
  public readonly id = 'v1-transparent-heuristic';
  public readonly name = 'VERIXA Transparent Heuristic Ranker';
  public readonly version = '1.0.0';

  public async rank(
    candidates: PostCandidate[],
    context: ViewerContext,
    weights: FeedScoringWeights = DEFAULT_FEED_WEIGHTS
  ): Promise<RankedPostItem[]> {
    const scoredItems: Array<{
      post: PostCandidate;
      totalScore: number;
      factors: RecommendationFactor[];
      summary: string;
    }> = [];

    const now = Date.now();

    for (const post of candidates) {
      // -------------------------------------------------------------
      // 1. ZERO-TOLERANCE HARD CONTENT SAFETY FILTER
      // -------------------------------------------------------------
      const modStatus = (post.moderation_status || 'approved').toLowerCase();
      if (['rejected', 'quarantined', 'blocked', 'flagged'].includes(modStatus)) {
        continue; // Strictly omitted from feed candidates
      }
      if (typeof post.ai_safety_score === 'number' && post.ai_safety_score < 60) {
        continue; // Strictly omitted on low safety score
      }

      // -------------------------------------------------------------
      // 2. ETHICAL GUARDRAIL: GUARDIAN SCORE NO-DISCRIMINATION CHECK
      // -------------------------------------------------------------
      // Notice: context.viewer_guardian_score is explicitly NEVER used
      // to penalize or restrict the viewer's feed discovery.

      const factors: RecommendationFactor[] = [];
      let totalScore = 0;

      // -------------------------------------------------------------
      // VECTOR 1: Followed Users (S_follow)
      // -------------------------------------------------------------
      const isFollowed = context.followed_user_ids.has(post.user_id);
      if (isFollowed) {
        const followScore = weights.followWeight;
        totalScore += followScore;
        factors.push({
          name: 'Followed Creator',
          score: followScore,
          weight: weights.followWeight,
          description: `From a creator you follow (@${post.author_username || 'creator'})`,
        });
      }

      // -------------------------------------------------------------
      // VECTOR 2, 3, 4, 5: Community Engagement (Likes, Comments, Saves, Shares)
      // -------------------------------------------------------------
      const likesPart = Math.min(10, (post.likes_count || 0) * 0.5);
      const commentsPart = Math.min(10, (post.comments_count || 0) * 1.0);
      const savesPart = Math.min(8, (post.saves_count || 0) * 1.5);
      const sharesPart = Math.min(10, (post.shares_count || 0) * 2.0);

      const rawEngagement = likesPart + commentsPart + savesPart + sharesPart;
      const normalizedEngagement = Math.min(
        weights.communityEngagementWeight,
        Math.round(rawEngagement * 10) / 10
      );

      if (normalizedEngagement > 0) {
        totalScore += normalizedEngagement;
        factors.push({
          name: 'Community Engagement',
          score: normalizedEngagement,
          weight: weights.communityEngagementWeight,
          description: `${post.likes_count || 0} likes, ${post.comments_count || 0} comments, ${post.shares_count || 0} shares`,
        });
      }

      // -------------------------------------------------------------
      // VECTOR 6: Post Category Affinity (S_category)
      // -------------------------------------------------------------
      if (post.category && context.preferred_categories.length > 0) {
        const matchesCategory = context.preferred_categories.some(
          (c) => c.toLowerCase() === post.category?.toLowerCase()
        );
        if (matchesCategory) {
          const catScore = weights.categoryAffinityWeight;
          totalScore += catScore;
          factors.push({
            name: 'Category Affinity',
            score: catScore,
            weight: weights.categoryAffinityWeight,
            description: `Matches your interest in ${post.category}`,
          });
        }
      }

      // -------------------------------------------------------------
      // VECTOR 7: Hashtags Affinity (S_hashtags)
      // -------------------------------------------------------------
      const postTags = (post.hashtags || []).map((t) => t.toLowerCase().replace('#', ''));
      const matchingTags: string[] = [];

      for (const tag of postTags) {
        if (
          context.preferred_hashtags.some((pt) => pt.toLowerCase().replace('#', '') === tag) ||
          (context.interacted_hashtag_counts.get(tag) || 0) > 0
        ) {
          matchingTags.push(`#${tag}`);
        }
      }

      if (matchingTags.length > 0) {
        const tagScore = Math.min(weights.hashtagAffinityWeight, matchingTags.length * 5);
        totalScore += tagScore;
        factors.push({
          name: 'Hashtag Affinity',
          score: tagScore,
          weight: weights.hashtagAffinityWeight,
          description: `Matches topics: ${matchingTags.slice(0, 3).join(', ')}`,
        });
      }

      // -------------------------------------------------------------
      // VECTOR 8: User Interaction History with Author (S_history)
      // -------------------------------------------------------------
      const pastAuthorInteractions = context.interacted_author_counts.get(post.user_id) || 0;
      if (pastAuthorInteractions > 0) {
        const historyScore = Math.min(weights.authorInteractionWeight, pastAuthorInteractions * 4);
        totalScore += historyScore;
        factors.push({
          name: 'Interaction History',
          score: historyScore,
          weight: weights.authorInteractionWeight,
          description: `You frequently interact with @${post.author_username || 'this creator'}`,
        });
      }

      // -------------------------------------------------------------
      // VECTOR 9: Recency Time Decay (S_recency)
      // -------------------------------------------------------------
      const postTime = post.created_at ? new Date(post.created_at).getTime() : now;
      const ageHours = Math.max(0, (now - postTime) / (1000 * 60 * 60));

      let recencyBase = 2;
      let ageDesc = '>48h ago';
      if (ageHours < 2) {
        recencyBase = 25;
        ageDesc = '<2h ago';
      } else if (ageHours < 6) {
        recencyBase = 20;
        ageDesc = '<6h ago';
      } else if (ageHours < 12) {
        recencyBase = 15;
        ageDesc = '<12h ago';
      } else if (ageHours < 24) {
        recencyBase = 10;
        ageDesc = '<24h ago';
      } else if (ageHours < 48) {
        recencyBase = 5;
        ageDesc = '<48h ago';
      }

      const recencyScore = Math.round((recencyBase / 25) * weights.recencyWeight * 10) / 10;
      totalScore += recencyScore;
      factors.push({
        name: 'Recency',
        score: recencyScore,
        weight: weights.recencyWeight,
        description: `Freshly published (${ageDesc})`,
      });

      // -------------------------------------------------------------
      // VECTOR 10: Content Safety Score (S_safety)
      // -------------------------------------------------------------
      const safety = post.ai_safety_score ?? 100;
      let safetyBase = 2;
      if (safety >= 95) {
        safetyBase = 10;
      } else if (safety >= 80) {
        safetyBase = 6;
      }
      const safetyScore = Math.round((safetyBase / 10) * weights.contentSafetyWeight * 10) / 10;
      totalScore += safetyScore;
      factors.push({
        name: 'Content Safety',
        score: safetyScore,
        weight: weights.contentSafetyWeight,
        description: `Verified Neural Safety Rating (${safety}/100)`,
      });

      // -------------------------------------------------------------
      // VECTOR 11: Explicit User Preferences (S_preferences)
      // -------------------------------------------------------------
      if (context.preferred_categories.length > 0 && post.category) {
        const isFav = context.preferred_categories[0]?.toLowerCase() === post.category.toLowerCase();
        if (isFav) {
          const prefScore = weights.userPreferenceWeight;
          totalScore += prefScore;
          factors.push({
            name: 'User Preference',
            score: prefScore,
            weight: weights.userPreferenceWeight,
            description: `Primary content preference match (${post.category})`,
          });
        }
      }

      // Sort factors by score descending
      factors.sort((a, b) => b.score - a.score);

      // Formulate human-readable summary
      const topFactorNames = factors.slice(0, 3).map((f) => f.name.toLowerCase());
      const summary = `Recommended based on ${topFactorNames.join(', ')}.`;

      scoredItems.push({
        post,
        totalScore: Math.round(totalScore * 10) / 10,
        factors,
        summary,
      });
    }

    // Sort by total score descending
    scoredItems.sort((a, b) => b.totalScore - a.totalScore);

    // Assign final rank position and package result
    return scoredItems.map((item, index) => ({
      post: item.post,
      explainability: {
        total_score: item.totalScore,
        rank: index + 1,
        strategy: this.id,
        factors: item.factors,
        summary: item.summary,
      },
    }));
  }
}

/**
 * Extensible ML Recommendation Ranker Architecture
 * Prepared so a trained model (collaborative filtering, embedding similarity,
 * or two-tower neural network) can replace the heuristic ranker seamlessly.
 */
export class MLRecommendationRanker implements FeedRankingStrategy {
  public readonly id = 'v2-trained-ml-ranker';
  public readonly name = 'VERIXA Neural Embeddings Ranker (Prepared)';
  public readonly version = '2.0.0-alpha';

  public async rank(
    candidates: PostCandidate[],
    context: ViewerContext,
    weights: FeedScoringWeights = DEFAULT_FEED_WEIGHTS
  ): Promise<RankedPostItem[]> {
    // Falls back to transparent ranker until trained embedding weights are connected
    const fallbackRanker = new TransparentHeuristicRanker();
    const ranked = await fallbackRanker.rank(candidates, context, weights);

    return ranked.map((item) => ({
      ...item,
      explainability: {
        ...item.explainability,
        strategy: this.id,
        summary: `[ML Mode] ${item.explainability.summary}`,
      },
    }));
  }
}
