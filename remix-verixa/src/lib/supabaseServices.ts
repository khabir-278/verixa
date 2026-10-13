import { supabase } from './supabase';
import { User, Post, Comment, Notification, ChatMessage, RecommendationExplainability, Reel, MessageType, ChatMessageReplyPreview } from '../types';

// ================= STORAGE HELPERS & SIGNED URL RESOLVER ================= //

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Default short-lived signed URL TTL (5 minutes) to bound post-block exposure window
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;
const MIN_SIGNED_URL_TTL_SECONDS = 60;
const MAX_SIGNED_URL_TTL_SECONDS = 900;

// In-memory cache for signed URLs to avoid redundant Supabase Storage network requests
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

// Client-side synchronized set of mutually restricted user IDs (blocked by viewer OR blocked viewer)
let activeViewerUserId: string | null = null;
const activeRestrictedUserIds = new Set<string>();

export function clearSignedUrlCache(): void {
  signedUrlCache.clear();
}

export function evictSignedUrlsForUser(userId: string): void {
  if (!userId) return;
  for (const key of Array.from(signedUrlCache.keys())) {
    if (key.includes(`:${userId}/`) || key.startsWith(`${userId}/`)) {
      signedUrlCache.delete(key);
    }
  }
}

export function setClientRestrictedUserIds(viewerId: string | null, restrictedIds: string[]): void {
  activeViewerUserId = viewerId;
  activeRestrictedUserIds.clear();
  for (const id of restrictedIds) {
    if (id && id !== viewerId) {
      activeRestrictedUserIds.add(id);
      evictSignedUrlsForUser(id);
    }
  }
}

export function getClientRestrictedUserIds(): string[] {
  return Array.from(activeRestrictedUserIds);
}

export function isClientUserRestricted(targetUserId?: string | null): boolean {
  if (!targetUserId) return false;
  if (activeViewerUserId && targetUserId === activeViewerUserId) return false;
  return activeRestrictedUserIds.has(targetUserId);
}

/**
 * Classifies a media reference into either a protected Supabase Storage object
 * (`isProtected: true`, with normalized `bucketName` and `objectPath`) or an
 * intentionally public external/static asset (`isProtected: false`).
 */
export function extractStorageObjectTarget(pathOrUrl?: string | null): {
  isProtected: boolean;
  bucketName: string;
  objectPath: string;
} {
  if (!pathOrUrl) {
    return { isProtected: false, bucketName: '', objectPath: '' };
  }
  const trimmed = pathOrUrl.trim();
  if (!trimmed) {
    return { isProtected: false, bucketName: '', objectPath: '' };
  }

  // 1. Explicit Supabase storage URL (signed, public, or authenticated endpoint)
  if (trimmed.includes('/storage/v1/object/')) {
    const match = trimmed.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/?#]+)\/([^?#]+)/);
    if (match) {
      return {
        isProtected: true,
        bucketName: match[1],
        objectPath: decodeURIComponent(match[2]).replace(/^\/+/, ''),
      };
    }
    return { isProtected: true, bucketName: 'app-files', objectPath: '' };
  }

  // 2. Intentionally public external URLs (OAuth avatars, UI-Avatars, Unsplash) or local blob/data/static public assets
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    (trimmed.startsWith('/') && !trimmed.startsWith('//'))
  ) {
    return { isProtected: false, bucketName: '', objectPath: '' };
  }

  // 3. Bucket-prefixed relative path (`app-files:userId/posts/file.jpg`)
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    return {
      isProtected: true,
      bucketName: parts[0] || 'app-files',
      objectPath: parts.slice(1).join(':').replace(/^\/+/, ''),
    };
  }

  // 4. Standard relative storage object path (`userId/posts/file.jpg`)
  return {
    isProtected: true,
    bucketName: 'app-files',
    objectPath: trimmed.replace(/^\/+/, ''),
  };
}

export function isProtectedStorageMedia(pathOrUrl?: string | null): boolean {
  return extractStorageObjectTarget(pathOrUrl).isProtected;
}

/**
 * Inspects a Supabase Storage signed URL (`.../storage/v1/object/sign/...?token=...`)
 * and returns true if its embedded JWT `exp` claim is expired or within `bufferSeconds` of expiry.
 */
export function isSignedStorageUrlExpired(url?: string | null, bufferSeconds: number = 15): boolean {
  if (!url || typeof url !== 'string') return true;
  if (!url.includes('/storage/v1/object/sign/')) return false;
  try {
    const qIdx = url.indexOf('?');
    if (qIdx === -1) return true;
    const params = new URLSearchParams(url.slice(qIdx + 1));
    const token = params.get('token');
    if (!token) return true;
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const jsonStr =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf-8');
    const payload = JSON.parse(jsonStr);
    if (typeof payload.exp !== 'number') return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSec + bufferSeconds;
  } catch {
    return true;
  }
}

export function hasValidStorageObjectPath(
  objectPath: string,
  expectedOwnerId?: string
): {
  valid: boolean;
  ownerId: string;
} {
  if (!objectPath || typeof objectPath !== 'string') {
    return { valid: false, ownerId: '' };
  }
  const clean = objectPath.trim().replace(/^\/+/, '');
  const segments = clean.split('/');
  if (
    segments.length < 2 ||
    segments.some((s) => !s || s === '.' || s === '..' || s.includes('\\'))
  ) {
    return { valid: false, ownerId: '' };
  }
  const ownerId = segments[0];
  if (!UUID_REGEX.test(ownerId)) {
    return { valid: false, ownerId: '' };
  }
  if (expectedOwnerId && ownerId.toLowerCase() !== expectedOwnerId.trim().toLowerCase()) {
    return { valid: false, ownerId };
  }
  return { valid: true, ownerId };
}

/**
 * Resolves a protected storage path (or legacy/expired storage URL) to a short-lived
 * signed URL. Never falls back to `getPublicUrl` or raw paths on error or block restriction.
 */
export async function getSignedMediaUrl(
  pathOrUrl?: string | null,
  expiresIn: number = DEFAULT_SIGNED_URL_TTL_SECONDS
): Promise<string> {
  if (!pathOrUrl) return '';
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return '';

  const target = extractStorageObjectTarget(trimmed);
  if (!target.isProtected) {
    return trimmed;
  }

  const { bucketName, objectPath } = target;
  const pathCheck = hasValidStorageObjectPath(objectPath);
  if (!pathCheck.valid) {
    return '';
  }

  // Enforce mutual block policy on private media object paths (${ownerUserId}/${folder}/...)
  const ownerPrefix = pathCheck.ownerId;
  if (isClientUserRestricted(ownerPrefix)) {
    evictSignedUrlsForUser(ownerPrefix);
    return '';
  }

  const effectiveTtl = Math.min(
    Math.max(Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_SIGNED_URL_TTL_SECONDS, MIN_SIGNED_URL_TTL_SECONDS),
    MAX_SIGNED_URL_TTL_SECONDS
  );
  const safetyBufferMs = Math.min(30_000, Math.floor((effectiveTtl * 1000) / 3));

  // Check in-memory cache for the object path, verifying both timestamp and token expiry
  const cacheKey = `${bucketName}:${objectPath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (
    cached &&
    cached.expiresAt > Date.now() + safetyBufferMs &&
    !isSignedStorageUrlExpired(cached.url, Math.ceil(safetyBufferMs / 1000))
  ) {
    return cached.url;
  }
  if (cached) {
    signedUrlCache.delete(cacheKey);
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(objectPath, effectiveTtl);

    if (error || !data?.signedUrl) {
      signedUrlCache.delete(cacheKey);
      return '';
    }

    // Re-check restriction in case a block occurred while createSignedUrl was in flight
    if (isClientUserRestricted(ownerPrefix)) {
      evictSignedUrlsForUser(ownerPrefix);
      return '';
    }

    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: Date.now() + effectiveTtl * 1000,
    });
    return data.signedUrl;
  } catch (err: any) {
    signedUrlCache.delete(cacheKey);
    console.warn('getSignedMediaUrl error:', err?.message || err);
    return '';
  }
}

/**
 * Evicts any cached signed URL for the given storage path or expired signed URL
 * and requests a fresh short-lived signed URL after re-verifying block restrictions.
 */
export async function refreshSignedMediaUrl(
  pathOrExpiredSignedUrl?: string | null,
  expiresIn: number = DEFAULT_SIGNED_URL_TTL_SECONDS
): Promise<string> {
  if (!pathOrExpiredSignedUrl) return '';
  const target = extractStorageObjectTarget(pathOrExpiredSignedUrl);
  if (!target.isProtected) {
    return pathOrExpiredSignedUrl.trim();
  }
  const pathCheck = hasValidStorageObjectPath(target.objectPath);
  if (!pathCheck.valid) {
    return '';
  }
  const cacheKey = `${target.bucketName}:${target.objectPath}`;
  signedUrlCache.delete(cacheKey);
  if (isClientUserRestricted(pathCheck.ownerId)) {
    evictSignedUrlsForUser(pathCheck.ownerId);
    return '';
  }
  return getSignedMediaUrl(`${target.bucketName}:${target.objectPath}`, expiresIn);
}

function buildFallbackInitialsAvatar(nameOrUsername?: string): string {
  const cleanName = encodeURIComponent(nameOrUsername || 'User');
  return `https://ui-avatars.com/api/?name=${cleanName}&background=4285F4&color=fff&size=256&bold=true`;
}

export async function resolvePostSignedUrls(post: Post): Promise<Post> {
  const rawMedia = post.mediaUrl || '';
  const rawAvatar = post.user?.avatar || '';
  const [resolvedMedia, resolvedAvatar] = await Promise.all([
    rawMedia ? getSignedMediaUrl(rawMedia) : Promise.resolve(''),
    rawAvatar ? getSignedMediaUrl(rawAvatar) : Promise.resolve(''),
  ]);

  const fallbackAvatar = buildFallbackInitialsAvatar(post.user?.name || post.user?.username);

  return {
    ...post,
    mediaUrl: resolvedMedia || undefined,
    user: {
      ...post.user,
      avatar: resolvedAvatar || (isProtectedStorageMedia(rawAvatar) ? fallbackAvatar : (rawAvatar || fallbackAvatar)),
    },
  };
}

export async function resolvePostsSignedUrls(posts: Post[]): Promise<Post[]> {
  return Promise.all(posts.map(resolvePostSignedUrls));
}

export async function resolveUserProfileSignedUrls(user: User): Promise<User> {
  const rawAvatar = user.avatar || '';
  const rawCover = user.cover || '';
  const [resolvedAvatar, resolvedCover] = await Promise.all([
    rawAvatar ? getSignedMediaUrl(rawAvatar) : Promise.resolve(''),
    rawCover ? getSignedMediaUrl(rawCover) : Promise.resolve(''),
  ]);
  const fallbackAvatar = buildFallbackInitialsAvatar(user.name || user.username);
  return {
    ...user,
    avatar: resolvedAvatar || (isProtectedStorageMedia(rawAvatar) ? fallbackAvatar : (rawAvatar || fallbackAvatar)),
    cover: resolvedCover || (isProtectedStorageMedia(rawCover) ? undefined : (rawCover || undefined)),
  };
}

export async function resolveReelSignedUrls(reelInput: any): Promise<Reel | null> {
  if (!reelInput) return null;
  const authorId = String(reelInput.user?.id || reelInput.user_id || '');
  if (authorId && isClientUserRestricted(authorId)) {
    return null;
  }

  const rawVideo = String(reelInput.videoUrl || reelInput.video_url || '').trim();
  if (!rawVideo) return null;

  const resolvedVideo = await getSignedMediaUrl(rawVideo);
  if (!resolvedVideo) {
    // Never fall back to rawVideo when signed URL resolution fails or author is blocked
    return null;
  }

  const rawAvatar = String(reelInput.user?.avatar || reelInput.user_avatar || '').trim();
  const resolvedAvatar = rawAvatar ? await getSignedMediaUrl(rawAvatar) : '';
  const authorName = reelInput.user?.name || reelInput.user_name || reelInput.user?.username || reelInput.username || 'Creator';
  const authorUsername = reelInput.user?.username || reelInput.username || 'user';
  const fallbackAvatar = buildFallbackInitialsAvatar(authorName || authorUsername);
  const finalAvatar =
    resolvedAvatar ||
    (isProtectedStorageMedia(rawAvatar) ? fallbackAvatar : (rawAvatar || fallbackAvatar));

  const normalized: Reel = {
    ...reelInput,
    id: reelInput.id,
    user: {
      id: authorId || 'unknown',
      username: authorUsername,
      name: authorName,
      avatar: finalAvatar,
      bio: reelInput.user?.bio || '',
      verified: reelInput.user?.verified ?? true,
      aiTrustBadge: reelInput.user?.aiTrustBadge || reelInput.ai_trust_badge || 'Verified Creator',
      safetyScore: reelInput.user?.safetyScore ?? 100,
      followersCount: reelInput.user?.followersCount ?? 0,
      followingCount: reelInput.user?.followingCount ?? 0,
      postsCount: reelInput.user?.postsCount ?? 0,
    },
    caption: reelInput.caption || '',
    videoUrl: resolvedVideo,
    audioTitle: reelInput.audioTitle || reelInput.audio_title || 'Original Audio • Verified Clean',
    likes: reelInput.likes ?? reelInput.likes_count ?? 0,
    isLiked: Boolean(reelInput.isLiked ?? reelInput.is_liked),
    commentsCount: reelInput.commentsCount ?? reelInput.comments_count ?? 0,
    sharesCount: reelInput.sharesCount ?? reelInput.shares_count ?? 0,
    aiTrustBadge: reelInput.aiTrustBadge || reelInput.ai_trust_badge || 'Verified Reel',
    deepfakeRisk: reelInput.deepfakeRisk ?? reelInput.deepfake_risk ?? 0,
    tags: Array.isArray(reelInput.tags) ? reelInput.tags : ['Reels', 'VERIXA'],
  };
  (normalized as any).video_url = resolvedVideo;
  return normalized;
}

export async function resolveReelsSignedUrls(reelsList: any[]): Promise<Reel[]> {
  if (!Array.isArray(reelsList) || reelsList.length === 0) return [];
  const resolved = await Promise.all(reelsList.map((r) => resolveReelSignedUrls(r)));
  return resolved.filter((r): r is Reel => r !== null);
}

// ================= USER PROFILES ================= //

export function getSafeAvatar(avatarUrl?: string | null, nameOrUsername?: string, userId?: string): string {
  if (userId && isClientUserRestricted(userId)) {
    return buildFallbackInitialsAvatar(nameOrUsername);
  }
  if (avatarUrl && !avatarUrl.includes('unsplash.com') && ! avatarUrl.includes('/storage/v1/object/public/')) {
    if (userId && typeof window !== 'undefined' && !isProtectedStorageMedia(avatarUrl)) {
      try {
        localStorage.setItem(`verixa_user_avatar_${userId}`, avatarUrl);
      } catch {}
    }
    return avatarUrl;
  }
  if (userId && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`verixa_user_avatar_${userId}`);
      if (cached && !cached.includes('unsplash.com') && !isProtectedStorageMedia(cached)) {
        return cached;
      }
    } catch {}
  }
  return buildFallbackInitialsAvatar(nameOrUsername);
}

export async function saveUserProfile(userData: {
  uid: string;
  username: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  bio?: string;
  role?: string;
}): Promise<User> {
  const safeAvatar = getSafeAvatar(userData.photoURL, userData.displayName || userData.username, userData.uid);

  const profilePayload = {
    id: userData.uid,
    username: userData.username.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user',
    name: userData.displayName || userData.username,
    email: userData.email,
    avatar: safeAvatar,
    bio: userData.bio || 'Safe social media explorer 🛡️',
    role: userData.role || 'Verified Member',
    verified: true,
    safety_score: 100,
    ai_trust_badge: 'Verified Member',
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.warn('Supabase saveUserProfile notice (table may be syncing):', error.message);
    }

    const row = data || profilePayload;
    const finalAvatar = (row.avatar && !row.avatar.includes('unsplash.com')) ? row.avatar : safeAvatar;
    const mapped: User = {
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email || userData.email,
      avatar: finalAvatar,
      bio: row.bio,
      verified: row.verified ?? true,
      aiTrustBadge: row.ai_trust_badge || 'Verified Member',
      safetyScore: row.safety_score ?? 100,
      followersCount: row.followers_count ?? 0,
      followingCount: row.following_count ?? 0,
      postsCount: row.posts_count ?? 0,
      role: row.role || 'Verified Member',
      joinedDate: row.created_at ? new Date(row.created_at).toLocaleDateString() : 'Joined Today',
      website: row.website,
      location: row.location,
      cover: row.cover,
    };
    return await resolveUserProfileSignedUrls(mapped);
  } catch (err: any) {
    console.warn('Error saving user profile to Supabase:', err.message);
    const fallback: User = {
      id: userData.uid,
      username: userData.username,
      name: userData.displayName || userData.username,
      email: userData.email,
      avatar: safeAvatar,
      bio: userData.bio || 'Safe social media explorer 🛡️',
      verified: true,
      aiTrustBadge: 'Verified Member',
      safetyScore: 100,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      role: userData.role || 'Verified Member',
      joinedDate: 'Joined Today',
    };
    return await resolveUserProfileSignedUrls(fallback);
  }
}

