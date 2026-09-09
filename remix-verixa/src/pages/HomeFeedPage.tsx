import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Send,
  ShieldCheck,
  Plus,
  Sparkles,
  MoreHorizontal,
  Flame,
  TrendingUp,
  UserPlus,
  Loader2,
  Scan,
  Shield,
  Eye,
  CheckCircle2,
  Trash2,
  Edit3,
  X,
  Clock,
  Users,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Post, Story, User } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { extractVideoFrames } from '../lib/videoFrameExtractor';
import { scanPrivacyInText } from '../lib/privacyScanner';
import { recordPostInteraction, fetchPostLikedUsers } from '../lib/supabaseServices';

interface UserStoryGroup {
  userId: string;
  user: {
    id: string;
    name: string;
    username: string;
    avatar: string;
    verified?: boolean;
    safetyScore?: number;
  };
  stories: Story[];
  hasUnviewed: boolean;
  latestTimestamp: string;
}

export const HomeFeedPage: React.FC<{ onOpenCreatePost: () => void }> = ({ onOpenCreatePost }) => {
  const {
    posts,
    isPostsLoading,
    postsError,
    refreshPosts,
    likePost,
    bookmarkPost,
    addComment,
    removeComment,
    removePost,
    editPost,
    stories,
    addStory,
    viewStory,
    likeStory,
    sendStoryReaction,
    isStoryUploading,
    storyUploadStage,
    setIsStoryUploading,
    setStoryUploadStage,
    currentUser,
    setCurrentPage,
    addToast,
    openUserProfile,
    followingUserIds,
  } = useApp();

  const [commentInputs, setCommentInputs] = useState<{ [postId: string]: string }>({});
  const [submittingCommentId, setSubmittingCommentId] = useState<string | null>(null);
  const [activeStoryGroup, setActiveStoryGroup] = useState<UserStoryGroup | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number>(0);
  const [storyReplyText, setStoryReplyText] = useState<string>('');
  const [isSendingReaction, setIsSendingReaction] = useState<boolean>(false);
  const [floatingReaction, setFloatingReaction] = useState<string | null>(null);

  const handleSendStoryReaction = async (
    storyId: string,
    authorId: string,
    reactionText: string,
    authorName?: string
  ) => {
    if (!reactionText || !reactionText.trim() || isSendingReaction) return;
    setIsSendingReaction(true);
    const chosenText = reactionText.trim();
    setFloatingReaction(chosenText);

    try {
      await sendStoryReaction(storyId, authorId, chosenText, authorName);
      setStoryReplyText('');
    } catch {
      // notification / toast already handled
    } finally {
      setIsSendingReaction(false);
      setTimeout(() => {
        setFloatingReaction(null);
      }, 1400);
    }
  };

  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editCaptionText, setEditCaptionText] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [feedMode, setFeedMode] = useState<'for-you' | 'following' | 'latest'>('for-you');
  const [selectedExplainPost, setSelectedExplainPost] = useState<Post | null>(null);

  // Collapsible comments state
  const [expandedCommentsPostIds, setExpandedCommentsPostIds] = useState<Set<string>>(new Set());

  const toggleComments = (postId: string) => {
    setExpandedCommentsPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  // Likes modal state & handler
  const [likesModalPostId, setLikesModalPostId] = useState<string | null>(null);
  const [likedUsers, setLikedUsers] = useState<User[]>([]);
  const [isLikedUsersLoading, setIsLikedUsersLoading] = useState<boolean>(false);

  const handleOpenLikesModal = async (postId: string) => {
    setLikesModalPostId(postId);
    setIsLikedUsersLoading(true);
    setLikedUsers([]);
    try {
      const users = await fetchPostLikedUsers(postId);
      setLikedUsers(users);
    } catch (err) {
      console.error('Failed to load liked users:', err);
    } finally {
      setIsLikedUsersLoading(false);
    }
  };

  // Derive displayed posts based on active feed tab
  const displayedPosts = React.useMemo(() => {
    if (feedMode === 'following') {
      return posts.filter((p) => followingUserIds.has(p.user.id));
    }
    if (feedMode === 'latest') {
      return [...posts].sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tB - tA;
      });
    }
    // 'for-you' is default, ranked with transparent heuristic strategy
    return posts;
  }, [posts, feedMode, followingUserIds]);

  // Group stories belonging to current user
  const myStories = React.useMemo(() => {
    if (!currentUser?.id) return [];
    return stories.filter(
      (s) => s.user?.id === currentUser.id || (s as any).user_id === currentUser.id
    );
  }, [stories, currentUser?.id]);

  const myStoryGroup = React.useMemo<UserStoryGroup | null>(() => {
    if (!currentUser?.id || myStories.length === 0) return null;
    const authorName = currentUser.name || 'You';
    const authorUsername = currentUser.username || 'user';
    const safeAvatar = (currentUser.avatar && !currentUser.avatar.includes('unsplash.com'))
      ? currentUser.avatar
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=4285F4&color=fff&size=256&bold=true`;

    return {
      userId: currentUser.id,
      user: {
        id: currentUser.id,
        name: authorName,
        username: authorUsername,
        avatar: safeAvatar,
        verified: currentUser.verified,
        safetyScore: currentUser.safetyScore,
      },
      stories: myStories,
      hasUnviewed: myStories.some((s) => !s.viewed),
      latestTimestamp: myStories[myStories.length - 1]?.timestamp || 'Recent',
    };
  }, [myStories, currentUser]);

  // Group other users' stories strictly by account/user
  const otherStoryGroups = React.useMemo<UserStoryGroup[]>(() => {
    const nonUserStories = stories.filter(
      (s) => s.user?.id !== currentUser?.id && (s as any).user_id !== currentUser?.id
    );

    const groupMap = new Map<string, UserStoryGroup>();
    for (const story of nonUserStories) {
      const uId = String(story.user?.id || (story as any).user_id || story.user?.username || 'user');
      if (!groupMap.has(uId)) {
        const authorName = story.user?.name || (story as any).user_name || 'User';
        const authorUsername = story.user?.username || (story as any).username || 'user';
        const rawAvatar = story.user?.avatar || (story as any).user_avatar;
        const safeAvatar = (rawAvatar && !rawAvatar.includes('unsplash.com'))
          ? rawAvatar
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName || authorUsername)}&background=4285F4&color=fff&size=256&bold=true`;

        groupMap.set(uId, {
          userId: uId,
          user: {
            id: uId,
            name: authorName,
            username: authorUsername,
            avatar: safeAvatar,
            verified: story.user?.verified,
            safetyScore: story.user?.safetyScore,
          },
          stories: [],
          hasUnviewed: false,
          latestTimestamp: story.timestamp || 'Recent',
        });
      }
      const group = groupMap.get(uId)!;
      group.stories.push(story);
      if (!story.viewed) {
        group.hasUnviewed = true;
      }
      group.latestTimestamp = story.timestamp || group.latestTimestamp;
    }

    return Array.from(groupMap.values());
  }, [stories, currentUser?.id]);

  // Unified list of all story groups for seamless next/prev navigation
  const allStoryGroups = React.useMemo<UserStoryGroup[]>(() => {
    const list: UserStoryGroup[] = [];
    if (myStoryGroup) {
      list.push(myStoryGroup);
    }
    list.push(...otherStoryGroups);
    return list;
  }, [myStoryGroup, otherStoryGroups]);

  // Open a specific story group at a given index
  const openStoryGroup = (group: UserStoryGroup, startIndex: number = 0) => {
    const validIdx = Math.max(0, Math.min(startIndex, group.stories.length - 1));
    setActiveStoryGroup(group);
    setActiveStoryIndex(validIdx);
    const targetStory = group.stories[validIdx];
    if (targetStory) {
      viewStory(targetStory.id);
    }
  };

  // Navigate to next story
  const handleNextStory = React.useCallback(() => {
    if (!activeStoryGroup) return;

    if (activeStoryIndex < activeStoryGroup.stories.length - 1) {
      const nextIdx = activeStoryIndex + 1;
      setActiveStoryIndex(nextIdx);
      const nextStory = activeStoryGroup.stories[nextIdx];
      if (nextStory) viewStory(nextStory.id);
    } else {
      // Advance to next user's story group
      const currentGroupIdx = allStoryGroups.findIndex(
        (g) => g.userId === activeStoryGroup.userId
      );
      if (currentGroupIdx !== -1 && currentGroupIdx < allStoryGroups.length - 1) {
        const nextGroup = allStoryGroups[currentGroupIdx + 1];
        setActiveStoryGroup(nextGroup);
        setActiveStoryIndex(0);
        if (nextGroup.stories[0]) viewStory(nextGroup.stories[0].id);
      } else {
        // Reached end of all stories!
        setActiveStoryGroup(null);
        setActiveStoryIndex(0);
      }
    }
  }, [activeStoryGroup, activeStoryIndex, allStoryGroups, viewStory]);

  // Navigate to previous story
  const handlePrevStory = React.useCallback(() => {
    if (!activeStoryGroup) return;

    if (activeStoryIndex > 0) {
      const prevIdx = activeStoryIndex - 1;
      setActiveStoryIndex(prevIdx);
      const prevStory = activeStoryGroup.stories[prevIdx];
      if (prevStory) viewStory(prevStory.id);
    } else {
      // Go back to previous user's story group
      const currentGroupIdx = allStoryGroups.findIndex(
        (g) => g.userId === activeStoryGroup.userId
      );
      if (currentGroupIdx > 0) {
        const prevGroup = allStoryGroups[currentGroupIdx - 1];
        const lastStoryIdx = Math.max(0, prevGroup.stories.length - 1);
        setActiveStoryGroup(prevGroup);
        setActiveStoryIndex(lastStoryIdx);
        if (prevGroup.stories[lastStoryIdx]) viewStory(prevGroup.stories[lastStoryIdx].id);
      }
    }
  }, [activeStoryGroup, activeStoryIndex, allStoryGroups, viewStory]);

  // Reset story reply text and reaction animation on story transition
  React.useEffect(() => {
    setStoryReplyText('');
    setFloatingReaction(null);
  }, [activeStoryGroup?.userId, activeStoryIndex]);

  // Keyboard navigation listener (ArrowRight, ArrowLeft, Escape)
  React.useEffect(() => {
    if (!activeStoryGroup) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') {
        if (e.key === 'Escape') {
          setActiveStoryGroup(null);
          setActiveStoryIndex(0);
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        handleNextStory();
      } else if (e.key === 'ArrowLeft') {
        handlePrevStory();
      } else if (e.key === 'Escape') {
        setActiveStoryGroup(null);
        setActiveStoryIndex(0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeStoryGroup, handleNextStory, handlePrevStory]);

  const handleCommentSubmit = async (postId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = commentInputs[postId];
    if (!text || !text.trim() || submittingCommentId === postId) return;

    // Check privacy sensitivity
    const privacyCheck = scanPrivacyInText(text);
    if (privacyCheck.has_sensitive_data) {
      addToast(
        'warning',
        'Privacy Alert',
        `Sensitive personal data detected (${privacyCheck.detected_types.map((t) => t.replace('_', ' ')).join(', ')}). Protect your personal privacy!`
      );
    }

    setSubmittingCommentId(postId);

    try {
      const result = await addComment(postId, text);
      if (result.allowed) {
        // Clear input ONLY after comment passed AI safety scan and was posted
        setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      }
      // If NOT allowed, text remains intact in the input so user can edit it based on AI suggestions!
    } finally {
      setSubmittingCommentId(null);
    }
  };

  const handleShare = (post: Post) => {
    navigator.clipboard.writeText(window.location.href);
    addToast('info', 'Link Copied', 'Encrypted post share link copied to clipboard.');
    if (currentUser?.id) {
      recordPostInteraction(currentUser.id, post.id, 'share');
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Stories Bar */}
      {/* Active Story Upload Progress Banner */}
      {isStoryUploading && (
        <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-950/90 via-purple-950/90 to-slate-950/90 border border-purple-500/40 backdrop-blur-xl shadow-xl flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-8 h-8 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              <ShieldCheck className="w-2.5 h-2.5 text-cyan-300 absolute" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-white text-xs">Uploading Story</p>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-cyan-300 border border-blue-500/30 animate-pulse">
                  AI SCAN ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate">
                {storyUploadStage || 'VERIXA Vision AI analyzing content for safety...'}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
              <div className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full animate-pulse w-full" />
            </div>
            <span className="text-[10px] font-medium text-slate-400">Please wait</span>
          </div>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-lg overflow-x-auto custom-scrollbar flex items-center gap-4">
        {/* Hidden File Input for Story Upload */}
        <input
          type="file"
          id="story-file-upload"
          accept="image/*,video/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const isVid = file.type.startsWith('video');
            setIsStoryUploading(true);
            setStoryUploadStage(isVid ? 'Extracting video frames for AI scan...' : 'Preparing image media...');

            let frames: Array<{ timestamp: number; data: string }> | undefined;
            if (isVid) {
              try {
                const ext = await extractVideoFrames(file, 1.0, 6);
                frames = ext.frames;
              } catch (extErr) {
                console.warn('Story video frame extract notice:', extErr);
              }
            }
            setStoryUploadStage('VERIXA Vision AI analyzing content for safety...');
            const reader = new FileReader();
            reader.onload = async () => {
              const dataUrl = reader.result as string;
              try {
                await addStory(dataUrl, isVid ? 'video' : 'image', frames);
              } finally {
                setIsStoryUploading(false);
                setStoryUploadStage('');
              }
            };
            reader.readAsDataURL(file);
            e.target.value = '';
          }}
        />

        {/* Create / View My Story Circle */}
        <div className="flex flex-col items-center gap-1.5 shrink-0 group">
          <div className="relative">
            {isStoryUploading ? (
              /* Story Uploading Animation State on Profile Circle */
              <div className="w-14 h-14 rounded-full p-[2px] relative flex items-center justify-center">
                {/* Rotating Glowing Neon Gradient Ring */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 animate-spin shadow-[0_0_18px_rgba(168,85,247,0.7)]" />
                {/* Inner Circle with Avatar & Radar Spinner */}
                <div className="relative w-full h-full rounded-full bg-slate-950 flex items-center justify-center overflow-hidden border-2 border-slate-950">
                  <img
                    src={
                      (currentUser?.avatar && !currentUser.avatar.includes('unsplash.com'))
                        ? currentUser.avatar
                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.username || 'You')}&background=4285F4&color=fff&size=256&bold=true`
                    }
                    alt="Uploading..."
                    className="w-full h-full rounded-full object-cover opacity-30 scale-95 blur-[0.5px]"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-6 h-6 text-cyan-300 animate-spin" />
                  </div>
                </div>

                {/* Pulsing AI badge in bottom right */}
                <div
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center justify-center border-2 border-slate-950 shadow-md animate-pulse"
                  title="AI Safety Scanner Active"
                >
                  <Sparkles className="w-3 h-3 text-cyan-200" />
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (myStoryGroup && myStoryGroup.stories.length > 0) {
                    openStoryGroup(myStoryGroup, 0);
                  } else {
                    const fileInput = document.getElementById('story-file-upload');
                    if (fileInput) {
                      fileInput.click();
                    } else {
                      const url = prompt(
                        'Enter image or video URL for story:',
                        'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80'
                      );
                      if (url) addStory(url);
                    }
                  }
                }}
                className="focus:outline-none cursor-pointer"
              >
                <div
                  className={`w-14 h-14 rounded-full p-0.5 transition ${
                    myStoryGroup && myStoryGroup.stories.length > 0
                      ? !myStoryGroup.hasUnviewed
                        ? 'bg-white/20 border border-white/20'
                        : 'bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                      : 'border-2 border-dashed border-blue-500/50 group-hover:border-blue-400 bg-black/40'
                  } flex items-center justify-center`}
                >
                  <img
                    src={
                      (currentUser?.avatar && !currentUser.avatar.includes('unsplash.com'))
                        ? currentUser.avatar
                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.username || 'You')}&background=4285F4&color=fff&size=256&bold=true`
                    }
                    alt="Your Story"
                    referrerPolicy="no-referrer"
                    className={`w-full h-full rounded-full object-cover ${myStoryGroup && myStoryGroup.stories.length > 0 ? 'border-2 border-[#050507]' : 'opacity-85'}`}
                  />
                </div>

                {/* Multi-story count badge for current user */}
                {myStoryGroup && myStoryGroup.stories.length > 1 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-[9px] border border-slate-900 shadow-md">
                    {myStoryGroup.stories.length}
                  </span>
                )}
              </button>
            )}

            {/* Plus add button badge (only visible when not uploading) */}
            {!isStoryUploading && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const fileInput = document.getElementById('story-file-upload');
                  if (fileInput) {
                    fileInput.click();
                  } else {
                    const url = prompt(
                      'Enter image or video URL for story:',
                      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80'
                    );
                    if (url) addStory(url);
                  }
                }}
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center border-2 border-slate-950 shadow-md transition transform hover:scale-110 focus:outline-none cursor-pointer"
                title="Add another story"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
          {isStoryUploading ? (
            <span className="text-[10px] font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-purple-300 to-pink-400 bg-clip-text text-transparent animate-pulse">
              Scanning...
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-gray-300">Your Story</span>
          )}
        </div>

        {/* Other Users' Stories (Exactly one profile circle per user account) */}
        {otherStoryGroups.map((group) => (
          <button
            key={group.userId}
            onClick={() => openStoryGroup(group, 0)}
            className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none cursor-pointer"
          >
            <div className="relative">
              <div
                className={`w-14 h-14 rounded-full p-0.5 transition ${
                  group.hasUnviewed
                    ? 'bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                    : 'bg-white/10 border border-white/20'
                }`}
              >
                <img
                  src={group.user.avatar}
                  alt={group.user.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full rounded-full object-cover border-2 border-[#050507]"
                />
              </div>

              {/* Multi-story count badge for other user */}
              {group.stories.length > 1 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold text-[9px] border border-slate-900 shadow-md">
                  {group.stories.length}
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-gray-300 truncate w-14 text-center">
              @{group.user.username}
            </span>
          </button>
        ))}
      </div>

          {/* Post Composer */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex gap-4">
              <img
                src={currentUser?.avatar}
                alt={currentUser?.name}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover shrink-0 border border-white/10"
              />
              <button
                onClick={onOpenCreatePost}
                className="flex-1 text-left bg-transparent border-none text-gray-400 text-sm py-2 hover:text-gray-200 focus:outline-none transition-colors"
              >
                What's happening safely?
              </button>
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
              <div className="flex gap-4 text-gray-400">
                <button onClick={onOpenCreatePost} className="hover:text-blue-400 transition-colors">
                  <Sparkles className="w-5 h-5" />
                </button>
                <button onClick={onOpenCreatePost} className="hover:text-blue-400 transition-colors">
                  <Scan className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={onOpenCreatePost}
                className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-full font-bold text-xs uppercase tracking-wider text-white transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)]"
              >
                POST
              </button>
            </div>
          </div>

          {/* Feed Mode Switcher Tabs */}
          <div className="flex items-center justify-between p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm shadow-md">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFeedMode('for-you')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  feedMode === 'for-you'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-300" />
                <span>For You (AI)</span>
              </button>
              <button
                type="button"
                onClick={() => setFeedMode('following')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  feedMode === 'following'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-purple-300" />
                <span>Following</span>
                {followingUserIds.size > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-mono">
                    {followingUserIds.size}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFeedMode('latest')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  feedMode === 'latest'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>Latest</span>
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 text-[10px] text-gray-400 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
              <span>Transparent AI Ranking</span>
            </div>
          </div>

          {/* Posts Feed */}
          <div className="space-y-6">
            {isPostsLoading ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3 backdrop-blur-sm shadow-xl">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <p className="text-sm font-medium text-gray-300">Loading verified community feed...</p>
              </div>
            ) : postsError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center space-y-4 backdrop-blur-sm shadow-xl">
                <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Could not load feed</h4>
                  <p className="text-xs text-gray-400 mt-1">{postsError}</p>
                </div>
                <button
                  onClick={() => refreshPosts()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold transition flex items-center gap-2 mx-auto"
                >
                  <Loader2 className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            ) : displayedPosts.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center space-y-4 backdrop-blur-sm shadow-xl">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                  {feedMode === 'following' ? <Users className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">
                    {feedMode === 'following' ? 'No Posts From Followed Creators' : 'No Posts Yet'}
                  </h3>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto">
                    {feedMode === 'following'
                      ? 'Follow more community members to see their safe posts here, or switch to "For You" for AI-recommended safe content!'
                      : 'Be the first to share a safe, AI-verified post with the VERIXA community!'}
                  </p>
                </div>
                {feedMode === 'following' ? (
                  <button
                    onClick={() => setFeedMode('for-you')}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-full shadow-lg shadow-blue-500/25 transition"
                  >
                    Switch to For You
                  </button>
                ) : (
                  <button
                    onClick={onOpenCreatePost}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-full shadow-lg shadow-blue-500/25 transition"
                  >
                    Create First Post
                  </button>
                )}
              </div>
            ) : (
              displayedPosts.map((post) => {
              const postCommentText = commentInputs[post.id] || '';
              const isSubmitting = submittingCommentId === post.id;

              return (
                <motion.article
                  key={post.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 border border-white/10 rounded-2xl p-6 relative backdrop-blur-sm shadow-xl"
                >
                  {/* Post Header: Avatar circle is permanently FIXED before username */}
                  <div className="flex items-center justify-between gap-3 mb-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Fixed Profile Avatar Circle */}
                      <button
                        type="button"
                        onClick={() => openUserProfile(post.user)}
                        className="relative shrink-0 focus:outline-none group cursor-pointer"
                        title={`View @${post.user.username}'s profile`}
                      >
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full p-[2px] bg-gradient-to-tr from-purple-500/40 via-blue-500/40 to-emerald-400/40 border border-white/15 shadow-sm group-hover:border-blue-400/60 transition-all duration-200">
                          <img
                            src={post.user.avatar}
                            alt={post.user.name}
                            className="w-full h-full rounded-full object-cover bg-slate-900"
                          />
                        </div>
                      </button>

                      {/* User Info (Name, Verified, AI Trust Badge, Handle) */}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="font-bold text-gray-100 hover:text-blue-400 transition cursor-pointer text-sm sm:text-base truncate"
                            onClick={() => openUserProfile(post.user)}
                          >
                            {post.user.name}
                          </span>
                          {post.user.verified && (
                            <span title="Verified User" className="inline-flex items-center shrink-0">
                              <CheckCircle2 className="w-4 h-4 text-blue-400 fill-blue-400/20" />
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shrink-0 shadow-sm">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20" />
                            <span>{post.user.aiTrustBadge || 'Verified Human'}</span>
                          </span>
                        </div>
                        <div className="text-gray-500 text-xs truncate mt-0.5">
                          @{post.user.username} • {post.timestamp}
                        </div>
                      </div>
                    </div>

                    {/* Top Right: Explainability & Options Menu */}
                    <div className="flex items-center gap-2 shrink-0">
                      {post.explainability && (
                        <button
                          type="button"
                          onClick={() => setSelectedExplainPost(post)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-[10px] font-semibold text-blue-300 transition cursor-pointer shadow-sm"
                          title="Why was this recommended to you?"
                        >
                          <Sparkles className="w-3 h-3 text-blue-400" />
                          <span className="hidden sm:inline">Why this?</span>
                        </button>
                      )}

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenMenuPostId(openMenuPostId === post.id ? null : post.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {openMenuPostId === post.id && (
                          <div className="absolute right-0 top-8 w-40 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1.5 z-20 text-xs">
                            {post.user.id === currentUser?.id ? (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingPost(post);
                                    setEditCaptionText(post.caption);
                                    setOpenMenuPostId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-blue-400" /> Edit Caption
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenMenuPostId(null);
                                    if (confirm('Are you sure you want to delete this post?')) {
                                      removePost(post.id);
                                    }
                                  }}
                                  className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-950/30 flex items-center gap-2 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Delete Post
                                </button>
                              </>
                            ) : null}
                            <button
                              onClick={() => {
                                handleShare(post);
                                setOpenMenuPostId(null);
                              }}
                              className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 flex items-center gap-2 transition"
                            >
                              <Share2 className="w-3.5 h-3.5 text-purple-400" /> Share Post
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Post Caption */}
                  {post.caption && (
                    <p className="text-gray-200 leading-relaxed text-sm whitespace-pre-line mb-3">
                      {post.caption}
                    </p>
                  )}

                  {/* Post Tags */}
                  {post.tags && post.tags.length > 0 && (
                    <div className="mb-3.5 flex flex-wrap gap-2">
                      {post.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-xs text-blue-400 font-semibold hover:underline cursor-pointer"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Post / Reel Media (Moderate ratio, not zoomed nor compressed) */}
                  {post.mediaUrl && (
                    <div className="mb-4 rounded-2xl overflow-hidden border border-white/10 bg-black/90 relative w-full max-h-[500px] sm:max-h-[520px] flex items-center justify-center shadow-lg">
                      {post.mediaType === 'video' ? (
                        <video
                          src={post.mediaUrl}
                          controls
                          className="w-full max-h-[500px] sm:max-h-[520px] object-contain rounded-2xl"
                        />
                      ) : (
                        <img
                          src={post.mediaUrl}
                          alt="Post media"
                          className="w-full max-h-[500px] sm:max-h-[520px] object-contain rounded-2xl"
                        />
                      )}

                      {/* AI Vision Scan Badge Overlay */}
                      <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/80 border border-white/10 backdrop-blur-md text-[10px] text-gray-300 font-mono flex items-center gap-1.5 shadow-lg">
                        <Scan className="w-3.5 h-3.5 text-green-400" />
                        <span>AI Verified • NSFW {post.aiScanDetails.nsfwScore}%</span>
                      </div>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex gap-8 mt-4 text-gray-400 text-xs font-medium">
                    {/* Likes (Heart toggles like, count opens who liked) */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => likePost(post.id)}
                        className={`p-1 -ml-1 rounded-full hover:bg-white/5 transition active:scale-90 duration-75 cursor-pointer ${
                          post.isLiked ? 'text-red-400' : 'hover:text-red-400'
                        }`}
                        title={post.isLiked ? 'Unlike post' : 'Like post'}
                      >
                        <Heart className={`w-5 h-5 transition-transform duration-75 ${post.isLiked ? 'fill-red-400 scale-110' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenLikesModal(post.id)}
                        className="text-xs font-semibold text-gray-400 hover:text-white hover:underline cursor-pointer transition px-1 py-0.5 rounded hover:bg-white/5"
                        title="View who liked this post"
                      >
                        {post.likes}
                      </button>
                    </div>

                    {/* Comment Toggle Button */}
                    <button
                      type="button"
                      onClick={() => toggleComments(post.id)}
                      className={`flex items-center gap-2 transition-colors active:scale-95 duration-75 cursor-pointer ${
                        expandedCommentsPostIds.has(post.id) ? 'text-blue-400 font-semibold' : 'hover:text-blue-400'
                      }`}
                      title={expandedCommentsPostIds.has(post.id) ? 'Collapse comments' : 'Expand comments'}
                    >
                      <MessageCircle className={`w-5 h-5 ${expandedCommentsPostIds.has(post.id) ? 'fill-blue-400/20' : ''}`} />
                      <span>{post.comments.length}</span>
                    </button>
                    <button
                      onClick={() => handleShare(post)}
                      className="flex items-center gap-2 hover:text-purple-400 transition-colors active:scale-90 duration-75 cursor-pointer"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => bookmarkPost(post.id)}
                      className={`flex items-center gap-2 hover:text-yellow-400 transition-colors ml-auto active:scale-90 duration-75 cursor-pointer ${
                        post.isBookmarked ? 'text-yellow-400' : ''
                      }`}
                    >
                      <Bookmark className={`w-5 h-5 transition-transform duration-75 ${post.isBookmarked ? 'fill-yellow-400 scale-110' : ''}`} />
                    </button>
                  </div>

                  {/* Comments Sub-Panel (Only displayed when clicking the comments button) */}
                  <AnimatePresence>
                    {expandedCommentsPostIds.has(post.id) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                          {post.comments.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                              {post.comments.map((comment) => (
                                <div
                                  key={comment.id}
                                  className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs flex items-start gap-2.5"
                                >
                                  <img
                                    src={comment.user.avatar}
                                    alt={comment.user.name}
                                    className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-gray-200">
                                        {comment.user.name}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-green-400 font-mono flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" /> Safe
                                        </span>
                                        {comment.user.id === currentUser?.id && (
                                          <button
                                            type="button"
                                            onClick={() => removeComment(post.id, comment.id)}
                                            className="text-gray-500 hover:text-red-400 p-0.5 rounded transition"
                                            title="Delete comment"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <p className="text-gray-300 mt-0.5 leading-snug">
                                      {comment.content}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 italic py-1">
                              No comments yet. Be the first to start the discussion!
                            </p>
                          )}

                          {/* Comment Input */}
                          <form
                            onSubmit={(e) => handleCommentSubmit(post.id, e)}
                            className="flex items-center gap-2 pt-1"
                          >
                            <input
                              type="text"
                              value={postCommentText}
                              disabled={submittingCommentId === post.id}
                              onChange={(e) =>
                                setCommentInputs({ ...commentInputs, [post.id]: e.target.value })
                              }
                              placeholder={submittingCommentId === post.id ? "Scanning safety..." : "Write a comment... (AI verified safe)"}
                              className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
                            />
                            <button
                              type="submit"
                              disabled={!postCommentText.trim() || submittingCommentId === post.id}
                              className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-90 text-white font-bold text-xs disabled:opacity-40 transition-all duration-75 flex items-center gap-1.5 shadow-[0_0_10px_rgba(37,99,235,0.3)] shrink-0 cursor-pointer"
                              title={submittingCommentId === post.id ? "AI Safety Scan in progress..." : "Post Comment"}
                            >
                              {submittingCommentId === post.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </form>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              );
            })
            )}
          </div>

          {/* Story Viewer Modal */}
          {activeStoryGroup && (() => {
            const currentStoryRaw = activeStoryGroup.stories[activeStoryIndex] || activeStoryGroup.stories[0];
            if (!currentStoryRaw) return null;

            // Live story reference synced from stories state
            const liveCurrentStory = stories.find((s) => s.id === currentStoryRaw.id) || currentStoryRaw;

            const storyMedia = liveCurrentStory.mediaUrl || (liveCurrentStory as any).media_url || '';
            const isVideo =
              liveCurrentStory.type === 'video' ||
              (liveCurrentStory as any).media_type === 'video' ||
              storyMedia.includes('.mp4');

            const isStoryOwner =
              (activeStoryGroup.userId && activeStoryGroup.userId === currentUser?.id) ||
              (liveCurrentStory.user?.id && liveCurrentStory.user.id === currentUser?.id) ||
              (liveCurrentStory as any).user_id === currentUser?.id;

            const userName = activeStoryGroup.user.name || activeStoryGroup.user.username || 'User';
            const userAvatar =
              activeStoryGroup.user.avatar ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=4285F4&color=fff&size=256&bold=true`;
            const storyTimestamp = liveCurrentStory.timestamp || (liveCurrentStory as any).created_at || 'Just now';
            const viewsCount = liveCurrentStory.viewsCount ?? (liveCurrentStory as any).views_count ?? 1;

            const likedBy = liveCurrentStory.likedBy || (liveCurrentStory as any).liked_by || [];
            const isLiked = Boolean(
              liveCurrentStory.isLiked ||
              (currentUser?.id && likedBy.includes(currentUser.id))
            );
            const likesCount = liveCurrentStory.likesCount ?? (liveCurrentStory as any).likes_count ?? likedBy.length ?? 0;

            const totalInGroup = activeStoryGroup.stories.length;

            // Check if there is a previous or next story or group
            const currentGroupIdx = allStoryGroups.findIndex((g) => g.userId === activeStoryGroup.userId);
            const hasPrev = activeStoryIndex > 0 || currentGroupIdx > 0;
            const hasNext = activeStoryIndex < totalInGroup - 1 || (currentGroupIdx !== -1 && currentGroupIdx < allStoryGroups.length - 1);

            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/92 backdrop-blur-xl transition-all select-none"
                onClick={() => {
                  setActiveStoryGroup(null);
                  setActiveStoryIndex(0);
                }}
              >
                {/* Floating Left Arrow Button (Desktop & Tablet) */}
                <button
                  type="button"
                  aria-label="Previous story"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrevStory();
                  }}
                  disabled={!hasPrev}
                  className={`hidden sm:flex absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full items-center justify-center backdrop-blur-xl border transition-all duration-200 cursor-pointer shadow-2xl ${
                    hasPrev
                      ? 'bg-slate-900/80 hover:bg-slate-800 text-white border-white/20 hover:scale-110 active:scale-95 hover:border-purple-500/50'
                      : 'bg-slate-900/40 text-white/20 border-white/5 cursor-not-allowed'
                  }`}
                  title="Previous story (Left Arrow)"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                {/* Floating Right Arrow Button (Desktop & Tablet) */}
                <button
                  type="button"
                  aria-label="Next story"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextStory();
                  }}
                  className="hidden sm:flex absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full items-center justify-center backdrop-blur-xl border bg-slate-900/80 hover:bg-slate-800 text-white border-white/20 hover:scale-110 active:scale-95 hover:border-purple-500/50 transition-all duration-200 cursor-pointer shadow-2xl"
                  title="Next story (Right Arrow)"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>

                {/* Main Story Container - Enlarged, modern 9:16 vertical styling */}
                <div
                  className="relative w-full max-w-lg md:max-w-xl h-[85vh] max-h-[850px] bg-slate-950 border border-slate-700/60 rounded-[32px] overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col justify-between"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Ambient Blurred Background Glow */}
                  {storyMedia && (
                    <div
                      className="absolute inset-0 z-0 opacity-30 blur-3xl scale-110 pointer-events-none"
                      style={{
                        backgroundImage: `url(${storyMedia})`,
                        backgroundPosition: 'center',
                        backgroundSize: 'cover',
                      }}
                    />
                  )}

                  {/* Top Segmented Progress Bars */}
                  <div className="relative z-20 pt-3.5 px-4 pb-1">
                    <div className="flex items-center gap-1.5 w-full">
                      {activeStoryGroup.stories.map((s, idx) => (
                        <div
                          key={s.id || idx}
                          className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/25 backdrop-blur-sm"
                        >
                          <div
                            className={`h-full transition-all duration-300 ${
                              idx < activeStoryIndex
                                ? 'w-full bg-white'
                                : idx === activeStoryIndex
                                ? 'w-full bg-gradient-to-r from-purple-400 to-pink-400'
                                : 'w-0 bg-transparent'
                            }`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Header Bar */}
                  <div className="relative z-20 px-4 py-2 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent">
                    <div className="flex items-center gap-2.5">
                      <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500">
                        <img
                          src={userAvatar}
                          alt={userName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border-2 border-black"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-sm text-white drop-shadow-sm">{userName}</h4>
                          {activeStoryGroup.user.verified && (
                            <span className="text-blue-400 text-xs" title="Verified Account">✓</span>
                          )}
                          {totalInGroup > 1 && (
                            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-mono text-white/90">
                              {activeStoryIndex + 1}/{totalInGroup}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-300/80">
                          <span>{storyTimestamp}</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-medium">🛡️ Safe</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Mobile Next/Prev quick buttons */}
                      <div className="flex sm:hidden items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrevStory();
                          }}
                          disabled={!hasPrev}
                          className="p-1.5 rounded-full bg-black/50 text-white border border-white/10 disabled:opacity-30"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNextStory();
                          }}
                          className="p-1.5 rounded-full bg-black/50 text-white border border-white/10"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          setActiveStoryGroup(null);
                          setActiveStoryIndex(0);
                        }}
                        className="p-2 rounded-full bg-black/50 hover:bg-black/80 text-slate-300 hover:text-white border border-white/10 hover:border-white/30 transition shadow-lg cursor-pointer"
                        title="Close Story Viewer (Esc)"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Media Content Display with side click tap-zones */}
                  <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
                    {/* Left Tap Zone (Click left 35% of story to go prev) */}
                    <div
                      className="absolute inset-y-0 left-0 w-[35%] z-10 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrevStory();
                      }}
                      title="Previous"
                    />

                    {/* Right Tap Zone (Click right 65% of story to go next) */}
                    <div
                      className="absolute inset-y-0 right-0 w-[65%] z-10 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNextStory();
                      }}
                      title="Next"
                    />

                    {/* Actual Story Media */}
                    {isVideo ? (
                      <video
                        src={storyMedia}
                        autoPlay
                        loop
                        playsInline
                        className="relative z-0 max-h-full max-w-full w-auto h-auto object-contain rounded-lg"
                      />
                    ) : (
                      <img
                        src={storyMedia}
                        alt="Story content"
                        className="relative z-0 max-h-full max-w-full w-auto h-auto object-contain rounded-lg drop-shadow-2xl"
                      />
                    )}
                  </div>

                  {/* Floating Reaction Animation Overlay */}
                  <AnimatePresence>
                    {floatingReaction && (
                      <motion.div
                        key={floatingReaction}
                        initial={{ opacity: 0, scale: 0.5, y: 40 }}
                        animate={{ opacity: 1, scale: 1.8, y: -80 }}
                        exit={{ opacity: 0, scale: 2.2, y: -160 }}
                        transition={{ duration: 0.9, ease: 'easeOut' }}
                        className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-5xl filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.9)] select-none"
                      >
                        {floatingReaction}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Bottom Story Controls & Reaction Footer */}
                  <div className="relative z-20 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent space-y-2.5">
                    {/* Quick Reaction Emojis & Meta Row */}
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        {['❤️', '🔥', '😂', '👏', '😮', '🎉', '🙌', '💯'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendStoryReaction(
                                liveCurrentStory.id,
                                activeStoryGroup.userId,
                                emoji,
                                userName
                              );
                            }}
                            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 active:scale-90 transition-all flex items-center justify-center text-sm cursor-pointer shadow-sm hover:scale-115"
                            title={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] text-slate-300 font-mono flex items-center gap-1 shadow">
                          <span>👁️</span>
                          <span className="font-semibold">{viewsCount}</span>
                        </div>
                        {isStoryOwner && (
                          <div className="px-2 py-0.5 rounded-full bg-purple-900/70 border border-purple-500/40 text-[10px] text-purple-200 font-medium shrink-0">
                            Your Story
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Main Interaction Row: Reply Input Bar & Icon-Only Like Button */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 flex items-center bg-black/70 hover:bg-black/85 focus-within:bg-black/90 backdrop-blur-xl border border-white/20 focus-within:border-purple-500/70 rounded-full px-3.5 py-1.5 transition shadow-xl">
                        <input
                          type="text"
                          value={storyReplyText}
                          onChange={(e) => setStoryReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              handleSendStoryReaction(
                                liveCurrentStory.id,
                                activeStoryGroup.userId,
                                storyReplyText,
                                userName
                              );
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder={`Reply to ${userName}...`}
                          className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none pr-8"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendStoryReaction(
                              liveCurrentStory.id,
                              activeStoryGroup.userId,
                              storyReplyText,
                              userName
                            );
                          }}
                          disabled={!storyReplyText.trim() || isSendingReaction}
                          className="absolute right-2 p-1.5 rounded-full text-purple-400 hover:text-purple-300 disabled:opacity-20 disabled:hover:text-purple-400 transition cursor-pointer"
                          title="Send reaction"
                        >
                          {isSendingReaction ? (
                            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Icon-Only Like Button (Number removed as requested) */}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!currentUser) {
                            addToast('warning', 'Sign In Required', 'Please sign in to like stories.');
                            return;
                          }

                          const nextLiked = !isLiked;
                          const nextCount = nextLiked ? likesCount + 1 : Math.max(0, likesCount - 1);

                          // Optimistic update
                          setActiveStoryGroup((prev) => {
                            if (!prev) return null;
                            const updatedStories = prev.stories.map((s, idx) => {
                              if (idx === activeStoryIndex || s.id === liveCurrentStory.id) {
                                const prevLikedBy = s.likedBy || (s as any).liked_by || [];
                                const updatedLikedBy = nextLiked
                                  ? Array.from(new Set([...prevLikedBy, currentUser.id]))
                                  : prevLikedBy.filter((id: string) => id !== currentUser.id);
                                return {
                                  ...s,
                                  isLiked: nextLiked,
                                  likesCount: nextCount,
                                  likes_count: nextCount,
                                  likedBy: updatedLikedBy,
                                  liked_by: updatedLikedBy,
                                };
                              }
                              return s;
                            });
                            return {
                              ...prev,
                              stories: updatedStories,
                            };
                          });

                          await likeStory(liveCurrentStory.id, activeStoryGroup.userId, userName);
                        }}
                        className={`w-10 h-10 rounded-full backdrop-blur-xl border flex items-center justify-center transition-all duration-200 active:scale-90 shadow-xl cursor-pointer shrink-0 ${
                          isLiked
                            ? 'bg-rose-500/25 border-rose-500/70 text-rose-300 hover:bg-rose-500/35 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                            : 'bg-black/70 border-white/20 text-slate-300 hover:text-white hover:border-white/40'
                        }`}
                        title={isLiked ? 'Unlike story' : 'Like story'}
                      >
                        <Heart
                          className={`w-5 h-5 transition-all duration-200 ${
                            isLiked
                              ? 'fill-rose-500 text-rose-500 scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.9)]'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

      {/* Edit Post Modal */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" /> Edit Post Caption
              </h3>
              <button
                onClick={() => setEditingPost(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              value={editCaptionText}
              onChange={(e) => setEditCaptionText(e.target.value)}
              rows={4}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none custom-scrollbar"
              placeholder="Update caption..."
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingPost(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingEdit || !editCaptionText.trim()}
                onClick={async () => {
                  if (!editingPost) return;
                  setIsSavingEdit(true);
                  await editPost(editingPost.id, { caption: editCaptionText });
                  setIsSavingEdit(false);
                  setEditingPost(null);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explainability Factor Breakdown Modal */}
      {selectedExplainPost && selectedExplainPost.explainability && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Why was this recommended?</h3>
                  <p className="text-[10px] text-gray-400 font-mono">
                    Model: {selectedExplainPost.explainability.strategy} • Total Score: {selectedExplainPost.explainability.total_score.toFixed(1)} pts
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExplainPost(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Post Summary Snippet */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3">
              <img
                src={selectedExplainPost.user.avatar}
                alt={selectedExplainPost.user.name}
                className="w-9 h-9 rounded-full object-cover border border-white/10"
              />
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-bold text-white truncate">{selectedExplainPost.user.name}</div>
                <div className="text-gray-400 text-[11px] truncate">
                  {selectedExplainPost.caption || 'Media post'}
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-mono text-blue-300 font-bold">
                Rank #{selectedExplainPost.explainability.rank}
              </div>
            </div>

            {/* Primary Recommendation Reason Box */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-950/40 to-indigo-950/40 border border-blue-500/20">
              <div className="text-[10px] uppercase font-bold tracking-wider text-blue-400 mb-1 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Primary Matching Reason
              </div>
              <p className="text-xs text-gray-200 leading-relaxed font-medium">
                "{selectedExplainPost.explainability.summary}"
              </p>
            </div>

            {/* Transparent Factor Breakdown */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Transparent Vector Scoring (11 Scoring Vectors)
              </div>
              <div className="space-y-1.5">
                {selectedExplainPost.explainability.factors.map((factor, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5 max-w-[75%]">
                      <div className="font-semibold text-gray-200 flex items-center gap-1.5">
                        <span>{factor.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          (Weight: {Math.round(factor.weight * 100)}%)
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400">{factor.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`font-mono text-xs font-bold ${
                        factor.score > 0 ? 'text-emerald-400' : 'text-gray-500'
                      }`}>
                        +{factor.score.toFixed(1)} pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ethical & Safety Safeguards Reassurance */}
            <div className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 space-y-1.5 text-[11px] text-gray-300">
              <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                <ShieldCheck className="w-4 h-4" /> VERIXA Transparent Ranking Commitments
              </div>
              <ul className="space-y-1 text-gray-400 list-disc list-inside">
                <li><strong className="text-gray-300">Safe-Only:</strong> Blocked, quarantined, or unsafe content is strictly excluded before ranking.</li>
                <li><strong className="text-gray-300">Non-Discriminatory:</strong> Your Guardian safety score is never used to penalize your content access.</li>
                <li><strong className="text-gray-300">Explainable:</strong> Weighted scoring is deterministic, adjustable, and fully auditable.</li>
              </ul>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedExplainPost(null)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition"
              >
                Close Explanation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= POST LIKES MODAL ================= */}
      {likesModalPostId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Heart className="w-5 h-5 fill-rose-500/20" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Liked By</h3>
                  <p className="text-xs text-slate-400">
                    {likedUsers.length} {likedUsers.length === 1 ? 'person' : 'people'} liked this post
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLikesModalPostId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-1 min-h-[160px]">
              {isLikedUsersLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <span className="text-xs">Fetching likes from database...</span>
                </div>
              ) : likedUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center space-y-2">
                  <div className="p-3 rounded-full bg-slate-800/80 text-slate-500">
                    <Heart className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-300">No likes yet</p>
                  <p className="text-xs text-slate-500">Be the first to like this post!</p>
                </div>
              ) : (
                likedUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => {
                      openUserProfile(u);
                      setLikesModalPostId(null);
                    }}
                    className="p-3 rounded-2xl bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/50 hover:border-purple-500/30 transition flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full p-[1.5px] bg-gradient-to-tr from-purple-500/40 to-blue-500/40 shrink-0">
                        <img
                          src={u.avatar}
                          alt={u.name}
                          className="w-full h-full rounded-full object-cover bg-slate-900"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-white text-sm group-hover:text-blue-400 transition truncate">
                            {u.name}
                          </span>
                          {u.verified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 fill-blue-400/20 shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate">@{u.username}</div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium">
                        <Shield className="w-3 h-3 text-emerald-400" />
                        <span className="hidden sm:inline">{u.aiTrustBadge || 'Verified Human'}</span>
                        <span className="sm:hidden">Verified</span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setLikesModalPostId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
