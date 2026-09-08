/**
 * VERIXA Personalized Feed Engine - Core Feed Service
 *
 * Coordinates candidate retrieval, viewer context derivation,
 * pluggable ranking strategy execution, transparent explainability generation,
 * interaction logging, and recommendation event telemetry.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  PostCandidate,
  ViewerContext,
  FeedScoringWeights,
  DEFAULT_FEED_WEIGHTS,
  RankedPostItem,
  FeedRankingStrategy,
  InteractionEventRecord,
  InteractionType,
  RecommendationEventRecord,
  RecommendationExplainability,
} from './types';
import { TransparentHeuristicRanker, MLRecommendationRanker } from './rankingStrategy';

const DATA_DIR = path.join(process.cwd(), 'data');
const INTERACTIONS_FILE = path.join(DATA_DIR, 'interaction_events.json');
const RECOMMENDATIONS_FILE = path.join(DATA_DIR, 'recommendation_events.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory for feed service:', err);
  }
}

function loadLocalFile<T>(filePath: string): T[] {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn(`Notice loading ${path.basename(filePath)}:`, err);
  }
  return [];
}

const saveTimeouts = new Map<string, NodeJS.Timeout>();

function saveLocalFileDebounced<T>(filePath: string, data: T[], delayMs: number = 3000) {
  const existing = saveTimeouts.get(filePath);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(() => {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data.slice(-500), null, 2), 'utf-8');
    } catch (err) {
      console.error(`Error saving ${path.basename(filePath)}:`, err);
    }
  }, delayMs);
  saveTimeouts.set(filePath, timeout);
}

function saveLocalFile<T>(filePath: string, data: T[]) {
  saveLocalFileDebounced(filePath, data);
}

function getServerSupabase(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

export class FeedService {
  private rankingStrategy: FeedRankingStrategy;
  private scoringWeights: FeedScoringWeights;
  private interactionEvents: InteractionEventRecord[] = [];
  private recommendationEvents: RecommendationEventRecord[] = [];

  // In-memory fallback candidates pool
  private memoryPostPool: Map<string, PostCandidate> = new Map();
  // In-memory follows cache: followerId -> Set<followingId>
  private memoryFollows: Map<string, Set<string>> = new Map();

  constructor() {
    this.rankingStrategy = new TransparentHeuristicRanker();
    this.scoringWeights = { ...DEFAULT_FEED_WEIGHTS };

    this.interactionEvents = loadLocalFile<InteractionEventRecord>(INTERACTIONS_FILE);
    this.recommendationEvents = loadLocalFile<RecommendationEventRecord>(RECOMMENDATIONS_FILE);
  }

  // ============================================================================
  // 1. PLUGGABLE STRATEGY CONFIGURATION
  // ============================================================================
  public setRankingStrategy(strategy: FeedRankingStrategy): void {
    this.rankingStrategy = strategy;
  }

  public getRankingStrategy(): FeedRankingStrategy {
    return this.rankingStrategy;
  }

  public getScoringWeights(): FeedScoringWeights {
    return { ...this.scoringWeights };
  }

  public updateScoringWeights(weights: Partial<FeedScoringWeights>): FeedScoringWeights {
    this.scoringWeights = {
      ...this.scoringWeights,
      ...weights,
    };
    return { ...this.scoringWeights };
  }

  // ============================================================================
  // 2. INTERACTION EVENT TRACKING
  // ============================================================================
  public async logInteraction(params: {
    userId: string;
    postId: string;
    interactionType: InteractionType;
    dwellTimeMs?: number;
    metadata?: Record<string, any>;
  }): Promise<InteractionEventRecord> {
    const { userId, postId, interactionType, dwellTimeMs = 0, metadata = {} } = params;

    const eventRecord: InteractionEventRecord = {
      id: `inte_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: userId,
      post_id: postId,
      interaction_type: interactionType,
      dwell_time_ms: dwellTimeMs,
      metadata,
      created_at: new Date().toISOString(),
    };

    this.interactionEvents.unshift(eventRecord);
    if (this.interactionEvents.length > 1000) {
      this.interactionEvents.pop();
    }
    saveLocalFile(INTERACTIONS_FILE, this.interactionEvents);

    // Persist to Supabase if available
    const sb = getServerSupabase();
    if (sb) {
      try {
        await sb.from('interaction_events').insert({
          user_id: eventRecord.user_id,
          post_id: eventRecord.post_id,
          interaction_type: eventRecord.interaction_type,
          dwell_time_ms: eventRecord.dwell_time_ms,
          metadata: eventRecord.metadata,
          created_at: eventRecord.created_at,
        });
      } catch (err: any) {
        console.warn('Notice syncing interaction_event to Supabase:', err.message);
      }
    }

    return eventRecord;
  }

  public getInteractions(userId?: string): InteractionEventRecord[] {
    if (!userId) return this.interactionEvents;
    return this.interactionEvents.filter((i) => i.user_id === userId);
  }

  // ============================================================================
  // 3. CANDIDATE RETRIEVAL & VIEWER CONTEXT
  // ============================================================================
  public async registerPostCandidate(post: PostCandidate): Promise<void> {
    this.memoryPostPool.set(post.id, post);
  }

  public registerFollow(followerId: string, followingId: string): void {
    const existing = this.memoryFollows.get(followerId) || new Set<string>();
    existing.add(followingId);
    this.memoryFollows.set(followerId, existing);
  }

  private async buildViewerContext(userId?: string): Promise<ViewerContext> {
    const viewerId = userId || 'anonymous';
    const followedUserIds = new Set<string>(this.memoryFollows.get(viewerId) || []);
    const likedPostIds = new Set<string>();
    const savedPostIds = new Set<string>();
    const interactedAuthorCounts = new Map<string, number>();
    const interactedHashtagCounts = new Map<string, number>();
    const preferredCategories: string[] = ['Technology', 'Safety', 'Design', 'AI'];
    const preferredHashtags: string[] = ['#ai', '#verixa', '#privacy', '#security'];

    // Accumulate signals from interaction events
    for (const evt of this.interactionEvents) {
      if (evt.user_id === viewerId) {
        if (evt.interaction_type === 'like') {
          likedPostIds.add(evt.post_id);
        } else if (evt.interaction_type === 'unlike') {
          likedPostIds.delete(evt.post_id);
        } else if (evt.interaction_type === 'save') {
          savedPostIds.add(evt.post_id);
        } else if (evt.interaction_type === 'unsave') {
          savedPostIds.delete(evt.post_id);
        }

        // Author interaction counts
        if (evt.metadata?.author_id) {
          const prev = interactedAuthorCounts.get(evt.metadata.author_id) || 0;
          interactedAuthorCounts.set(evt.metadata.author_id, prev + 1);
        }

        // Hashtag interaction counts
        if (Array.isArray(evt.metadata?.hashtags)) {
          for (const h of evt.metadata.hashtags) {
            const cleanH = h.toLowerCase().replace('#', '');
            const prevH = interactedHashtagCounts.get(cleanH) || 0;
            interactedHashtagCounts.set(cleanH, prevH + 1);
          }
        }
      }
    }

    // Query Supabase for real follows & likes if available
    const sb = getServerSupabase();
    if (sb && viewerId !== 'anonymous') {
      try {
        const [followsRes, likesRes, savedRes] = await Promise.all([
          sb.from('follows').select('following_id').eq('follower_id', viewerId),
          sb.from('likes').select('post_id').eq('user_id', viewerId),
          sb.from('saved_posts').select('post_id').eq('user_id', viewerId),
        ]);

        if (followsRes.data) {
          followsRes.data.forEach((f: any) => followedUserIds.add(f.following_id));
        }
        if (likesRes.data) {
          likesRes.data.forEach((l: any) => likedPostIds.add(l.post_id));
        }
        if (savedRes.data) {
          savedRes.data.forEach((s: any) => savedPostIds.add(s.post_id));
        }
      } catch {
        // Fallback to in-memory signals
      }
    }

    return {
      viewer_id: viewerId,
      followed_user_ids: followedUserIds,
      liked_post_ids: likedPostIds,
      saved_post_ids: savedPostIds,
      interacted_author_counts: interactedAuthorCounts,
      interacted_hashtag_counts: interactedHashtagCounts,
      preferred_categories: preferredCategories,
      preferred_hashtags: preferredHashtags,
      // ETHICAL NOTICE: viewer_guardian_score is explicitly NEVER used to restrict feed discovery
      viewer_guardian_score: 100,
    };
  }

  private async fetchCandidatePosts(options?: {
    category?: string;
    hashtag?: string;
    limit?: number;
  }): Promise<PostCandidate[]> {
    const candidates: PostCandidate[] = [];
    const maxPool = options?.limit ? Math.max(options.limit * 3, 60) : 100;

    const sb = getServerSupabase();
    if (sb) {
      try {
        let query = sb
          .from('posts')
          .select(`
            id,
            user_id,
            caption,
            media_url,
            media_type,
            hashtags,
            likes_count,
            comments_count,
            visibility,
            moderation_status,
            ai_safety_score,
            ai_scan_details,
            created_at,
            profiles:user_id (
              id,
              username,
              name,
              avatar,
              role,
              safety_score
            )
          `)
          .in('moderation_status', ['approved'])
          .gte('ai_safety_score', 60)
          .order('created_at', { ascending: false })
          .limit(maxPool);

        if (options?.hashtag) {
          query = query.contains('hashtags', [options.hashtag.replace('#', '')]);
        }

        const { data, error } = await query;
        if (!error && data) {
          for (const row of data) {
            const profile = (row as any).profiles;
            candidates.push({
              id: row.id,
              user_id: row.user_id,
              caption: row.caption || '',
              media_url: row.media_url,
              media_type: row.media_type || 'image',
              hashtags: row.hashtags || [],
              category: deriveCategory(row.caption, row.hashtags),
              likes_count: row.likes_count || 0,
              comments_count: row.comments_count || 0,
              shares_count: 0,
              saves_count: 0,
              visibility: row.visibility || 'public',
              moderation_status: row.moderation_status || 'approved',
              ai_safety_score: row.ai_safety_score ?? 100,
              ai_scan_details: row.ai_scan_details,
              created_at: row.created_at,
              author_username: profile?.username || 'member',
              author_name: profile?.name || 'VERIXA Member',
              author_avatar: profile?.avatar,
              author_role: profile?.role,
              author_safety_score: profile?.safety_score,
            });
          }
        }
      } catch (err: any) {
        console.warn('Notice querying Supabase post candidates:', err.message);
      }
    }

    // Merge in-memory candidates
    for (const post of this.memoryPostPool.values()) {
      if (!candidates.some((c) => c.id === post.id)) {
        candidates.push(post);
      }
    }

    // Overlay durable server post likes counts onto candidate posts
    try {
      const postLikesPath = path.join(process.cwd(), 'data', 'post_likes.json');
      if (fs.existsSync(postLikesPath)) {
        const raw = fs.readFileSync(postLikesPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed?.post_likes) {
          for (const cand of candidates) {
            const serverLikedUsers = parsed.post_likes[cand.id];
            if (Array.isArray(serverLikedUsers)) {
              cand.likes_count = Math.max(cand.likes_count || 0, serverLikedUsers.length);
            }
          }
        }
      }
    } catch {
      // Non-blocking fallback
    }

    return candidates;
  }

  // ============================================================================
  // 4. PERSONALIZED FEED GENERATION
  // ============================================================================
  public async getPersonalizedFeed(
    userId?: string,
    limitCount: number = 30,
    options?: { category?: string; hashtag?: string }
  ): Promise<{
    posts: RankedPostItem[];
    strategy: string;
    total: number;
    served_at: string;
  }> {
    const candidates = await this.fetchCandidatePosts({
      ...options,
      limit: limitCount,
    });

    const viewerContext = await this.buildViewerContext(userId);

    // Execute pluggable ranking strategy
    const rankedItems = await this.rankingStrategy.rank(
      candidates,
      viewerContext,
      this.scoringWeights
    );

    const sliced = rankedItems.slice(0, limitCount);
    const now = new Date().toISOString();

    // Log recommendation events (telemetry)
    if (userId && userId !== 'anonymous') {
      this.logRecommendationEvents(userId, sliced, now).catch(() => {});
    }

    return {
      posts: sliced,
      strategy: this.rankingStrategy.id,
      total: rankedItems.length,
      served_at: now,
    };
  }

  private async logRecommendationEvents(
    userId: string,
    items: RankedPostItem[],
    timestamp: string
  ): Promise<void> {
    const sb = getServerSupabase();
    const rows: RecommendationEventRecord[] = items.map((item, idx) => ({
      id: `rece_${Date.now()}_${idx}`,
      user_id: userId,
      post_id: item.post.id,
      rank_position: idx + 1,
      total_score: item.explainability.total_score,
      scoring_factors: item.explainability.factors.reduce((acc, f) => {
        acc[f.name] = f.score;
        return acc;
      }, {} as Record<string, number>),
      model_version: this.rankingStrategy.id,
      served_at: timestamp,
    }));

    this.recommendationEvents.unshift(...rows);
    if (this.recommendationEvents.length > 1000) {
      this.recommendationEvents = this.recommendationEvents.slice(0, 1000);
    }
    saveLocalFile(RECOMMENDATIONS_FILE, this.recommendationEvents);

    if (sb) {
      try {
        await sb.from('recommendation_events').insert(
          rows.map((r) => ({
            user_id: r.user_id,
            post_id: r.post_id,
            rank_position: r.rank_position,
            total_score: r.total_score,
            scoring_factors: r.scoring_factors,
            model_version: r.model_version,
            served_at: r.served_at,
          }))
        );
      } catch {
        // Non-blocking
      }
    }
  }

  public async getPostExplainability(
    userId: string,
    postId: string
  ): Promise<RecommendationExplainability | null> {
    const post = this.memoryPostPool.get(postId);
    if (!post) return null;

    const viewerContext = await this.buildViewerContext(userId);
    const ranked = await this.rankingStrategy.rank([post], viewerContext, this.scoringWeights);
    return ranked[0]?.explainability || null;
  }
}

function deriveCategory(caption: string = '', hashtags: string[] = []): string {
  const combined = (caption + ' ' + hashtags.join(' ')).toLowerCase();
  if (combined.includes('tech') || combined.includes('ai') || combined.includes('code') || combined.includes('software')) {
    return 'Technology';
  }
  if (combined.includes('safe') || combined.includes('cyber') || combined.includes('security') || combined.includes('privacy')) {
    return 'Safety';
  }
  if (combined.includes('art') || combined.includes('design') || combined.includes('photo') || combined.includes('creative')) {
    return 'Art & Design';
  }
  if (combined.includes('fitness') || combined.includes('health') || combined.includes('gym') || combined.includes('sport')) {
    return 'Fitness';
  }
  if (combined.includes('music') || combined.includes('song') || combined.includes('audio')) {
    return 'Music';
  }
  return 'General';
}

export const feedService = new FeedService();