export async function getUserProfile(uid: string, viewerId?: string): Promise<User | null> {
  try {
    const effectiveViewerId = viewerId || activeViewerUserId || undefined;
    if (effectiveViewerId && uid !== effectiveViewerId && isClientUserRestricted(uid)) {
      return null;
    }

    // 1. Check authoritative server profile endpoint which enforces mutual block policy
    try {
      const params = effectiveViewerId ? `?viewerId=${encodeURIComponent(effectiveViewerId)}` : '';
      const res = await fetch(`/api/users/${encodeURIComponent(uid)}/profile${params}`);
      if (res.status === 403) {
        return null;
      }
      if (res.ok) {
        const body = await res.json();
        if (body?.restricted) {
          return null;
        }
        if (body?.profile) {
          const p = body.profile;
          if (effectiveViewerId && p.id !== effectiveViewerId && isClientUserRestricted(p.id)) {
            return null;
          }
          const finalAvatar = getSafeAvatar(p.avatar, p.name || p.username, p.id);
          const mapped: User = {
            id: p.id,
            username: p.username,
            name: p.name,
            email: p.email,
            avatar: finalAvatar,
            bio: p.bio || '',
            verified: p.verified ?? true,
            aiTrustBadge: p.aiTrustBadge || p.ai_trust_badge || 'Verified Human',
            safetyScore: p.safetyScore ?? p.safety_score ?? 100,
            followersCount: p.followersCount ?? p.followers_count ?? 0,
            followingCount: p.followingCount ?? p.following_count ?? 0,
            postsCount: p.postsCount ?? p.posts_count ?? 0,
            role: p.role || 'Member',
            joinedDate: p.joinedDate || (p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Joined Recently'),
            website: p.website,
            location: p.location,
            cover: p.cover,
          };
          return await resolveUserProfileSignedUrls(mapped);
        }
      }
    } catch {}

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`id.eq.${uid},username.eq.${uid.toLowerCase()}`)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    if (effectiveViewerId && data.id !== effectiveViewerId) {
      if (isClientUserRestricted(data.id)) {
        return null;
      }
      const blockStatus = await checkUserBlockStatus(effectiveViewerId, data.id);
      if (blockStatus.restricted) {
        return null;
      }
    }

    let realFollowersCount = data.followers_count ?? 0;
    let realFollowingCount = data.following_count ?? 0;
    try {
      const [{ count: fCount }, { count: fingCount }] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', data.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', data.id),
      ]);
      if (typeof fCount === 'number') realFollowersCount = fCount;
      if (typeof fingCount === 'number') realFollowingCount = fingCount;
    } catch {}

    const finalAvatar = getSafeAvatar(data.avatar, data.name || data.username, data.id);
    const mapped: User = {
      id: data.id,
      username: data.username,
      name: data.name,
      email: data.email,
      avatar: finalAvatar,
      bio: data.bio || '',
      verified: data.verified ?? true,
      aiTrustBadge: data.ai_trust_badge || 'Verified Human',
      safetyScore: data.safety_score ?? 100,
      followersCount: realFollowersCount,
      followingCount: realFollowingCount,
      postsCount: data.posts_count ?? 0,
      role: data.role || 'Member',
      joinedDate: data.created_at ? new Date(data.created_at).toLocaleDateString() : 'Joined Recently',
      website: data.website,
      location: data.location,
      cover: data.cover,
    };
    return await resolveUserProfileSignedUrls(mapped);
  } catch {
    return null;
  }
}

export async function isUsernameAvailable(username: string, currentUserId: string): Promise<boolean> {
  const clean = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  if (!clean) return false;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', clean)
      .neq('id', currentUserId)
      .maybeSingle();
    return !data;
  } catch {
    return true;
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<{
    displayName: string;
    username: string;
    bio: string;
    photoURL: string;
    website: string;
    location: string;
    cover: string;
  }>
): Promise<void> {
  const dbUpdates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.displayName !== undefined) dbUpdates.name = updates.displayName;
  if (updates.username !== undefined)
    dbUpdates.username = updates.username.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
  if (updates.photoURL !== undefined) dbUpdates.avatar = updates.photoURL;
  if (updates.website !== undefined) dbUpdates.website = updates.website;
  if (updates.location !== undefined) dbUpdates.location = updates.location;
  if (updates.cover !== undefined) dbUpdates.cover = updates.cover;

  const { error } = await supabase.from('profiles').update(dbUpdates).eq('id', uid);
  if (error) {
    console.error('Supabase updateUserProfile error:', error.message);
    throw new Error(`Failed to update profile: ${error.message}`);
  }
}

// ================= POSTS ================= //

export async function createPost(postData: {
  userId: string;
  username: string;
  userPhotoURL: string;
  caption: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  visibility?: 'public' | 'friends' | 'private';
  tags?: string[];
  aiScanDetails?: any;
}): Promise<string> {
  const newPostId = crypto.randomUUID();
  const hashtags = postData.tags || postData.caption.match(/#[\w]+/g) || [];

  const payload = {
    id: newPostId,
    user_id: postData.userId,
    caption: postData.caption,
    media_url: postData.mediaUrl || null,
    media_type: postData.mediaType || 'image',
    hashtags,
    likes_count: 0,
    comments_count: 0,
    visibility: postData.visibility || 'public',
    moderation_status: 'approved',
    ai_safety_score: 99,
    ai_scan_details: postData.aiScanDetails || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from('posts').insert(payload);
    if (error) {
      console.error('Supabase createPost error:', error.message);
      throw new Error(`Failed to create post: ${error.message}`);
    }

    // Note: User posts_count is automatically maintained atomically by database trigger (on_post_added_or_removed)
    return newPostId;
  } catch (err: any) {
    console.error('Error inserting post to Supabase:', err.message);
    throw err;
  }
}

export async function updatePost(
  postId: string,
  userId: string,
  updates: { caption?: string; visibility?: string; tags?: string[] }
): Promise<void> {
  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.caption !== undefined) {
    payload.caption = updates.caption;
    payload.hashtags = updates.caption.match(/#[\w]+/g) || updates.tags || [];
  }
  if (updates.visibility !== undefined) {
    payload.visibility = updates.visibility;
  }
  if (updates.tags !== undefined && updates.caption === undefined) {
    payload.hashtags = updates.tags;
  }

  const { error } = await supabase
    .from('posts')
    .update(payload)
    .eq('id', postId)
    .eq('user_id', userId);

  if (error) {
    console.error('Supabase updatePost error:', error.message);
    throw new Error(`Failed to update post: ${error.message}`);
  }
}

export async function fetchFeedPosts(
  currentUserIdOrLimit?: string | number,
  limitCount: number = 50
): Promise<Post[]> {
  const currentUserId = typeof currentUserIdOrLimit === 'string' ? currentUserIdOrLimit : undefined;
  const limit = typeof currentUserIdOrLimit === 'number' ? currentUserIdOrLimit : limitCount;

  try {
    const { data, error } = await supabase
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
          bio,
          verified,
          ai_trust_badge,
          safety_score,
          role
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      // Fallback simple query if profiles join is missing
      const { data: rawData, error: rawError } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (rawError || !rawData) return [];

      const simplePosts: Post[] = rawData
        .filter((row: any) => !isClientUserRestricted(row.user_id))
        .map((row: any) => ({
          id: row.id,
          user: {
            id: row.user_id || 'unknown',
            username: 'user',
            name: 'VERIXA User',
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
            bio: 'Safe social media explorer 🛡️',
            verified: true,
            aiTrustBadge: 'Verified Member',
            safetyScore: 100,
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
            role: 'Verified Member',
            joinedDate: 'Joined Today',
          },
          caption: row.caption || '',
          mediaUrl: row.media_url || undefined,
          mediaType: row.media_type || 'image',
          likes: row.likes_count || 0,
          comments: [],
          shares: 0,
          timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
          tags: row.hashtags || ['VERIXA'],
          aiSafetyScore: row.ai_safety_score || 99,
          aiScanDetails: row.ai_scan_details || { nsfwScore: 0, violenceScore: 0, fakeConfidence: 0, labels: [], summary: 'Verified safe', safe: true },
        }));
      return await resolvePostsSignedUrls(simplePosts);
    }

    const visibleRows = data.filter((row: any) => {
      const authorId = row.profiles?.id || row.user_id;
      return !isClientUserRestricted(authorId);
    });

    // Parallel fetch current user's likes and saves
    const likedPostIds = new Set<string>();
    const savedPostIds = new Set<string>();

    if (currentUserId) {
      const [likesRes, savesRes] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', currentUserId),
        supabase.from('saved_posts').select('post_id').eq('user_id', currentUserId),
      ]);
      if (likesRes.data) {
        likesRes.data.forEach((r: any) => likedPostIds.add(r.post_id));
      }
      if (savesRes.data) {
        savesRes.data.forEach((r: any) => savedPostIds.add(r.post_id));
      }
    }

    // Parallel fetch recent comments for these posts
    const postIds = visibleRows.map((p) => p.id);
    const commentsByPost: Record<string, Comment[]> = {};

    if (postIds.length > 0) {
      try {
        const { data: commentsData } = await supabase
          .from('comments')
          .select(`
            id,
            post_id,
            user_id,
            text,
            toxicity_score,
            moderation_status,
            created_at,
            profiles:user_id (
              id,
              username,
              name,
              avatar,
              bio,
              verified,
              ai_trust_badge,
              safety_score
            )
          `)
          .in('post_id', postIds)
          .order('created_at', { ascending: true });

        if (commentsData) {
          commentsData.forEach((c: any) => {
            const author = c.profiles || {};
            const authorId = author.id || c.user_id || 'unknown';
            if (isClientUserRestricted(authorId)) return;

            const commentObj: Comment = {
              id: c.id,
              postId: c.post_id,
              user: {
                id: authorId,
                username: author.username || 'user',
                name: author.name || author.username || 'Member',
                avatar: author.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
                bio: author.bio || '',
                verified: author.verified ?? true,
                aiTrustBadge: author.ai_trust_badge || 'Verified Human',
                safetyScore: author.safety_score ?? 100,
                followersCount: 0,
                followingCount: 0,
                postsCount: 0,
                role: 'Member',
                joinedDate: '',
              },
              content: c.text,
              timestamp: c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
              toxicityScore: c.toxicity_score || 0,
              categories: ['Verified Safe'],
              aiStatus: 'safe',
              likes: 0,
            };
            if (!commentsByPost[c.post_id]) {
              commentsByPost[c.post_id] = [];
            }
            commentsByPost[c.post_id].push(commentObj);
          });
        }
      } catch (cErr) {
        console.warn('Notice loading post comments:', cErr);
      }
    }

    const postsList: Post[] = visibleRows.map((row: any) => {
      const author = row.profiles || {};
      return {
        id: row.id,
        user: {
          id: author.id || row.user_id || 'unknown',
          username: author.username || 'user',
          name: author.name || author.username || 'VERIXA User',
          avatar: author.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
          bio: author.bio || 'Safe social media explorer 🛡️',
          verified: author.verified ?? true,
          aiTrustBadge: author.ai_trust_badge || 'Verified Member',
          safetyScore: author.safety_score ?? 100,
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          role: author.role || 'Verified Member',
          joinedDate: 'Joined Today',
        },
        caption: row.caption || '',
        mediaUrl: row.media_url || undefined,
        mediaType: row.media_type || 'image',
        likes: row.likes_count || 0,
        isLiked: likedPostIds.has(row.id),
        isBookmarked: savedPostIds.has(row.id),
        comments: commentsByPost[row.id] || [],
        shares: 0,
        timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
        tags: row.hashtags || ['VERIXA', 'SafeMedia'],
        aiSafetyScore: row.ai_safety_score || 99,
        aiScanDetails: row.ai_scan_details || { nsfwScore: 0, violenceScore: 0, fakeConfidence: 0, labels: [], summary: 'Verified safe', safe: true },
      };
    });

    return await resolvePostsSignedUrls(postsList);
  } catch (err: any) {
    console.warn('Error fetching feed posts from Supabase:', err.message);
    return [];
  }
}

export async function fetchPostById(
  postId: string,
  currentUserId?: string
): Promise<Post | null> {
  try {
    const { data: row, error } = await supabase
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
          bio,
          verified,
          ai_trust_badge,
          safety_score,
          role
        )
      `)
      .eq('id', postId)
      .maybeSingle();

    if (error || !row) return null;

    const author = (row as any).profiles || {};
    const authorId = author.id || row.user_id;
    const viewerId = currentUserId || activeViewerUserId || undefined;
    if (viewerId && authorId && viewerId !== authorId) {
      if (isClientUserRestricted(authorId)) return null;
      const status = await checkUserBlockStatus(viewerId, authorId);
      if (status.restricted) return null;
    }

    let isLiked = false;
    if (currentUserId) {
      const { data: likeData } = await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', currentUserId)
        .maybeSingle();
      isLiked = Boolean(likeData);
    }

    const { data: commentsData } = await supabase
      .from('comments')
      .select(`
        id,
        post_id,
        user_id,
        text,
        toxicity_score,
        moderation_status,
        created_at,
        profiles:user_id (
          id,
          username,
          name,
          avatar,
          bio,
          verified,
          ai_trust_badge,
          safety_score
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    const comments: Comment[] = (commentsData || [])
      .filter((c: any) => !isClientUserRestricted(c.profiles?.id || c.user_id))
      .map((c: any) => {
        const cAuthor = c.profiles || {};
        return {
          id: c.id,
          postId: c.post_id,
          user: {
            id: cAuthor.id || c.user_id || 'unknown',
            username: cAuthor.username || 'user',
            name: cAuthor.name || cAuthor.username || 'Member',
            avatar: cAuthor.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
            bio: cAuthor.bio || '',
            verified: cAuthor.verified ?? true,
            aiTrustBadge: cAuthor.ai_trust_badge || 'Verified Member',
            safetyScore: cAuthor.safety_score ?? 100,
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
            role: 'Member',
            joinedDate: '',
          },
          content: c.text,
          timestamp: c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
          toxicityScore: c.toxicity_score || 0,
          categories: ['Verified Safe'],
          aiStatus: 'safe',
          likes: 0,
        };
      });

    const post: Post = {
      id: row.id,
      user: {
        id: authorId,
        username: author.username || 'user',
        name: author.name || author.username || 'VERIXA Member',
        avatar: author.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        bio: author.bio || '',
        verified: author.verified ?? true,
        aiTrustBadge: author.ai_trust_badge || 'Verified Member',
        safetyScore: author.safety_score ?? 100,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        role: author.role || 'Member',
        joinedDate: '',
      },
      caption: row.caption || '',
      mediaUrl: row.media_url || undefined,
      mediaType: row.media_type || 'image',
      likes: row.likes_count || 0,
      comments,
      shares: 0,
      isLiked,
      isBookmarked: false,
      timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
      tags: row.hashtags || ['VERIXA', 'SafeMedia'],
      aiSafetyScore: row.ai_safety_score || 99,
      aiScanDetails: row.ai_scan_details || { nsfwScore: 0, violenceScore: 0, fakeConfidence: 0, labels: [], summary: 'Verified safe', safe: true },
    };

    return await resolvePostSignedUrls(post);
  } catch (err: any) {
    console.warn('Error fetching post by id from Supabase:', err.message);
    return null;
  }
}

export async function fetchReelById(
  reelId: string,
  currentUserId?: string
): Promise<Reel | null> {
  try {
    const { data: row, error } = await supabase
      .from('reels')
      .select(`
        id,
        user_id,
        caption,
        video_url,
        audio_title,
        deepfake_risk,
        moderation_status,
        likes_count,
        comments_count,
        shares_count,
        tags,
        created_at,
        profiles:user_id (
          id,
          username,
          name,
          avatar,
          bio,
          verified,
          ai_trust_badge,
          safety_score
        )
      `)
      .eq('id', reelId)
      .maybeSingle();

    if (error || !row) return null;

    const author = (row as any).profiles || {};
    const authorId = author.id || row.user_id;
    const viewerId = currentUserId || activeViewerUserId || undefined;
    if (viewerId && authorId && viewerId !== authorId) {
      if (isClientUserRestricted(authorId)) return null;
      const status = await checkUserBlockStatus(viewerId, authorId);
      if (status.restricted) return null;
    }

    const signedVideo = row.video_url ? await getSignedMediaUrl(row.video_url) : '';
    if (!signedVideo) return null;
    const signedAvatar = author.avatar ? await getSignedMediaUrl(author.avatar) : '';

    const reel: Reel = {
      id: row.id,
      user: {
        id: authorId,
        username: author.username || 'user',
        name: author.name || author.username || 'Creator',
        avatar: signedAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        bio: author.bio || '',
        verified: author.verified ?? true,
        aiTrustBadge: author.ai_trust_badge || 'Verified Creator',
        safetyScore: author.safety_score ?? 100,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
      },
      caption: row.caption || '',
      videoUrl: signedVideo,
      audioTitle: row.audio_title || 'Original Audio • Verified Clean',
      likes: row.likes_count || 0,
      isLiked: false,
      commentsCount: row.comments_count || 0,
      sharesCount: row.shares_count || 0,
      aiTrustBadge: author.ai_trust_badge || 'Verified Reel',
      deepfakeRisk: row.deepfake_risk || 0,
      tags: row.tags || ['Reels', 'VERIXA'],
    };
    return reel;
  } catch (err: any) {
    console.warn('Error fetching reel by id from Supabase:', err.message);
    return null;
  }
}

