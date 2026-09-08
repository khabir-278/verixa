/**
 * VERIXA Personalized Feed Engine - Type Definitions
 *
 * Core types governing content candidates, viewer context signals,
 * ranking strategy interfaces, explainability factor structures,
 * and auditable event telemetry.
 */

export type InteractionType =
  | 'view'
  | 'like'
  | 'unlike'
  | 'comment'
  | 'save'
  | 'unsave'
  | 'share'
  | 'click_hashtag'
  | 'dwell_time'
  | 'hide'
  | 'report';

export interface InteractionEventRecord {
  id: string;
  user_id: string;
  post_id: string;
  interaction_type: InteractionType;
  dwell_time_ms?: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface RecommendationFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface RecommendationExplainability {
  total_score: number;
  rank: number;
  strategy: string;
  factors: RecommendationFactor[];
  summary: string;
}

export interface RecommendationEventRecord {
  id: string;
  user_id: string;
  post_id: string;
  rank_position: number;
  total_score: number;
  scoring_factors: Record<string, any>;
  model_version: string;
  served_at: string;
}

export interface PostCandidate {
  id: string;
  user_id: string;
  caption: string;
  media_url?: string;
  media_type?: 'image' | 'video';
  hashtags: string[];
  category?: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  visibility: string;
  moderation_status: string;
  ai_safety_score: number;
  ai_scan_details?: Record<string, any>;
  created_at: string;
  author_username?: string;
  author_name?: string;
  author_avatar?: string;
  author_role?: string;
  author_safety_score?: number;
}

export interface ViewerContext {
  viewer_id: string;
  followed_user_ids: Set<string>;
  liked_post_ids: Set<string>;
  saved_post_ids: Set<string>;
  interacted_author_counts: Map<string, number>;
  interacted_hashtag_counts: Map<string, number>;
  preferred_categories: string[];
  preferred_hashtags: string[];
  viewer_guardian_score?: number;
}

export interface FeedScoringWeights {
  followWeight: number; // default: 35
  recencyWeight: number; // default: 25
  authorInteractionWeight: number; // default: 20
  hashtagAffinityWeight: number; // default: 15
  categoryAffinityWeight: number; // default: 10
  communityEngagementWeight: number; // default: 25
  contentSafetyWeight: number; // default: 10
  userPreferenceWeight: number; // default: 15
}

export const DEFAULT_FEED_WEIGHTS: FeedScoringWeights = {
  followWeight: 35,
  recencyWeight: 25,
  authorInteractionWeight: 20,
  hashtagAffinityWeight: 15,
  categoryAffinityWeight: 10,
  communityEngagementWeight: 25,
  contentSafetyWeight: 10,
  userPreferenceWeight: 15,
};

export interface RankedPostItem {
  post: PostCandidate;
  explainability: RecommendationExplainability;
}

export interface FeedRankingStrategy {
  id: string;
  name: string;
  version: string;
  rank(
    candidates: PostCandidate[],
    context: ViewerContext,
    weights?: FeedScoringWeights
  ): Promise<RankedPostItem[]>;
}
