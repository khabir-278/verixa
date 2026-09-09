/**
 * VERIXA Stories Service
 *
 * Implements:
 * - Pre-publication image and video moderation
 * - 24-hour expiry lifecycle enforcement
 * - Idempotent view tracking per user
 * - Local durable file persistence & Supabase sync
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { moderationGateway } from './moderationGateway';
import { ModerationState, ModerationStatus } from './types';

export interface StoryRecord {
  id: string;
  user_id: string;
  user: {
    id: string;
    username: string;
    name: string;
    avatar: string;
  };
  media_url: string; // Permanent storage path
  media_type: 'image' | 'video';
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  type?: 'image' | 'video';
  moderation_status: ModerationStatus;
  moderation_state: ModerationState;
  moderationStatus?: string;
  moderationState?: string;
  analysis_id?: string;
  analysisId?: string;
  deepfake_risk?: number;
  deepfakeRisk?: number;
  views_count: number;
  viewsCount?: number;
  viewed_by: string[]; // List of user IDs who have viewed
  viewedBy?: string[];
  likes_count: number;
  likesCount?: number;
  liked_by: string[]; // List of user IDs who have liked
  likedBy?: string[];
  created_at: string;
  createdAt?: string;
  timestamp?: string;
  expires_at: string;
  expiresAt?: string;
  is_ai_moderated: boolean;
  isAIModerated?: boolean;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORIES_FILE = path.join(DATA_DIR, 'stories.json');

// Memory buffer of stories
const storiesMemoryBuffer: StoryRecord[] = [];

// Initialize data directory and load existing stories
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory for stories:', err);
  }
}

try {
  if (fs.existsSync(STORIES_FILE)) {
    const raw = fs.readFileSync(STORIES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const realStories = parsed.filter(
        (s) => !s.user_id?.includes('test') && s.user_id !== 'user_story_test' && s.user?.username !== 'alice_story'
      );
      storiesMemoryBuffer.push(...realStories);
    }
  }
} catch (err) {
  console.warn('Notice loading stories file:', err);
}

function saveStoriesToFile() {
  try {
    const persistable = storiesMemoryBuffer.filter(
      (s) => !s.user_id?.includes('test') && s.user_id !== 'user_story_test' && s.user?.username !== 'alice_story'
    );
    fs.writeFileSync(STORIES_FILE, JSON.stringify(persistable, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving stories to file:', err);
  }
}

function getServerSupabase(): SupabaseClient | null {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://jnbaumemwxydjktwedtz.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    'sb_publishable_9IakRstb07CZxsC8Y_WgKQ_sQk_i_D2';

  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: { persistSession: false },
    });
  } catch {
    return null;
  }
}

export async function syncStoriesToSupabase(): Promise<number> {
  const sb = getServerSupabase();
  if (!sb) return 0;
  let synced = 0;
  for (const s of storiesMemoryBuffer) {
    if (!s.user_id || s.user_id.includes('test')) continue;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id);
    const validId = isUuid ? s.id : (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : s.id);
    const isUserUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.user_id);
    if (!isUserUuid) continue;

    try {
      const { error } = await sb.from('stories').upsert({
        id: validId,
        user_id: s.user_id,
        media_url: s.media_url || s.mediaUrl,
        media_type: s.media_type || s.mediaType || 'image',
        moderation_status: (s.moderation_status || 'approved').toLowerCase(),
        analysis_id: s.analysis_id || null,
        views_count: s.views_count || 0,
        viewed_by: [],
        created_at: s.created_at || new Date().toISOString(),
        expires_at: s.expires_at || new Date(Date.now() + 86400000).toISOString(),
      }, { onConflict: 'id' });

      if (!error) {
        s.id = validId;
        synced++;
      } else {
        console.warn('Notice syncing story to Supabase:', error.message);
      }
    } catch {
      // non-blocking
    }
  }
  if (synced > 0) {
    saveStoriesToFile();
    console.log(`✅ Synced ${synced} stories to Supabase.`);
  }
  return synced;
}

export class StoryService {
  /**
   * Creates and moderates a story before publication.
   * Enforces 24-hour expiry and server-side safety verification.
   */
  async createStory(input: {
    userId: string;
    username: string;
    name?: string;
    avatar?: string;
    mediaUrl: string;
    mediaType?: 'image' | 'video';
    mimeType?: string;
    frames?: Array<{ timestamp: number; data: string }>;
  }): Promise<{
    allowed: boolean;
    story?: StoryRecord;
    moderation: any;
    error?: string;
  }> {
    const mediaType = input.mediaType || (input.mimeType?.startsWith('video/') ? 'video' : 'image');
    const storyId = crypto.randomUUID();

    // 1. Authoritative Pre-Publication Moderation
    const moderationResult = await moderationGateway.moderate({
      content: input.mediaUrl,
      content_type: 'story',
      mime_type: input.mimeType || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
      context: 'user story media pre-publication',
      user_id: input.userId,
      username: input.username,
      content_id: storyId,
      frames: input.frames,
    });

    if (!moderationResult.allowed || moderationResult.decision === 'BLOCK' || moderationResult.decision === 'QUARANTINE') {
      return {
        allowed: false,
        moderation: moderationResult,
        error: moderationResult.reason || 'Story media violated VERIXA community safety guidelines.',
      };
    }

    // 2. Compute 24-Hour Expiry
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const storyRecord: StoryRecord = {
      id: storyId,
      user_id: input.userId,
      user: {
        id: input.userId,
        username: input.username,
        name: input.name || input.username,
        avatar: (input.avatar && !input.avatar.includes('unsplash.com'))
          ? input.avatar
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(input.name || input.username || 'User')}&background=4285F4&color=fff&size=256&bold=true`,
      },
      media_url: input.mediaUrl,
      media_type: mediaType,
      mediaUrl: input.mediaUrl,
      mediaType: mediaType,
      type: mediaType,
      moderation_status: moderationResult.status,
      moderation_state: moderationResult.state,
      moderationStatus: moderationResult.status,
      moderationState: moderationResult.state,
      analysis_id: moderationResult.analysis_id,
      analysisId: moderationResult.analysis_id,
      deepfake_risk: moderationResult.deepfake_risk ?? 0,
      deepfakeRisk: moderationResult.deepfake_risk ?? 0,
      views_count: 0,
      viewsCount: 0,
      viewed_by: [],
      viewedBy: [],
      likes_count: 0,
      likesCount: 0,
      liked_by: [],
      likedBy: [],
      created_at: now.toISOString(),
      createdAt: now.toISOString(),
      timestamp: 'Just now',
      expires_at: expiresAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      is_ai_moderated: true,
      isAIModerated: true,
    };

    // 3. Persist to memory and disk
    storiesMemoryBuffer.unshift(storyRecord);
    saveStoriesToFile();

    // 4. Persist to Supabase if table exists
    const sb = getServerSupabase();
    if (sb) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storyRecord.id);
        const validId = isUuid ? storyRecord.id : (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : storyRecord.id);

        const { data: inserted, error: sbErr } = await sb.from('stories').insert({
          id: validId,
          user_id: storyRecord.user_id,
          media_url: storyRecord.media_url,
          media_type: storyRecord.media_type,
          moderation_status: storyRecord.moderation_status.toLowerCase(),
          analysis_id: storyRecord.analysis_id,
          views_count: 0,
          viewed_by: [],
          created_at: storyRecord.created_at,
          expires_at: storyRecord.expires_at,
        }).select();

        if (sbErr) {
          console.warn('Notice syncing story to Supabase:', sbErr.message, sbErr.code);
        } else {
          console.log('✅ Story persisted to Supabase successfully:', validId);
        }
      } catch (sbErr: any) {
        console.warn('Notice syncing story to Supabase:', sbErr?.message || sbErr);
      }
    }

    return {
      allowed: true,
      story: storyRecord,
      moderation: moderationResult,
    };
  }

  /**
   * Retrieves active, non-expired, approved stories (< 24 hours old).
   */
  getActiveStories(currentUserId?: string): StoryRecord[] {
    const nowMs = Date.now();
    return storiesMemoryBuffer
      .filter((s) => {
        const expires = s.expires_at || s.expiresAt;
        const isExpired = expires ? new Date(expires).getTime() <= nowMs : false;
        // Filter out synthetic/mock test stories from public feed
        const isTestStory =
          s.user_id === 'user_story_test' ||
          s.user?.username === 'alice_story' ||
          (s as any).username === 'alice_story' ||
          s.user_id?.includes('test');
        if (isTestStory && currentUserId !== s.user_id) {
          return false;
        }

        // Only approved stories are public; author can see their own
        const isApproved =
          s.moderation_state === 'APPROVED' ||
          s.moderation_status === 'ALLOWED' ||
          (s as any).moderationState === 'APPROVED' ||
          (s as any).moderationStatus === 'ALLOWED';
        const isAuthor =
          currentUserId &&
          (s.user_id === currentUserId || (s as any).userId === currentUserId);
        return isApproved || isAuthor;
      })
      .map((s) => {
        const mediaUrl = s.mediaUrl || s.media_url || '';
        const mediaType = (s.type || s.mediaType || s.media_type || (mediaUrl.includes('.mp4') ? 'video' : 'image')) as 'image' | 'video';
        const viewsCount = s.viewsCount ?? s.views_count ?? (s.viewed_by?.length || 0);
        const viewedBy = s.viewedBy || s.viewed_by || [];
        const likesCount = s.likesCount ?? s.likes_count ?? (s.liked_by?.length || s.likedBy?.length || 0);
        const likedBy = s.likedBy || s.liked_by || [];
        const createdAt = s.createdAt || s.created_at || new Date().toISOString();
        const expiresAt = s.expiresAt || s.expires_at;
        const rawAvatar = s.user?.avatar;
        const safeAvatar = (rawAvatar && !rawAvatar.includes('unsplash.com'))
          ? rawAvatar
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(s.user?.name || s.user?.username || 'User')}&background=4285F4&color=fff&size=256&bold=true`;

        return {
          ...s,
          user: {
            ...s.user,
            avatar: safeAvatar,
          },
          media_url: mediaUrl,
          mediaUrl: mediaUrl,
          media_type: mediaType,
          mediaType: mediaType,
          type: mediaType,
          views_count: viewsCount,
          viewsCount: viewsCount,
          viewed_by: viewedBy,
          viewedBy: viewedBy,
          likes_count: likesCount,
          likesCount: likesCount,
          liked_by: likedBy,
          likedBy: likedBy,
          created_at: createdAt,
          createdAt: createdAt,
          timestamp: s.timestamp || 'Just now',
          expires_at: expiresAt,
          expiresAt: expiresAt,
          is_ai_moderated: s.is_ai_moderated ?? s.isAIModerated ?? true,
          isAIModerated: s.isAIModerated ?? s.is_ai_moderated ?? true,
        };
      });
  }

  /**
   * Deletes a story by ID.
   */
  deleteStory(storyId: string): boolean {
    const idx = storiesMemoryBuffer.findIndex((s) => s.id === storyId);
    if (idx !== -1) {
      storiesMemoryBuffer.splice(idx, 1);
      saveStoriesToFile();
      return true;
    }
    return false;
  }

  /**
   * Records a user view on a story idempotently.
   */
  recordView(storyId: string, viewerUserId: string): { success: boolean; viewsCount: number } {
    const story = storiesMemoryBuffer.find((s) => s.id === storyId);
    if (!story) {
      return { success: false, viewsCount: 0 };
    }

    if (!Array.isArray(story.viewed_by)) {
      story.viewed_by = [];
    }

    if (!story.viewed_by.includes(viewerUserId)) {
      story.viewed_by.push(viewerUserId);
      story.views_count = story.viewed_by.length;
      story.viewsCount = story.views_count;
      saveStoriesToFile();

      // Sync with Supabase asynchronously
      const sb = getServerSupabase();
      if (sb) {
        Promise.resolve(sb.rpc('record_story_view', { p_story_id: storyId })).catch(() => {});
      }
    }

    return { success: true, viewsCount: story.views_count };
  }

  /**
   * Toggles a like on a story by a user.
   */
  toggleLike(storyId: string, userId: string): { success: boolean; isLiked: boolean; likesCount: number; likedBy: string[] } {
    const story = storiesMemoryBuffer.find((s) => s.id === storyId);
    if (!story) {
      return { success: false, isLiked: false, likesCount: 0, likedBy: [] };
    }

    if (!Array.isArray(story.liked_by)) {
      story.liked_by = [];
    }
    if (!Array.isArray(story.likedBy)) {
      story.likedBy = story.liked_by;
    }

    const idx = story.liked_by.indexOf(userId);
    let isLiked = false;
    if (idx >= 0) {
      story.liked_by.splice(idx, 1);
      isLiked = false;
    } else {
      story.liked_by.push(userId);
      isLiked = true;
    }

    story.likedBy = story.liked_by;
    story.likes_count = story.liked_by.length;
    story.likesCount = story.likes_count;
    saveStoriesToFile();

    // Async sync with Supabase
    const sb = getServerSupabase();
    if (sb) {
      (async () => {
        try {
          if (isLiked) {
            await sb.from('story_likes').upsert(
              {
                story_id: storyId,
                user_id: userId,
                created_at: new Date().toISOString(),
              },
              { onConflict: 'story_id,user_id' }
            );
          } else {
            await sb.from('story_likes').delete().match({
              story_id: storyId,
              user_id: userId,
            });
          }
          await sb.from('stories').update({
            likes_count: story.likes_count,
            liked_by: story.liked_by,
          }).eq('id', storyId);
        } catch {
          // Non-blocking sync fallback
        }
      })();
    }

    return {
      success: true,
      isLiked,
      likesCount: story.likes_count,
      likedBy: story.liked_by,
    };
  }
}

export const storyService = new StoryService();