export function subscribePosts(
  callback: (posts: Post[]) => void,
  currentUserId?: string
): () => void {
  let isSubscribed = true;

  const load = async () => {
    try {
      const posts = await fetchFeedPosts(currentUserId);
      if (isSubscribed) {
        callback(posts);
      }
    } catch (err: any) {
      console.warn('Realtime Supabase posts fetch warning:', err.message);
    }
  };

  load();

  // Supabase Realtime channel for posts, comments, and likes
  const channel = supabase
    .channel('verixa_posts_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
      load();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => {
      load();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => {
      load();
    })
    .subscribe();

  return () => {
    isSubscribed = false;
    supabase.removeChannel(channel);
  };
}

export async function deletePost(postId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', userId);
  if (error) {
    console.error('Supabase deletePost error:', error.message);
    throw new Error(`Failed to delete post: ${error.message}`);
  }
  // Note: user posts_count is automatically maintained atomically by database trigger (on_post_added_or_removed)
}

// ================= LIKES ================= //

export interface PostLikeSyncResult {
  isLiked: boolean;
  likesCount?: number;
}

export async function togglePostLike(
  postId: string,
  userId: string,
  targetLiked?: boolean
): Promise<PostLikeSyncResult> {
  const shouldLike = targetLiked !== undefined ? targetLiked : true;

  // Enforce client & server block check on post owner before liking
  try {
    const { data: postOwner } = await supabase.from('posts').select('user_id').eq('id', postId).maybeSingle();
    if (postOwner?.user_id && postOwner.user_id !== userId) {
      if (isClientUserRestricted(postOwner.user_id)) {
        throw new Error('Action not available due to account privacy restrictions.');
      }
      const status = await checkUserBlockStatus(userId, postOwner.user_id);
      if (status.restricted) {
        throw new Error('Action not available due to account privacy restrictions.');
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('privacy restrictions')) {
      throw err;
    }
  }

  // 1. Authoritative server sync
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    const res = await fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, targetLiked: shouldLike }),
    });
    if (res.status === 403) {
      throw new Error('Action not available due to account privacy restrictions.');
    }
    if (res.ok) {
      const data = await res.json();
      if (typeof data.isLiked === 'boolean') {
        return {
          isLiked: data.isLiked,
          likesCount: typeof data.likesCount === 'number' ? data.likesCount : undefined,
        };
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('privacy restrictions')) {
      throw err;
    }
    console.warn('Server togglePostLike notice:', err?.message || err);
  }

  // 2. Direct Supabase sync (must succeed on primary likes table; never report false success on DB failure)
  if (!shouldLike) {
    const [likesRes] = await Promise.all([
      supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId),
      supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId),
    ]);
    if (likesRes.error) {
      throw new Error(`Failed to remove post like: ${likesRes.error.message}`);
    }
    return { isLiked: false };
  } else {
    const [likesRes] = await Promise.all([
      supabase.from('likes').upsert({
        post_id: postId,
        user_id: userId,
        created_at: new Date().toISOString(),
      }, { onConflict: 'post_id,user_id' }),
      supabase.from('post_likes').upsert({
        post_id: postId,
        user_id: userId,
        created_at: new Date().toISOString(),
      }, { onConflict: 'post_id,user_id' }),
    ]);
    if (likesRes.error) {
      throw new Error(`Failed to save post like: ${likesRes.error.message}`);
    }
    return { isLiked: true };
  }
}

/**
 * Fetch all user profiles who liked a specific post
 * Queries server endpoint /api/posts/:id/likes with fallback to Supabase likes & post_likes
 */
export async function fetchPostLikedUsers(postId: string): Promise<User[]> {
  try {
    // 1. Authoritative server endpoint query
    const res = await fetch(`/api/posts/${postId}/likes`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.users)) {
        return data.users
          .filter((u: any) => !isClientUserRestricted(u.id))
          .map((u: any) => ({
            id: u.id,
            name: u.name || 'User',
            username: u.username || 'user',
            avatar: u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'User')}&background=4285F4&color=fff&size=256&bold=true`,
            bio: u.bio || '',
            verified: Boolean(u.verified),
            aiTrustBadge: u.aiTrustBadge || 'Verified Member',
            safetyScore: u.safetyScore || 98,
            followersCount: u.followersCount || 0,
            followingCount: u.followingCount || 0,
            postsCount: u.postsCount || 0,
          }));
      }
    }
  } catch (err) {
    console.warn('Notice fetching post likes from server:', err);
  }

  // 2. Direct Supabase fallback
  try {
    const [likesRes, postLikesRes] = await Promise.allSettled([
      supabase.from('likes').select('user_id').eq('post_id', postId),
      supabase.from('post_likes').select('user_id').eq('post_id', postId),
    ]);

    const userIds: string[] = [];
    if (likesRes.status === 'fulfilled' && likesRes.value?.data) {
      likesRes.value.data.forEach((r: any) => {
        if (r.user_id && !isClientUserRestricted(r.user_id)) userIds.push(r.user_id);
      });
    }
    if (postLikesRes.status === 'fulfilled' && postLikesRes.value?.data) {
      postLikesRes.value.data.forEach((r: any) => {
        if (r.user_id && !isClientUserRestricted(r.user_id)) userIds.push(r.user_id);
      });
    }

    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length === 0) return [];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', uniqueIds);

    if (profiles && profiles.length > 0) {
      return profiles
        .filter((p: any) => !isClientUserRestricted(p.id))
        .map((p: any) => ({
          id: p.id,
          name: p.name || p.username || 'User',
          username: p.username || 'user',
          avatar:
            p.avatar ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || p.username || 'User')}&background=6366F1&color=fff&size=256&bold=true`,
          bio: p.bio || '',
          verified: Boolean(p.verified),
          aiTrustBadge: p.ai_trust_badge || 'Verified Member',
          safetyScore: p.safety_score || 98,
          followersCount: p.followers_count || 0,
          followingCount: p.following_count || 0,
          postsCount: p.posts_count || 0,
        }));
    }
  } catch (err) {
    console.warn('Notice querying Supabase directly for post likes:', err);
  }

  return [];
}

export async function getUserLikedPostIds(userId: string): Promise<string[]> {
  // 1. Fetch from server endpoint
  try {
    const res = await fetch(`/api/posts/liked/${userId}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.likedPostIds)) {
        return data.likedPostIds;
      }
    }
  } catch {
    // Non-blocking fallback
  }

  // 2. Attempt Supabase lookup
  try {
    const { data } = await supabase.from('likes').select('post_id').eq('user_id', userId);
    if (data && Array.isArray(data)) {
      return data.map((r: any) => r.post_id);
    }
  } catch {
    // Non-blocking
  }

  return [];
}

// ================= COMMENTS ================= //

export async function addComment(
  postId: string,
  userId: string,
  username: string,
  userPhotoURL: string,
  text: string,
  toxicityScore: number = 0
): Promise<string> {
  // Check if post owner is mutually restricted with commenter
  try {
    const { data: postOwner } = await supabase.from('posts').select('user_id').eq('id', postId).maybeSingle();
    if (postOwner?.user_id && postOwner.user_id !== userId) {
      if (isClientUserRestricted(postOwner.user_id)) {
        throw new Error('Action not available due to account privacy restrictions.');
      }
      const status = await checkUserBlockStatus(userId, postOwner.user_id);
      if (status.restricted) {
        throw new Error('Action not available due to account privacy restrictions.');
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('privacy restrictions')) {
      throw err;
    }
  }

  const commentId = crypto.randomUUID();
  try {
    const payload = {
      id: commentId,
      post_id: postId,
      user_id: userId,
      text,
      toxicity_score: toxicityScore,
      moderation_status: 'approved',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('comments').insert(payload);
    if (error) {
      console.error('Supabase addComment error:', error.message);
      throw new Error(`Failed to save comment: ${error.message}`);
    }

    // Note: post comments_count is automatically maintained atomically by database trigger (on_comment_added_or_removed)
    return commentId;
  } catch (err: any) {
    console.error('Error inserting comment to Supabase:', err.message);
    throw err;
  }
}

export function subscribePostComments(
  postId: string,
  callback: (comments: Comment[]) => void
): () => void {
  let isSubscribed = true;

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id,
          post_id,
          user_id,
          text,
          toxicity_score,
          moderation_status,
          created_at,
          profiles:user_id (
            id,
            username,
            name,
            avatar,
            bio,
            verified,
            ai_trust_badge,
            safety_score
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) {
        const { data: rawComments } = await supabase
          .from('comments')
          .select('*')
          .eq('post_id', postId)
          .order('created_at', { ascending: true });

        if (rawComments && isSubscribed) {
          const list: Comment[] = rawComments
            .filter((row) => !isClientUserRestricted(row.user_id))
            .map((row) => ({
              id: row.id,
              postId,
              user: {
                id: row.user_id,
                username: 'user',
                name: 'Member',
                avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
                bio: '',
                verified: true,
                aiTrustBadge: 'Verified Human',
                safetyScore: 100,
                followersCount: 0,
                followingCount: 0,
                postsCount: 0,
                role: 'Member',
                joinedDate: '',
              },
              content: row.text,
              timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
              toxicityScore: row.toxicity_score || 0,
              categories: ['SAFE_CONTENT'],
              aiStatus: 'safe',
              likes: 0,
            }));
          callback(list);
        }
        return;
      }

      if (data && isSubscribed) {
        const list: Comment[] = data
          .filter((row: any) => !isClientUserRestricted(row.profiles?.id || row.user_id))
          .map((row: any) => {
            const author = row.profiles || {};
            return {
              id: row.id,
              postId,
              user: {
                id: author.id || row.user_id,
                username: author.username || 'user',
                name: author.name || author.username || 'Member',
                avatar: author.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
                bio: author.bio || '',
                verified: author.verified ?? true,
                aiTrustBadge: author.ai_trust_badge || 'Verified Human',
                safetyScore: author.safety_score ?? 100,
                followersCount: 0,
                followingCount: 0,
                postsCount: 0,
                role: 'Member',
                joinedDate: '',
              },
              content: row.text,
              timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
              toxicityScore: row.toxicity_score || 0,
              categories: ['SAFE_CONTENT'],
              aiStatus: 'safe',
              likes: 0,
            };
          });
        callback(list);
      }
    } catch (err: any) {
      console.warn('Realtime comments fetch warning:', err.message);
    }
  };

  fetchComments();

  const channel = supabase
    .channel(`comments_post_${postId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
      () => {
        fetchComments();
      }
    )
    .subscribe();

  return () => {
    isSubscribed = false;
    supabase.removeChannel(channel);
  };
}

export async function deleteComment(commentId: string, _userId?: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) {
    console.error('Supabase deleteComment error:', error.message);
    throw new Error(`Failed to delete comment: ${error.message}`);
  }
}

export async function fetchReelComments(reelId: string): Promise<Comment[]> {
  try {
    let query = supabase
      .from('comments')
      .select(`
        id,
        post_id,
        user_id,
        text,
        toxicity_score,
        moderation_status,
        created_at,
        profiles:user_id (
          id,
          username,
          name,
          avatar,
          bio,
          verified,
          ai_trust_badge,
          safety_score
        )
      `);

    // Try query matching either post_id = reelId or reel_id = reelId
    try {
      const { data, error } = await query.or(`post_id.eq.${reelId},reel_id.eq.${reelId}`).order('created_at', { ascending: true });
      if (!error && data) {
        return data
          .filter((row: any) => !isClientUserRestricted(row.profiles?.id || row.user_id))
          .map((row: any) => {
            const author = row.profiles || {};
            return {
              id: row.id,
              postId: reelId,
              user: {
                id: author.id || row.user_id,
                username: author.username || 'user',
                name: author.name || author.username || 'Member',
                avatar: author.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
                bio: author.bio || '',
                verified: author.verified ?? true,
                aiTrustBadge: author.ai_trust_badge || 'Verified Member',
                safetyScore: author.safety_score ?? 100,
                followersCount: 0,
                followingCount: 0,
                postsCount: 0,
                role: 'Member',
                joinedDate: '',
              },
              content: row.text,
              timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
              toxicityScore: row.toxicity_score || 0,
              categories: ['SAFE_CONTENT'],
              aiStatus: 'safe',
              likes: 0,
            };
          });
      }
    } catch {}

    // Fallback simple query
    const { data: fallbackData } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', reelId)
      .order('created_at', { ascending: true });

    if (fallbackData) {
      return fallbackData
        .filter((row: any) => !isClientUserRestricted(row.user_id))
        .map((row: any) => ({
          id: row.id,
          postId: reelId,
          user: {
            id: row.user_id,
            username: 'user',
            name: 'Member',
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
            bio: '',
            verified: true,
            aiTrustBadge: 'Verified Member',
            safetyScore: 100,
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
            role: 'Member',
            joinedDate: '',
          },
          content: row.text,
          timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
          toxicityScore: row.toxicity_score || 0,
          categories: ['SAFE_CONTENT'],
          aiStatus: 'safe',
          likes: 0,
        }));
    }
    return [];
  } catch (err: any) {
    console.warn('Error fetching reel comments:', err.message);
    return [];
  }
}

export async function addReelComment(
  reelId: string,
  userId: string,
  username: string,
  userPhotoURL: string,
  text: string,
  toxicityScore: number = 0
): Promise<string> {
  try {
    const { data: reelRow } = await supabase.from('reels').select('user_id').eq('id', reelId).maybeSingle();
    if (reelRow?.user_id && reelRow.user_id !== userId) {
      if (isClientUserRestricted(reelRow.user_id)) {
        throw new Error('Action not available due to account privacy restrictions.');
      }
      const status = await checkUserBlockStatus(userId, reelRow.user_id);
      if (status.restricted) {
        throw new Error('Action not available due to account privacy restrictions.');
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('privacy restrictions')) {
      throw err;
    }
  }

  const commentId = crypto.randomUUID();
  try {
    // Primary insert using reel_id column (supported by comments_insert_auth policy)
    const { error: reelErr } = await supabase.from('comments').insert({
      id: commentId,
      reel_id: reelId,
      user_id: userId,
      text,
      toxicity_score: toxicityScore,
      moderation_status: 'approved',
      created_at: new Date().toISOString(),
    });

    if (reelErr) {
      // Fallback only if reel_id column is absent in legacy schema
      if (reelErr.message?.includes('reel_id') || reelErr.message?.includes('column')) {
        const { error: insertErr } = await supabase.from('comments').insert({
          id: commentId,
          post_id: reelId,
          user_id: userId,
          text,
          toxicity_score: toxicityScore,
          moderation_status: 'approved',
          created_at: new Date().toISOString(),
        });
        if (insertErr) {
          throw new Error(`Failed to save reel comment: ${insertErr.message}`);
        }
      } else {
        throw new Error(`Failed to save reel comment: ${reelErr.message}`);
      }
    }

    // Note: reel comments_count is maintained atomically by database trigger (on_comment_added_or_removed)
    return commentId;
  } catch (err: any) {
    console.error('Error inserting reel comment:', err);
    throw err;
  }
}

export function subscribeReelComments(
  reelId: string,
  callback: (comments: Comment[]) => void
): () => void {
  let isSubscribed = true;

  const load = async () => {
    const comments = await fetchReelComments(reelId);
    if (isSubscribed) callback(comments);
  };

  load();

  const channel = supabase
    .channel(`reel_comments_${reelId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comments' },
      () => {
        load();
      }
    )
    .subscribe();

  return () => {
    isSubscribed = false;
    supabase.removeChannel(channel);
  };
}

// ================= FOLLOWS ================= //

export async function checkIsFollowing(followerId: string, followingId: string): Promise<boolean> {
  if (!followerId || !followingId || followerId === followingId) return false;
  if (isClientUserRestricted(followingId)) return false;
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let resolvedFollowerId = followerId;
    let resolvedFollowingId = followingId;

    if (!uuidRegex.test(resolvedFollowerId)) {
      const { data: fProfile } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${followerId},username.eq.${followerId.toLowerCase()}`)
        .maybeSingle();
      if (fProfile?.id) resolvedFollowerId = fProfile.id;
    }
    if (!uuidRegex.test(resolvedFollowingId)) {
      const { data: fingProfile } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${followingId},username.eq.${followingId.toLowerCase()}`)
        .maybeSingle();
      if (fingProfile?.id) resolvedFollowingId = fingProfile.id;
    }

    if (isClientUserRestricted(resolvedFollowingId)) return false;

    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', resolvedFollowerId)
      .eq('following_id', resolvedFollowingId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function getUserFollowers(userId: string): Promise<User[]> {
  try {
    if (!userId) return [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let targetId = userId;
    if (!uuidRegex.test(targetId)) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${targetId},username.eq.${targetId.toLowerCase()}`)
        .maybeSingle();
      if (p?.id) targetId = p.id;
    }

    if (activeViewerUserId && targetId !== activeViewerUserId && isClientUserRestricted(targetId)) {
      return [];
    }

    // Try backend server endpoint first
    try {
      const viewerQuery = activeViewerUserId ? `?viewerId=${encodeURIComponent(activeViewerUserId)}` : '';
      const res = await fetch(`/api/users/${targetId}/followers${viewerQuery}`);
      if (res.status === 403) return [];
      if (res.ok) {
        const body = await res.json();
        if (body && Array.isArray(body.followers) && body.followers.length > 0) {
          const mapped: User[] = body.followers
            .filter((p: any) => !isClientUserRestricted(p.id))
            .map((p: any) => ({
              id: p.id,
              username: p.username || 'user',
              name: p.name || p.username || 'Member',
              avatar: getSafeAvatar(p.avatar, p.name || p.username, p.id),
              bio: p.bio || '',
              verified: p.verified ?? true,
              aiTrustBadge: p.ai_trust_badge || 'Verified Human',
              safetyScore: p.safety_score ?? 100,
              followersCount: p.followers_count ?? 0,
              followingCount: p.following_count ?? 0,
              postsCount: p.posts_count ?? 0,
              role: p.role || 'Member',
              joinedDate: '',
            }));
          return await Promise.all(mapped.map((u) => resolveUserProfileSignedUrls(u)));
        }
      }
    } catch {}

    // Fallback directly to Supabase client
    const { data, error } = await supabase
      .from('follows')
      .select(`
        follower_id,
        profiles:follower_id (
          id,
          username,
          name,
          avatar,
          bio,
          verified,
          ai_trust_badge,
          safety_score,
          followers_count,
          following_count,
          posts_count,
          role
        )
      `)
      .eq('following_id', targetId);

    if (error || !data) return [];
    const users: User[] = data
      .filter((row: any) => row.profiles && !isClientUserRestricted(row.profiles.id))
      .map((row: any) => ({
        id: row.profiles.id,
        username: row.profiles.username || 'user',
        name: row.profiles.name || row.profiles.username || 'Member',
        avatar: getSafeAvatar(row.profiles.avatar, row.profiles.name || row.profiles.username, row.profiles.id),
        bio: row.profiles.bio || '',
        verified: row.profiles.verified ?? true,
        aiTrustBadge: row.profiles.ai_trust_badge || 'Verified Human',
        safetyScore: row.profiles.safety_score ?? 100,
        followersCount: row.profiles.followers_count ?? 0,
        followingCount: row.profiles.following_count ?? 0,
        postsCount: row.profiles.posts_count ?? 0,
        role: row.profiles.role || 'Member',
        joinedDate: '',
      }));
    return await Promise.all(users.map((u) => resolveUserProfileSignedUrls(u)));
  } catch (err) {
    console.warn('Error fetching followers:', err);
    return [];
  }
}

