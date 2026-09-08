import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Post,
  Reel,
  Story,
  Notification,
  ChatMessage,
  ModerationAuditLog,
  PageView,
  UserSettings,
  DEFAULT_SETTINGS,
  Comment,
} from '../types';
import { supabase } from '../lib/supabase';
import {
  saveUserProfile,
  getUserProfile,
  createPost,
  fetchFeedPosts,
  fetchPersonalizedFeed,
  recordPostInteraction,
  subscribePosts,
  deletePost,
  updatePost,
  togglePostLike,
  addComment as addSupabaseComment,
  deleteComment as deleteSupabaseComment,
  toggleFollowUser,
  getUserFollowing,
  subscribeUserNotifications,
  markNotificationsAsReadInSupabase,
  toggleSavePost,
  sendMessage as sendSupabaseMessage,
  subscribeMessages as subscribeSupabaseMessages,
  subscribeIncomingMessages,
  getRecentIncomingMessages,
  logModerationEvent,
  getSignedMediaUrl,
  getUserLikedPostIds,
  resolvePostSignedUrls,
  deleteStorageFile,
  toggleStoryLike,
  createNotification,
  markSingleNotificationAsReadInApi,
} from '../lib/supabaseServices';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

interface BlockedCommentInfo {
  open: boolean;
  commentText: string;
  reason: string;
  toxicityScore: number;
  categories: string[];
  suggestion: string;
  confidence?: number;
  contentType?: 'comment' | 'caption' | 'title' | 'content';
  message?: string;
  languageDetected?: string;
}

interface AppContextType {
  currentPage: PageView;
  setCurrentPage: (page: PageView) => void;
  canGoBack: boolean;
  goBack: () => void;
  pendingVerificationEmail: string;
  setPendingVerificationEmail: (email: string) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, username: string, email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
  isUnauthorizedDomainModalOpen: boolean;
  openUnauthorizedDomainModal: () => void;
  closeUnauthorizedDomainModal: () => void;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  
  // Feed & Posts
  posts: Post[];
  isPostsLoading: boolean;
  postsError: string | null;
  refreshPosts: () => Promise<void>;
  addPost: (
    caption: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video',
    visibility?: 'public' | 'friends' | 'private',
    tags?: string[]
  ) => Promise<{ success: boolean; error?: string; scanDetails?: any }>;
  editPost: (
    postId: string,
    updates: { caption?: string; visibility?: string; tags?: string[] }
  ) => Promise<void>;
  removePost: (postId: string) => Promise<void>;
  likePost: (postId: string) => Promise<void>;
  bookmarkPost: (postId: string) => Promise<void>;
  addComment: (postId: string, text: string) => Promise<{ allowed: boolean; reason?: string }>;
  removeComment: (postId: string, commentId: string) => Promise<void>;
  
  // Follows
  followingUserIds: Set<string>;
  followUser: (targetUserId: string) => Promise<void>;
  isUserFollowing: (userId: string) => boolean;

  // Stories & Reels
  stories: Story[];
  addStory: (mediaUrl: string, mediaType?: 'image' | 'video', frames?: Array<{ timestamp: number; data: string }>) => Promise<boolean>;
  viewStory: (storyId: string) => Promise<void>;
  likeStory: (storyId: string, explicitAuthorId?: string, explicitAuthorName?: string) => Promise<boolean>;
  sendStoryReaction: (storyId: string, authorId: string, reactionText: string, authorName?: string) => Promise<boolean>;
  isStoryUploading: boolean;
  storyUploadStage: string;
  setIsStoryUploading: (val: boolean) => void;
  setStoryUploadStage: (stage: string) => void;
  reels: Reel[];
  addReel: (videoUrl: string, caption?: string, audioTitle?: string, tags?: string[], frames?: Array<{ timestamp: number; data: string }>) => Promise<boolean>;
  likeReel: (reelId: string) => void;
  
  // Moderation Popup
  blockedCommentModal: BlockedCommentInfo;
  closeBlockedCommentModal: () => void;
  
  // Direct Messages & Unread Indicators
  activeChatUser: User | null;
  setActiveChatUser: (user: User | null) => void;
  messages: ChatMessage[];
  isMessagesLoading: boolean;
  sendMessage: (text: string, mediaUrl?: string) => Promise<void>;
  unreadChatSenderIds: Set<string>;
  unreadChatSenders: Record<string, { count: number; lastText: string; lastTime: string }>;
  totalUnreadMessagesCount: number;
  markChatAsRead: (senderUserId: string) => void;
  
  // Notifications
  notifications: Notification[];
  unreadNotifCount: number;
  markNotificationsAsRead: () => void;
  markSingleNotificationAsRead: (notifId: string) => void;
  
  // Audit Logs & Statistics
  auditLogs: ModerationAuditLog[];
  stats: {
    toxicBlocked: number;
    fakeProfilesDetected: number;
    usersProtected: number;
    aiAccuracy: number;
    dailyScans: string;
  };
  
  // Settings
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  
  // Toasts
  toasts: Toast[];
  addToast: (type: Toast['type'], title: string, message: string) => void;
  removeToast: (id: string) => void;
  
  // Explore
  selectedExploreCategory: string;
  setSelectedExploreCategory: (cat: string) => void;
  exploreSearchQuery: string;
  setExploreSearchQuery: (query: string) => void;

  // Image / Video Scanner Modal state
  scannerModal: { open: boolean; type: 'image' | 'video' };
  openScannerModal: (type: 'image' | 'video') => void;
  closeScannerModal: () => void;

