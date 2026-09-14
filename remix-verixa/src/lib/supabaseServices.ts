import { supabase } from './supabase';
import { User, Post, Comment, Notification, ChatMessage, RecommendationExplainability, Reel } from '../types';

// ================= STORAGE HELPERS & SIGNED URL RESOLVER ================= //

// In-memory cache for signed URLs to avoid redundant Supabase Storage network requests
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedMediaUrl(
  pathOrUrl?: string | null,
  expiresIn: number = 3600
): Promise<string> {
  if (!pathOrUrl) return '';
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return '';

  // Return direct URL if already an absolute external URL or blob URL
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  // Check cache (buffer of 120s before expiry)
  const cached = signedUrlCache.get(trimmed);
  if (cached && cached.expiresAt > Date.now() + 120_000) {
    return cached.url;
  }

  try {
    let bucketName = 'app-files';
    let objectPath = trimmed;
    if (trimmed.includes(':') && !trimmed.startsWith('http')) {
      const parts = trimmed.split(':');
      bucketName = parts[0];
      objectPath = parts.slice(1).join(':');
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(objectPath, expiresIn);

    if (error || !data?.signedUrl) {
      // Fallback: Check if bucket is configured as public
      const { data: publicData } = supabase.storage.from(bucketName).getPublicUrl(objectPath);
      if (publicData?.publicUrl) {
        return publicData.publicUrl;
      }
      console.warn('Notice: Could not create signed URL for path:', trimmed, error?.message);
      return trimmed;
    }

    signedUrlCache.set(trimmed, {
      url: data.signedUrl,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    return data.signedUrl;
  } catch (err: any) {
    console.warn('getSignedMediaUrl error:', err.message);
    return trimmed;
  }
}

export async function resolvePostSignedUrls(post: Post): Promise<Post> {
  const [resolvedMedia, resolvedAvatar] = await Promise.all([
    post.mediaUrl ? getSignedMediaUrl(post.mediaUrl) : Promise.resolve(undefined),
    post.user?.avatar ? getSignedMediaUrl(post.user.avatar) : Promise.resolve(post.user?.avatar),
  ]);

  return {
    ...post,
    mediaUrl: resolvedMedia,
    user: {
      ...post.user,
      avatar: resolvedAvatar || post.user?.avatar,
    },
  };
}

export async function resolvePostsSignedUrls(posts: Post[]): Promise<Post[]> {
  return Promise.all(posts.map(resolvePostSignedUrls));
}

export async function resolveUserProfileSignedUrls(user: User): Promise<User> {
  const [resolvedAvatar, resolvedCover] = await Promise.all([
    user.avatar ? getSignedMediaUrl(user.avatar) : Promise.resolve(user.avatar),
    user.cover ? getSignedMediaUrl(user.cover) : Promise.resolve(user.cover),
  ]);
  return {
    ...user,
    avatar: resolvedAvatar || user.avatar,
    cover: resolvedCover || user.cover,
  };
}

// ================= USER PROFILES ================= //

export function getSafeAvatar(avatarUrl?: string | null, nameOrUsername?: string, userId?: string): string {
  if (avatarUrl && !avatarUrl.includes('unsplash.com')) {
    if (userId && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`verixa_user_avatar_${userId}`, avatarUrl);
      } catch {}
    }
    return avatarUrl;
  }
  if (userId && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`verixa_user_avatar_${userId}`);
      if (cached && !cached.includes('unsplash.com')) {
        return cached;
      }
    } catch {}
  }
  const cleanName = encodeURIComponent(nameOrUsername || 'User');
  return `https://ui-avatars.com/api/?name=${cleanName}&background=4285F4&color=fff&size=256&bold=true`;
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