export async function getUserFollowing(userId: string): Promise<User[]> {
  try {
    if (!userId) return [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let targetId = userId;
    if (!uuidRegex.test(targetId)) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${targetId},username.eq.${targetId.toLowerCase()}`)
        .maybeSingle();
      if (p?.id) targetId = p.id;
    }

    if (activeViewerUserId && targetId !== activeViewerUserId && isClientUserRestricted(targetId)) {
      return [];
    }

    // Try backend server endpoint first
    try {
      const viewerQuery = activeViewerUserId ? `?viewerId=${encodeURIComponent(activeViewerUserId)}` : '';
      const res = await fetch(`/api/users/${targetId}/following${viewerQuery}`);
      if (res.status === 403) return [];
      if (res.ok) {
        const body = await res.json();
        if (body && Array.isArray(body.following) && body.following.length > 0) {
          const mapped: User[] = body.following
            .filter((p: any) => !isClientUserRestricted(p.id))
            .map((p: any) => ({
              id: p.id,
              username: p.username || 'user',
              name: p.name || p.username || 'Member',
              avatar: getSafeAvatar(p.avatar, p.name || p.username, p.id),
              bio: p.bio || '',
              verified: p.verified ?? true,
              aiTrustBadge: p.ai_trust_badge || 'Verified Human',
              safetyScore: p.safety_score ?? 100,
              followersCount: p.followers_count ?? 0,
              followingCount: p.following_count ?? 0,
              postsCount: p.posts_count ?? 0,
              role: p.role || 'Member',
              joinedDate: '',
            }));
          return await Promise.all(mapped.map((u) => resolveUserProfileSignedUrls(u)));
        }
      }
    } catch {}

    // Fallback directly to Supabase client
    const { data, error } = await supabase
      .from('follows')
      .select(`
        following_id,
        profiles:following_id (
          id,
          username,
          name,
          avatar,
          bio,
          verified,
          ai_trust_badge,
          safety_score,
          followers_count,
          following_count,
          posts_count,
          role
        )
      `)
      .eq('follower_id', targetId);

    if (error || !data) return [];
    const users: User[] = data
      .filter((row: any) => row.profiles && !isClientUserRestricted(row.profiles.id))
      .map((row: any) => ({
        id: row.profiles.id,
        username: row.profiles.username || 'user',
        name: row.profiles.name || row.profiles.username || 'Member',
        avatar: getSafeAvatar(row.profiles.avatar, row.profiles.name || row.profiles.username, row.profiles.id),
        bio: row.profiles.bio || '',
        verified: row.profiles.verified ?? true,
        aiTrustBadge: row.profiles.ai_trust_badge || 'Verified Human',
        safetyScore: row.profiles.safety_score ?? 100,
        followersCount: row.profiles.followers_count ?? 0,
        followingCount: row.profiles.following_count ?? 0,
        postsCount: row.profiles.posts_count ?? 0,
        role: row.profiles.role || 'Member',
        joinedDate: '',
      }));
    return await Promise.all(users.map((u) => resolveUserProfileSignedUrls(u)));
  } catch (err) {
    console.warn('Error fetching following:', err);
    return [];
  }
}

export async function toggleFollowUser(
  followerId: string,
  followingId: string,
  targetFollowing?: boolean
): Promise<boolean> {
  if (followerId === followingId) {
    throw new Error('You cannot follow yourself.');
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let resolvedFollowerId = followerId;
  let resolvedFollowingId = followingId;

  if (!uuidRegex.test(resolvedFollowerId)) {
    const { data: fProfile } = await supabase
      .from('profiles')
      .select('id')
      .or(`id.eq.${followerId},username.eq.${followerId.toLowerCase()}`)
      .maybeSingle();
    if (fProfile?.id) resolvedFollowerId = fProfile.id;
  }
  if (!uuidRegex.test(resolvedFollowingId)) {
    const { data: fingProfile } = await supabase
      .from('profiles')
      .select('id')
      .or(`id.eq.${followingId},username.eq.${followingId.toLowerCase()}`)
      .maybeSingle();
    if (fingProfile?.id) resolvedFollowingId = fingProfile.id;
  }

  if (resolvedFollowerId === resolvedFollowingId) {
    throw new Error('You cannot follow yourself.');
  }

  // Enforce mutual block policy before allowing follow
  if (isClientUserRestricted(resolvedFollowingId)) {
    throw new Error('Action not available due to account privacy restrictions.');
  }
  const blockCheck = await checkUserBlockStatus(resolvedFollowerId, resolvedFollowingId);
  if (blockCheck.restricted) {
    throw new Error('Action not available due to account privacy restrictions.');
  }

  let shouldFollow: boolean;
  if (targetFollowing !== undefined) {
    shouldFollow = targetFollowing;
  } else {
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', resolvedFollowerId)
      .eq('following_id', resolvedFollowingId)
      .maybeSingle();
    shouldFollow = !data;
  }

  // Always check server follow endpoint first so server-side block & count integrity is enforced
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    const res = await fetch(`/api/users/${resolvedFollowingId}/follow`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        followerId: resolvedFollowerId,
        targetFollowing: shouldFollow,
      }),
    });

    if (res.status === 403) {
      throw new Error('Action not available due to account privacy restrictions.');
    }
    if (res.ok) {
      const result = await res.json();
      if (result.following) {
        createNotification({
          recipientId: resolvedFollowingId,
          senderId: resolvedFollowerId,
          type: 'follow',
          message: 'started following you',
        }).catch(() => {});
      }
      return Boolean(result.following);
    }
  } catch (apiErr: any) {
    if (apiErr?.message?.includes('privacy restrictions')) {
      throw apiErr;
    }
    console.warn('Server follow notice:', apiErr);
  }

  if (!shouldFollow) {
    const { error: unfollowErr } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', resolvedFollowerId)
      .eq('following_id', resolvedFollowingId);
    if (unfollowErr) {
      throw new Error(`Failed to unfollow user: ${unfollowErr.message}`);
    }
  } else {
    const { error: followErr } = await supabase.from('follows').upsert(
      {
        follower_id: resolvedFollowerId,
        following_id: resolvedFollowingId,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'follower_id,following_id' }
    );
    if (followErr) {
      throw new Error(`Failed to follow user: ${followErr.message}`);
    }
    createNotification({
      recipientId: resolvedFollowingId,
      senderId: resolvedFollowerId,
      type: 'follow',
      message: 'started following you',
    }).catch(() => {});
  }

  return shouldFollow;
}

// ================= BLOCKED USERS ================= //

export interface BlockedUserAccount {
  id: string;
  name: string;
  username: string;
  avatar: string;
  reason?: string;
  blockedAt?: string;
}

export async function checkUserBlockStatus(
  viewerId: string | undefined,
  targetUserId: string
): Promise<{ restricted: boolean; isBlocked: boolean; blockedByViewer: boolean }> {
  if (!viewerId || !targetUserId || viewerId === targetUserId) {
    return { restricted: false, isBlocked: false, blockedByViewer: false };
  }
  try {
    const res = await fetch(
      `/api/users/${encodeURIComponent(targetUserId)}/block-status?viewerId=${encodeURIComponent(viewerId)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.restricted && (!activeViewerUserId || activeViewerUserId === viewerId)) {
        activeRestrictedUserIds.add(targetUserId);
        evictSignedUrlsForUser(targetUserId);
      }
      return {
        restricted: Boolean(data.restricted),
        isBlocked: Boolean(data.isBlocked ?? data.restricted),
        blockedByViewer: Boolean(data.blockedByViewer),
      };
    }
  } catch {}
  const fallbackRestricted = isClientUserRestricted(targetUserId);
  return {
    restricted: fallbackRestricted,
    isBlocked: fallbackRestricted,
    blockedByViewer: fallbackRestricted,
  };
}