  // Profile Navigation
  viewingProfileUserId: string | null;
  openUserProfile: (userOrId?: string | User) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPage, _setCurrentPage] = useState<PageView>('landing');
  const [pageHistory, setPageHistory] = useState<PageView[]>(['landing']);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Real Data states (clean initial values)
  const [posts, setPosts] = useState<Post[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState<boolean>(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const hasLoadedPostsOnce = useRef<boolean>(false);
  
  const [stories, setStories] = useState<Story[]>([]);
  const [isStoryUploading, setIsStoryUploading] = useState<boolean>(false);
  const [storyUploadStage, setStoryUploadStage] = useState<string>('');
  const [reels, setReels] = useState<Reel[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState<boolean>(false);
  const [activeChatUser, setActiveChatUser] = useState<User | null>(null);
  const [unreadChatSenders, setUnreadChatSenders] = useState<
    Record<string, { count: number; lastText: string; lastTime: string }>
  >({});

  const unreadChatSenderIds = React.useMemo(
    () => new Set(Object.keys(unreadChatSenders)),
    [unreadChatSenders]
  );
  const totalUnreadMessagesCount = React.useMemo(
    () => Object.values(unreadChatSenders).reduce((sum, item) => sum + item.count, 0),
    [unreadChatSenders]
  );
  const [followingUserIds, setFollowingUserIds] = useState<Set<string>>(new Set());
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [auditLogs, setAuditLogs] = useState<ModerationAuditLog[]>([]);

  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('verixa_user_settings') : null;
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_SETTINGS;
  });

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selectedExploreCategory, setSelectedExploreCategory] = useState<string>('All');
  const [exploreSearchQuery, setExploreSearchQuery] = useState<string>('');
  
  // Navigation helper with history tracking
  const setCurrentPage = (page: PageView) => {
    setPageHistory((prev) => {
      if (prev[prev.length - 1] !== page) {
        return [...prev, page];
      }
      return prev;
    });
    _setCurrentPage(page);
  };

  const goBack = () => {
    setPageHistory((prev) => {
      if (prev.length > 1) {
        const newHistory = [...prev];
        newHistory.pop();
        const prevPage = newHistory[newHistory.length - 1];
        _setCurrentPage(prevPage);
        return newHistory;
      } else {
        const fallback: PageView = currentUser ? 'home' : 'landing';
        _setCurrentPage(fallback);
        return [fallback];
      }
    });
  };

  const canGoBack = (() => {
    if (pageHistory.length <= 1) return false;
    if (currentPage === 'landing' || currentPage === 'home') return false;
    return true;
  })();

  // Community & Safety stats
  const [stats, setStats] = useState({
    toxicBlocked: 1482920,
    fakeProfilesDetected: 28490,
    usersProtected: 520400,
    aiAccuracy: 99.8,
    dailyScans: '1.2M+',
  });

  // Blocked comment modal state
  const [blockedCommentModal, setBlockedCommentModal] = useState<BlockedCommentInfo>({
    open: false,
    commentText: '',
    reason: '',
    toxicityScore: 0,
    categories: [],
    suggestion: '',
  });

  // Scanner Modal State
  const [scannerModal, setScannerModal] = useState<{ open: boolean; type: 'image' | 'video' }>({
    open: false,
    type: 'image',
  });

  // Unauthorized Domain / OAuth Modal State
  const [isUnauthorizedDomainModalOpen, setIsUnauthorizedDomainModalOpen] = useState(false);
  const openUnauthorizedDomainModal = () => setIsUnauthorizedDomainModalOpen(true);
  const closeUnauthorizedDomainModal = () => setIsUnauthorizedDomainModalOpen(false);

  // Profile viewing state
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);

  const openUserProfile = (userOrId?: string | User) => {
    if (!userOrId) {
      setViewingProfileUserId(currentUser?.id || null);
    } else if (typeof userOrId === 'string') {
      setViewingProfileUserId(userOrId);
    } else {
      setViewingProfileUserId(userOrId.id || null);
    }
    _setCurrentPage('profile');
  };

  const isAuthenticated = currentUser !== null;

  // Add Toast helper
  const addToast = (type: Toast['type'], title: string, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Helper to construct User profile from Supabase user session
  const mapSupabaseUserToProfile = (sbUser: any): User => {
    const metadata = sbUser.user_metadata || {};
    const email = sbUser.email || '';
    const rawUsername =
      metadata.username ||
      metadata.user_name ||
      (email ? email.split('@')[0] : 'user');
    const username = rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
    const name =
      metadata.full_name ||
      metadata.name ||
      (email ? email.split('@')[0] : 'VERIXA Member');
    let avatarCandidate = metadata.avatar_url || metadata.picture;
    if (!avatarCandidate && Array.isArray(sbUser.identities)) {
      for (const identity of sbUser.identities) {
        if (identity.identity_data?.avatar_url) {
          avatarCandidate = identity.identity_data.avatar_url;
          break;
        }
        if (identity.identity_data?.picture) {
          avatarCandidate = identity.identity_data.picture;
          break;
        }
      }
    }

    if ((!avatarCandidate || avatarCandidate.includes('unsplash.com')) && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`verixa_user_avatar_${sbUser.id}`);
        if (cached && !cached.includes('unsplash.com')) {
          avatarCandidate = cached;
        }
      } catch {}
    }

    const avatar = (avatarCandidate && !avatarCandidate.includes('unsplash.com'))
      ? avatarCandidate
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || username)}&background=4285F4&color=fff&size=256&bold=true`;

    if (avatarCandidate && !avatarCandidate.includes('unsplash.com') && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`verixa_user_avatar_${sbUser.id}`, avatarCandidate);
      } catch {}
    }

    return {
      id: sbUser.id,
      username,
      name,
      email,
      avatar,
      bio: 'Safe social media explorer 🛡️',
      verified: true,
      aiTrustBadge: 'Verified Human • 100% Trust',
      safetyScore: 100,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      role: 'Verified Member',
      joinedDate: 'Joined Today',
    };
  };

  // Load and apply User's relationships (Following, Saved Posts, Liked Posts)
  const loadUserRelations = useCallback(async (userId: string) => {
    try {
      const localLikedRaw = typeof window !== 'undefined' ? localStorage.getItem(`verixa_liked_posts_${userId}`) : null;
      let localLikedArr: string[] = [];
      if (localLikedRaw) {
        try {
          localLikedArr = JSON.parse(localLikedRaw);
        } catch {}
      }

      const [following, savedPosts, likedPostIdsList] = await Promise.all([
        getUserFollowing(userId),
        supabase.from('saved_posts').select('post_id').eq('user_id', userId),
        getUserLikedPostIds(userId),
      ]);

      const followingSet = new Set(following.map((u) => u.id));
      setFollowingUserIds(followingSet);

      if (savedPosts && (savedPosts as any).data) {
        const savedSet = new Set<string>((savedPosts as any).data.map((r: any) => String(r.post_id)));
        setSavedPostIds(savedSet);
      }

      const likedIds: string[] = [...localLikedArr, ...(likedPostIdsList || [])];
      const combinedLiked = new Set<string>(likedIds);
      setLikedPostIds(combinedLiked);
    } catch (err) {
      console.warn('Notice loading user relations:', err);
    }
  }, []);

  // Helper to map video posts into Reels
  const syncReelsFromPosts = (postsList: Post[]) => {
    const videoPosts = postsList.filter((p) => p.mediaType === 'video' && p.mediaUrl);
    if (videoPosts.length > 0) {
      const mappedReels: Reel[] = videoPosts.map((vp) => ({
        id: vp.id,
        user: vp.user,
        caption: vp.caption,
        videoUrl: vp.mediaUrl!,
        audioTitle: 'Original Audio • Verified Clean',
        likes: vp.likes,
        isLiked: vp.isLiked,
        commentsCount: vp.comments.length,
        sharesCount: vp.shares,
        aiTrustBadge: vp.user.aiTrustBadge,
        deepfakeRisk: 1,
        tags: vp.tags,
      }));
      setReels(mappedReels);
    }
  };

  // Handle Supabase Auth User State
  const syncSupabaseAuthUser = useCallback(async (sbUser: any) => {
    const initialProfile = mapSupabaseUserToProfile(sbUser);
    setCurrentUser((prev) => (prev ? { ...prev, ...initialProfile } : initialProfile));

    try {
      const dbProfile = await saveUserProfile({
        uid: sbUser.id,
        username: initialProfile.username,
        email: initialProfile.email,
        displayName: initialProfile.name,
        photoURL: initialProfile.avatar,
      });
      if (dbProfile) {
        if (dbProfile.avatar?.includes('unsplash.com') && initialProfile.avatar && !initialProfile.avatar.includes('unsplash.com')) {
          dbProfile.avatar = initialProfile.avatar;
        }
        setCurrentUser(dbProfile);
      }
      loadUserRelations(sbUser.id);
    } catch (err: any) {
      console.warn('Profile background sync notice:', err.message);
    }
  }, [loadUserRelations]);

  // Load Feed Posts from Supabase
  const loadPosts = useCallback(async () => {
    if (!hasLoadedPostsOnce.current) {
      setIsPostsLoading(true);
    }
    setPostsError(null);
    try {
      const fetched = await fetchPersonalizedFeed(currentUser?.id, 30);
      setPosts(fetched);
      syncReelsFromPosts(fetched);
      hasLoadedPostsOnce.current = true;
    } catch (err: any) {
      console.error('Failed to load posts:', err);
      setPostsError(err.message || 'Failed to fetch posts from Supabase');
    } finally {
      setIsPostsLoading(false);
    }
  }, [currentUser?.id]);

  const normalizeStoryItem = async (item: any, currentUserId?: string): Promise<Story> => {
    const rawMedia = item.mediaUrl || item.media_url || '';
    const resolvedMedia = await getSignedMediaUrl(rawMedia, 3600);
    const rawAvatar = item.user?.avatar || item.user_avatar || '';
    const resolvedAvatar = rawAvatar ? await getSignedMediaUrl(rawAvatar, 3600) : '';

    const isMyStory = Boolean(
      (currentUserId && (item.user?.id === currentUserId || item.user_id === currentUserId)) ||
      (currentUser?.id && (item.user?.id === currentUser.id || item.user_id === currentUser.id))
    );

    let finalAvatar = resolvedAvatar || rawAvatar;
    if (isMyStory && currentUser?.avatar && !currentUser.avatar.includes('unsplash.com')) {
      finalAvatar = currentUser.avatar;
    } else if (isMyStory && currentUserId && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`verixa_user_avatar_${currentUserId}`);
        if (cached && !cached.includes('unsplash.com')) {
          finalAvatar = cached;
        }
      } catch {}
    }

    if (!finalAvatar || finalAvatar.includes('unsplash.com')) {
      const displayName = item.user?.name || item.user_name || item.user?.username || item.username || 'User';
      finalAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=4285F4&color=fff&size=256&bold=true`;
    }

    const viewsCount = item.viewsCount ?? item.views_count ?? (item.viewed_by?.length || 0);
    const viewedBy = item.viewedBy || item.viewed_by || [];
    const isViewed = Boolean(
      item.viewed ||
      (currentUserId && viewedBy.includes(currentUserId))
    );

    const likesCount = item.likesCount ?? item.likes_count ?? (item.liked_by?.length || item.likedBy?.length || 0);
    const likedBy = item.likedBy || item.liked_by || [];
    const isLiked = Boolean(
      item.isLiked ||
      (currentUserId && likedBy.includes(currentUserId))
    );

    const mediaType = (item.type || item.mediaType || item.media_type || (rawMedia.includes('.mp4') ? 'video' : 'image')) as 'image' | 'video';

    return {
      id: item.id || `st_${Date.now()}`,
      user: {
        id: item.user?.id || item.user_id || '',
        name: item.user?.name || item.user_name || 'User',
        username: item.user?.username || item.username || 'user',
        avatar: finalAvatar,
        bio: item.user?.bio || '',
        verified: Boolean(item.user?.verified),
        aiTrustBadge: item.user?.aiTrustBadge || 'Verified Human • 100% Trust',
        safetyScore: item.user?.safetyScore ?? 99,
        followersCount: item.user?.followersCount ?? 0,
        followingCount: item.user?.followingCount ?? 0,
        postsCount: item.user?.postsCount ?? 0,
      },
      mediaUrl: resolvedMedia || rawMedia,
      media_url: resolvedMedia || rawMedia,
      type: mediaType,
      mediaType: mediaType,
      media_type: mediaType,
      timestamp: item.timestamp || (item.created_at ? 'Recent' : 'Just now'),
      viewed: isViewed,
      isAIModerated: item.isAIModerated ?? item.is_ai_moderated ?? true,
      viewsCount,
      views_count: viewsCount,
      viewedBy,
      viewed_by: viewedBy,
      likesCount,
      likes_count: likesCount,
      likedBy,
      liked_by: likedBy,
      isLiked,
      expiresAt: item.expiresAt || item.expires_at,
      expires_at: item.expiresAt || item.expires_at,
      createdAt: item.createdAt || item.created_at,
      created_at: item.createdAt || item.created_at,
    };
  };

  const loadStories = useCallback(async () => {
    try {
      const res = await fetch(`/api/stories${currentUser?.id ? `?userId=${currentUser.id}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.stories) && data.stories.length > 0) {
          const normalized = await Promise.all(
            data.stories.map((s: any) => normalizeStoryItem(s, currentUser?.id))
          );
          setStories(normalized);
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }, [currentUser?.id]);

  const loadReels = useCallback(async () => {
    try {
      const res = await fetch(`/api/reels${currentUser?.id ? `?userId=${currentUser.id}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.reels) && data.reels.length > 0) {
          setReels(data.reels);
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }, [currentUser?.id]);

  const refreshPosts = async () => {
    await loadPosts();
    await loadStories();
    await loadReels();
  };

  // Synchronize isBookmarked and isLiked with loaded user sets
  useEffect(() => {
    if (posts.length === 0) return;
    setPosts((prev) =>
      prev.map((p) => {
        const isBookmarked = savedPostIds.has(p.id);
        const isLiked = likedPostIds.has(p.id);
        if (p.isBookmarked === isBookmarked && p.isLiked === isLiked) return p;
        return {
          ...p,
          isBookmarked,
          isLiked,
        };
      })
    );
  }, [savedPostIds, likedPostIds]);

  // Setup Supabase Auth listener & clean hash if present
  useEffect(() => {
    const cleanUrlHash = () => {
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      cleanUrlHash();
      if (session?.user) {
        syncSupabaseAuthUser(session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      cleanUrlHash();
      if (session?.user) {
        syncSupabaseAuthUser(session.user);
        if (event === 'SIGNED_IN') {
          _setCurrentPage('home');
          setPageHistory(['home']);
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setFollowingUserIds(new Set());
        setSavedPostIds(new Set());
        setLikedPostIds(new Set());
        setNotifications([]);
        setMessages([]);
        _setCurrentPage('landing');
        setPageHistory(['landing']);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncSupabaseAuthUser]);

  // Initial Posts, Stories, and Reels load
  useEffect(() => {
    loadPosts();
    loadStories();
    loadReels();
  }, [loadPosts, loadStories, loadReels]);

  // Setup Real-time Posts Subscription
  useEffect(() => {
    const unsubPosts = subscribePosts((sbPosts) => {
      if (sbPosts) {
        setPosts(sbPosts);
        setIsPostsLoading(false);
        syncReelsFromPosts(sbPosts);
      }
    }, currentUser?.id);

    return () => {
      unsubPosts();
    };
  }, [currentUser?.id]);

  // Real-time notifications subscriber with cross-tab BroadcastChannel & server sync
  useEffect(() => {
    if (!currentUser?.id) {
      setNotifications([]);
      return;
    }

    // Reset notifications list on user change to prevent stale user notifications
    setNotifications([]);

    // Load any offline / local notifications cached for this user (strictly non-self)
    try {
      const storageKey = `verixa_notifications_${currentUser.id}`;
      const cached = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (cached && Array.isArray(cached) && cached.length > 0) {
        // STRICT: Never allow self-notifications from cache
        const nonSelf = cached.filter((n: Notification) => n.user?.id !== currentUser.id);
        if (nonSelf.length > 0) {
          setNotifications(nonSelf);
        }
      }
    } catch {}

    const unsubNotifs = subscribeUserNotifications(currentUser.id, (realtimeNotifs) => {
      if (realtimeNotifs && Array.isArray(realtimeNotifs)) {
        // Filter out any notification where sender is current user
        const cleanNotifs = realtimeNotifs.filter((n) => n.user?.id !== currentUser.id);
        setNotifications(cleanNotifs);

        // Cache clean notifications in localStorage
        try {
          const storageKey = `verixa_notifications_${currentUser.id}`;
          localStorage.setItem(storageKey, JSON.stringify(cleanNotifs.slice(0, 50)));
        } catch {}
      }
    });

    // Cross-tab broadcast listener so active sessions for currentUser receive notifications instantly
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('verixa_notifications_channel') : null;
    if (bc) {
      bc.onmessage = (event) => {
        if (event.data?.recipientId === currentUser.id && event.data?.notification) {
          const incoming: Notification = event.data.notification;
          // STRICT: Ignore any self notification
          if (incoming.user?.id === currentUser.id) return;

          setNotifications((prev) => {
            if (prev.some((n) => n.id === incoming.id)) return prev;
            return [incoming, ...prev];
          });
        }
      };
    }

    return () => {
      unsubNotifs();
      bc?.close();
    };
  }, [currentUser?.id]);

  // Helper to read and write lastReadMap in localStorage
  const getLastReadMap = useCallback((): Record<string, string> => {
    if (typeof window === 'undefined' || !currentUser?.id) return {};
    try {
      const saved = localStorage.getItem(`verixa_chat_last_read_${currentUser.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, [currentUser?.id]);

  const updateLastRead = useCallback(
    (senderUserId: string, timestamp: string) => {
      if (typeof window === 'undefined' || !currentUser?.id) return;
      try {
        const current = getLastReadMap();
        current[senderUserId] = timestamp;
        localStorage.setItem(
          `verixa_chat_last_read_${currentUser.id}`,
          JSON.stringify(current)
        );
      } catch (err) {
        console.warn('Could not save last read chat timestamp:', err);
      }
    },
    [currentUser?.id, getLastReadMap]
  );

  const markChatAsRead = useCallback(
    (senderUserId: string) => {
      const nowIso = new Date().toISOString();
      updateLastRead(senderUserId, nowIso);
      setUnreadChatSenders((prev) => {
        if (!prev[senderUserId]) return prev;
        const next = { ...prev };
        delete next[senderUserId];
        return next;
      });
    },
    [updateLastRead]
  );

  // Load initial unread incoming messages on mount/login
  useEffect(() => {
    if (!currentUser?.id) {
      setUnreadChatSenders({});
      return;
    }

    let isMounted = true;
    const loadUnread = async () => {
      const lastReadMap = getLastReadMap();
      const recentIncoming = await getRecentIncomingMessages(currentUser.id);
      if (!isMounted) return;

      const unreadMap: Record<string, { count: number; lastText: string; lastTime: string }> = {};
      for (const item of recentIncoming) {
        const senderId = item.senderId;
        const lastRead = lastReadMap[senderId];
        const isUnread = !lastRead || new Date(item.createdAt) > new Date(lastRead);
        if (isUnread) {
          if (!unreadMap[senderId]) {
            unreadMap[senderId] = {
              count: 1,
              lastText: item.text || 'Media attachment',
              lastTime: item.createdAt
                ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Just now',
            };
          } else {
            unreadMap[senderId].count += 1;
          }
        }
      }
      setUnreadChatSenders(unreadMap);
    };

    loadUnread();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, getLastReadMap]);

  // Global Realtime listener for incoming messages to currentUser (does NOT auto-open)
  useEffect(() => {
    if (!currentUser?.id) return;

    const unsubIncoming = subscribeIncomingMessages(currentUser.id, (newMsg) => {
      // If currently on Messages page AND actively chatting with this sender:
      if (activeChatUser?.id === newMsg.senderId && currentPage === 'messages') {
        updateLastRead(newMsg.senderId, new Date().toISOString());
      } else {
        // User is NOT currently viewing this chat!
        // DO NOT auto-open the chat!
        // Show unread indicator dot on this sender's chat
        setUnreadChatSenders((prev) => ({
          ...prev,
          [newMsg.senderId]: {
            count: (prev[newMsg.senderId]?.count || 0) + 1,
            lastText: newMsg.text || 'Media attachment',
            lastTime: newMsg.timestamp,
          },
        }));

        addToast(
          'info',
          'New Message',
          newMsg.text ? `"${newMsg.text.slice(0, 50)}"` : 'You received a new direct message.'
        );
      }
    });

    return () => unsubIncoming();
  }, [currentUser?.id, activeChatUser?.id, currentPage, updateLastRead, addToast]);

  // Real-time chat messages listener for active conversation
  useEffect(() => {
    if (!currentUser?.id || !activeChatUser?.id) {
      setMessages([]);
      return;
    }
    setIsMessagesLoading(true);
    const unsubChat = subscribeSupabaseMessages(currentUser.id, activeChatUser.id, (realtimeMsgs) => {
      setMessages(realtimeMsgs || []);
      setIsMessagesLoading(false);
    });
    return () => unsubChat();
  }, [currentUser?.id, activeChatUser?.id]);

  // ================= AUTH METHODS (SUPABASE) ================= //

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('email not confirmed') || errorMsg.includes('not confirmed')) {
          try {
            await supabase.auth.resend({ type: 'signup', email: email.trim() });
          } catch (resendErr) {
            console.warn('Resend verification notice:', resendErr);
          }
          setCurrentUser(null);
          setPendingVerificationEmail(email.trim());
          setCurrentPage('verify-email');
          return { success: false, error: 'email_unverified' };
        }

        if (errorMsg.includes('invalid login credentials') || errorMsg.includes('invalid credentials')) {
          return {
            success: false,
            error: 'Invalid email or password. If you do not have an account yet, please sign up first.',
          };
        }

        if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
          return { success: false, error: 'Too many login attempts. Please wait a few moments and try again.' };
        }

        return { success: false, error: error.message };
      }

      if (data.user) {
        if (typeof window !== 'undefined' && window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        await syncSupabaseAuthUser(data.user);
        setPageHistory(['home']);
        _setCurrentPage('home');
        addToast('success', 'Welcome Back!', `Signed in as ${data.user.email}`);
        return { success: true };
      }

      return { success: false, error: 'Unable to sign in. Please check your credentials.' };
    } catch (err: any) {
      console.warn('Supabase login error:', err.message);
      return { success: false, error: err.message || 'Login failed.' };
    }
  };

  const signup = async (
    name: string,
    username: string,
    email: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: pass,
        options: {
          data: {
            name: name.trim(),
            full_name: name.trim(),
            username: cleanUsername,
          },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('already registered') || errorMsg.includes('already in use') || errorMsg.includes('user already exists')) {
          return { success: false, error: 'User already exists. Please sign in.' };
        }
        if (errorMsg.includes('weak password') || errorMsg.includes('at least 6 characters')) {
          return { success: false, error: 'Password must be at least 6 characters.' };
        }
        return { success: false, error: error.message };
      }

      if (data.user && !data.session) {
        setCurrentUser(null);
        setPendingVerificationEmail(email.trim());
        setCurrentPage('verify-email');
        return { success: true };
      }

      if (data.user && data.session) {
        await syncSupabaseAuthUser(data.user);
        setPageHistory(['home']);
        _setCurrentPage('home');
        addToast('success', 'Account Created Successfully', `Welcome to VERIXA, @${cleanUsername}!`);
        return { success: true };
      }

      setPendingVerificationEmail(email.trim());
      setCurrentPage('verify-email');
      return { success: true };
    } catch (err: any) {
      console.warn('Supabase signup error:', err.message);
      return { success: false, error: err.message || 'Failed to create account.' };
    }
  };

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string; cancelled?: boolean }> => {
    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        console.error('Supabase Google OAuth error:', error);
        let friendlyError = error.message || 'Failed to connect to Google.';

        if (
          error.message.toLowerCase().includes('domain') ||
          error.message.toLowerCase().includes('redirect_uri') ||
          error.message.toLowerCase().includes('unauthorized')
        ) {
          friendlyError = 'Supabase redirect URL configuration required for Google OAuth.';
          setIsUnauthorizedDomainModalOpen(true);
        }

        addToast('error', 'Google Sign-In Notice', friendlyError);
        return { success: false, error: friendlyError };
      }

      return { success: true };
    } catch (err: any) {
      console.error('Google OAuth execution error:', err);
      const msg = err.message || 'An error occurred during Google authentication.';
      addToast('error', 'Google Sign-In Failed', msg);
      return { success: false, error: msg };
    }
  };

  const resetPassword = async (emailToReset: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(emailToReset.trim(), {
        redirectTo: redirectUrl,
      });

      if (error) {
        let msg = error.message;
        if (error.message.toLowerCase().includes('user not found')) {
          msg = 'No user account found with this email address.';
        }
        return { success: false, error: msg };
      }

      addToast('success', 'Password Reset Email Sent', `Instructions sent to ${emailToReset}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to send password reset email.' };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err: any) {
      console.warn('Sign out warning:', err.message);
    }
    setCurrentUser(null);
    setPageHistory(['login']);
    _setCurrentPage('login');
    addToast('info', 'Logged Out', 'You have been safely logged out.');
  };

  // ================= FEED & POSTS ================= //

  const addPost = async (
    caption: string,
    mediaUrl?: string,
    mediaType: 'image' | 'video' = 'image',
    visibility: 'public' | 'friends' | 'private' = 'public',
    tags?: string[]
  ) => {
    if (!currentUser?.id) {
      addToast('warning', 'Authentication Required', 'Please sign in to publish posts.');
      return { success: false, error: 'Authentication required' };
    }

    try {
      // 0. VERIXA AI Guardian Action Authorization & Cooldown Check
      try {
        const checkRes = await fetch('/api/guardian/check-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, action: 'post' }),
        });
        const checkData = await checkRes.json();
        if (checkData && checkData.allowed === false) {
          addToast(
            'warning',
            checkData.risk_level === 'CRITICAL' ? 'Account Suspended' : 'Rate Limit Active',
            checkData.reason || checkData.restriction || 'Post action restricted under current safety risk level.'
          );
          return { success: false, error: checkData.reason || checkData.restriction };
        }
      } catch {
        // Non-blocking fallback
      }

      // 1. Moderate Caption / Title Text via AI
      if (caption && caption.trim().length > 0) {
        const modRes = await fetch('/api/moderate/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: caption, context: 'post caption/title' }),
        });
        const modData = await modRes.json();

        const isBlocked = modData.status === 'BLOCKED' || modData.allowed === false;
        const toxicityScore = modData.toxicity_score ?? modData.toxicityScore ?? 0;
        const confidence = modData.confidence ?? 95;
        const categories = modData.detected_labels || modData.categories || [];
        const suggestion =
          modData.safe_rewrite ||
          modData.suggested_action ||
          modData.suggestion ||
          'Please rewrite your caption respectfully to express your thoughts without hurting the creator.';

        if (isBlocked) {
          setStats((prev) => ({ ...prev, toxicBlocked: prev.toxicBlocked + 1 }));

          const newLog: ModerationAuditLog = {
            id: `log_${Date.now()}`,
            timestamp: 'Just now',
            type: 'COMMENT_BLOCKED',
            contentSnippet: `"${caption}"`,
            actor: currentUser.username || 'Member',
            severity: toxicityScore > 80 ? 'HIGH' : 'MEDIUM',
            confidence: Math.round(confidence),
          };
          setAuditLogs((prev) => [newLog, ...prev]);

          setBlockedCommentModal({
            open: true,
            commentText: caption,
            reason: modData.reason || 'Insulting or Harmful Caption Detected',
            toxicityScore: toxicityScore || 85,
            confidence: Math.round(confidence),
            categories: categories.length > 0 ? categories : ['INSULT', 'HARASSMENT'],
            suggestion: suggestion,
            contentType: 'caption',
            languageDetected: modData.language_detected || modData.language,
          });

          addToast(
            'error',
            'Caption Blocked',
            'Your caption violates VERIXA safety rules. Please rewrite your caption.'
          );
          return { success: false, error: modData.reason || 'Caption blocked by AI.' };
        }
      }

      // 2. Scan Image/Video Media if provided
      let scanDetails = {
        safe: true,
        nsfwScore: 0,
        violenceScore: 0,
        fakeConfidence: 1,
        labels: ['Verified Media', 'Original Creation'],
        summary: 'Media passed VERIXA AI safety inspection.',
      };

      if (mediaUrl && mediaType === 'image') {
        const signedScanUrl = await getSignedMediaUrl(mediaUrl, 3600);
        const res = await fetch('/api/moderate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            signedScanUrl.startsWith('data:')
              ? { imageBase64: signedScanUrl }
              : { imageUrl: signedScanUrl }
          ),
        });
        const scanRes = await res.json();
        if (scanRes) {
          scanDetails = scanRes;
        }
      }

      const isMediaUnsafe =
        !scanDetails.safe ||
        (scanDetails as any).allowed === false ||
        scanDetails.nsfwScore > 70 ||
        scanDetails.violenceScore > 70 ||
        (typeof (scanDetails as any).embeddedTextToxicityScore === 'number' && (scanDetails as any).embeddedTextToxicityScore >= 60) ||
        (scanDetails as any).decision === 'BLOCK' ||
        (scanDetails as any).decision === 'QUARANTINE';

      if (isMediaUnsafe) {
        if (mediaUrl && !mediaUrl.startsWith('http')) {
          await deleteStorageFile(mediaUrl);
        }
        const blockReason =
          (scanDetails as any).summary ||
          (scanDetails as any).reason ||
          (scanDetails as any).message ||
          (typeof (scanDetails as any).embeddedTextToxicityScore === 'number' && (scanDetails as any).embeddedTextToxicityScore >= 60
            ? 'Uploaded image contains offensive or toxic text.'
            : 'Uploaded media violated VERIXA safety guidelines.');

        addToast('error', 'Post Blocked by AI', blockReason);
        return { success: false, error: blockReason, scanDetails };
      }

      // 3. Persist to Supabase
      const sbPostId = await createPost({
        userId: currentUser.id,
        username: currentUser.username,
        userPhotoURL: currentUser.avatar,
        caption,
        mediaUrl,
        mediaType,
        visibility,
        tags,
        aiScanDetails: scanDetails,
      });

      const extractedTags = caption.match(/#[\w]+/g) || tags || ['VERIXA', 'SafeMedia'];

      const newPost: Post = {
        id: sbPostId,
        user: currentUser,
        caption,
        mediaUrl,
        mediaType,
        likes: 0,
        isLiked: false,
        isBookmarked: false,
        comments: [],
        shares: 0,
        timestamp: 'Just now',
        tags: extractedTags,
        aiSafetyScore: 99,
        aiScanDetails: scanDetails,
      };

      const displayPost = await resolvePostSignedUrls(newPost);

      setPosts((prev) => [displayPost, ...prev.filter((p) => p.id !== displayPost.id)]);

      addToast('success', 'Post Published!', 'Your post passed all AI safety checks & is live on Verixa.');
      return { success: true, scanDetails };
    } catch (err: any) {
      console.error('Post creation error:', err);
      addToast('error', 'Post Failed', err.message || 'Failed to publish post.');
      return { success: false, error: err.message || 'Failed to process post.' };
    }
  };

  const editPost = async (
    postId: string,
    updates: { caption?: string; visibility?: string; tags?: string[] }
  ) => {
    if (!currentUser?.id) {
      addToast('warning', 'Authentication Required', 'Please sign in to edit posts.');
      return;
    }

    const previousPost = posts.find((p) => p.id === postId);
    if (!previousPost) return;

    // Moderate new caption if updated
    if (updates.caption && updates.caption.trim().length > 0) {
      try {
        const modRes = await fetch('/api/moderation/gateway', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: updates.caption,
            content_type: 'caption',
            context: 'edit post caption',
            user_id: currentUser.id,
          }),
        });
        const modData = await modRes.json();
        if (!modData.allowed || modData.decision === 'BLOCK' || modData.decision === 'QUARANTINE') {
          addToast('error', 'Caption Rejected', modData.reason || 'Edited caption violated safety guidelines.');
          return;
        }
      } catch (modErr) {
        console.warn('Moderation check notice on edit post:', modErr);
      }
    }

    // Optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              caption: updates.caption !== undefined ? updates.caption : p.caption,
              tags: updates.tags !== undefined ? updates.tags : (updates.caption ? updates.caption.match(/#[\w]+/g) || p.tags : p.tags),
            }
          : p
      )
    );

    try {
      await updatePost(postId, currentUser.id, updates);
      addToast('success', 'Post Updated', 'Your changes have been saved.');
    } catch (err: any) {
      // Rollback on failure
      setPosts((prev) => prev.map((p) => (p.id === postId ? previousPost : p)));
      addToast('error', 'Update Failed', err.message || 'Could not update post. Rolled back.');
    }
  };

  const removePost = async (postId: string) => {
    if (!currentUser?.id) return;
    const postToDelete = posts.find((p) => p.id === postId);
    if (!postToDelete) return;

    // Optimistic remove
    setPosts((prev) => prev.filter((p) => p.id !== postId));

    try {
      await deletePost(postId, currentUser.id);
      addToast('info', 'Post Deleted', 'Your post was successfully removed.');
    } catch (err: any) {
      // Rollback on failure
      setPosts((prev) => [postToDelete, ...prev]);
      addToast('error', 'Delete Failed', err.message || 'Could not delete post. Rolled back.');
    }
  };

  /**
   * Centralized Social Notification Dispatcher
   * Delivers notifications directly to the content creator (User 1)
   * Ensures User 2 (actor) does NOT receive a self-notification!
   */
  const sendNotificationToUser = async ({
    recipientId,
    type,
    message,
    postId,
    detail,
  }: {
    recipientId: string;
    type: 'like' | 'comment' | 'follow' | 'mention';
    message: string;
    postId?: string;
    detail?: string;
  }) => {
    // 0. ABSOLUTELY ZERO SELF-NOTIFICATIONS!
    if (!recipientId || !currentUser?.id || recipientId === currentUser.id) {
      return;
    }

    const notifPayload: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      user: {
        id: currentUser.id,
        username: currentUser.username,
        name: currentUser.name || currentUser.username,
        avatar: currentUser.avatar,
        bio: currentUser.bio || '',
        verified: currentUser.verified ?? true,
        aiTrustBadge: currentUser.aiTrustBadge || 'Verified Human',
        safetyScore: currentUser.safetyScore ?? 100,
        followersCount: currentUser.followersCount || 0,
        followingCount: currentUser.followingCount || 0,
        postsCount: currentUser.postsCount || 0,
        role: currentUser.role || 'Member',
        joinedDate: currentUser.joinedDate || '',
      },
      text: message,
      timestamp: 'Just now',
      read: false,
      detail,
    };

    // Note: NEVER add notifPayload to currentUser's feed!
    // currentUser is the sender / actor (e.g. User 2), not the recipient (User 1)!

    // 1. Persist to server API and Supabase for the recipient (User 1)
    try {
      await createNotification({
        recipientId,
        senderId: currentUser.id,
        senderUsername: currentUser.username,
        senderName: currentUser.name || currentUser.username,
        senderPhotoURL: currentUser.avatar,
        type,
        postId,
        message,
        detail,
        sender: currentUser,
      });
    } catch (err: any) {
      console.warn('Notification persist notice:', err?.message || err);
    }

    // 2. Persist to localStorage for recipientId so if User 1 is on this browser, their panel includes it
    try {
      const storageKey = `verixa_notifications_${recipientId}`;
      const existing: Notification[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const updated = [
        notifPayload,
        ...existing.filter((n) => n.id !== notifPayload.id && n.user?.id !== recipientId),
      ].slice(0, 50);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}

    // 3. Broadcast via cross-tab / cross-window BroadcastChannel so any active tab for User 1 updates instantly
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('verixa_notifications_channel');
        bc.postMessage({ recipientId, notification: notifPayload });
        bc.close();
      }
    } catch {}
  };

  const likePost = async (postId: string) => {
    if (!currentUser?.id) {
      addToast('warning', 'Sign In Required', 'Please sign in to like posts.');
      return;
    }

    const currentPost = posts.find((p) => p.id === postId);
    if (!currentPost) return;

    const previousLiked = !!currentPost.isLiked;
    const previousLikesCount = currentPost.likes;
    const nextLiked = !previousLiked;
    const nextLikesCount = nextLiked ? previousLikesCount + 1 : Math.max(0, previousLikesCount - 1);

    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, isLiked: nextLiked, likes: nextLikesCount }
          : p
      )
    );
    setLikedPostIds((prev) => {
      const updated = new Set(prev);
      if (nextLiked) updated.add(postId);
      else updated.delete(postId);

      if (typeof window !== 'undefined' && currentUser?.id) {
        try {
          localStorage.setItem(`verixa_liked_posts_${currentUser.id}`, JSON.stringify([...updated]));
        } catch {}
      }
      return updated;
    });

    try {
      const syncResult = await togglePostLike(postId, currentUser.id, nextLiked);
      if (syncResult && typeof syncResult === 'object' && typeof syncResult.likesCount === 'number') {
        const confirmedCount = syncResult.likesCount;
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, isLiked: syncResult.isLiked, likes: confirmedCount } : p
          )
        );
      }
      recordPostInteraction(currentUser.id, postId, nextLiked ? 'like' : 'unlike');

      // Send notification to post creator (User 1)
      if (nextLiked && currentPost.user?.id) {
        const postAuthorId = currentPost.user.id;
        const postSnippet = currentPost.caption
          ? (currentPost.caption.length > 35 ? currentPost.caption.slice(0, 35) + '...' : currentPost.caption)
          : 'post';
        sendNotificationToUser({
          recipientId: postAuthorId,
          type: 'like',
          postId,
          message: `liked your post: "${postSnippet}"`,
        });

        if (postAuthorId !== currentUser.id) {
          addToast('success', 'Post Liked', `Notification sent to @${currentPost.user.username || 'author'}`);
        }
      }
    } catch (err: any) {
      console.warn('Like sync notice:', err?.message || err);
    }
  };

  const bookmarkPost = async (postId: string) => {
    if (!currentUser?.id) {
      addToast('warning', 'Sign In Required', 'Please sign in to bookmark posts.');
      return;
    }

    const currentPost = posts.find((p) => p.id === postId);
    if (!currentPost) return;

    const previousBookmarked = !!currentPost.isBookmarked;
    const nextBookmarked = !previousBookmarked;

    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, isBookmarked: nextBookmarked } : p))
    );
    setSavedPostIds((prev) => {
      const updated = new Set(prev);
      if (nextBookmarked) updated.add(postId);
      else updated.delete(postId);
      return updated;
    });

    if (nextBookmarked) {
      addToast('info', 'Post Bookmarked', 'Saved to your personal collection.');
    }

    try {
      await toggleSavePost(currentUser.id, postId, nextBookmarked);
      recordPostInteraction(currentUser.id, postId, nextBookmarked ? 'save' : 'unsave');
    } catch (err: any) {
      // Rollback on failure
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, isBookmarked: previousBookmarked } : p))
      );
      setSavedPostIds((prev) => {
        const updated = new Set(prev);
        if (previousBookmarked) updated.add(postId);
        else updated.delete(postId);
        return updated;
      });
      addToast('error', 'Bookmark Failed', err.message || 'Could not save post. Rolled back.');
    }
  };

  // Add Comment with Real-Time AI Moderation and optimistic rollback
  const addComment = async (postId: string, text: string): Promise<{ allowed: boolean; reason?: string }> => {
    const trimmed = text.trim();
    if (!trimmed) return { allowed: false, reason: 'Comment cannot be empty.' };

    if (!currentUser?.id) {
      addToast('warning', 'Sign In Required', 'Please sign in to post comments.');
      return { allowed: false, reason: 'Authentication required.' };
    }

    // 0. VERIXA AI Guardian Action Authorization & Cooldown Check
    try {
      const checkRes = await fetch('/api/guardian/check-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, action: 'comment' }),
      });
      const checkData = await checkRes.json();
      if (checkData && checkData.allowed === false) {
        addToast(
          'warning',
          checkData.risk_level === 'CRITICAL' ? 'Account Suspended' : 'Rate Limit Active',
          checkData.reason || checkData.restriction || 'Comment action restricted under current safety risk level.'
        );
        return { allowed: false, reason: checkData.reason || checkData.restriction };
      }
    } catch {
      // Non-blocking fallback
    }

    // Step 1: Check toxicity FIRST (pre-moderation before UI insertion or upload)
    try {
      const res = await fetch('/api/moderate/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: trimmed }),
      });
      const data = await res.json();

      const isBlocked =
        data.status === 'OFFENSIVE' ||
        data.classification === 'OFFENSIVE' ||
        data.status === 'BLOCKED' ||
        data.allowed === false;
      const isWarning = data.status === 'WARNING';
      const toxicityScore = data.toxicity_score ?? data.toxicityScore ?? (isBlocked ? 85 : 0);
      const confidence = data.confidence ?? 95;
      const categories = data.detected_labels || data.categories || [];
      const suggestion = data.safe_rewrite || data.suggested_action || data.suggestion || 'Please rewrite your comment respectfully.';
      const blockMessage = data.message || "Your comment couldn't be posted because it may contain offensive or inappropriate content.";

      if (isBlocked) {
        setStats((prev) => ({ ...prev, toxicBlocked: prev.toxicBlocked + 1 }));

        const newLog: ModerationAuditLog = {
          id: `log_${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: 'COMMENT_BLOCKED',
          contentSnippet: `"${trimmed}"`,
          actor: currentUser.username || 'Member',
          severity: toxicityScore > 80 ? 'HIGH' : 'MEDIUM',
          confidence: Math.round(confidence),
        };
        setAuditLogs((prev) => [newLog, ...prev]);

        logModerationEvent({
          targetId: postId,
          targetType: 'comment',
          userId: currentUser.id,
          status: 'rejected',
          category: categories[0] || 'OFFENSIVE_CONTENT',
          confidence,
          reason: data.reason || 'Offensive or inappropriate content detected.',
        }).catch((e) => console.warn('Moderation event log notice:', e));

        addToast('error', 'Comment Blocked', blockMessage);

        setBlockedCommentModal({
          open: true,
          commentText: trimmed,
          reason: data.reason || 'Offensive or inappropriate content detected.',
          toxicityScore: toxicityScore || 85,
          confidence: Math.round(confidence),
          categories: categories.length > 0 ? categories : ['OFFENSIVE_LANGUAGE'],
          suggestion: suggestion,
          contentType: 'comment',
          message: blockMessage,
          languageDetected: data.language_detected || data.language,
        });

        // The comment was never uploaded or displayed.
        return { allowed: false, reason: data.reason || blockMessage };
      }

      if (isWarning) {
        addToast(
          'warning',
          `Content Warning (${data.category || 'Low Toxicity'})`,
          data.reason || 'Slightly sensitive phrasing detected.'
        );
      }

      // Step 2: Persist to Supabase ONLY AFTER passing safety scan!
      try {
        const realCommentId = await addSupabaseComment(
          postId,
          currentUser.id,
          currentUser.username,
          currentUser.avatar,
          trimmed,
          toxicityScore
        );

        const verifiedComment: Comment = {
          id: realCommentId,
          postId,
          user: currentUser,
          content: trimmed,
          timestamp: 'Just now',
          toxicityScore,
          categories: categories.length > 0 ? categories : ['Safe / Verified'],
          aiStatus: isWarning ? 'flagged' : 'safe',
          likes: 0,
        };

        // Insert into UI ONLY after verified safe and saved!
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id === postId) {
              return {
                ...p,
                comments: [...(p.comments || []), verifiedComment],
              };
            }
            return p;
          })
        );
        recordPostInteraction(currentUser.id, postId, 'comment');

        // Dispatch notification to post author (User 1)
        const targetPost = posts.find((p) => p.id === postId);
        if (targetPost?.user?.id) {
          const commentSnippet = trimmed.length > 35 ? trimmed.slice(0, 35) + '...' : trimmed;
          sendNotificationToUser({
            recipientId: targetPost.user.id,
            type: 'comment',
            postId,
            message: `commented on your post: "${commentSnippet}"`,
            detail: trimmed,
          });
        }
      } catch (dbErr: any) {
        console.error('Supabase addComment failure:', dbErr);
        addToast('error', 'Comment Failed', dbErr.message || 'Could not save comment to database.');
        return { allowed: false, reason: 'Database error' };
      }

      addToast(
        'success',
        'Comment Posted!',
        isWarning ? 'Posted with content warning tag.' : 'Verified safe by VERIXA AI Engine.'
      );
      return { allowed: true };
    } catch (err: any) {
      console.warn('Comment moderation notice:', err);
      addToast('error', 'Error', 'Failed to process comment. Please try again.');
      return { allowed: false, reason: err.message };
    }
  };

  const removeComment = async (postId: string, commentId: string) => {
    if (!currentUser?.id) return;
    const currentPost = posts.find((p) => p.id === postId);
    const commentToDelete = currentPost?.comments.find((c) => c.id === commentId);
    if (!commentToDelete) return;

    // Optimistic delete
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) }
          : p
      )
    );

    try {
      await deleteSupabaseComment(commentId, currentUser.id);
      addToast('info', 'Comment Deleted', 'Your comment was removed.');
    } catch (err: any) {
      // Rollback on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comments: [...p.comments, commentToDelete] }
            : p
        )
      );
      addToast('error', 'Delete Failed', err.message || 'Could not delete comment.');
    }
  };

  const closeBlockedCommentModal = () => {
    setBlockedCommentModal((prev) => ({ ...prev, open: false }));
  };

  // ================= FOLLOWS ================= //

  const followUser = async (targetUserId: string) => {
    if (!currentUser?.id) {
      addToast('warning', 'Authentication Required', 'Please log in to follow users.');
      return;
    }
    if (currentUser.id === targetUserId) {
      addToast('warning', 'Invalid Action', 'You cannot follow yourself.');
      return;
    }

    const wasFollowing = followingUserIds.has(targetUserId);
    const nextFollowing = !wasFollowing;

    // Optimistic update
    setFollowingUserIds((prev) => {
      const next = new Set(prev);
      if (nextFollowing) next.add(targetUserId);
      else next.delete(targetUserId);
      return next;
    });

    try {
      await toggleFollowUser(currentUser.id, targetUserId);
      if (nextFollowing && targetUserId !== currentUser.id) {
        sendNotificationToUser({
          recipientId: targetUserId,
          type: 'follow',
          message: 'started following you',
        });
      }
      addToast(
        'info',
        nextFollowing ? 'Following User' : 'Unfollowed User',
        nextFollowing ? 'You are now following this creator.' : 'You have unfollowed this creator.'
      );
    } catch (err: any) {
      // Rollback on failure
      setFollowingUserIds((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.add(targetUserId);
        else next.delete(targetUserId);
        return next;
      });
      addToast('error', 'Follow Failed', err.message || 'Could not update follow status.');
    }
  };

  const isUserFollowing = (userId: string) => {
    return followingUserIds.has(userId);
  };

  // Stories & Reels
  const addStory = async (
    mediaUrl: string,
    mediaType?: 'image' | 'video',
    frames?: Array<{ timestamp: number; data: string }>
  ): Promise<boolean> => {
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to post stories.');
      return false;
    }

    setIsStoryUploading(true);
    setStoryUploadStage('VERIXA Vision AI analyzing content for safety...');

    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrl,
          mediaType: mediaType || (mediaUrl.includes('.mp4') ? 'video' : 'image'),
          userId: currentUser.id,
          username: currentUser.username,
          name: currentUser.name,
          avatar: currentUser.avatar,
          frames,
        }),
      });

      const data = await res.json();

      if (res.status === 202 || data.state === 'REVIEW_REQUIRED' || data.decision === 'QUARANTINE') {
        addToast(
          'warning',
          'Review Required',
          data.moderation?.reason || 'Story media placed in quarantine pending AI safety review.'
        );
        return false;
      }

      if (!res.ok || !data.allowed) {
        addToast(
          'error',
          'Story Flagged by AI',
          data.error || 'Story media violated VERIXA community safety guidelines.'
        );
        return false;
      }

      if (data.story) {
        const normalized = await normalizeStoryItem(data.story, currentUser.id);
        setStories((prev) => [normalized, ...prev.filter((s) => s.id !== normalized.id)]);

        // Direct authenticated client sync to Supabase
        try {
          await supabase.from('stories').upsert({
            id: data.story.id,
            user_id: currentUser.id,
            media_url: data.story.media_url || data.story.mediaUrl,
            media_type: data.story.media_type || data.story.mediaType || 'image',
            moderation_status: (data.story.moderation_status || 'approved').toLowerCase(),
            analysis_id: data.story.analysis_id || null,
            views_count: data.story.views_count || 0,
            viewed_by: [],
            created_at: data.story.created_at || new Date().toISOString(),
            expires_at: data.story.expires_at || new Date(Date.now() + 86400000).toISOString(),
          });
        } catch (sbErr) {
          console.warn('Client story Supabase sync notice:', sbErr);
        }
      }
      addToast('success', 'Story Added!', 'Your story is active for 24h and AI verified.');
      return true;
    } catch (err: any) {
      console.warn('Story publication error:', err);
      addToast('warning', 'Review Required', 'AI verification service temporarily unreachable. Story held for review.');
      return false;
    } finally {
      setIsStoryUploading(false);
      setStoryUploadStage('');
    }
  };

  const viewStory = async (storyId: string) => {
    setStories((prev) =>
      prev.map((s) => {
        if (s.id === storyId) {
          const viewedAlready = s.viewed;
          const currentViews = s.viewsCount ?? s.views_count ?? 0;
          const newViews = currentViews + (viewedAlready ? 0 : 1);
          return {
            ...s,
            viewed: true,
            viewsCount: newViews,
            views_count: newViews,
          };
        }
        return s;
      })
    );

    if (currentUser?.id) {
      try {
        await fetch(`/api/stories/${storyId}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id }),
        });
      } catch {
        // Non-blocking view sync
      }
    }
  };

  const likeStory = async (
    storyId: string,
    explicitAuthorId?: string,
    explicitAuthorName?: string
  ): Promise<boolean> => {
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to like stories.');
      return false;
    }

    const targetStory = stories.find((s) => s.id === storyId);
    const wasLiked = Boolean(targetStory?.isLiked);
    const targetLiked = !wasLiked;
    const prevLikes = targetStory?.likesCount ?? targetStory?.likes_count ?? 0;
    const nextLikes = targetLiked ? prevLikes + 1 : Math.max(0, prevLikes - 1);

    // Optimistic state update
    setStories((prev) =>
      prev.map((s) => {
        if (s.id === storyId) {
          const prevLikedBy = s.likedBy || s.liked_by || [];
          const updatedLikedBy = targetLiked
            ? Array.from(new Set([...prevLikedBy, currentUser.id]))
            : prevLikedBy.filter((uid) => uid !== currentUser.id);

          return {
            ...s,
            isLiked: targetLiked,
            likesCount: nextLikes,
            likes_count: nextLikes,
            likedBy: updatedLikedBy,
            liked_by: updatedLikedBy,
          };
        }
        return s;
      })
    );

    // Call backend API
    try {
      const res = await fetch(`/api/stories/${storyId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.likesCount === 'number') {
          setStories((prev) =>
            prev.map((s) =>
              s.id === storyId
                ? {
                    ...s,
                    isLiked: data.isLiked ?? targetLiked,
                    likesCount: data.likesCount,
                    likes_count: data.likesCount,
                    likedBy: data.likedBy ?? s.likedBy,
                    liked_by: data.likedBy ?? s.liked_by,
                  }
                : s
            )
          );
        }
      }
    } catch (err) {
      console.warn('Story like server call notice:', err);
    }

    // Persist to Supabase
    try {
      await toggleStoryLike(storyId, currentUser.id, targetLiked);
    } catch {
      // Non-blocking sync fallback
    }

    // Send notification to story author (User 1) if liked
    if (targetLiked && currentUser) {
      const authorId = String(
        explicitAuthorId ||
        targetStory?.user?.id ||
        (targetStory as any)?.user_id ||
        (targetStory as any)?.userId ||
        ''
      );
      if (authorId) {
        sendNotificationToUser({
          recipientId: authorId,
          type: 'like',
          postId: storyId,
          message: `liked your story`,
        });

        if (authorId !== currentUser.id) {
          const authorName = explicitAuthorName || targetStory?.user?.name || targetStory?.user?.username || 'creator';
          addToast('success', 'Story Liked', `Notification sent to @${authorName}`);
        }
      }
    }

    return true;
  };

  const sendStoryReaction = async (
    storyId: string,
    authorId: string,
    reactionText: string,
    authorName?: string
  ): Promise<boolean> => {
    if (!reactionText || !reactionText.trim()) return false;
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to react to stories.');
      return false;
    }

    const cleanText = reactionText.trim();

    // 1. Dispatch notification to story author (User 1)
    sendNotificationToUser({
      recipientId: authorId,
      type: 'comment',
      postId: storyId,
      message: `reacted to your story: "${cleanText}"`,
      detail: `Story reaction: ${cleanText}`,
    });

    // 2. Also deliver as direct message to story author if not self
    if (authorId !== currentUser.id) {
      try {
        await sendSupabaseMessage(currentUser.id, authorId, `Reacted to your story: "${cleanText}"`);
      } catch {
        // non-blocking
      }
      addToast('success', 'Reaction Sent', `Sent "${cleanText}" to @${authorName || 'creator'}`);
    }

    return true;
  };

  const addReel = async (
    videoUrl: string,
    caption?: string,
    audioTitle?: string,
    tags?: string[],
    frames?: Array<{ timestamp: number; data: string }>
  ): Promise<boolean> => {
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to publish reels.');
      return false;
    }

    try {
      const res = await fetch('/api/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          caption,
          audioTitle,
          tags,
          userId: currentUser.id,
          username: currentUser.username,
          name: currentUser.name,
          avatar: currentUser.avatar,
          aiTrustBadge: currentUser.aiTrustBadge,
          frames,
        }),
      });

      const data = await res.json();

      if (res.status === 202 || data.state === 'REVIEW_REQUIRED' || data.decision === 'QUARANTINE') {
        addToast(
          'warning',
          'Review Required',
          data.moderation?.reason || 'Reel video placed in quarantine pending safety review.'
        );
        return false;
      }

      if (!res.ok || !data.allowed) {
        addToast('error', 'Reel Flagged', data.error || 'Reel video violated VERIXA safety rules.');
        return false;
      }

      if (data.reel) {
        setReels((prev) => [data.reel, ...prev]);

        // Direct authenticated client sync to Supabase
        try {
          await supabase.from('reels').upsert({
            id: data.reel.id,
            user_id: currentUser.id,
            caption: data.reel.caption || '',
            video_url: data.reel.video_url || data.reel.videoUrl,
            audio_title: data.reel.audio_title || data.reel.audioTitle || 'Original Audio',
            deepfake_risk: data.reel.deepfake_risk ?? data.reel.deepfakeRisk ?? 0,
            moderation_status: (data.reel.moderation_status || 'approved').toLowerCase(),
            analysis_id: data.reel.analysis_id || null,
            likes_count: data.reel.likes || 0,
            comments_count: data.reel.comments_count || 0,
            shares_count: data.reel.shares_count || 0,
            tags: data.reel.tags || [],
            created_at: data.reel.created_at || new Date().toISOString(),
            updated_at: data.reel.updated_at || new Date().toISOString(),
          });
        } catch (sbErr) {
          console.warn('Client reel Supabase sync notice:', sbErr);
        }
      }
      addToast('success', 'Reel Published!', `Reel verified safe (${data.reel?.deepfakeRisk ?? 0}% deepfake risk).`);
      return true;
    } catch (err: any) {
      addToast('error', 'Publish Failed', err.message || 'Could not publish reel.');
      return false;
    }
  };

  const likeReel = (reelId: string) => {
    let targetReel: Reel | undefined;
    let nextLiked = false;

    setReels((prev) =>
      prev.map((r) => {
        if (r.id === reelId) {
          targetReel = r;
          nextLiked = !r.isLiked;
          return {
            ...r,
            isLiked: nextLiked,
            likes: nextLiked ? r.likes + 1 : Math.max(0, r.likes - 1),
          };
        }
        return r;
      })
    );

    if (!targetReel) {
      targetReel = reels.find((r) => r.id === reelId);
      if (targetReel) nextLiked = !targetReel.isLiked;
    }

    // Call server API asynchronously
    fetch(`/api/reels/${reelId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser?.id }),
    }).catch(() => {});

    // If reel was liked, dispatch notification to reel author (User 1)
    if (nextLiked && currentUser && targetReel) {
      const reelAuthorId = String(targetReel.user?.id || (targetReel as any)?.user_id || '');
      if (reelAuthorId) {
        const reelCaption = targetReel.caption
          ? (targetReel.caption.length > 35 ? targetReel.caption.slice(0, 35) + '...' : targetReel.caption)
          : 'reel';

        sendNotificationToUser({
          recipientId: reelAuthorId,
          type: 'like',
          postId: reelId,
          message: `liked your reel: "${reelCaption}"`,
        });

        if (reelAuthorId !== currentUser.id) {
          addToast('success', 'Reel Liked', `Notification sent to @${targetReel.user?.username || 'creator'}`);
        }
      }
    }
  };

  // Chat Messages
  const sendMessage = async (text: string, mediaUrl?: string) => {
    if (!text.trim() && !mediaUrl) return;

    if (!currentUser?.id) {
      addToast('warning', 'Sign In Required', 'Please sign in to send direct messages.');
      return;
    }

    if (!activeChatUser?.id) {
      addToast('warning', 'No Contact Selected', 'Please select a conversation partner.');
      return;
    }

    const tempId = `msg_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      senderId: currentUser.id,
      receiverId: activeChatUser.id,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isAIVerified: true,
      mediaUrl,
    };

    // Optimistic UI append
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // 1. Moderate DM Text through Centralized Gateway
      if (text.trim()) {
        const modRes = await fetch('/api/moderation/gateway', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: text.trim(),
            content_type: 'dm_text',
            context: 'direct message',
            user_id: currentUser.id,
            target_id: activeChatUser.id,
          }),
        });
        const modData = await modRes.json();

        if (!modData.allowed || modData.decision === 'BLOCK' || modData.decision === 'QUARANTINE') {
          // Rollback immediately
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setStats((prev) => ({ ...prev, toxicBlocked: prev.toxicBlocked + 1 }));

          setBlockedCommentModal({
            open: true,
            commentText: text,
            reason: modData.reason || 'Harmful or Abusive Direct Message Detected',
            toxicityScore: modData.toxicity_score || 85,
            categories: modData.categories || ['HARASSMENT', 'DM_VIOLATION'],
            suggestion: modData.safe_rewrite || 'Please keep private messages safe and respectful.',
            contentType: 'comment',
            message: modData.message || 'Direct message blocked by VERIXA safety gateway.',
            languageDetected: modData.language,
          });

          addToast('error', 'Message Blocked', modData.reason || 'Message violated VERIXA safety policy.');
          return;
        }
      }

      // 2. Moderate Message Media if present
      if (mediaUrl) {
        const mediaModRes = await fetch('/api/moderation/gateway', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: mediaUrl,
            content_type: 'dm_media',
            context: 'direct message media attachment',
            user_id: currentUser.id,
            target_id: activeChatUser.id,
          }),
        });
        const mediaModData = await mediaModRes.json();

        if (!mediaModData.allowed || mediaModData.decision === 'BLOCK' || mediaModData.decision === 'QUARANTINE') {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          addToast('error', 'Media Blocked', mediaModData.reason || 'Message media violated safety guidelines.');
          return;
        }
      }

      const realMsgId = await sendSupabaseMessage(
        currentUser.id,
        activeChatUser.id,
        text,
        mediaUrl
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: realMsgId } : m))
      );
    } catch (err: any) {
      // Rollback on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      addToast('error', 'Message Failed', err.message || 'Could not deliver message. Rolled back.');
    }
  };

  // Notifications
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  const markNotificationsAsRead = () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      if (currentUser?.id) {
        try {
          const storageKey = `verixa_notifications_${currentUser.id}`;
          localStorage.setItem(storageKey, JSON.stringify(updated.slice(0, 50)));
        } catch {}
      }
      return updated;
    });
    if (currentUser?.id) {
      markNotificationsAsReadInSupabase(currentUser.id);
    }
  };

  const markSingleNotificationAsRead = (notifId: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === notifId ? { ...n, read: true } : n));
      if (currentUser?.id) {
        try {
          const storageKey = `verixa_notifications_${currentUser.id}`;
          localStorage.setItem(storageKey, JSON.stringify(updated.slice(0, 50)));
        } catch {}
      }
      return updated;
    });
    if (currentUser?.id) {
      markSingleNotificationAsReadInApi(currentUser.id, notifId);
    }
  };

  // Settings
  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('verixa_user_settings', JSON.stringify(updated));
        }
      } catch {
        // ignore
      }
      return updated;
    });
    addToast('success', 'Settings Updated', 'Your preferences have been applied.');
  };

  const openScannerModal = (type: 'image' | 'video') => {
    setScannerModal({ open: true, type });
  };

  const closeScannerModal = () => {
    setScannerModal({ open: false, type: 'image' });
  };

  return (
    <AppContext.Provider
      value={{
        currentPage,
        setCurrentPage,
        canGoBack,
        goBack,
        pendingVerificationEmail,
        setPendingVerificationEmail,
        currentUser,
        setCurrentUser,
        isAuthenticated,
        login,
        signup,
        loginWithGoogle,
        isUnauthorizedDomainModalOpen,
        openUnauthorizedDomainModal,
        closeUnauthorizedDomainModal,
        resetPassword,
        logout,
        posts,
        isPostsLoading,
        postsError,
        refreshPosts,
        addPost,
        editPost,
        removePost,
        likePost,
        bookmarkPost,
        addComment,
        removeComment,
        followingUserIds,
        followUser,
        isUserFollowing,
        stories,
        addStory,
        viewStory,
        likeStory,
        sendStoryReaction,
        isStoryUploading,
        storyUploadStage,
        setIsStoryUploading,
        setStoryUploadStage,
        reels,
        addReel,
        likeReel,
        blockedCommentModal,
        closeBlockedCommentModal,
        activeChatUser,
        setActiveChatUser,
        messages,
        isMessagesLoading,
        sendMessage,
        unreadChatSenderIds,
        unreadChatSenders,
        totalUnreadMessagesCount,
        markChatAsRead,
        notifications,
        unreadNotifCount,
        markNotificationsAsRead,
        markSingleNotificationAsRead,
        auditLogs,
        stats,
        settings,
        updateSettings,
        toasts,
        addToast,
        removeToast,
        selectedExploreCategory,
        setSelectedExploreCategory,
        exploreSearchQuery,
        setExploreSearchQuery,
        scannerModal,
        openScannerModal,
        closeScannerModal,
        viewingProfileUserId,
        openUserProfile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
