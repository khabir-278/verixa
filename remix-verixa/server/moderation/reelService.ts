/**
 * VERIXA Reels Service
 *
 * Implements:
 * - Actual persisted video media management
 * - Pre-publication video moderation (frame-by-frame & scene analysis)
 * - Deepfake risk field (0 to 100 derived from actual frame inspection)
 * - Moderation status tracking (APPROVED, REJECTED, REVIEW_REQUIRED)
 * - Local durable file persistence & Supabase sync
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { moderationGateway } from './moderationGateway';
import { ModerationState, ModerationStatus } from './types';

export interface ReelRecord {
  id: string;
  user_id: string;
  user: {
    id: string;
    username: string;
    name: string;
    avatar: string;
    aiTrustBadge?: string;
  };
  caption: string;
  video_url: string; // Permanent persisted media path
  audio_title: string;
  likes: number;
  is_liked?: boolean;
  comments_count: number;
  shares_count: number;
  ai_trust_badge: string;
  deepfake_risk: number; // Genuine deepfake risk score
  moderation_status: ModerationStatus;
  moderation_state: ModerationState;
  analysis_id?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const REELS_FILE = path.join(DATA_DIR, 'reels.json');

const reelsMemoryBuffer: ReelRecord[] = [];

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory for reels:', err);
  }
}

try {
  if (fs.existsSync(REELS_FILE)) {
    const raw = fs.readFileSync(REELS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      reelsMemoryBuffer.push(...parsed);
    }
  }
} catch (err) {
  console.warn('Notice loading reels file:', err);
}

function saveReelsToFile() {
  try {
    fs.writeFileSync(REELS_FILE, JSON.stringify(reelsMemoryBuffer, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving reels to file:', err);
  }
}

function getServerSupabase(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: { persistSession: false },
    });
  } catch {
    return null;
  }
}

export class ReelService {
  /**
   * Moderates video before publication and persists reel record
   */
  async createReel(input: {
    userId: string;
    username: string;
    name?: string;
    avatar?: string;
    aiTrustBadge?: string;
    caption?: string;
    videoUrl: string;
    audioTitle?: string;
    tags?: string[];
    mimeType?: string;
    frames?: Array<{ timestamp: number; data: string }>;
  }): Promise<{
    allowed: boolean;
    reel?: ReelRecord;
    moderation: any;
    error?: string;
  }> {
    const reelId = crypto.randomUUID();

    // 1. Authoritative Video Moderation Before Publication
    const moderationResult = await moderationGateway.moderate({
      content: input.videoUrl,
      content_type: 'reel',
      mime_type: input.mimeType || 'video/mp4',
      context: 'reel video publication audit',
      user_id: input.userId,
      username: input.username,
      content_id: reelId,
      frames: input.frames,
    });

    if (!moderationResult.allowed || moderationResult.decision === 'BLOCK' || moderationResult.decision === 'QUARANTINE') {
      return {
        allowed: false,
        moderation: moderationResult,
        error: moderationResult.reason || 'Reel video violated VERIXA community safety guidelines.',
      };
    }

    const deepfakeRisk = moderationResult.deepfake_risk ?? 0;
    const aiTrustBadge = deepfakeRisk > 50
      ? 'Synthetic Media Warning'
      : (input.aiTrustBadge || 'Verified Authentic Reel');

    const now = new Date().toISOString();
    const reelRecord: ReelRecord = {
      id: reelId,
      user_id: input.userId,
      user: {
        id: input.userId,
        username: input.username,
        name: input.name || input.username,
        avatar: input.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        aiTrustBadge: input.aiTrustBadge,
      },
      caption: input.caption || '',
      video_url: input.videoUrl,
      audio_title: input.audioTitle || 'Original Audio • Verified Clean',
      likes: 0,
      is_liked: false,
      comments_count: 0,
      shares_count: 0,
      ai_trust_badge: aiTrustBadge,
      deepfake_risk: deepfakeRisk,
      moderation_status: moderationResult.status,
      moderation_state: moderationResult.state,
      analysis_id: moderationResult.analysis_id,
      tags: input.tags || ['TechShorts', 'AISafety'],
      created_at: now,
      updated_at: now,
    };

    // 2. Persist to memory and disk
    reelsMemoryBuffer.unshift(reelRecord);
    saveReelsToFile();

    // 3. Persist to Supabase if available
    const sb = getServerSupabase();
    if (sb) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reelRecord.id);
        const validId = isUuid ? reelRecord.id : (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : reelRecord.id);

        const { data: inserted, error: sbErr } = await sb.from('reels').insert({
          id: validId,
          user_id: reelRecord.user_id,
          caption: reelRecord.caption,
          video_url: reelRecord.video_url,
          audio_title: reelRecord.audio_title,
          deepfake_risk: reelRecord.deepfake_risk,
          moderation_status: reelRecord.moderation_status.toLowerCase(),
          analysis_id: reelRecord.analysis_id,
          likes_count: 0,
          comments_count: 0,
          shares_count: 0,
          tags: reelRecord.tags,
          created_at: reelRecord.created_at,
          updated_at: reelRecord.updated_at,
        }).select();

        if (sbErr) {
          console.warn('Notice syncing reel to Supabase:', sbErr.message, sbErr.code);
        } else {
          console.log('✅ Reel persisted to Supabase successfully:', validId);
        }
      } catch (sbErr: any) {
        console.warn('Notice syncing reel to Supabase:', sbErr?.message || sbErr);
      }
    }

    return {
      allowed: true,
      reel: reelRecord,
      moderation: moderationResult,
    };
  }

  /**
   * Retrieves all approved reels for public display.
   * If currentUserId is passed, includes author's pending/quarantined reels.
   */
  getReels(currentUserId?: string): ReelRecord[] {
    return reelsMemoryBuffer.filter((r) => {
      const isApproved = r.moderation_state === 'APPROVED' || r.moderation_status === 'ALLOWED';
      const isAuthor = currentUserId && r.user_id === currentUserId;
      return isApproved || isAuthor;
    });
  }

  /**
   * Toggle like on a reel
   */
  toggleLike(reelId: string): { success: boolean; likes: number; isLiked: boolean } {
    const reel = reelsMemoryBuffer.find((r) => r.id === reelId);
    if (!reel) {
      return { success: false, likes: 0, isLiked: false };
    }

    reel.is_liked = !reel.is_liked;
    reel.likes += reel.is_liked ? 1 : -1;
    saveReelsToFile();

    return { success: true, likes: reel.likes, isLiked: reel.is_liked };
  }
}

export const reelService = new ReelService();