export async function fetchUserBlockRelations(userId: string): Promise<{
  blockedUsers: BlockedUserAccount[];
  restrictedUserIds: string[];
}> {
  if (!userId) {
    return { blockedUsers: [], restrictedUserIds: [] };
  }
  const blockedUsers = await getBlockedUsersList(userId);
  const restrictedSet = new Set<string>(blockedUsers.map((u) => u.id));

  // Query narrowly-scoped SECURITY DEFINER RPC for bilateral restrictions (both outgoing & incoming blocks for auth.uid())
  try {
    const { data: rpcRestricted, error: rpcErr } = await supabase.rpc('get_my_restricted_user_ids');
    if (!rpcErr && Array.isArray(rpcRestricted)) {
      for (const item of rpcRestricted) {
        const restrictedId =
          typeof item === 'string'
            ? item
            : item?.restricted_user_id || item?.get_my_restricted_user_ids || item?.id;
        if (restrictedId && typeof restrictedId === 'string' && restrictedId !== userId) {
          restrictedSet.add(restrictedId);
        }
      }
    }
  } catch {}

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}/blocked`, { headers });
    if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body?.restrictedUserIds)) {
        body.restrictedUserIds.forEach((id: string) => {
          if (id && id !== userId) restrictedSet.add(id);
        });
      }
    }
  } catch {}

  const restrictedUserIds = Array.from(restrictedSet);
  setClientRestrictedUserIds(userId, restrictedUserIds);
  return { blockedUsers, restrictedUserIds };
}

export async function blockUserAccount(
  blockerId: string,
  targetUser: { id: string; name?: string; username?: string; avatar?: string },
  reason: string = 'Blocked by user'
): Promise<boolean> {
  if (!blockerId || !targetUser?.id) {
    throw new Error('Blocker ID and target user ID are required.');
  }
  if (blockerId === targetUser.id) {
    throw new Error('You cannot block yourself.');
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let resolvedBlockerId = blockerId;
  let resolvedTargetId = targetUser.id;

  if (!uuidRegex.test(resolvedBlockerId)) {
    try {
      const { data: bProf } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${blockerId},username.eq.${blockerId.toLowerCase()}`)
        .maybeSingle();
      if (bProf?.id) resolvedBlockerId = bProf.id;
    } catch {}
  }

  if (!uuidRegex.test(resolvedTargetId)) {
    try {
      const { data: tProf } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${targetUser.id},username.eq.${(targetUser.username || targetUser.id).toLowerCase()}`)
        .maybeSingle();
      if (tProf?.id) resolvedTargetId = tProf.id;
    } catch {}
  }

  if (resolvedBlockerId === resolvedTargetId) {
    throw new Error('You cannot block yourself.');
  }

  // Immediately register in client restricted set and evict signed media URLs
  activeViewerUserId = resolvedBlockerId;
  activeRestrictedUserIds.add(resolvedTargetId);
  evictSignedUrlsForUser(resolvedTargetId);

  // 1. Persist block in Supabase blocked_users table (authoritative check)
  let blockTableError: string | null = null;
  let blockTableSaved = false;
  try {
    const { error: insertErr } = await supabase.from('blocked_users').insert({
      blocker_id: resolvedBlockerId,
      blocked_id: resolvedTargetId,
      reason,
      created_at: new Date().toISOString(),
    });
    if (!insertErr || insertErr.code === '23505') {
      blockTableSaved = true;
    } else {
      blockTableError = insertErr.message || 'Failed to insert block record';
    }
  } catch (err: any) {
    blockTableError = err?.message || 'Failed to insert block record';
  }

  // 2. Sync with backend server endpoint (verifies JWT, persists to Supabase blocked_users & updates counts)
  let serverSynced = false;
  let serverErrorMessage: string | null = null;
  let serverExplicitFailure = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    const res = await fetch(`/api/users/${encodeURIComponent(resolvedTargetId)}/block`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        blockerId: resolvedBlockerId,
        reason,
        targetName: targetUser.name || targetUser.username || 'Blocked User',
        targetUsername: targetUser.username || 'blocked_user',
        targetAvatar: targetUser.avatar || '',
      }),
    });

    if (res.ok) {
      const payload = await res.json().catch(() => ({}));
      if (payload?.success !== false && payload?.blocked !== false) {
        serverSynced = true;
      } else {
        serverExplicitFailure = true;
        serverErrorMessage = payload?.error || 'Server rejected block operation';
      }
    } else {
      serverExplicitFailure = true;
      const errBody = await res.json().catch(() => ({}));
      serverErrorMessage = errBody?.error || `Block request failed with status ${res.status}`;
    }
  } catch (apiErr: any) {
    serverErrorMessage = apiErr?.message || 'Failed to reach block endpoint';
  }

  // Never report success if the authoritative database write failed
  if (serverExplicitFailure || (!blockTableSaved && !serverSynced)) {
    activeRestrictedUserIds.delete(resolvedTargetId);
    throw new Error(
      serverErrorMessage || blockTableError || 'Failed to persist block relationship in Supabase.'
    );
  }

  // 3. Remove follow relationships in both directions in Supabase directly
  try {
    await Promise.allSettled([
      supabase
        .from('follows')
        .delete()
        .eq('follower_id', resolvedBlockerId)
        .eq('following_id', resolvedTargetId),
      supabase
        .from('follows')
        .delete()
        .eq('follower_id', resolvedTargetId)
        .eq('following_id', resolvedBlockerId),
    ]);
  } catch {}

  // 4. Persist block in Supabase moderation_logs via authoritative RPC
  try {
    await supabase.rpc('log_moderation_entry', {
      p_target_id: resolvedTargetId,
      p_target_type: 'user',
      p_status: 'blocked',
      p_category: 'USER_BLOCK',
      p_confidence: 100,
      p_reason: JSON.stringify({
        reason,
        name: targetUser.name || targetUser.username || 'Blocked User',
        username: targetUser.username || 'blocked_user',
        avatar: targetUser.avatar || '',
      }),
    });
  } catch {}

  return true;
}

export async function unblockUserAccount(
  blockerId: string,
  targetUserId: string
): Promise<boolean> {
  if (!blockerId || !targetUserId) {
    throw new Error('Blocker ID and target user ID are required.');
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let resolvedBlockerId = blockerId;
  let resolvedTargetId = targetUserId;

  if (!uuidRegex.test(resolvedBlockerId)) {
    try {
      const { data: bProf } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${blockerId},username.eq.${blockerId.toLowerCase()}`)
        .maybeSingle();
      if (bProf?.id) resolvedBlockerId = bProf.id;
    } catch {}
  }

  if (!uuidRegex.test(resolvedTargetId)) {
    try {
      const { data: tProf } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${targetUserId},username.eq.${targetUserId.toLowerCase()}`)
        .maybeSingle();
      if (tProf?.id) resolvedTargetId = tProf.id;
    } catch {}
  }

  // 1. Delete from Supabase blocked_users table and check for errors
  let unblockDbSaved = false;
  let unblockDbError: string | null = null;
  try {
    const { error: delErr } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', resolvedBlockerId)
      .eq('blocked_id', resolvedTargetId);
    if (!delErr) {
      unblockDbSaved = true;
    } else {
      unblockDbError = delErr.message || 'Failed to delete block record';
    }
  } catch (err: any) {
    unblockDbError = err?.message || 'Failed to delete block record';
  }

  // 2. Sync with backend server endpoint
  let serverSynced = false;
  let serverExplicitFailure = false;
  let serverErrorMessage: string | null = null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    const res = await fetch(`/api/users/${encodeURIComponent(resolvedTargetId)}/unblock`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        blockerId: resolvedBlockerId,
      }),
    });

    if (res.ok) {
      const payload = await res.json().catch(() => ({}));
      if (payload?.success !== false) {
        serverSynced = true;
      } else {
        serverExplicitFailure = true;
        serverErrorMessage = payload?.error || 'Server rejected unblock operation';
      }
    } else {
      serverExplicitFailure = true;
      const errBody = await res.json().catch(() => ({}));
      serverErrorMessage = errBody?.error || `Unblock request failed with status ${res.status}`;
    }
  } catch (apiErr: any) {
    serverErrorMessage = apiErr?.message || 'Failed to reach unblock endpoint';
  }

  if (serverExplicitFailure || (!unblockDbSaved && !serverSynced)) {
    throw new Error(
      serverErrorMessage || unblockDbError || 'Failed to remove block relationship in Supabase.'
    );
  }

  // 3. Record unblock event in Supabase moderation_logs via authoritative RPC
  try {
    await supabase.rpc('log_moderation_entry', {
      p_target_id: resolvedTargetId,
      p_target_type: 'user',
      p_status: 'approved',
      p_category: 'USER_UNBLOCK',
      p_confidence: 100,
      p_reason: 'Unblocked by user',
    });
  } catch {}

  // Re-check whether target still blocks viewer before removing from client restricted set
  const statusAfter = await checkUserBlockStatus(resolvedBlockerId, resolvedTargetId);
  if (!statusAfter.restricted) {
    activeRestrictedUserIds.delete(resolvedTargetId);
  }

  return true;
}

export async function getBlockedUsersList(blockerId: string): Promise<BlockedUserAccount[]> {
  if (!blockerId) return [];

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let resolvedBlockerId = blockerId;
  if (!uuidRegex.test(resolvedBlockerId)) {
    try {
      const { data: bProf } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${blockerId},username.eq.${blockerId.toLowerCase()}`)
        .maybeSingle();
      if (bProf?.id) resolvedBlockerId = bProf.id;
    } catch {}
  }

  const unblockedSet = new Set<string>();
  const blockedMap = new Map<string, BlockedUserAccount>();

  // 1. Check Supabase moderation_logs first (authoritative chronological log per authenticated user)
  try {
    const { data: modLogs } = await supabase
      .from('moderation_logs')
      .select('target_id, status, category, reason, created_at')
      .eq('user_id', resolvedBlockerId)
      .eq('target_type', 'user')
      .in('category', ['USER_BLOCK', 'USER_UNBLOCK'])
      .order('created_at', { ascending: false });

    if (Array.isArray(modLogs)) {
      const seenTargets = new Set<string>();
      for (const log of modLogs) {
        const tId = log.target_id;
        if (!tId || seenTargets.has(tId)) continue;
        seenTargets.add(tId);

        if (log.category === 'USER_UNBLOCK' || log.status === 'approved') {
          unblockedSet.add(tId);
        } else if (log.category === 'USER_BLOCK' && log.status === 'blocked') {
          let meta: any = {};
          if (log.reason && log.reason.startsWith('{')) {
            try {
              meta = JSON.parse(log.reason);
            } catch {}
          }
          blockedMap.set(tId, {
            id: tId,
            name: meta.name || 'Blocked User',
            username: meta.username || 'blocked_user',
            avatar: meta.avatar || '',
            reason: meta.reason || log.reason || 'Blocked by user',
            blockedAt: log.created_at || new Date().toISOString(),
          });
        }
      }
    }
  } catch {}

  // 2. Check Supabase blocked_users table (if created)
  try {
    const { data: sbBlocked, error: sbErr } = await supabase
      .from('blocked_users')
      .select('blocked_id, reason, created_at')
      .eq('blocker_id', resolvedBlockerId)
      .order('created_at', { ascending: false });

    if (!sbErr && Array.isArray(sbBlocked)) {
      for (const row of sbBlocked) {
        if (row.blocked_id && !unblockedSet.has(row.blocked_id) && !blockedMap.has(row.blocked_id)) {
          blockedMap.set(row.blocked_id, {
            id: row.blocked_id,
            name: 'Blocked User',
            username: 'blocked_user',
            avatar: '',
            reason: row.reason || 'Blocked by user',
            blockedAt: row.created_at || new Date().toISOString(),
          });
        }
      }
    }
  } catch {}

  // 3. Check backend server endpoint
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    const res = await fetch(`/api/users/${encodeURIComponent(resolvedBlockerId)}/blocked`, { headers });
    if (res.ok) {
      const body = await res.json();
      if (body && Array.isArray(body.blockedUsers)) {
        for (const item of body.blockedUsers) {
          if (item?.id && !unblockedSet.has(item.id)) {
            const existing = blockedMap.get(item.id);
            blockedMap.set(item.id, {
              id: item.id,
              name: item.name && item.name !== 'Blocked User' ? item.name : existing?.name || 'Blocked User',
              username: item.username && item.username !== 'blocked_user' ? item.username : existing?.username || 'blocked_user',
              avatar: item.avatar || existing?.avatar || '',
              reason: item.reason || existing?.reason || 'Blocked by user',
              blockedAt: item.blockedAt || existing?.blockedAt || new Date().toISOString(),
            });
          }
        }
      }
      if (body && Array.isArray(body.restrictedUserIds)) {
        const unionIds = new Set<string>([...body.restrictedUserIds, ...Array.from(blockedMap.keys())]);
        setClientRestrictedUserIds(resolvedBlockerId, Array.from(unionIds));
      }
    }
  } catch {}

  // 4. Hydrate real user profile details from public.profiles in Supabase
  const targetIds = Array.from(blockedMap.keys()).filter((id) => uuidRegex.test(id));
  if (targetIds.length > 0) {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar')
        .in('id', targetIds);

      if (Array.isArray(profiles)) {
        for (const p of profiles) {
          const entry = blockedMap.get(p.id);
          if (entry) {
            entry.name = p.name || p.username || entry.name;
            entry.username = p.username || entry.username;
            entry.avatar = p.avatar || entry.avatar;
          }
        }
      }
    } catch {}
  }

  // 5. Resolve signed URLs or fallback avatars
  const finalEntries = await Promise.all(
    Array.from(blockedMap.values()).map(async (item) => {
      return {
        ...item,
        avatar: getSafeAvatar(item.avatar, item.name || item.username, item.id),
      };
    })
  );

  return finalEntries;
}

// ================= NOTIFICATIONS ================= //

export async function createNotification(notif: {
  recipientId: string;
  senderId: string;
  senderUsername?: string;
  senderName?: string;
  senderPhotoURL?: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'friend_request' | 'ai_warning';
  postId?: string;
  message: string;
  detail?: string;
  sender?: User;
}): Promise<void> {
  // STRICT: Never allow self-notifications or notifications between mutually blocked users!
  if (!notif.recipientId || !notif.senderId || notif.recipientId === notif.senderId) return;
  if (isClientUserRestricted(notif.recipientId) || isClientUserRestricted(notif.senderId)) return;

  const senderObj = notif.sender || {
    id: notif.senderId,
    username: notif.senderUsername || 'User',
    name: notif.senderName || notif.senderUsername || 'User',
    avatar: notif.senderPhotoURL || getSafeAvatar(notif.senderPhotoURL, notif.senderName || notif.senderUsername, notif.senderId),
  };

  // 1. Send to server-authoritative API
  let serverIgnored = false;
  try {
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientId: notif.recipientId,
        senderId: notif.senderId,
        type: notif.type,
        message: notif.message,
        postId: notif.postId,
        detail: notif.detail,
        sender: senderObj,
      }),
    });
    if (res.ok) {
      const body = await res.json();
      if (body?.ignored) serverIgnored = true;
    }
  } catch (apiErr: any) {
    console.warn('Server notification API notice:', apiErr.message);
  }

  if (serverIgnored) return;

  // 2. Also attempt Supabase insert in background (catch RLS errors silently)
  try {
    const isUUID = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (isUUID(notif.recipientId) && isUUID(notif.senderId)) {
      await supabase.from('notifications').insert({
        recipient_id: notif.recipientId,
        sender_id: notif.senderId,
        type: notif.type,
        post_id: isUUID(notif.postId) ? notif.postId : null,
        message: notif.message,
        read: false,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    // Expected on anon key due to RLS
  }
}

export async function markNotificationsAsReadInSupabase(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {}

  try {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', userId)
      .eq('read', false);
  } catch {}
}

export async function markSingleNotificationAsReadInApi(userId: string, notificationId: string): Promise<void> {
  if (!userId || !notificationId) return;
  try {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, notificationId }),
    });
  } catch {}

  try {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('recipient_id', userId);
  } catch {}
}

export function subscribeUserNotifications(
  userId: string,
  callback: (notifs: Notification[]) => void
): () => void {
  let isSubscribed = true;

  const fetchNotifs = async () => {
    try {
      // 1. Always query server API first (reliable, persisted in data/notifications.json)
      let apiNotifs: Notification[] = [];
      try {
        const res = await fetch(`/api/notifications?userId=${encodeURIComponent(userId)}&limit=50`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.notifications)) {
            apiNotifs = data.notifications
              .filter(
                (row: any) =>
                  row.recipient_id !== row.sender_id &&
                  row.sender_id !== userId &&
                  !isClientUserRestricted(row.sender_id) &&
                  !isClientUserRestricted(row.sender?.id)
              )
              .map((row: any) => {
                const s = row.sender || {};
                return {
                  id: row.id,
                  type: (row.type as Notification['type']) || 'like',
                  user: {
                    id: s.id || row.sender_id,
                    username: s.username || 'User',
                    name: s.name || s.username || 'User',
                    avatar: s.avatar || getSafeAvatar(null, s.username || 'User', s.id || row.sender_id),
                    bio: '',
                    verified: s.verified ?? true,
                    aiTrustBadge: s.ai_trust_badge || 'Verified Human',
                    safetyScore: s.safety_score ?? 100,
                    followersCount: 0,
                    followingCount: 0,
                    postsCount: 0,
                    role: 'Member',
                    joinedDate: '',
                  },
                  text: row.message || 'New notification',
                  timestamp: row.created_at
                    ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Just now',
                  read: !!row.read,
                  detail: row.detail || undefined,
                };
              });
          }
        }
      } catch (err: any) {
        console.warn('API fetch notifications warning:', err.message);
      }

      // 2. Also check Supabase notifications table
      let sbNotifs: Notification[] = [];
      try {
        const { data } = await supabase
          .from('notifications')
          .select(`
            id,
            sender_id,
            type,
            message,
            read,
            created_at,
            sender:sender_id (
              id,
              username,
              name,
              avatar,
              verified,
              ai_trust_badge,
              safety_score
            )
          `)
          .eq('recipient_id', userId)
          .neq('sender_id', userId) // STRICT: filter out any self notifications!
          .order('created_at', { ascending: false })
          .limit(30);

        if (data && Array.isArray(data)) {
          sbNotifs = data
            .filter(
              (row: any) =>
                row.sender_id !== userId &&
                !isClientUserRestricted(row.sender_id) &&
                !isClientUserRestricted(row.sender?.id)
            )
            .map((row: any) => {
              const sender = row.sender || {};
              return {
                id: row.id,
                type: (row.type as Notification['type']) || 'like',
                user: {
                  id: sender.id || row.sender_id,
                  username: sender.username || 'User',
                  name: sender.name || sender.username || 'User',
                  avatar: sender.avatar || getSafeAvatar(null, sender.username, sender.id),
                  bio: '',
                  verified: sender.verified ?? true,
                  aiTrustBadge: sender.ai_trust_badge || 'Verified Human',
                  safetyScore: sender.safety_score ?? 100,
                  followersCount: 0,
                  followingCount: 0,
                  postsCount: 0,
                  role: 'Member',
                  joinedDate: '',
                },
                text: row.message || 'New notification',
                timestamp: row.created_at
                  ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Just now',
                read: row.read || false,
              };
            });
        }
      } catch {}

      if (!isSubscribed) return;

      // Merge results avoiding duplicate notifications by id or (sender + text)
      const merged: Notification[] = [...apiNotifs];
      for (const sbItem of sbNotifs) {
        if (!merged.some((m) => m.id === sbItem.id || (m.text === sbItem.text && m.user?.id === sbItem.user?.id))) {
          merged.push(sbItem);
        }
      }

      // Filter out any self-notifications or restricted users strictly!
      const finalNotifs = merged.filter((n) => n.user?.id !== userId && !isClientUserRestricted(n.user?.id));
      callback(finalNotifs);
    } catch (err: any) {
      console.warn('subscribeUserNotifications error:', err.message);
    }
  };

  fetchNotifs();

  // Polling every 3 seconds for snappy real-time cross-browser updates
  const pollInterval = setInterval(() => {
    if (isSubscribed) fetchNotifs();
  }, 3000);

  // Realtime Supabase channel
  const channel = supabase
    .channel(`notifs_user_${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      () => {
        fetchNotifs();
      }
    )
    .subscribe();

  return () => {
    isSubscribed = false;
    clearInterval(pollInterval);
    supabase.removeChannel(channel);
  };
}

// ================= SAVED POSTS ================= //

export async function getUserSavedPosts(userId: string): Promise<Post[]> {
  try {
    const { data, error } = await supabase
      .from('saved_posts')
      .select(`
        post:post_id (
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
            bio,
            verified,
            ai_trust_badge,
            safety_score,
            role
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    const postsList: Post[] = data
      .filter((row: any) => row.post && !isClientUserRestricted(row.post.profiles?.id || row.post.user_id))
      .map((row: any) => {
        const p = row.post;
        const author = p.profiles || {};
        return {
          id: p.id,
          user: {
            id: author.id || p.user_id || 'unknown',
            username: author.username || 'user',
            name: author.name || author.username || 'Member',
            avatar: author.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
            bio: author.bio || '',
            verified: author.verified ?? true,
            aiTrustBadge: author.ai_trust_badge || 'Verified Human',
            safetyScore: author.safety_score ?? 100,
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
            role: author.role || 'Member',
            joinedDate: '',
          },
          caption: p.caption || '',
          mediaUrl: p.media_url || undefined,
          mediaType: p.media_type || 'image',
          likes: p.likes_count || 0,
          isLiked: false,
          isBookmarked: true,
          comments: [],
          shares: 0,
          timestamp: p.created_at ? new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
          tags: p.hashtags || [],
          aiSafetyScore: p.ai_safety_score || 99,
          aiScanDetails: p.ai_scan_details || { nsfwScore: 0, violenceScore: 0, fakeConfidence: 0, labels: [], summary: 'Verified safe', safe: true },
        };
      });
    return await resolvePostsSignedUrls(postsList);
  } catch (err) {
    console.warn('Error fetching saved posts:', err);
    return [];
  }
}