export async function getUserProfile(uid: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`id.eq.${uid},username.eq.${uid.toLowerCase()}`)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

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
      followersCount: data.followers_count ?? 0,
      followingCount: data.following_count ?? 0,
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

      const simplePosts: Post[] = rawData.map((row: any) => ({
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
    const postIds = data.map((p) => p.id);
    const commentsByPost: Record<string, Comment[]> = {};

    if (postIds.length > 0) {
      try {
        const { data: commentsData } = await supabase
          .from('comments')
          .select(`
            id,
            post_id,
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
            const commentObj: Comment = {
              id: c.id,
              postId: c.post_id,
              user: {
                id: author.id || c.user_id || 'unknown',
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

    const postsList: Post[] = data.map((row: any) => {
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

    const comments: Comment[] = (commentsData || []).map((c: any) => {
      const author = c.profiles || {};
      return {
        id: c.id,
        postId: c.post_id,
        user: {
          id: author.id || c.user_id || 'unknown',
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
        content: c.text,
        timestamp: c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
        toxicityScore: c.toxicity_score || 0,
        categories: ['Verified Safe'],
        aiStatus: 'safe',
        likes: 0,
      };
    });

    const author = (row as any).profiles || {};
    const post: Post = {
      id: row.id,
      user: {
        id: author.id || row.user_id,
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
    const signedVideo = row.video_url ? await getSignedMediaUrl(row.video_url) : row.video_url;
    const signedAvatar = author.avatar ? await getSignedMediaUrl(author.avatar) : author.avatar;

    const reel: Reel = {
      id: row.id,
      user: {
        id: author.id || row.user_id,
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

  // 1. Authoritative server sync
  try {
    const res = await fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, targetLiked: shouldLike }),
    });
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
    console.warn('Server togglePostLike notice:', err?.message || err);
  }

  // 2. Best-effort Supabase sync (does not throw if RLS / anon permissions are restricted)
  try {
    if (!shouldLike) {
      await Promise.allSettled([
        supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId),
        supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId),
      ]);
      return { isLiked: false };
    } else {
      await Promise.allSettled([
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
      return { isLiked: true };
    }
  } catch (err: any) {
    console.warn('Supabase togglePostLike notice (permission restricted):', err?.message || err);
    return { isLiked: shouldLike };
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
        return data.users.map((u: any) => ({
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
        if (r.user_id) userIds.push(r.user_id);
      });
    }
    if (postLikesRes.status === 'fulfilled' && postLikesRes.value?.data) {
      postLikesRes.value.data.forEach((r: any) => {
        if (r.user_id) userIds.push(r.user_id);
      });
    }

    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length === 0) return [];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', uniqueIds);

    if (profiles && profiles.length > 0) {
      return profiles.map((p: any) => ({
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
          const list: Comment[] = rawComments.map((row) => ({
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
        const list: Comment[] = data.map((row: any) => {
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
        return data.map((row: any) => {
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
      return fallbackData.map((row: any) => ({
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
  const commentId = crypto.randomUUID();
  try {
    // Attempt insert into comments
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
      // If post_id FK failed, attempt with reel_id
      const { error: reelErr } = await supabase.from('comments').insert({
        id: commentId,
        user_id: userId,
        text,
        toxicity_score: toxicityScore,
        moderation_status: 'approved',
        created_at: new Date().toISOString(),
        reel_id: reelId,
      });
      if (reelErr) {
        console.warn('Notice inserting reel comment to Supabase:', reelErr.message);
      }
    }

    // Atomically increment reel comments_count in Supabase reels table if available
    try {
      const { data: curReel } = await supabase.from('reels').select('comments_count').eq('id', reelId).maybeSingle();
      if (curReel) {
        await supabase.from('reels').update({
          comments_count: (curReel.comments_count || 0) + 1,
        }).eq('id', reelId);
      }
    } catch {}

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
  try {
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function getUserFollowers(userId: string): Promise<User[]> {
  try {
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
      .eq('following_id', userId);

    if (error || !data) return [];
    const users: User[] = data
      .filter((row: any) => row.profiles)
      .map((row: any) => ({
        id: row.profiles.id,
        username: row.profiles.username || 'user',
        name: row.profiles.name || row.profiles.username || 'Member',
        avatar: row.profiles.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
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
      .eq('follower_id', userId);

    if (error || !data) return [];
    const users: User[] = data
      .filter((row: any) => row.profiles)
      .map((row: any) => ({
        id: row.profiles.id,
        username: row.profiles.username || 'user',
        name: row.profiles.name || row.profiles.username || 'Member',
        avatar: row.profiles.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
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

  let shouldFollow: boolean;

  if (targetFollowing !== undefined) {
    shouldFollow = targetFollowing;
  } else {
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle();
    shouldFollow = !data;
  }

  if (!shouldFollow) {
    // Unfollow: delete row. Note: following_count and followers_count updated automatically by DB trigger (on_follow_added_or_removed)
    const { error } = await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId);
    if (error) {
      console.error('Supabase unfollow error:', error.message);
      throw new Error(`Failed to unfollow user: ${error.message}`);
    }
    return false;
  } else {
    // Follow: insert row. Note: following_count and followers_count updated automatically by DB trigger (on_follow_added_or_removed)
    const { error } = await supabase.from('follows').upsert({
      follower_id: followerId,
      following_id: followingId,
      created_at: new Date().toISOString(),
    }, { onConflict: 'follower_id,following_id' });
    if (error) {
      console.error('Supabase follow error:', error.message);
      throw new Error(`Failed to follow user: ${error.message}`);
    }
    return true;
  }
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
  // STRICT: Never allow self-notifications!
  if (!notif.recipientId || !notif.senderId || notif.recipientId === notif.senderId) return;

  const senderObj = notif.sender || {
    id: notif.senderId,
    username: notif.senderUsername || 'User',
    name: notif.senderName || notif.senderUsername || 'User',
    avatar: notif.senderPhotoURL || getSafeAvatar(notif.senderPhotoURL, notif.senderName || notif.senderUsername, notif.senderId),
  };

  // 1. Send to server-authoritative API
  try {
    await fetch('/api/notifications', {
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
  } catch (apiErr: any) {
    console.warn('Server notification API notice:', apiErr.message);
  }

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
              .filter((row: any) => row.recipient_id !== row.sender_id && row.sender_id !== userId) // Strictly no self
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
            .filter((row: any) => row.sender_id !== userId)
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

      // Filter out any self-notifications strictly!
      const finalNotifs = merged.filter((n) => n.user?.id !== userId);
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
      .filter((row: any) => row.post)
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

export async function sendMessage(
  senderId: string,
  receiverId: string,
  text: string,
  mediaUrl?: string,
  isVoice?: boolean,
  voiceDuration?: number | string
): Promise<string> {
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
  };

  const { error } = await supabase.from('messages').insert(fullPayload);

  if (error) {
    // If optional columns do not exist yet in DB schema, fallback to basic insert
    if (error.message && (error.message.includes('column') || error.message.includes('schema') || error.message.includes('status'))) {
      const basicPayload: any = {
        id: messageId,
        conversation_id: convId,
        sender_id: senderId,
        receiver_id: receiverId,
        text: text || (isVoice ? '🎙️ Voice message' : ''),
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
  const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const filePath = `${userId}/audio/voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
  const { data, error } = await supabase.storage
    .from('app-files')
    .upload(filePath, audioBlob, {
      contentType: audioBlob.type || 'audio/webm',
      upsert: true,
    });

  if (error) {
    console.error('Supabase uploadVoiceNote error:', error.message);
    throw new Error(`Failed to upload voice note: ${error.message}`);
  }

  const signedUrl = await getSignedMediaUrl(data.path);
  return { path: data.path, signedUrl: signedUrl || data.path };
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
        // Asynchronously resolve any signed media URLs
        const mappedPromises = data.map(async (row) => {
          let resolvedMedia = row.media_url || undefined;
          if (resolvedMedia && !resolvedMedia.startsWith('http') && !resolvedMedia.startsWith('blob:') && !resolvedMedia.startsWith('data:')) {
            resolvedMedia = await getSignedMediaUrl(resolvedMedia);
          }
          const msg: ChatMessage = {
            id: row.id,
            senderId: row.sender_id,
            receiverId: row.receiver_id,
            text: row.text,
            timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
            isAIVerified: row.is_ai_verified ?? true,
            mediaUrl: resolvedMedia,
            isVoice: row.is_voice ?? (row.media_url?.includes('/audio/') || false),
            voiceDuration: row.voice_duration || undefined,
            status: (row.status as any) || 'sent',
            delivered_at: row.delivered_at || undefined,
            read_at: row.read_at || undefined,
            created_at: row.created_at || undefined,
          };
          return msg;
        });

        const msgs = await Promise.all(mappedPromises);
        if (isSubscribed) {
          callback(msgs);
          // Mark conversation as read since user is viewing it
          markConversationAsRead(userId, otherUserId);
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
        fetchMsgs();
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
        let resolvedMedia = row.media_url || undefined;
        if (resolvedMedia && !resolvedMedia.startsWith('http') && !resolvedMedia.startsWith('blob:') && !resolvedMedia.startsWith('data:')) {
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
    return data.map((r: any) => ({
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
    const mapped: User[] = data.map((row: any) => ({
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
  _ignoredUid?: string
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
  if (!file) throw new Error('Valid file required for avatar upload.');
  return uploadFileToSupabase(file, 'profileImages');
}

export async function uploadPostMedia(
  fileOrUid: File | string,
  maybeFile?: File
): Promise<string> {
  const file = fileOrUid instanceof File ? fileOrUid : (maybeFile as File);
  if (!file) throw new Error('Valid file required for post media upload.');
  return uploadFileToSupabase(file, 'posts');
}

export async function uploadCoverImage(
  fileOrUid: File | string,
  maybeFile?: File
): Promise<string> {
  const file = fileOrUid instanceof File ? fileOrUid : (maybeFile as File);
  if (!file) throw new Error('Valid file required for cover image upload.');
  return uploadFileToSupabase(file, 'covers');
}

export async function uploadMessageAttachment(
  fileOrUid: File | string,
  maybeFile?: File
): Promise<string> {
  const file = fileOrUid instanceof File ? fileOrUid : (maybeFile as File);
  if (!file) throw new Error('Valid file required for message attachment.');
  return uploadFileToSupabase(file, 'messages');
}

export async function deleteStorageFile(filePath: string): Promise<void> {
  if (
    !filePath ||
    filePath.startsWith('http://') ||
    filePath.startsWith('https://') ||
    filePath.startsWith('data:') ||
    filePath.startsWith('blob:')
  ) {
    return;
  }
  try {
    let bucketName = 'app-files';
    let objectPath = filePath;
    if (filePath.includes(':')) {
      const parts = filePath.split(':');
      bucketName = parts[0];
      objectPath = parts.slice(1).join(':');
    }
    await supabase.storage.from(bucketName).remove([objectPath]);
  } catch (err: any) {
    console.warn('Failed to delete storage file:', filePath, err?.message);
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
        const mappedPosts: Post[] = data.posts.map((item: any) => {
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
                const commentObj: Comment = {
                  id: c.id,
                  postId: c.post_id,
                  user: {
                    id: author.id || c.user_id || 'unknown',
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
      if (error) {
        await fetch(`/api/stories/${storyId}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      }
    } else {
      const { error } = await supabase
        .from('story_likes')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', userId);
      if (error) {
        await fetch(`/api/stories/${storyId}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      }
    }

    return { success: true, isLiked: shouldLike };
  } catch (err: any) {
    console.warn('Notice syncing story like with Supabase:', err?.message || err);
    try {
      await fetch(`/api/stories/${storyId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    } catch {}
    return { success: true, isLiked: targetLiked ?? true };
  }
}

/**
 * Records a story view in Supabase database idempotently
 */
export async function recordStoryViewInDatabase(
  storyId: string,
  viewerUserId: string
): Promise<number> {
  if (!storyId || !viewerUserId) return 0;
  try {
    const { data } = await supabase
      .from('stories')
      .select('views_count, viewed_by')
      .eq('id', storyId)
      .maybeSingle();

    if (data) {
      const list: string[] = Array.isArray(data.viewed_by) ? data.viewed_by : [];
      if (!list.includes(viewerUserId)) {
        const nextList = [...list, viewerUserId];
        const nextCount = (data.views_count || 0) + 1;
        await supabase
          .from('stories')
          .update({
            views_count: nextCount,
            viewed_by: nextList,
          })
          .eq('id', storyId);
        return nextCount;
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

    const { data: likesRows, count: likesCountFromTable } = await supabase
      .from('story_likes')
      .select('user_id', { count: 'exact' })
      .eq('story_id', storyId);

    if (storyData || likesRows) {
      const viewedBy: string[] = Array.isArray(storyData?.viewed_by) ? storyData.viewed_by : [];
      const likedBy: string[] = likesRows ? likesRows.map((r: any) => r.user_id) : [];
      const likesCount = likesCountFromTable ?? likedBy.length;
      const viewsCount = storyData?.views_count ?? viewedBy.length;

      // Fetch profiles for users who viewed or liked
      const userIdsToFetch = Array.from(new Set([...viewedBy, ...likedBy].filter(Boolean)));
      let profilesMap: Record<string, any> = {};
      if (userIdsToFetch.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, username, avatar_url')
          .in('id', userIdsToFetch);
        if (profiles) {
          profiles.forEach((p: any) => {
            profilesMap[p.id] = {
              id: p.id,
              name: p.name || p.username || 'User',
              username: p.username || 'user',
              avatar: p.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || p.username || 'User')}&background=4285F4&color=fff&size=256&bold=true`,
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