export async function toggleSavePost(
  userId: string,
  postId: string,
  targetSaved?: boolean
): Promise<boolean> {
  let shouldSave: boolean;

  if (targetSaved !== undefined) {
    shouldSave = targetSaved;
  } else {
    const { data } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle();
    shouldSave = !data;
  }

  if (!shouldSave) {
    const { error } = await supabase.from('saved_posts').delete().eq('user_id', userId).eq('post_id', postId);
    if (error) {
      console.error('Supabase toggleSavePost delete error:', error.message);
      throw new Error(`Failed to unsave post: ${error.message}`);
    }
    return false;
  } else {
    const { error } = await supabase.from('saved_posts').upsert({
      user_id: userId,
      post_id: postId,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,post_id' });
    if (error) {
      console.error('Supabase toggleSavePost insert error:', error.message);
      throw new Error(`Failed to save post: ${error.message}`);
    }
    return true;
  }
}

// ================= DIRECT MESSAGING ================= //

export interface SendMessageOptions {
  mediaName?: string;
  mediaSize?: number;
  messageType?: MessageType;
  replyToMessageId?: string;
  replyTo?: ChatMessageReplyPreview;
  isForwarded?: boolean;
  forwardedFromMessageId?: string;
  recipientId?: string;
  optimisticMediaUrl?: string;
}

export async function sendMessage(
  senderId: string,
  receiverId: string,
  text: string,
  mediaUrl?: string,
  isVoice?: boolean,
  voiceDuration?: number | string,
  options?: SendMessageOptions
): Promise<string> {
  // 1. Enforce mutual block policy before creating message
  if (isClientUserRestricted(receiverId)) {
    throw new Error("Unable to send messages. Messaging isn't available between these accounts.");
  }
  const blockStatus = await checkUserBlockStatus(senderId, receiverId);
  if (blockStatus.restricted) {
    throw new Error("Unable to send messages. Messaging isn't available between these accounts.");
  }

  const convId = [senderId, receiverId].sort().join('_');
  const messageId = crypto.randomUUID();

  // Try with modern columns first
  const fullPayload: any = {
    id: messageId,
    conversation_id: convId,
    sender_id: senderId,
    receiver_id: receiverId,
    text: text || (isVoice ? '🎙️ Voice message' : ''),
    media_url: mediaUrl || null,
    is_ai_verified: true,
    is_voice: !!isVoice,
    voice_duration: voiceDuration ? (typeof voiceDuration === 'string' ? parseFloat(voiceDuration) : voiceDuration) : null,
    status: 'sent',
    created_at: new Date().toISOString(),
    reply_to_message_id: options?.replyToMessageId || null,
    is_forwarded: !!options?.isForwarded,
    forwarded_from_message_id: options?.forwardedFromMessageId || null,
    message_type: options?.messageType || (isVoice ? 'audio' : mediaUrl ? 'image' : 'text'),
    media_name: options?.mediaName || null,
    media_size: options?.mediaSize || null,
    reactions: {},
  };

  const { error } = await supabase.from('messages').insert(fullPayload);

  if (error) {
    // If optional columns do not exist yet in DB schema, fallback to basic insert with embedded metadata
    if (error.message && (error.message.includes('column') || error.message.includes('schema') || error.message.includes('status'))) {
      const metaObj: Record<string, any> = {};
      if (options?.replyToMessageId) metaObj.replyToMessageId = options.replyToMessageId;
      if (options?.replyTo) metaObj.replyTo = options.replyTo;
      if (options?.isForwarded) metaObj.isForwarded = true;
      if (options?.forwardedFromMessageId) metaObj.forwardedFromMessageId = options.forwardedFromMessageId;
      if (options?.messageType) metaObj.messageType = options.messageType;
      if (options?.mediaName) metaObj.mediaName = options.mediaName;
      if (options?.mediaSize) metaObj.mediaSize = options.mediaSize;
      if (voiceDuration) {
        metaObj.voiceDuration = typeof voiceDuration === 'string' ? parseFloat(voiceDuration) : voiceDuration;
      }

      const rawText = text || (isVoice ? '🎙️ Voice message' : '');
      const storedText = Object.keys(metaObj).length > 0
        ? JSON.stringify({ _v_meta: metaObj, text: rawText })
        : rawText;

      const basicPayload: any = {
        id: messageId,
        conversation_id: convId,
        sender_id: senderId,
        receiver_id: receiverId,
        text: storedText,
        media_url: mediaUrl || null,
        is_ai_verified: true,
        created_at: new Date().toISOString(),
      };
      const { error: fallbackError } = await supabase.from('messages').insert(basicPayload);
      if (fallbackError) {
        console.error('Supabase sendMessage fallback error:', fallbackError.message);
        throw new Error(`Failed to send message: ${fallbackError.message}`);
      }
      return messageId;
    }
    console.error('Supabase sendMessage error:', error.message);
    throw new Error(`Failed to send message: ${error.message}`);
  }
  return messageId;
}

export async function updateMessageText(
  messageId: string,
  senderId: string,
  newText: string
): Promise<void> {
  if (!messageId || !senderId) {
    throw new Error('Message ID and sender ID are required.');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = sessionData?.session?.user?.id;
  if (sessionUserId && sessionUserId !== senderId) {
    throw new Error('Forbidden: authenticated user does not match message sender.');
  }

  const { data: row, error: fetchErr } = await supabase
    .from('messages')
    .select('id, text, sender_id, receiver_id')
    .eq('id', messageId)
    .maybeSingle();

  if (fetchErr || !row) {
    throw new Error('Message not found or access denied.');
  }

  if (row.sender_id !== senderId) {
    throw new Error('Forbidden: only the original sender can edit a message.');
  }

  if (row.receiver_id) {
    if (isClientUserRestricted(row.receiver_id)) {
      throw new Error('Messaging unavailable due to account privacy restrictions.');
    }
    const blockStatus = await checkUserBlockStatus(senderId, row.receiver_id);
    if (blockStatus.restricted) {
      throw new Error('Messaging unavailable due to account privacy restrictions.');
    }
  }

  let embeddedMeta: any = null;
  if (row?.text && row.text.startsWith('{"_v_meta":')) {
    try {
      embeddedMeta = JSON.parse(row.text)._v_meta;
    } catch {}
  }

  const nowIso = new Date().toISOString();
  if (embeddedMeta) {
    embeddedMeta.editedAt = nowIso;
    const packed = JSON.stringify({ _v_meta: embeddedMeta, text: newText });
    const { error: metaErr } = await supabase
      .from('messages')
      .update({ text: packed })
      .eq('id', messageId)
      .eq('sender_id', senderId);
    if (metaErr) {
      throw new Error(`Failed to edit message: ${metaErr.message}`);
    }
    return;
  }

  const { error } = await supabase
    .from('messages')
    .update({
      text: newText,
      edited_at: nowIso,
    })
    .eq('id', messageId)
    .eq('sender_id', senderId);

  if (error) {
    if (error.message.includes('column') || error.message.includes('edited_at')) {
      // Fallback: update text only if edited_at column is not present
      const { error: fallbackErr } = await supabase
        .from('messages')
        .update({ text: newText })
        .eq('id', messageId)
        .eq('sender_id', senderId);
      if (fallbackErr) {
        throw new Error(`Failed to edit message: ${fallbackErr.message}`);
      }
      return;
    }
    throw new Error(`Failed to edit message: ${error.message}`);
  }
}

export async function deleteMessageSoft(
  messageId: string,
  senderId: string
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({
      text: 'This message was deleted',
      deleted_at: new Date().toISOString(),
      media_url: null,
      is_voice: false,
    })
    .eq('id', messageId)
    .eq('sender_id', senderId);

  if (error) {
    if (error.message.includes('column') || error.message.includes('deleted_at')) {
      // Fallback if deleted_at column does not exist yet: clear text and media
      const { error: fallbackErr } = await supabase
        .from('messages')
        .update({
          text: 'This message was deleted',
          media_url: null,
          is_voice: false,
        })
        .eq('id', messageId)
        .eq('sender_id', senderId);
      if (fallbackErr) {
        throw new Error(`Failed to delete message: ${fallbackErr.message}`);
      }
      return;
    }
    throw new Error(`Failed to delete message: ${error.message}`);
  }
}

export async function deleteMessagePermanent(
  messageId: string,
  senderId: string
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('sender_id', senderId);

  if (error) {
    throw new Error(`Failed to permanently delete message: ${error.message}`);
  }
}

export async function toggleMessageReaction(
  messageId: string,
  userId: string,
  emoji: string
): Promise<Record<string, string>> {
  try {
    const { data: row } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (!row) return {};

    // Verify caller is a conversation participant
    if (userId !== row.sender_id && userId !== row.receiver_id) {
      throw new Error('Forbidden: only conversation participants can react to this message.');
    }

    // Prevent message reactions when accounts have a mutual block relationship
    const partnerId = row.sender_id === userId ? row.receiver_id : row.sender_id;
    if (partnerId) {
      if (isClientUserRestricted(partnerId)) {
        throw new Error("Messaging isn't available between these accounts.");
      }
      const blockStatus = await checkUserBlockStatus(userId, partnerId);
      if (blockStatus.restricted) {
        throw new Error("Messaging isn't available between these accounts.");
      }
    }

    let currentReactions: Record<string, string> = {};
    let embeddedMeta: any = null;
    let rowText = row.text || '';

    if (rowText.startsWith('{"_v_meta":')) {
      try {
        const parsed = JSON.parse(rowText);
        embeddedMeta = parsed._v_meta;
        rowText = parsed.text || '';
        currentReactions = { ...(embeddedMeta?.reactions || {}) };
      } catch {}
    } else if (row.reactions && typeof row.reactions === 'object') {
      currentReactions = { ...row.reactions };
    }

    if (currentReactions[userId] === emoji) {
      delete currentReactions[userId];
    } else {
      currentReactions[userId] = emoji;
    }

    const { error: updateErr } = await supabase
      .from('messages')
      .update({ reactions: currentReactions })
      .eq('id', messageId);

    if (updateErr) {
      // Only fallback to _v_meta text packing if reactions column is absent AND caller is the sender
      // (DB trigger enforce_message_update_security forbids receivers from mutating text)
      if (
        (updateErr.message?.includes('reactions') || updateErr.message?.includes('column')) &&
        userId === row.sender_id
      ) {
        const newMeta = { ...(embeddedMeta || {}), reactions: currentReactions };
        const packed = JSON.stringify({ _v_meta: newMeta, text: rowText });
        const { error: metaErr } = await supabase
          .from('messages')
          .update({ text: packed })
          .eq('id', messageId)
          .eq('sender_id', userId);
        if (metaErr) {
          throw new Error(`Failed to update reaction: ${metaErr.message}`);
        }
      } else {
        throw new Error(`Failed to update reaction: ${updateErr.message}`);
      }
    }

    return currentReactions;
  } catch (err: any) {
    if (
      err?.message?.includes("Messaging isn't available") ||
      err?.message?.includes('Forbidden:') ||
      err?.message?.includes('Failed to update reaction')
    ) {
      throw err;
    }
    console.warn('Reaction toggle notice:', err.message);
    return {};
  }
}

export async function markMessagesAsDelivered(recipientId: string): Promise<void> {
  try {
    await supabase
      .from('messages')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      })
      .eq('receiver_id', recipientId)
      .eq('status', 'sent');
  } catch (err) {
    // Graceful ignore if column does not exist
  }
}

export async function markConversationAsRead(currentUserId: string, partnerId: string): Promise<void> {
  if (isClientUserRestricted(partnerId)) return;
  try {
    const convId = [currentUserId, partnerId].sort().join('_');
    await supabase
      .from('messages')
      .update({
        status: 'read',
        read_at: new Date().toISOString(),
      })
      .eq('conversation_id', convId)
      .eq('receiver_id', currentUserId)
      .neq('status', 'read');
  } catch (err) {
    // Graceful ignore if column does not exist
  }
}

export async function uploadVoiceNote(
  userId: string,
  audioBlob: Blob
): Promise<{ path: string; signedUrl: string }> {
  if (!(audioBlob instanceof Blob)) {
    throw new Error('Valid audio blob is required for voice note upload.');
  }

  // Verify authenticated Supabase session user and enforce strict path ownership (STOR-04)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    throw new Error(authError?.message || 'User must be authenticated to upload voice notes.');
  }

  if (userId && userId !== user.id) {
    throw new Error('Forbidden: voice note path owner does not match authenticated user.');
  }

  const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const filePath = `${user.id}/audio/voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

  if (!hasValidStorageObjectPath(filePath, user.id).valid) {
    throw new Error('Forbidden: invalid storage object path for voice note.');
  }

  const { data, error } = await supabase.storage
    .from('app-files')
    .upload(filePath, audioBlob, {
      contentType: audioBlob.type || 'audio/webm',
      upsert: false,
    });

  if (error || !data?.path) {
    console.error('Supabase uploadVoiceNote error:', error?.message);
    throw new Error(`Failed to upload voice note: ${error?.message || 'No storage path returned'}`);
  }

  // Never fall back to raw storage path when signed URL generation fails (STOR-01 / STOR-03)
  const signedUrl = await getSignedMediaUrl(data.path);
  if (!signedUrl) {
    throw new Error('Voice note uploaded but signed media URL could not be generated.');
  }
  return { path: data.path, signedUrl };
}

export function subscribeMessages(
  userId: string,
  otherUserId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  const convId = [userId, otherUserId].sort().join('_');
  let isSubscribed = true;

  const fetchMsgs = async () => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (data && isSubscribed) {
        // Asynchronously resolve signed media URLs and reply previews
        const mappedPromises = data.map(async (row) => {
          let resolvedMedia = row.media_url || undefined;
          if (resolvedMedia) {
            resolvedMedia = await getSignedMediaUrl(resolvedMedia);
          }

          let rowText = row.text || '';
          let embeddedMeta: any = null;
          if (rowText.startsWith('{"_v_meta":')) {
            try {
              const parsed = JSON.parse(rowText);
              embeddedMeta = parsed._v_meta;
              rowText = parsed.text || '';
            } catch (e) {
              // fallback
            }
          }

          const effectiveReplyToId = row.reply_to_message_id || embeddedMeta?.replyToMessageId;
          const effectiveIsForwarded = !!row.is_forwarded || !!embeddedMeta?.isForwarded;
          const effectiveForwardedFrom = row.forwarded_from_message_id || embeddedMeta?.forwardedFromMessageId;
          const effectiveMessageType = row.message_type || embeddedMeta?.messageType || (row.is_voice ? 'audio' : resolvedMedia ? 'image' : 'text');
          const effectiveMediaName = row.media_name || embeddedMeta?.mediaName;
          const effectiveMediaSize = row.media_size || embeddedMeta?.mediaSize;
          const effectiveReactions = (row.reactions as Record<string, string>) || embeddedMeta?.reactions || {};
          const effectiveEditedAt = row.edited_at || embeddedMeta?.editedAt;
          const effectiveDeletedAt = row.deleted_at || embeddedMeta?.deletedAt || (rowText === 'This message was deleted' ? (row.created_at || new Date().toISOString()) : undefined);

          // Reply preview resolution
          let replyPreview: ChatMessageReplyPreview | undefined = embeddedMeta?.replyTo;
          if (!replyPreview && effectiveReplyToId) {
            const parentRow = data.find((r) => r.id === effectiveReplyToId);
            if (parentRow) {
              let parentText = parentRow.text || '';
              if (parentText.startsWith('{"_v_meta":')) {
                try { parentText = JSON.parse(parentText).text || ''; } catch {}
              }
              const isParentDeleted = !!parentRow.deleted_at || parentText === 'This message was deleted';
              replyPreview = {
                id: parentRow.id,
                senderId: parentRow.sender_id,
                text: isParentDeleted ? 'Original message unavailable' : (parentText || (parentRow.is_voice ? '🎙️ Voice note' : 'Media attachment')),
                isVoice: parentRow.is_voice,
                mediaUrl: parentRow.media_url,
              };
            } else {
              replyPreview = {
                id: effectiveReplyToId,
                senderId: '',
                text: 'Original message unavailable',
              };
            }
          }

          const msg: ChatMessage = {
            id: row.id,
            senderId: row.sender_id,
            receiverId: row.receiver_id,
            text: effectiveDeletedAt ? 'This message was deleted' : rowText,
            timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
            isAIVerified: row.is_ai_verified ?? true,
            mediaUrl: effectiveDeletedAt ? undefined : resolvedMedia,
            mediaName: effectiveMediaName || undefined,
            mediaSize: effectiveMediaSize || undefined,
            messageType: effectiveMessageType,
            isVoice: effectiveDeletedAt ? false : (row.is_voice ?? (row.media_url?.includes('/audio/') || false)),
            voiceDuration: row.voice_duration || embeddedMeta?.voiceDuration || undefined,
            status: (row.status as any) || 'sent',
            delivered_at: row.delivered_at || undefined,
            read_at: row.read_at || undefined,
            created_at: row.created_at || undefined,
            replyToMessageId: effectiveReplyToId || undefined,
            replyTo: replyPreview,
            isForwarded: effectiveIsForwarded,
            forwardedFromMessageId: effectiveForwardedFrom || undefined,
            editedAt: effectiveEditedAt || undefined,
            deletedAt: effectiveDeletedAt || undefined,
            reactions: effectiveReactions,
          };
          return msg;
        });

        const msgs = await Promise.all(mappedPromises);
        if (isSubscribed) {
          callback(msgs);
          // Mark conversation as read since user is viewing it (only if not mutually blocked)
          if (!isClientUserRestricted(otherUserId)) {
            markConversationAsRead(userId, otherUserId);
          }
        }
      }
    } catch (err: any) {
      console.warn('Realtime messages fetch warning:', err.message);
    }
  };

  fetchMsgs();

  const channel = supabase
    .channel(`chat_${convId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
      () => {
        if (!isClientUserRestricted(otherUserId)) {
          fetchMsgs();
        }
      }
    )
    .subscribe();

  return () => {
    isSubscribed = false;
    supabase.removeChannel(channel);
  };
}

export function subscribeIncomingMessages(
  userId: string,
  onNewMessage: (message: ChatMessage) => void
): () => void {
  let isSubscribed = true;

  const channel = supabase
    .channel(`incoming_msgs_user_${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      },
      async (payload: any) => {
        if (!isSubscribed || !payload?.new) return;
        const row = payload.new;
        if (isClientUserRestricted(row.sender_id)) return;
        const status = await checkUserBlockStatus(userId, row.sender_id);
        if (status.restricted) return;

        let resolvedMedia = row.media_url || undefined;
        if (resolvedMedia) {
          resolvedMedia = await getSignedMediaUrl(resolvedMedia);
        }
        const msg: ChatMessage = {
          id: row.id,
          senderId: row.sender_id,
          receiverId: row.receiver_id,
          text: row.text || '',
          timestamp: row.created_at
            ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          isAIVerified: row.is_ai_verified ?? true,
          mediaUrl: resolvedMedia,
          isVoice: row.is_voice ?? (row.media_url?.includes('/audio/') || false),
          voiceDuration: row.voice_duration || undefined,
          status: (row.status as any) || 'sent',
          delivered_at: row.delivered_at || undefined,
          read_at: row.read_at || undefined,
          created_at: row.created_at || undefined,
        };
        onNewMessage(msg);
        // Mark message as delivered
        markMessagesAsDelivered(userId);
      }
    )
    .subscribe();

  return () => {
    isSubscribed = false;
    supabase.removeChannel(channel);
  };
}

export async function getRecentIncomingMessages(
  userId: string
): Promise<Array<{ id: string; senderId: string; text: string; mediaUrl?: string; isVoice?: boolean; createdAt: string }>> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, text, media_url, is_voice, created_at')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !data) return [];
    return data
      .filter((r: any) => !isClientUserRestricted(r.sender_id))
      .map((r: any) => ({
        id: r.id,
        senderId: r.sender_id,
        text: r.text || '',
        mediaUrl: r.media_url || undefined,
        isVoice: r.is_voice || r.media_url?.includes('/audio/') || false,
        createdAt: r.created_at || '',
      }));
  } catch (err) {
    console.warn('Notice loading recent incoming messages:', err);
    return [];
  }
}

export interface ConversationSnippet {
  partnerId: string;
  lastText: string;
  lastSenderId: string;
  lastTime: string;
  createdAt: string;
}

export function formatConversationTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();
    if (isYesterday) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export async function getUserConversationsOverview(
  userId: string
): Promise<Record<string, ConversationSnippet>> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, text, media_url, is_voice, created_at')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error || !data) return {};

    const overview: Record<string, ConversationSnippet> = {};
    for (const row of data) {
      const partnerId = row.sender_id === userId ? row.receiver_id : row.sender_id;
      if (!partnerId || overview[partnerId]) continue;

      if (isClientUserRestricted(partnerId)) {
        overview[partnerId] = {
          partnerId,
          lastText: 'Messaging unavailable',
          lastSenderId: row.sender_id,
          lastTime: row.created_at ? formatConversationTime(row.created_at) : '',
          createdAt: row.created_at || '',
        };
        continue;
      }

      let snippetText = row.text || '';
      if (row.is_voice || row.media_url?.includes('/audio/')) {
        snippetText = '🎙️ Voice note';
      } else if (row.media_url && !row.text) {
        snippetText = '📷 Photo';
      }

      overview[partnerId] = {
        partnerId,
        lastText: snippetText,
        lastSenderId: row.sender_id,
        lastTime: row.created_at ? formatConversationTime(row.created_at) : '',
        createdAt: row.created_at || '',
      };
    }
    return overview;
  } catch (err) {
    console.warn('Notice loading conversation overview:', err);
    return {};
  }
}

export async function getUserConversationPartners(userId: string): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, created_at')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    // Track most recent interaction timestamp per partner
    const partnerLastMessageTime = new Map<string, number>();
    data.forEach((row: any) => {
      const partnerId = row.sender_id === userId ? row.receiver_id : row.sender_id;
      if (partnerId) {
        const time = row.created_at ? new Date(row.created_at).getTime() : 0;
        if (!partnerLastMessageTime.has(partnerId) || time > partnerLastMessageTime.get(partnerId)!) {
          partnerLastMessageTime.set(partnerId, time);
        }
      }
    });

    const partnerIds = Array.from(partnerLastMessageTime.keys());
    if (partnerIds.length === 0) return [];

    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', partnerIds);

    if (profError || !profiles) return [];
    const mapped: User[] = profiles.map((row: any) => ({
      id: row.id,
      username: row.username || 'user',
      name: row.name || row.username || 'Member',
      avatar: row.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
      bio: row.bio || '',
      verified: row.verified ?? true,
      aiTrustBadge: row.ai_trust_badge || 'Verified Member',
      safetyScore: row.safety_score ?? 100,
      followersCount: row.followers_count ?? 0,
      followingCount: row.following_count ?? 0,
      postsCount: row.posts_count ?? 0,
      role: row.role || 'Member',
      joinedDate: row.created_at || '',
    }));

    // Sort partners by latest message descending
    mapped.sort((a, b) => {
      const timeA = partnerLastMessageTime.get(a.id) || 0;
      const timeB = partnerLastMessageTime.get(b.id) || 0;
      return timeB - timeA;
    });

    return await Promise.all(mapped.map((u) => resolveUserProfileSignedUrls(u)));
  } catch (err) {
    console.warn('Notice loading conversation partners:', err);
    return [];
  }
}


export async function getAllProfiles(excludeUserId?: string): Promise<User[]> {
  try {
    let query = supabase.from('profiles').select('*').limit(50);
    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    const mapped: User[] = data
      .filter((row: any) => !isClientUserRestricted(row.id))
      .map((row: any) => ({
        id: row.id,
        username: row.username || 'user',
        name: row.name || row.username || 'Member',
        avatar: row.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        bio: row.bio || '',
        verified: row.verified ?? true,
        aiTrustBadge: row.ai_trust_badge || 'Verified Human',
        safetyScore: row.safety_score ?? 100,
        followersCount: row.followers_count ?? 0,
        followingCount: row.following_count ?? 0,
        postsCount: row.posts_count ?? 0,
        role: row.role || 'Member',
        joinedDate: row.created_at ? new Date(row.created_at).toLocaleDateString() : 'Recently',
        website: row.website,
        location: row.location,
        cover: row.cover,
      }));
    return await Promise.all(mapped.map((u) => resolveUserProfileSignedUrls(u)));
  } catch (err) {
    console.warn('Error loading all profiles:', err);
    return [];
  }
}

// ================= REPORTS & AUDIT LOGS ================= //

export async function createReport(
  reporterId: string,
  targetId: string,
  targetType: 'post' | 'comment' | 'user',
  reason: string,
  description?: string
): Promise<void> {
  try {
    await supabase.from('reports').insert({
      reporter_id: reporterId,
      target_id: targetId,
      target_type: targetType,
      reason,
      description: description || '',
      status: 'pending',
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn('Supabase createReport notice:', err.message);
  }
}

export async function logModerationEvent(data: {
  targetId: string;
  targetType: 'post' | 'comment';
  userId: string;
  status: 'approved' | 'rejected' | 'flagged';
  category?: string;
  confidence?: number;
  reason?: string;
}): Promise<void> {
  try {
    // Try secure RPC first
    const { error: rpcErr } = await supabase.rpc('log_moderation_entry', {
      p_target_id: data.targetId,
      p_target_type: data.targetType,
      p_status: data.status,
      p_category: data.category || 'General',
      p_confidence: data.confidence ? Math.round(data.confidence) : 95,
      p_reason: data.reason || 'AI automated inspection',
    });

    if (rpcErr) {
      // Fallback direct insert if RPC not loaded in older migration
      await supabase.from('moderation_logs').insert({
        target_id: data.targetId,
        target_type: data.targetType,
        user_id: data.userId,
        status: data.status,
        category: data.category || null,
        confidence: data.confidence || null,
        reason: data.reason || null,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    console.warn('Supabase logModerationEvent notice:', err.message);
  }
}

// ================= ACCOUNT LIFECYCLE ================= //

export async function deleteCurrentUserAccount(): Promise<void> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    throw new Error('User is not authenticated.');
  }

  // Call atomic security definer RPC to erase all data in one transaction
  const { error: rpcErr } = await supabase.rpc('delete_current_user_account');
  if (rpcErr) {
    console.warn('delete_current_user_account RPC notice, running cascade cleanup:', rpcErr.message);
    const { error: delErr } = await supabase.from('profiles').delete().eq('id', user.id);
    if (delErr) {
      throw new Error(`Failed to delete account data: ${delErr.message}`);
    }
  }

  // Sign out the user
  await supabase.auth.signOut();
}

// ================= STORAGE (SUPABASE PRIVATE BUCKET: app-files) ================= //


export async function uploadFileToSupabase(
  file: File,
  folder: 'profileImages' | 'posts' | 'covers' | 'messages' = 'posts',
  callerUid?: string
): Promise<string> {
  if (!(file instanceof File)) {
    throw new Error('Valid file is required for upload.');
  }

  // Always use the authenticated Supabase user.
  // Never trust a user ID supplied by the browser.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(`Authentication check failed: ${authError.message}`);
  }

  if (!user) {
    throw new Error('User must be authenticated to upload files.');
  }

  if (callerUid && callerUid !== user.id) {
    throw new Error('Forbidden: upload user ID does not match authenticated user.');
  }

  // Generate a unique filename.
  const fileExt =
    file.name.split('.').pop()?.toLowerCase() || 'bin';

  const uniqueId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  // IMPORTANT:
  // Every file path starts with the authenticated user's ID.
  const filePath =
    `${user.id}/${folder}/${Date.now()}_${uniqueId}.${fileExt}`;

  if (!hasValidStorageObjectPath(filePath, user.id).valid) {
    throw new Error('Forbidden: invalid storage object path.');
  }

  const { data, error } = await supabase.storage
    .from('app-files')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) {
    console.error('Supabase Storage upload failed:', {
      message: error.message,
      name: error.name,
      path: filePath,
    });

    // IMPORTANT:
    // Do NOT create a bucket.
    // Do NOT try another bucket.
    // Do NOT convert the file to Base64.
    // Do NOT silently continue.
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  if (!data?.path) {
    throw new Error('Storage upload succeeded but no storage path was returned.');
  }

  // Store/return the permanent STORAGE PATH.
  // Do not return a temporary signed URL.
  return data.path;
}

export async function uploadProfilePicture(
  fileOrUid: File | string,
  maybeFile?: File
): Promise<string> {
  const file = fileOrUid instanceof File ? fileOrUid : (maybeFile as File);
  const callerUid = typeof fileOrUid === 'string' ? fileOrUid : undefined;
  if (!file) throw new Error('Valid file required for avatar upload.');
  return uploadFileToSupabase(file, 'profileImages', callerUid);
}

export async function uploadPostMedia(
  fileOrUid: File | string,
  maybeFile?: File
): Promise<string> {
  const file = fileOrUid instanceof File ? fileOrUid : (maybeFile as File);
  const callerUid = typeof fileOrUid === 'string' ? fileOrUid : undefined;
  if (!file) throw new Error('Valid file required for post media upload.');
  return uploadFileToSupabase(file, 'posts', callerUid);
}

export async function uploadCoverImage(
  fileOrUid: File | string,
  maybeFile?: File
): Promise<string> {
  const file = fileOrUid instanceof File ? fileOrUid : (maybeFile as File);
  const callerUid = typeof fileOrUid === 'string' ? fileOrUid : undefined;
  if (!file) throw new Error('Valid file required for cover image upload.');
  return uploadFileToSupabase(file, 'covers', callerUid);
}

export async function uploadMessageAttachment(
  fileOrUid: File | string,
  maybeFile?: File
): Promise<string> {
  const file = fileOrUid instanceof File ? fileOrUid : (maybeFile as File);
  const callerUid = typeof fileOrUid === 'string' ? fileOrUid : undefined;
  if (!file) throw new Error('Valid file required for message attachment.');
  return uploadFileToSupabase(file, 'messages', callerUid);
}

export async function deleteStorageFile(filePath: string): Promise<void> {
  if (
    !filePath ||
    filePath.startsWith('data:') ||
    filePath.startsWith('blob:')
  ) {
    return;
  }

  let bucketName = 'app-files';
  let objectPath = filePath;

  const extractedTarget = extractStorageObjectTarget(filePath);
  if (extractedTarget.isProtected && extractedTarget.objectPath) {
    bucketName = extractedTarget.bucketName;
    objectPath = extractedTarget.objectPath;
  } else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    // External non-Supabase URL — nothing to delete in storage
    return;
  }

  // Verify authenticated user and strict path ownership before deleting (STOR-04)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    throw new Error(authError?.message || 'User must be authenticated to delete storage files.');
  }

  if (!hasValidStorageObjectPath(objectPath, user.id).valid) {
    throw new Error('Forbidden: cannot delete storage file owned by another user.');
  }

  const { error } = await supabase.storage.from(bucketName).remove([objectPath]);
  if (error) {
    throw new Error(`Failed to delete storage file: ${error.message}`);
  }
}

// ============================================================================
// VERIXA MODERATION REVIEW & APPEAL CLIENT SERVICES
// ============================================================================

import {
  AppealRecord,
  ReportRecord,
  ReviewQueueItem,
  AdminActionRecord,
  AdminDashboardMetrics,
} from '../types';

async function getAuthHeaders(token?: string): Promise<Record<string, string>> {
  let authToken = token;
  if (!authToken) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      authToken = session?.access_token;
    } catch {
      // Fallback
    }
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

/**
 * Fetches real aggregated telemetry metrics for the admin dashboard
 */
export async function fetchAdminDashboardStats(token?: string): Promise<AdminDashboardMetrics> {
  const headers = await getAuthHeaders(token);
  const res = await fetch('/api/admin/dashboard-stats', { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch admin dashboard statistics.');
  }
  const data = await res.json();
  return data.stats;
}

/**
 * Fetches pending review queue items for moderator triage
 */
export async function fetchReviewQueue(
  token?: string,
  filters?: { status?: string; item_type?: string; priority?: string }
): Promise<ReviewQueueItem[]> {
  const headers = await getAuthHeaders(token);
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.item_type) params.append('item_type', filters.item_type);
  if (filters?.priority) params.append('priority', filters.priority);

  const url = `/api/admin/review-queue${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch review queue.');
  }
  const data = await res.json();
  return data.items || [];
}

/**
 * Resolves a review queue item (APPROVE / REJECT)
 */
export async function resolveReviewQueueItem(
  token: string | undefined,
  queueId: string,
  decision: 'APPROVE' | 'REJECT',
  notes: string = ''
): Promise<any> {
  const headers = await getAuthHeaders(token);
  const res = await fetch(`/api/admin/review-queue/${encodeURIComponent(queueId)}/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ decision, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to resolve review item.');
  }
  return res.json();
}

/**
 * Fetches appeals for administrative review
 */
export async function fetchAdminAppeals(
  token?: string,
  filters?: { status?: string; userId?: string }
): Promise<AppealRecord[]> {
  const headers = await getAuthHeaders(token);
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.userId) params.append('userId', filters.userId);

  const url = `/api/admin/appeals${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch appeals.');
  }
  const data = await res.json();
  return data.appeals || [];
}

/**
 * Resolves an appeal directly (APPROVE / REJECT)
 */
export async function resolveAdminAppeal(
  token: string | undefined,
  appealId: string,
  decision: 'APPROVE' | 'REJECT',
  notes: string = ''
): Promise<any> {
  const headers = await getAuthHeaders(token);
  const res = await fetch(`/api/admin/appeals/${encodeURIComponent(appealId)}/decision`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ decision, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to resolve appeal.');
  }
  return res.json();
}

/**
 * Fetches user reports for moderator review
 */
export async function fetchAdminReports(
  token?: string,
  filters?: { status?: string }
): Promise<ReportRecord[]> {
  const headers = await getAuthHeaders(token);
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);

  const url = `/api/admin/reports${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch reports.');
  }
  const data = await res.json();
  return data.reports || [];
}

/**
 * Resolves or dismisses a user report
 */
export async function resolveAdminReport(
  token: string | undefined,
  reportId: string,
  decision: 'APPROVE' | 'REJECT',
  notes: string = ''
): Promise<any> {
  const headers = await getAuthHeaders(token);
  const res = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ decision, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to resolve report.');
  }
  return res.json();
}

/**
 * Fetches immutable admin actions audit history
 */
export async function fetchAdminAuditActions(token?: string, limit: number = 50): Promise<AdminActionRecord[]> {
  const headers = await getAuthHeaders(token);
  const res = await fetch(`/api/admin/actions?limit=${limit}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch audit actions.');
  }
  const data = await res.json();
  return data.actions || [];
}

/**
 * Fetches threat alerts filtered by category
 */
export async function fetchThreatAlerts(
  token: string | undefined,
  category: string = 'all',
  limit: number = 50
): Promise<any[]> {
  const headers = await getAuthHeaders(token);
  const res = await fetch(`/api/admin/threat-alerts?category=${encodeURIComponent(category)}&limit=${limit}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch threat alerts.');
  }
  const data = await res.json();
  return data.alerts || [];
}

/**
 * User submits an appeal for blocked/quarantined content
 */
export async function submitModerationAppeal(
  token: string | undefined,
  input: {
    userId: string;
    analysisId: string;
    contentId: string;
    contentType?: string;
    originalDecision?: string;
    reason: string;
    appealText: string;
    evidenceUrls?: string[];
  }
): Promise<AppealRecord> {
  const headers = await getAuthHeaders(token);
  const res = await fetch('/api/moderation/appeals', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to submit appeal.');
  }
  const data = await res.json();
  return data.appeal;
}

/**
 * Community member submits a report against abusive content/user
 */
export async function submitCommunityReport(
  token: string | undefined,
  input: {
    reporterId: string;
    targetId: string;
    targetType: string;
    reason: string;
    description?: string;
    severity?: string;
  }
): Promise<ReportRecord> {
  const headers = await getAuthHeaders(token);
  const res = await fetch('/api/moderation/reports', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to submit report.');
  }
  const data = await res.json();
  return data.report;
}

// ============================================================================
// VERIXA PERSONALIZED FEED CLIENT HELPERS
// ============================================================================

/**
 * Fetches explainable personalized feed from the server-authoritative ranking engine
 */
export async function fetchPersonalizedFeed(
  userId?: string,
  limit: number = 30,
  options?: { category?: string; hashtag?: string }
): Promise<Post[]> {
  try {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    params.append('limit', String(limit));
    if (options?.category) params.append('category', options.category);
    if (options?.hashtag) params.append('hashtag', options.hashtag);

    const res = await fetch(`/api/feed/personalized?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.posts) && data.posts.length > 0) {
        // Map ranked items to Post interface with attached explainability
        const mappedPosts: Post[] = data.posts
          .filter((item: any) => !isClientUserRestricted(item?.post?.user_id))
          .map((item: any) => {
            const p = item.post;
            return {
              id: p.id,
              user: {
                id: p.user_id || 'unknown',
                username: p.author_username || 'member',
                name: p.author_name || 'VERIXA Member',
                avatar: p.author_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
                bio: 'Verified Member',
                verified: true,
                aiTrustBadge: 'Verified Member',
                safetyScore: p.author_safety_score ?? 100,
                followersCount: 0,
                followingCount: 0,
                postsCount: 0,
                role: p.author_role || 'Verified Member',
                joinedDate: 'Joined Today',
              },
              caption: p.caption || '',
              mediaUrl: p.media_url || undefined,
              mediaType: p.media_type || 'image',
              likes: p.likes_count || 0,
              comments: [],
              shares: p.shares_count || 0,
              timestamp: p.created_at ? new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
              tags: p.hashtags || ['VERIXA'],
              category: p.category || 'General',
              aiSafetyScore: p.ai_safety_score ?? 100,
              aiScanDetails: p.ai_scan_details || {
                nsfwScore: 0,
                violenceScore: 0,
                fakeConfidence: 0,
                labels: ['Verified Safe'],
                summary: 'Evaluated compliant by Neural Defense.',
                safe: true,
              },
              explainability: item.explainability,
            };
          });

        const postIds = mappedPosts.map((p) => p.id);
        const likedPostIds = new Set<string>();
        const savedPostIds = new Set<string>();

        if (userId && postIds.length > 0) {
          try {
            const [likesRes, savesRes, serverLikedArr] = await Promise.all([
              supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
              supabase.from('saved_posts').select('post_id').eq('user_id', userId).in('post_id', postIds),
              getUserLikedPostIds(userId),
            ]);
            if (likesRes.data) likesRes.data.forEach((r: any) => likedPostIds.add(r.post_id));
            if (savesRes.data) savesRes.data.forEach((r: any) => savedPostIds.add(r.post_id));
            if (Array.isArray(serverLikedArr)) serverLikedArr.forEach((id) => likedPostIds.add(id));
          } catch {
            // non-blocking
          }
        }

        const commentsByPost: Record<string, Comment[]> = {};
        if (postIds.length > 0) {
          try {
            const { data: commentsData } = await supabase
              .from('comments')
              .select(`
                id,
                post_id,
                user_id,
                text,
                toxicity_score,
                moderation_status,
                created_at,
                profiles:user_id (
                  id,
                  username,
                  name,
                  avatar,
                  bio,
                  verified,
                  ai_trust_badge,
                  safety_score
                )
              `)
              .in('post_id', postIds)
              .order('created_at', { ascending: true });

            if (commentsData) {
              commentsData.forEach((c: any) => {
                const author = c.profiles || {};
                const authorId = author.id || c.user_id || 'unknown';
                if (isClientUserRestricted(authorId)) return;

                const commentObj: Comment = {
                  id: c.id,
                  postId: c.post_id,
                  user: {
                    id: authorId,
                    username: author.username || 'user',
                    name: author.name || author.username || 'User',
                    avatar: author.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
                    bio: author.bio || '',
                    verified: author.verified ?? true,
                    aiTrustBadge: author.ai_trust_badge || 'Verified Human',
                    safetyScore: author.safety_score ?? 100,
                    followersCount: 0,
                    followingCount: 0,
                    postsCount: 0,
                    role: 'Verified Member',
                    joinedDate: 'Recently',
                  },
                  content: c.text || '',
                  timestamp: c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
                  toxicityScore: c.toxicity_score || 0,
                  categories: c.toxicity_score > 30 ? ['FLAGGED'] : ['SAFE'],
                  aiStatus: c.moderation_status === 'approved' ? 'safe' : 'flagged',
                  likes: 0,
                };
                if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
                commentsByPost[c.post_id].push(commentObj);
              });
            }
          } catch {
            // non-blocking
          }
        }

        mappedPosts.forEach((p) => {
          p.comments = commentsByPost[p.id] || [];
          p.isLiked = likedPostIds.has(p.id);
          p.isBookmarked = savedPostIds.has(p.id);
        });

        return resolvePostsSignedUrls(mappedPosts);
      }
    }
  } catch (err: any) {
    console.warn('Personalized feed server notice, falling back:', err.message);
  }

  // Fallback to default feed query if server feed is booting
  return fetchFeedPosts(userId, limit);
}

/**
 * Records explicit or implicit interaction telemetry
 */
export async function recordPostInteraction(
  userId: string,
  postId: string,
  interactionType: string,
  metadata?: Record<string, any>,
  dwellTimeMs?: number
): Promise<void> {
  if (!userId || !postId || !interactionType) return;
  try {
    await fetch('/api/feed/interact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        postId,
        interactionType,
        dwellTimeMs: dwellTimeMs || 0,
        metadata: metadata || {},
      }),
    });
  } catch {
    // Non-blocking telemetry
  }
}

/**
 * Fetches explainability factor breakdown for a specific post
 */
export async function fetchPostExplainability(
  userId: string,
  postId: string
): Promise<RecommendationExplainability | null> {
  try {
    const res = await fetch(`/api/feed/explain/${encodeURIComponent(postId)}?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.explainability || null;
  } catch {
    return null;
  }
}

/**
 * Toggles like on a story in Supabase and syncs with server/local storage
 */
export async function toggleStoryLike(
  storyId: string,
  userId: string,
  targetLiked?: boolean
): Promise<{ success: boolean; isLiked: boolean }> {
  try {
    // Check client & server mutual block status on story owner
    const { data: storyRow } = await supabase.from('stories').select('user_id').eq('id', storyId).maybeSingle();
    if (storyRow?.user_id && storyRow.user_id !== userId) {
      if (isClientUserRestricted(storyRow.user_id)) {
        return { success: false, isLiked: false };
      }
      const status = await checkUserBlockStatus(userId, storyRow.user_id);
      if (status.restricted) {
        return { success: false, isLiked: false };
      }
    }

    // Check server first to enforce mutual block restriction
    const { data: sessionData } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionData?.session?.access_token) {
      headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    const serverRes = await fetch(`/api/stories/${storyId}/like`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, targetLiked }),
    });
    if (serverRes.status === 403) {
      return { success: false, isLiked: false };
    }

    let shouldLike = targetLiked;
    if (shouldLike === undefined) {
      const { data } = await supabase
        .from('story_likes')
        .select('id')
        .eq('story_id', storyId)
        .eq('user_id', userId)
        .maybeSingle();
      shouldLike = !data;
    }

    if (shouldLike) {
      const { error } = await supabase.from('story_likes').upsert(
        {
          story_id: storyId,
          user_id: userId,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'story_id,user_id' }
      );
      if (error && !serverRes.ok) {
        return { success: false, isLiked: false };
      }
    } else {
      const { error } = await supabase
        .from('story_likes')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', userId);
      if (error && !serverRes.ok) {
        return { success: false, isLiked: true };
      }
    }

    return { success: true, isLiked: shouldLike };
  } catch (err: any) {
    console.warn('Notice syncing story like with Supabase:', err?.message || err);
    return { success: false, isLiked: false };
  }
}

/**
 * Records a story view in Supabase database idempotently using UUID[] array
 */
export async function recordStoryViewInDatabase(
  storyId: string,
  viewerUserId: string
): Promise<number> {
  if (!storyId || !viewerUserId) return 0;
  try {
    // 1. Prefer atomic SECURITY DEFINER RPC record_story_view (uses UUID[] and row-level locking)
    const { error: rpcErr } = await supabase.rpc('record_story_view', {
      p_story_id: storyId,
    });

    const { data } = await supabase
      .from('stories')
      .select('user_id, views_count, viewed_by')
      .eq('id', storyId)
      .maybeSingle();

    if (data) {
      if (data.user_id && data.user_id !== viewerUserId && isClientUserRestricted(data.user_id)) {
        return data.views_count || 0;
      }
      const list: string[] = Array.isArray(data.viewed_by) ? data.viewed_by : [];
      if (!rpcErr) {
        return data.views_count || list.length;
      }

      // 2. Fallback only if RPC is not yet deployed: ensure viewerUserId is a valid UUID before appending to UUID[]
      if (UUID_REGEX.test(viewerUserId) && !list.includes(viewerUserId)) {
        const nextList = [...list, viewerUserId];
        const nextCount = Math.max((data.views_count || 0) + 1, nextList.length);
        const { error: updateErr } = await supabase
          .from('stories')
          .update({
            views_count: nextCount,
            viewed_by: nextList,
          })
          .eq('id', storyId);
        if (!updateErr) {
          return nextCount;
        }
      }
      return data.views_count || list.length;
    }
  } catch (err) {
    console.warn('Notice recording story view in Supabase:', err);
  }
  return 0;
}

/**
 * Fetches real-time story insights (views_count, likes_count, viewed_by, liked_by) from database
 */
export async function fetchStoryInsightsFromDatabase(storyId: string): Promise<{
  viewsCount: number;
  likesCount: number;
  viewedBy: string[];
  likedBy: string[];
  viewers: Array<{ id: string; name: string; username: string; avatar: string }>;
  likers: Array<{ id: string; name: string; username: string; avatar: string }>;
}> {
  // 1. Try querying Supabase directly for live database values
  try {
    const { data: storyData } = await supabase
      .from('stories')
      .select('views_count, viewed_by')
      .eq('id', storyId)
      .maybeSingle();

    const { data: likesRows } = await supabase
      .from('story_likes')
      .select('user_id')
      .eq('story_id', storyId);

    if (storyData || likesRows) {
      const viewedBy: string[] = (Array.isArray(storyData?.viewed_by) ? storyData.viewed_by : []).filter(
        (uid: string) => !isClientUserRestricted(uid)
      );
      const likedBy: string[] = (likesRows ? likesRows.map((r: any) => r.user_id) : []).filter(
        (uid: string) => !isClientUserRestricted(uid)
      );
      const likesCount = likedBy.length;
      const viewsCount = viewedBy.length;

      // Fetch profiles for users who viewed or liked
      const userIdsToFetch = Array.from(new Set([...viewedBy, ...likedBy].filter(Boolean)));
      let profilesMap: Record<string, any> = {};
      if (userIdsToFetch.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, username, avatar')
          .in('id', userIdsToFetch);
        if (profiles) {
          const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
          profiles.forEach((p: any) => {
            const cleanUsername = p.username && !isUuid(p.username)
              ? p.username
              : (p.name && !isUuid(p.name) ? p.name.toLowerCase().replace(/[^a-z0-9_]/g, '') : `user_${p.id.slice(0, 6)}`);
            const cleanName = p.name && !isUuid(p.name) ? p.name : cleanUsername;
            profilesMap[p.id] = {
              id: p.id,
              name: cleanName,
              username: cleanUsername,
              avatar: p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=4285F4&color=fff&size=256&bold=true`,
            };
          });
        }
      }

      const viewers = viewedBy.map((uid) => profilesMap[uid] || {
        id: uid,
        name: `User ${uid.slice(0, 6)}`,
        username: `user_${uid.slice(0, 6)}`,
        avatar: `https://ui-avatars.com/api/?name=User&background=4285F4&color=fff&size=256&bold=true`,
      });

      const likers = likedBy.map((uid) => profilesMap[uid] || {
        id: uid,
        name: `User ${uid.slice(0, 6)}`,
        username: `user_${uid.slice(0, 6)}`,
        avatar: `https://ui-avatars.com/api/?name=User&background=4285F4&color=fff&size=256&bold=true`,
      });

      return {
        viewsCount,
        likesCount,
        viewedBy,
        likedBy,
        viewers,
        likers,
      };
    }
  } catch (err) {
    console.warn('Notice querying Supabase stories table:', err);
  }

  // 2. Query server endpoint as authoritative database fallback
  try {
    const res = await fetch(`/api/stories/${storyId}/insights`);
    if (res.ok) {
      const data = await res.json();
      return {
        viewsCount: data.viewsCount || 0,
        likesCount: data.likesCount || 0,
        viewedBy: data.viewedBy || [],
        likedBy: data.likedBy || [],
        viewers: data.viewers || [],
        likers: data.likers || [],
      };
    }
  } catch (err) {
    console.warn('Notice querying story insights API:', err);
  }

  return {
    viewsCount: 0,
    likesCount: 0,
    viewedBy: [],
    likedBy: [],
    viewers: [],
    likers: [],
  };
}

/**
 * Subscribes to real-time changes on a story's views and likes
 * Listens on both 'stories' table and 'story_likes' table.
 */
export function subscribeStoryInsightsRealtime(
  storyId: string,
  onUpdate: (data: {
    viewsCount: number;
    likesCount: number;
    viewedBy: string[];
    likedBy: string[];
    viewers: Array<{ id: string; name: string; username: string; avatar: string }>;
    likers: Array<{ id: string; name: string; username: string; avatar: string }>;
  }) => void
): () => void {
  // Fetch initial live insights immediately
  fetchStoryInsightsFromDatabase(storyId).then(onUpdate).catch(() => {});

  const channel = supabase
    .channel(`story_realtime_${storyId}_${Math.random().toString(36).substring(2, 9)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stories',
        filter: `id=eq.${storyId}`,
      },
      async () => {
        const fresh = await fetchStoryInsightsFromDatabase(storyId);
        onUpdate(fresh);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'story_likes',
        filter: `story_id=eq.${storyId}`,
      },
      async () => {
        const fresh = await fetchStoryInsightsFromDatabase(storyId);
        onUpdate(fresh);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

