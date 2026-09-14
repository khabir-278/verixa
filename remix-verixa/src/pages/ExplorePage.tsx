import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  Search,
  Sparkles,
  ShieldCheck,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Play,
  Pause,
  Film,
  Image as ImageIcon,
  Quote,
  X,
  Send,
  Loader2,
  TrendingUp,
  Trash2,
  CheckCircle2,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Music,
  Flame,
  Clock,
  Shuffle,
  LayoutGrid,
  Grid,
  SlidersHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { scanPrivacyInText } from '../lib/privacyScanner';
import { Post, Reel, Comment, User } from '../types';
import { getSafeAvatar, fetchReelComments, addReelComment } from '../lib/supabaseServices';

/**
 * Dedicated Custom Video Player for Explore Modal:
 * Completely disables browser-injected Picture-in-Picture and browser quick-action / translation overlays.
 */
interface ExploreVideoPlayerProps {
  src: string;
}

const ExploreVideoPlayer: React.FC<ExploreVideoPlayerProps> = ({ src }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (timeInSec: number) => {
    if (isNaN(timeInSec) || !isFinite(timeInSec)) return '0:00';
    const mins = Math.floor(timeInSec / 60);
    const secs = Math.floor(timeInSec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newTime = parseFloat(e.target.value);
    if (!videoRef.current) return;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 2500);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={togglePlay}
      className="relative rounded-2xl overflow-hidden bg-black max-h-[420px] w-full flex items-center justify-center border border-slate-800 group select-none cursor-pointer"
    >
      {/* Video Element: pointer-events-none + disablePictureInPicture ensures browser PiP & Translator tools are completely blocked */}
      <video
        ref={videoRef}
        src={src}
        autoPlay
        playsInline
        loop
        muted={isMuted}
        disablePictureInPicture
        controlsList="nodownload nopictureinpicture noremoteplayback"
        // @ts-ignore
        translate="no"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="max-h-[420px] w-full object-contain pointer-events-none notranslate"
      />

      {/* Center Play/Pause indicator flash when paused */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-slate-950/80 border border-purple-500/40 backdrop-blur-md flex items-center justify-center text-white shadow-2xl">
            <Play className="w-6 h-6 fill-white translate-x-0.5 text-white" />
          </div>
        </div>
      )}

      {/* Custom Sleek Video Controls Bar (replaces browser controls completely, zero PiP / translator buttons) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-6 flex flex-col gap-1.5 transition-opacity duration-200 z-10 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Progress Scrubber */}
        <div className="w-full flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:h-2 transition-all"
          />
        </div>

        {/* Control Buttons & Timestamp */}
        <div className="flex items-center justify-between text-xs text-white">
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="p-1 rounded-lg hover:bg-white/10 transition cursor-pointer text-white hover:text-purple-300"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            </button>

            {/* Mute/Unmute */}
            <button
              type="button"
              onClick={toggleMute}
              className="p-1 rounded-lg hover:bg-white/10 transition cursor-pointer text-white hover:text-purple-300"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Time Display */}
            <span className="text-[11px] font-mono text-slate-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1 rounded-lg hover:bg-white/10 transition cursor-pointer text-white hover:text-purple-300"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ExplorePage: React.FC = () => {
  const {
    posts,
    reels,
    likePost,
    likeReel,
    bookmarkPost,
    addComment,
    removeComment,
    openUserProfile,
    addToast,
    currentUser,
    selectedExploreCategory,
    setSelectedExploreCategory,
    exploreSearchQuery,
    setExploreSearchQuery,
  } = useApp();

  // Active item in detail modal (either a Post or a Reel)
  const [activeModalPost, setActiveModalPost] = useState<Post | null>(null);
  const [activeModalReel, setActiveModalReel] = useState<Reel | null>(null);

  // Modal comment toggle & submission state
  const [isModalCommentsOpen, setIsModalCommentsOpen] = useState<boolean>(false);
  const [commentInputText, setCommentInputText] = useState<string>('');
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);
  const commentsEndRef = useRef<HTMLDivElement | null>(null);

  // Collapsible comments state for grid post cards (hidden by default)
  const [expandedCommentsPostIds, setExpandedCommentsPostIds] = useState<Set<string>>(new Set());
  const [cardCommentInputs, setCardCommentInputs] = useState<{ [postId: string]: string }>({});
  const [submittingCardCommentId, setSubmittingCardCommentId] = useState<string | null>(null);

  // Reel-specific state (saved reels, comments, inline inputs)
  const [savedReelIds, setSavedReelIds] = useState<Set<string>>(new Set());
  const [expandedReelCommentsIds, setExpandedReelCommentsIds] = useState<Set<string>>(new Set());
  const [reelCommentsMap, setReelCommentsMap] = useState<{ [reelId: string]: Comment[] }>({});
  const [reelCommentInputs, setReelCommentInputs] = useState<{ [reelId: string]: string }>({});
  const [submittingReelCommentId, setSubmittingReelCommentId] = useState<string | null>(null);

  // Explore dynamic sorting, shuffle seed, and visual layout mode
  const [exploreSortOrder, setExploreSortOrder] = useState<'trending' | 'curated' | 'latest' | 'popular'>('trending');
  const [shuffleSeed, setShuffleSeed] = useState<number>(0);
  const [gridViewMode, setGridViewMode] = useState<'mosaic' | 'feed'>('mosaic');

  // Explore categories (replaces "Videos" with "Reels")
  const categories = [
    { label: 'All', icon: Sparkles },
    { label: 'Reels', icon: Film },
    { label: 'Photos', icon: ImageIcon },
    { label: 'Thoughts', icon: Quote },
    { label: 'Technology', icon: null },
    { label: 'Gaming', icon: null },
    { label: 'Sports', icon: null },
    { label: 'Travel', icon: null },
    { label: 'Music', icon: null },
    { label: 'Photography', icon: null },
  ];

  // Feed item discriminator for Pinterest / Instagram Explore masonry
  type ExploreFeedItem =
    | { type: 'post'; post: Post }
    | { type: 'reel'; reel: Reel };

  // Filtered items (strictly NO video posts - all video content is REELS only!)
  const filteredItems = useMemo<ExploreFeedItem[]>(() => {
    const q = exploreSearchQuery.toLowerCase().trim();
    const cat = selectedExploreCategory;

    // 1. Filtered Posts: STRICTLY REMOVE ALL REGULAR VIDEO POSTS (mediaType === 'video')
    const validPosts = posts
      .filter((p) => p.mediaType !== 'video')
      .filter((p) => {
        if (cat === 'Reels') return false; // Reels only tab
        if (cat === 'Photos') {
          if (!(p.mediaType === 'image' || (!p.mediaType && !!p.mediaUrl))) return false;
        } else if (cat === 'Thoughts') {
          if (p.mediaUrl) return false;
        } else if (cat !== 'All') {
          const catLower = cat.toLowerCase();
          const inTags = p.tags?.some((t) => t.toLowerCase().includes(catLower));
          const inCaption = p.caption?.toLowerCase().includes(catLower);
          if (!inTags && !inCaption) return false;
        }

        if (q) {
          const captionMatch = p.caption?.toLowerCase().includes(q);
          const authorNameMatch = p.user?.name?.toLowerCase().includes(q);
          const authorUserMatch = p.user?.username?.toLowerCase().includes(q);
          const tagMatch = p.tags?.some((t) => t.toLowerCase().includes(q));
          if (!captionMatch && !authorNameMatch && !authorUserMatch && !tagMatch) return false;
        }

        return true;
      })
      .map((p) => ({ type: 'post' as const, post: p }));

    // 2. Filtered Reels: Short-form authentic reels
    const validReels = reels
      .filter((r) => {
        if (cat === 'Photos' || cat === 'Thoughts') return false;
        if (cat !== 'All' && cat !== 'Reels') {
          const catLower = cat.toLowerCase();
          const inTags = r.tags?.some((t) => t.toLowerCase().includes(catLower));
          const inCaption = r.caption?.toLowerCase().includes(catLower);
          const inAudio = r.audioTitle?.toLowerCase().includes(catLower);
          if (!inTags && !inCaption && !inAudio) return false;
        }

        if (q) {
          const captionMatch = r.caption?.toLowerCase().includes(q);
          const authorNameMatch = r.user?.name?.toLowerCase().includes(q);
          const authorUserMatch = r.user?.username?.toLowerCase().includes(q);
          const tagMatch = r.tags?.some((t) => t.toLowerCase().includes(q));
          const audioMatch = r.audioTitle?.toLowerCase().includes(q);
          if (!captionMatch && !authorNameMatch && !authorUserMatch && !tagMatch && !audioMatch) return false;
        }

        return true;
      })
      .map((r) => ({ type: 'reel' as const, reel: r }));

    // Helper to calculate engagement score for trending discovery
    const getEngagementScore = (item: ExploreFeedItem) => {
      if (item.type === 'post') {
        const p = item.post;
        return (p.likes || 0) * 2 + (p.comments?.length || 0) * 3 + (p.shares || 0) * 1.5;
      } else {
        const r = item.reel;
        return (r.likes || 0) * 2 + (r.commentsCount || 0) * 3 + (r.sharesCount || 0) * 1.5 + 4;
      }
    };

    // Helper to extract timestamp
    const getTimestampValue = (item: ExploreFeedItem) => {
      if (item.type === 'post') {
        const t = item.post.timestamp;
        const d = Date.parse(t);
        return isNaN(d) ? 0 : d;
      } else {
        const t = item.reel.createdAt;
        const d = t ? Date.parse(t) : 0;
        return isNaN(d) ? 0 : d;
      }
    };

    // Fast deterministic pseudo-hash for seed-based shuffle
    const pseudoHash = (seed: number, str: string) => {
      let h = seed;
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      }
      return h;
    };

    let allItems: ExploreFeedItem[] = [];

    if (cat === 'Reels') {
      allItems = [...validReels];
    } else if (cat === 'Photos' || cat === 'Thoughts') {
      allItems = [...validPosts];
    } else {
      // Dynamic organic interleave for 'All' or specific topics
      // Avoid static [p, p, r] by dynamically alternating photos, reels, and thought quotes
      const photos = validPosts.filter((p) => p.post.mediaUrl);
      const thoughts = validPosts.filter((p) => !p.post.mediaUrl);
      const reelPool = [...validReels];

      const combined: ExploreFeedItem[] = [];
      let photoIdx = 0;
      let reelIdx = 0;
      let thoughtIdx = 0;

      // Varied rhythm pattern: [Reel, Photo, Photo, Reel, Photo, Thought, Reel, Photo, Photo, Thought...]
      const pattern = ['reel', 'photo', 'photo', 'reel', 'photo', 'thought', 'reel', 'photo', 'photo', 'thought'];
      let patStep = 0;

      while (photoIdx < photos.length || reelIdx < reelPool.length || thoughtIdx < thoughts.length) {
        const wanted = pattern[patStep % pattern.length];
        patStep++;

        if (wanted === 'reel' && reelIdx < reelPool.length) {
          combined.push(reelPool[reelIdx++]);
        } else if (wanted === 'photo' && photoIdx < photos.length) {
          combined.push(photos[photoIdx++]);
        } else if (wanted === 'thought' && thoughtIdx < thoughts.length) {
          combined.push(thoughts[thoughtIdx++]);
        } else if (photoIdx < photos.length) {
          combined.push(photos[photoIdx++]);
        } else if (reelIdx < reelPool.length) {
          combined.push(reelPool[reelIdx++]);
        } else if (thoughtIdx < thoughts.length) {
          combined.push(thoughts[thoughtIdx++]);
        }
      }

      allItems = combined;
    }

    // Apply User's Selected Sort Order
    if (exploreSortOrder === 'latest') {
      allItems.sort((a, b) => getTimestampValue(b) - getTimestampValue(a));
    } else if (exploreSortOrder === 'popular') {
      allItems.sort((a, b) => {
        const likesA = a.type === 'post' ? a.post.likes || 0 : a.reel.likes || 0;
        const likesB = b.type === 'post' ? b.post.likes || 0 : b.reel.likes || 0;
        return likesB - likesA;
      });
    } else if (exploreSortOrder === 'curated' || shuffleSeed > 0) {
      // Curated discovery shuffle based on seed
      const seeded = [...allItems];
      for (let i = seeded.length - 1; i > 0; i--) {
        const item = seeded[i];
        const id = item.type === 'post' ? item.post.id : item.reel.id;
        const j = Math.abs(pseudoHash(shuffleSeed + i * 31, id)) % (i + 1);
        [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
      }
      return seeded;
    } else {
      // Default: 'trending' - Ranked by engagement with creator diversity to prevent clustering
      allItems.sort((a, b) => getEngagementScore(b) - getEngagementScore(a));

      const diversified: ExploreFeedItem[] = [];
      const pool = [...allItems];
      let lastAuthor = '';

      while (pool.length > 0) {
        let foundIdx = pool.findIndex((item) => {
          const author = item.type === 'post' ? item.post.user?.id : item.reel.user?.id;
          return author !== lastAuthor;
        });

        if (foundIdx === -1) foundIdx = 0;

        const [picked] = pool.splice(foundIdx, 1);
        diversified.push(picked);
        lastAuthor = (picked.type === 'post' ? picked.post.user?.id : picked.reel.user?.id) || '';
      }

      allItems = diversified;
    }

    return allItems;
  }, [posts, reels, selectedExploreCategory, exploreSearchQuery, exploreSortOrder, shuffleSeed]);

  // Keep modal post & reel in sync with real-time state
  const modalPost = useMemo(() => {
    if (!activeModalPost) return null;
    return posts.find((p) => p.id === activeModalPost.id) || activeModalPost;
  }, [posts, activeModalPost]);

  const modalReel = useMemo(() => {
    if (!activeModalReel) return null;
    return reels.find((r) => r.id === activeModalReel.id) || activeModalReel;
  }, [reels, activeModalReel]);

  // Handle Like Post
  const handleToggleLike = (e: React.MouseEvent, post: Post) => {
    e.stopPropagation();
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to like posts.');
      return;
    }
    likePost(post.id);
  };

  // Handle Like Reel
  const handleToggleLikeReel = (e: React.MouseEvent, reel: Reel) => {
    e.stopPropagation();
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to like reels.');
      return;
    }
    likeReel(reel.id);
  };

  // Handle Save / Bookmark Post
  const handleToggleSave = (e: React.MouseEvent, post: Post) => {
    e.stopPropagation();
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to bookmark posts.');
      return;
    }
    bookmarkPost(post.id);
  };

  // Handle Save / Bookmark Reel
  const handleToggleSaveReel = (e: React.MouseEvent, reel: Reel) => {
    e.stopPropagation();
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to bookmark reels.');
      return;
    }
    setSavedReelIds((prev) => {
      const next = new Set(prev);
      if (next.has(reel.id)) {
        next.delete(reel.id);
        addToast('info', 'Bookmark Removed', 'Reel removed from saved collection.');
      } else {
        next.add(reel.id);
        addToast('success', 'Reel Saved', 'Reel added to your saved collection.');
      }
      return next;
    });
  };

  // Handle Share Post
  const handleShare = async (e: React.MouseEvent, post: Post) => {
    e.stopPropagation();
    const url = `${window.location.origin}/?post=${post.id}`;
    const title = `Post by ${post.user.name} on VERIXA`;
    const text = post.caption ? post.caption.slice(0, 100) : 'Check out this verified post on VERIXA';

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        addToast('success', 'Shared Successfully', 'Link shared via system dialog.');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      addToast('success', 'Link Copied', 'Post link copied to clipboard.');
    }
  };

  // Handle Share Reel
  const handleShareReel = async (e: React.MouseEvent, reel: Reel) => {
    e.stopPropagation();
    const url = `${window.location.origin}/?reel=${reel.id}`;
    const title = `Reel by ${reel.user.name} on VERIXA`;
    const text = reel.caption ? reel.caption.slice(0, 100) : 'Check out this authentic Reel on VERIXA';

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        addToast('success', 'Shared Successfully', 'Reel link shared via system dialog.');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      addToast('success', 'Link Copied', 'Reel link copied to clipboard.');
    }
  };

  // Handle Profile Navigation
  const handleOpenProfile = (e: React.MouseEvent, user: User) => {
    e.stopPropagation();
    if (activeModalPost) setActiveModalPost(null);
    if (activeModalReel) setActiveModalReel(null);
    openUserProfile(user);
  };

  // Toggle inline comments on a post card
  const toggleComments = (postId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  // Toggle inline comments on a reel card
  const toggleReelComments = (reelId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedReelCommentsIds((prev) => {
      const next = new Set(prev);
      if (next.has(reelId)) {
        next.delete(reelId);
      } else {
        next.add(reelId);
        if (!reelCommentsMap[reelId]) {
          fetchReelComments(reelId).then((comments) => {
            setReelCommentsMap((m) => ({ ...m, [reelId]: comments }));
          }).catch(() => {});
        }
      }
      return next;
    });
  };

  // Handle comment submit directly on post card
  const handleCardCommentSubmit = async (postId: string, e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = cardCommentInputs[postId];
    if (!text || !text.trim() || submittingCardCommentId === postId) return;

    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to write comments.');
      return;
    }

    const privacyCheck = scanPrivacyInText(text);
    if (privacyCheck.has_sensitive_data) {
      addToast(
        'warning',
        'Privacy Alert',
        `Sensitive personal data detected (${privacyCheck.detected_types.map((t) => t.replace('_', ' ')).join(', ')}). Protect your personal privacy!`
      );
    }

    setSubmittingCardCommentId(postId);

    try {
      const result = await addComment(postId, text);
      if (result.allowed) {
        setCardCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      } else {
        addToast('error', 'Comment Blocked by AI Safety', result.reason || 'Comment violates community safety rules.');
      }
    } catch (err: any) {
      addToast('error', 'Comment Failed', err.message || 'Failed to submit comment.');
    } finally {
      setSubmittingCardCommentId(null);
    }
  };

  // Handle comment submit directly on reel card
  const handleCardReelCommentSubmit = async (reelId: string, e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = reelCommentInputs[reelId];
    if (!text || !text.trim() || submittingReelCommentId === reelId) return;

    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to write comments.');
      return;
    }

    const privacyCheck = scanPrivacyInText(text);
    if (privacyCheck.has_sensitive_data) {
      addToast(
        'warning',
        'Privacy Alert',
        `Sensitive personal data detected (${privacyCheck.detected_types.map((t) => t.replace('_', ' ')).join(', ')}). Protect your personal privacy!`
      );
    }

    setSubmittingReelCommentId(reelId);

    try {
      const modRes = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: text.trim(),
          postId: reelId,
          userId: currentUser.id,
          username: currentUser.username,
        }),
      });

      const modData = await modRes.json();
      if (!modRes.ok || modData.allowed === false || modData.decision === 'BLOCK') {
        addToast(
          'error',
          'Comment Blocked by AI Safety',
          modData.error || modData.reason || 'Comment violates community safety rules.'
        );
        return;
      }

      const newCommentId = await addReelComment(
        reelId,
        currentUser.id,
        currentUser.username || 'user',
        currentUser.avatar || '',
        text.trim(),
        modData.toxicity_score || 0
      );

      const newComment: Comment = {
        id: newCommentId,
        postId: reelId,
        user: currentUser,
        content: text.trim(),
        timestamp: 'Just now',
        toxicityScore: modData.toxicity_score || 0,
        categories: ['SAFE_CONTENT'],
        aiStatus: 'safe',
        likes: 0,
      };

      setReelCommentsMap((prev) => ({
        ...prev,
        [reelId]: [newComment, ...(prev[reelId] || [])],
      }));
      setReelCommentInputs((prev) => ({ ...prev, [reelId]: '' }));
    } catch (err: any) {
      addToast('error', 'Comment Failed', err.message || 'Failed to submit comment.');
    } finally {
      setSubmittingReelCommentId(null);
    }
  };

  // Handle Comment Submission in Detail Modal (Post or Reel)
  const handleModalCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInputText.trim() || isSubmittingComment) return;
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to write comments.');
      return;
    }

    const content = commentInputText.trim();
    setIsSubmittingComment(true);

    try {
      if (modalPost) {
        const res = await addComment(modalPost.id, content);
        if (!res.allowed) {
          addToast('error', 'Comment Blocked by AI Safety', res.reason || 'Comment violates community safety rules.');
          return;
        }
      } else if (modalReel) {
        const modRes = await fetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment: content,
            postId: modalReel.id,
            userId: currentUser.id,
            username: currentUser.username,
          }),
        });
        const modData = await modRes.json();
        if (!modRes.ok || modData.allowed === false || modData.decision === 'BLOCK') {
          addToast(
            'error',
            'Comment Blocked by AI Safety',
            modData.error || modData.reason || 'Comment violates community safety rules.'
          );
          return;
        }

        const newCommentId = await addReelComment(
          modalReel.id,
          currentUser.id,
          currentUser.username || 'user',
          currentUser.avatar || '',
          content,
          modData.toxicity_score || 0
        );

        const newComment: Comment = {
          id: newCommentId,
          postId: modalReel.id,
          user: currentUser,
          content,
          timestamp: 'Just now',
          toxicityScore: modData.toxicity_score || 0,
          categories: ['SAFE_CONTENT'],
          aiStatus: 'safe',
          likes: 0,
        };

        setReelCommentsMap((prev) => ({
          ...prev,
          [modalReel.id]: [newComment, ...(prev[modalReel.id] || [])],
        }));
      }

      setCommentInputText('');
      setTimeout(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      addToast('error', 'Comment Failed', err.message || 'Failed to submit comment.');
    } finally {
      setIsSubmittingComment(false);
    }
  };


  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Search & Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
              Explore <Sparkles className="w-6 h-6 text-purple-400 animate-pulse" />
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Curated verified safe media, stories & ideas powered by VERIXA AI content classifiers.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={exploreSearchQuery}
              onChange={(e) => setExploreSearchQuery(e.target.value)}
              placeholder="Search posts, creators, tags..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-purple-500/20 rounded-full text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition shadow-inner"
            />
            {exploreSearchQuery && (
              <button
                type="button"
                onClick={() => setExploreSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 pt-1">
          {categories.map((cat) => {
            const active = selectedExploreCategory === cat.label;
            const Icon = cat.icon;
            return (
              <button
                key={cat.label}
                onClick={() => setSelectedExploreCategory(cat.label)}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-purple-900/40 ring-1 ring-purple-400 scale-[1.02]'
                    : 'bg-slate-900/80 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-700'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Explore Toolbar: Dynamic Sort, Shuffle, & Layout View Mode */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60 text-xs">
          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1 shrink-0">
              <SlidersHorizontal className="w-3 h-3" /> Order:
            </span>
            {[
              { id: 'trending', label: 'Trending', icon: Flame },
              { id: 'curated', label: 'Curated', icon: Sparkles },
              { id: 'latest', label: 'Latest', icon: Clock },
              { id: 'popular', label: 'Popular', icon: Heart },
            ].map((sort) => {
              const active = exploreSortOrder === sort.id;
              const SortIcon = sort.icon;
              return (
                <button
                  key={sort.id}
                  type="button"
                  onClick={() => setExploreSortOrder(sort.id as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    active
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50 shadow-sm shadow-purple-900/30 ring-1 ring-purple-400/40'
                      : 'bg-slate-900/70 text-slate-400 border border-slate-800/80 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <SortIcon className={`w-3 h-3 ${active ? 'text-purple-400' : 'text-slate-500'}`} />
                  <span>{sort.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Tools: Shuffle & Grid Mode Toggle */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Shuffle Button */}
            <button
              type="button"
              onClick={() => {
                setShuffleSeed((s) => s + 1);
                addToast('info', 'Feed Shuffled', 'Loaded a fresh discovery order.');
              }}
              className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-purple-500/40 hover:bg-slate-800 transition cursor-pointer flex items-center gap-1.5 text-xs font-medium active:scale-95 shadow-inner"
              title="Reshuffle feed items for fresh discovery"
            >
              <Shuffle className="w-3.5 h-3.5 text-purple-400 transition-transform active:rotate-180" />
              <span className="hidden sm:inline">Shuffle</span>
            </button>

            {/* View Mode Toggle (Mosaic vs Cards) */}
            <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-full p-0.5 shadow-inner">
              <button
                type="button"
                onClick={() => setGridViewMode('mosaic')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  gridViewMode === 'mosaic'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Visual Mosaic Grid (Instagram / TikTok Explore style)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mosaic</span>
              </button>
              <button
                type="button"
                onClick={() => setGridViewMode('feed')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  gridViewMode === 'feed'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Card Feed (Expanded view with inline comments on demand)"
              >
                <Grid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Explore Content Display */}
      {filteredItems.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800 space-y-3">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Verified Content Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {exploreSearchQuery
              ? `No posts or reels matched your search for "${exploreSearchQuery}". Try another keyword or clear the search.`
              : `No content currently available in category "${selectedExploreCategory}".`}
          </p>
        </div>
      ) : gridViewMode === 'mosaic' ? (
        /* MODE A: ATTRACTIVE INSTAGRAM / TIKTOK VISUAL MOSAIC GRID */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4.5 auto-rows-[200px] sm:auto-rows-[230px] md:auto-rows-[260px] grid-flow-dense">
          {filteredItems.map((item, index) => {
            if (item.type === 'reel') {
              const reel = item.reel;
              const reelAvatar = getSafeAvatar(reel.user?.avatar, reel.user?.name || reel.user?.username, reel.user?.id);
              const commentsList = reelCommentsMap[reel.id] || [];
              const commentsCount = Math.max(reel.commentsCount || 0, commentsList.length);
              const isSaved = savedReelIds.has(reel.id);

              return (
                <div
                  key={`mosaic_reel_${reel.id}`}
                  onClick={() => {
                    setActiveModalReel(reel);
                    setActiveModalPost(null);
                    setIsModalCommentsOpen(false);
                  }}
                  className="row-span-2 col-span-1 group relative rounded-3xl overflow-hidden bg-slate-950 border border-purple-500/25 hover:border-purple-400/70 shadow-lg hover:shadow-2xl hover:shadow-purple-950/60 transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col ring-1 ring-white/5 select-none"
                >
                  {/* Reel Video Preview (Tall 9:16 vertical proportion, zero PiP, zero translator) */}
                  <video
                    src={reel.videoUrl}
                    preload="metadata"
                    muted
                    playsInline
                    loop
                    disablePictureInPicture
                    controlsList="nodownload nopictureinpicture noremoteplayback"
                    // @ts-ignore
                    translate="no"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-700 pointer-events-none select-none notranslate"
                  />

                  {/* Top Floating Badges */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-black/65 backdrop-blur-md text-purple-300 border border-purple-500/30 shadow-md">
                      <Film className="w-3 h-3 text-purple-400" /> Reel
                    </span>
                    {reel.audioTitle && (
                      <div className="max-w-[120px] px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-[9px] text-purple-200 flex items-center gap-1 shadow-md">
                        <Music className="w-2.5 h-2.5 text-purple-400 shrink-0 animate-pulse" />
                        <span className="truncate">{reel.audioTitle}</span>
                      </div>
                    )}
                  </div>

                  {/* Centered Frosted Play Indicator */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-11 h-11 rounded-full bg-slate-950/60 border border-white/20 backdrop-blur-md flex items-center justify-center text-white group-hover:scale-115 group-hover:bg-purple-600/80 transition-all duration-300 shadow-xl opacity-75 group-hover:opacity-100">
                      <Play className="w-4 h-4 fill-white translate-x-0.5" />
                    </div>
                  </div>

                  {/* Bottom Persistent + Interactive Glassmorphic Gradient */}
                  <div className="absolute inset-x-0 bottom-0 z-10 p-3 pt-12 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col justify-end space-y-1.5">
                    {/* Creator Info */}
                    <div
                      className="flex items-center gap-1.5 cursor-pointer group/creator w-fit"
                      onClick={(e) => handleOpenProfile(e, reel.user)}
                    >
                      <img
                        src={reelAvatar}
                        alt={reel.user?.name || 'Creator'}
                        className="w-6 h-6 rounded-full object-cover border border-purple-400/40 group-hover/creator:ring-2 group-hover/creator:ring-purple-400 transition shrink-0"
                      />
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs font-bold text-white group-hover/creator:text-purple-300 truncate drop-shadow">
                          {reel.user?.name || reel.user?.username || 'Creator'}
                        </span>
                        <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                      </div>
                    </div>

                    {/* Caption snippet */}
                    {reel.caption && (
                      <p className="text-[11px] text-slate-200 line-clamp-2 leading-snug drop-shadow-sm font-medium">
                        {reel.caption}
                      </p>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-1 border-t border-white/10 text-slate-300">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => handleToggleLikeReel(e, reel)}
                          className={`flex items-center gap-1 text-[11px] font-bold transition hover:scale-110 active:scale-95 cursor-pointer ${
                            reel.isLiked ? 'text-rose-400' : 'text-slate-300 hover:text-rose-400'
                          }`}
                          title={reel.isLiked ? 'Unlike Reel' : 'Like Reel'}
                        >
                          <Heart className={`w-3.5 h-3.5 ${reel.isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                          <span>{reel.likes || 0}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveModalReel(reel);
                            setActiveModalPost(null);
                            setIsModalCommentsOpen(true);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-purple-300 transition hover:scale-110 active:scale-95 cursor-pointer"
                          title="Comments"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{commentsCount}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleShareReel(e, reel)}
                          className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer hover:scale-110 active:scale-95"
                          title="Share Reel"
                        >
                          <Share2 className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleToggleSaveReel(e, reel)}
                          className={`p-1 rounded-lg transition cursor-pointer hover:scale-110 active:scale-95 ${
                            isSaved ? 'text-purple-400 bg-purple-500/20' : 'text-slate-300 hover:text-purple-300 hover:bg-white/10'
                          }`}
                          title={isSaved ? 'Remove Bookmark' : 'Save Reel'}
                        >
                          <Bookmark className={`w-3 h-3 ${isSaved ? 'fill-purple-400 text-purple-400' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // POST ITEM (Photo or Thought)
            const post = item.post;
            const isPhoto = post.mediaType === 'image' || (!post.mediaType && !!post.mediaUrl);
            const safeAvatar = getSafeAvatar(post.user?.avatar, post.user?.name || post.user?.username, post.user?.id);
            const isHeroPhoto = isPhoto && index === 0 && filteredItems.length > 4;

            if (isPhoto && post.mediaUrl) {
              return (
                <div
                  key={`mosaic_post_${post.id}`}
                  onClick={() => {
                    setActiveModalPost(post);
                    setActiveModalReel(null);
                    setIsModalCommentsOpen(false);
                  }}
                  className={`${
                    isHeroPhoto ? 'sm:col-span-2 sm:row-span-2 col-span-1 row-span-1' : 'col-span-1 row-span-1'
                  } group relative rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 hover:border-purple-500/60 shadow-md hover:shadow-2xl hover:shadow-purple-950/50 transition-all duration-300 hover:-translate-y-1 cursor-pointer ring-1 ring-white/5 select-none`}
                >
                  <img
                    src={post.mediaUrl}
                    alt={post.caption || 'Explore photo'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                  />

                  {/* Photo Badge */}
                  <span className="absolute top-2.5 left-2.5 z-10 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-black/65 backdrop-blur-md text-indigo-300 border border-indigo-500/30 shadow-md pointer-events-none">
                    <ImageIcon className="w-3 h-3 text-indigo-400" /> Photo
                  </span>

                  {/* Floating Hover & Mobile Overlay */}
                  <div className="absolute inset-0 z-10 p-3 bg-gradient-to-t from-black/95 via-black/50 to-transparent opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between">
                    <div
                      className="flex items-center gap-1.5 cursor-pointer group/creator w-fit pt-0.5"
                      onClick={(e) => handleOpenProfile(e, post.user)}
                    >
                      <img
                        src={safeAvatar}
                        alt={post.user?.name || 'Creator'}
                        className="w-6 h-6 rounded-full object-cover border border-purple-400/40 group-hover/creator:ring-2 group-hover/creator:ring-purple-400 transition shrink-0"
                      />
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs font-bold text-white group-hover/creator:text-purple-300 truncate drop-shadow">
                          {post.user?.name || post.user?.username || 'Member'}
                        </span>
                        <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {post.caption && (
                        <p className="text-[11px] text-slate-200 line-clamp-2 leading-snug drop-shadow-sm font-medium">
                          {post.caption}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-white/10 text-slate-300">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={(e) => handleToggleLike(e, post)}
                            className={`flex items-center gap-1 text-[11px] font-bold transition hover:scale-110 active:scale-95 cursor-pointer ${
                              post.isLiked ? 'text-rose-400' : 'text-slate-300 hover:text-rose-400'
                            }`}
                            title={post.isLiked ? 'Unlike' : 'Like'}
                          >
                            <Heart className={`w-3.5 h-3.5 ${post.isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                            <span>{post.likes || 0}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveModalPost(post);
                              setActiveModalReel(null);
                              setIsModalCommentsOpen(true);
                            }}
                            className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-purple-300 transition hover:scale-110 active:scale-95 cursor-pointer"
                            title="Comments"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>{post.comments?.length || 0}</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleShare(e, post)}
                            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer hover:scale-110 active:scale-95"
                            title="Share link"
                          >
                            <Share2 className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleToggleSave(e, post)}
                            className={`p-1 rounded-lg transition cursor-pointer hover:scale-110 active:scale-95 ${
                              post.isBookmarked ? 'text-purple-400 bg-purple-500/20' : 'text-slate-300 hover:text-purple-300 hover:bg-white/10'
                            }`}
                            title={post.isBookmarked ? 'Remove Bookmark' : 'Save to Collection'}
                          >
                            <Bookmark className={`w-3 h-3 ${post.isBookmarked ? 'fill-purple-400 text-purple-400' : ''}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // THOUGHT / QUOTE POST
            return (
              <div
                key={`mosaic_thought_${post.id}`}
                onClick={() => {
                  setActiveModalPost(post);
                  setActiveModalReel(null);
                  setIsModalCommentsOpen(false);
                }}
                className="col-span-1 row-span-1 group relative rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-950/90 via-slate-900 to-purple-950/90 border border-purple-500/30 hover:border-purple-400/70 shadow-md hover:shadow-2xl hover:shadow-purple-950/50 transition-all duration-300 hover:-translate-y-1 cursor-pointer ring-1 ring-white/5 p-4 flex flex-col justify-between select-none"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm">
                    <Quote className="w-3 h-3 text-purple-400" /> Thought
                  </span>
                  <Quote className="w-5 h-5 text-purple-400/25 group-hover:text-purple-400/60 transition" />
                </div>

                <p className="text-xs sm:text-sm text-slate-100 font-serif italic leading-relaxed line-clamp-4 my-auto">
                  “{post.caption}”
                </p>

                <div className="pt-2 border-t border-purple-500/20">
                  <div className="flex items-center justify-between mb-1.5">
                    <div
                      className="flex items-center gap-1.5 cursor-pointer group/creator"
                      onClick={(e) => handleOpenProfile(e, post.user)}
                    >
                      <img
                        src={safeAvatar}
                        alt={post.user?.name || 'Creator'}
                        className="w-5 h-5 rounded-full object-cover border border-purple-400/40 group-hover/creator:ring-2 group-hover/creator:ring-purple-400 transition shrink-0"
                      />
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[11px] font-bold text-white group-hover/creator:text-purple-300 truncate">
                          {post.user?.name || post.user?.username || 'Member'}
                        </span>
                        <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={(e) => handleToggleLike(e, post)}
                        className={`flex items-center gap-1 font-bold transition hover:scale-110 active:scale-95 cursor-pointer ${
                          post.isLiked ? 'text-rose-400' : 'text-slate-400 hover:text-rose-400'
                        }`}
                        title={post.isLiked ? 'Unlike' : 'Like'}
                      >
                        <Heart className={`w-3.5 h-3.5 ${post.isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                        <span>{post.likes || 0}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveModalPost(post);
                          setActiveModalReel(null);
                          setIsModalCommentsOpen(true);
                        }}
                        className="flex items-center gap-1 font-semibold hover:text-purple-300 transition hover:scale-110 active:scale-95 cursor-pointer"
                        title="Comments"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{post.comments?.length || 0}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleShare(e, post)}
                        className="p-1 rounded-lg hover:text-white hover:bg-white/10 transition cursor-pointer hover:scale-110 active:scale-95"
                        title="Share"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleToggleSave(e, post)}
                        className={`p-1 rounded-lg transition cursor-pointer hover:scale-110 active:scale-95 ${
                          post.isBookmarked ? 'text-purple-400 bg-purple-500/20' : 'text-slate-400 hover:text-purple-300 hover:bg-white/10'
                        }`}
                        title={post.isBookmarked ? 'Remove Bookmark' : 'Save'}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${post.isBookmarked ? 'fill-purple-400 text-purple-400' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MODE B: DETAILED CARD FEED WITH EXPANDED DETAILS & COMMENTS ON DEMAND */
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5 [column-fill:_balance]">
          {filteredItems.map((item) => {
            if (item.type === 'reel') {
              const reel = item.reel;
              const reelAvatar = getSafeAvatar(reel.user?.avatar, reel.user?.name || reel.user?.username, reel.user?.id);
              const commentsList = reelCommentsMap[reel.id] || [];
              const commentsCount = Math.max(reel.commentsCount || 0, commentsList.length);
              const isSaved = savedReelIds.has(reel.id);

              return (
                <div
                  key={`reel_${reel.id}`}
                  onClick={() => {
                    setActiveModalReel(reel);
                    setActiveModalPost(null);
                    setIsModalCommentsOpen(false);
                  }}
                  className="break-inside-avoid mb-5 group relative rounded-3xl bg-slate-900/90 border border-slate-800/80 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-950/40 transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer flex flex-col backdrop-blur-xl ring-1 ring-purple-500/10"
                >
                  {/* Creator Header Chip */}
                  <div
                    className="p-3.5 flex items-center justify-between border-b border-slate-800/60 bg-slate-950/40 z-10"
                    onClick={(e) => handleOpenProfile(e, reel.user)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 cursor-pointer group/creator">
                      <img
                        src={reelAvatar}
                        alt={reel.user?.name || 'Creator'}
                        className="w-8 h-8 rounded-full object-cover border border-purple-500/30 group-hover/creator:ring-2 group-hover/creator:ring-purple-400 transition shrink-0 shadow-md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-white group-hover/creator:text-purple-300 truncate transition">
                            {reel.user?.name || reel.user?.username || 'Creator'}
                          </span>
                          <span title="Verified Human" className="inline-flex items-center shrink-0">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono truncate">@{reel.user?.username || 'user'}</p>
                      </div>
                    </div>

                    {/* Reel Badge */}
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                      <Film className="w-2.5 h-2.5 text-purple-400" /> Reel
                    </span>
                  </div>

                  {/* Reel Video Preview (9:16 vertical aspect, zero PiP, zero translator overlays) */}
                  <div className="relative overflow-hidden bg-black flex items-center justify-center aspect-[9/14]">
                    <video
                      src={reel.videoUrl}
                      preload="metadata"
                      muted
                      playsInline
                      loop
                      disablePictureInPicture
                      controlsList="nodownload nopictureinpicture noremoteplayback"
                      // @ts-ignore
                      translate="no"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-500 pointer-events-none select-none notranslate"
                    />
                    <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-slate-950/40 transition flex items-center justify-center pointer-events-none">
                      <div className="w-11 h-11 rounded-full bg-slate-950/70 border border-white/20 backdrop-blur-md flex items-center justify-center text-white group-hover:scale-110 transition shadow-xl">
                        <Play className="w-4 h-4 fill-white translate-x-0.5" />
                      </div>
                    </div>

                    {/* Audio Title Chip */}
                    {reel.audioTitle && (
                      <div className="absolute bottom-2.5 left-2.5 right-2.5 px-2.5 py-1 rounded-full bg-slate-950/70 backdrop-blur-md border border-white/10 flex items-center gap-1.5 text-[10px] text-purple-200 pointer-events-none">
                        <Music className="w-3 h-3 text-purple-400 shrink-0 animate-pulse" />
                        <span className="truncate">{reel.audioTitle}</span>
                      </div>
                    )}
                  </div>

                  {/* Caption & Tags */}
                  {reel.caption && (
                    <div className="p-3.5 pb-2">
                      <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed">
                        {reel.caption}
                      </p>
                    </div>
                  )}

                  {reel.tags && reel.tags.length > 0 && (
                    <div className="px-3.5 pb-2 flex flex-wrap gap-1">
                      {reel.tags.slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                        >
                          #{tag.replace(/^#/, '')}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Reel Action Bar */}
                  <div className="p-3 mt-auto bg-slate-950/70 border-t border-slate-800/60 flex items-center justify-between text-slate-400">
                    <div className="flex items-center gap-3">
                      {/* Like Button */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleLikeReel(e, reel)}
                        className={`flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer hover:scale-110 active:scale-95 ${
                          reel.isLiked ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-rose-400'
                        }`}
                        title={reel.isLiked ? 'Unlike Reel' : 'Like Reel'}
                      >
                        <Heart className={`w-4 h-4 transition ${reel.isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                        <span>{reel.likes || 0}</span>
                      </button>

                      {/* Comment Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => toggleReelComments(reel.id, e)}
                        className={`flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer hover:scale-110 active:scale-95 ${
                          expandedReelCommentsIds.has(reel.id) ? 'text-purple-400 font-bold' : 'text-slate-400 hover:text-purple-400'
                        }`}
                        title={expandedReelCommentsIds.has(reel.id) ? 'Collapse comments' : 'Expand comments'}
                      >
                        <MessageCircle className={`w-4 h-4 ${expandedReelCommentsIds.has(reel.id) ? 'fill-purple-400/20' : ''}`} />
                        <span>{commentsCount}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Share Button */}
                      <button
                        type="button"
                        onClick={(e) => handleShareReel(e, reel)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition cursor-pointer hover:scale-110 active:scale-95"
                        title="Share reel"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Save / Bookmark Button */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleSaveReel(e, reel)}
                        className={`p-1.5 rounded-xl transition cursor-pointer hover:scale-110 active:scale-95 ${
                          isSaved ? 'text-purple-400 bg-purple-500/10' : 'text-slate-400 hover:text-purple-400 hover:bg-slate-800'
                        }`}
                        title={isSaved ? 'Remove Bookmark' : 'Save to Collection'}
                      >
                        <Bookmark className={`w-3.5 h-3.5 transition ${isSaved ? 'fill-purple-400 text-purple-400' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Comments Sub-Panel for Reel */}
                  <AnimatePresence>
                    {expandedReelCommentsIds.has(reel.id) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden bg-slate-950/95 border-t border-slate-800/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="p-3.5 space-y-3">
                          {commentsList.length > 0 ? (
                            <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                              {commentsList.map((c) => {
                                const authorAvatar = getSafeAvatar(c.user?.avatar, c.user?.name || c.user?.username, c.user?.id);
                                return (
                                  <div
                                    key={c.id}
                                    className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-xs flex items-start gap-2.5"
                                  >
                                    <img
                                      src={authorAvatar}
                                      alt={c.user?.name || 'User'}
                                      onClick={(e) => handleOpenProfile(e, c.user)}
                                      className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 cursor-pointer hover:ring-2 hover:ring-purple-400 transition"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between">
                                        <div
                                          className="flex items-center gap-1 cursor-pointer group/name"
                                          onClick={(e) => handleOpenProfile(e, c.user)}
                                        >
                                          <span className="font-bold text-slate-200 group-hover/name:text-purple-300 transition text-[11px]">
                                            {c.user?.name || c.user?.username || 'Member'}
                                          </span>
                                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-0.5">
                                            <CheckCircle2 className="w-2.5 h-2.5" /> Safe
                                          </span>
                                          {c.user?.id === currentUser?.id && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                removeComment(reel.id, c.id);
                                                setReelCommentsMap((prev) => ({
                                                  ...prev,
                                                  [reel.id]: (prev[reel.id] || []).filter((item) => item.id !== c.id),
                                                }));
                                              }}
                                              className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                                              title="Delete comment"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-slate-300 mt-0.5 leading-snug break-words text-[11px]">
                                        {c.content}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500 italic py-1 text-center">
                              No comments yet. Be the first to start the verified conversation!
                            </p>
                          )}

                          {/* Reel Comment Input Form */}
                          <form
                            onSubmit={(e) => handleCardReelCommentSubmit(reel.id, e)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 pt-1"
                          >
                            <input
                              type="text"
                              value={reelCommentInputs[reel.id] || ''}
                              disabled={submittingReelCommentId === reel.id}
                              onChange={(e) =>
                                setReelCommentInputs({ ...reelCommentInputs, [reel.id]: e.target.value })
                              }
                              placeholder={submittingReelCommentId === reel.id ? 'Scanning safety...' : 'Write a comment... (AI verified safe)'}
                              className="flex-1 bg-slate-900 border border-slate-800 rounded-full px-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 disabled:opacity-50"
                            />
                            <button
                              type="submit"
                              disabled={!reelCommentInputs[reel.id]?.trim() || submittingReelCommentId === reel.id}
                              className="px-3.5 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs disabled:opacity-40 transition-all flex items-center gap-1 shadow-md shrink-0 cursor-pointer disabled:cursor-not-allowed"
                              title={submittingReelCommentId === reel.id ? 'AI Safety Scan in progress...' : 'Post Comment'}
                            >
                              {submittingReelCommentId === reel.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3 h-3" />
                              )}
                            </button>
                          </form>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }

            // Post Card (Photo or Thought)
            const post = item.post;
            const isPhoto = post.mediaType === 'image' || (!post.mediaType && !!post.mediaUrl);
            const isTextOnly = !post.mediaUrl;
            const safeAvatar = getSafeAvatar(post.user?.avatar, post.user?.name || post.user?.username, post.user?.id);

            return (
              <div
                key={`post_${post.id}`}
                onClick={() => {
                  setActiveModalPost(post);
                  setActiveModalReel(null);
                  setIsModalCommentsOpen(false);
                }}
                className="break-inside-avoid mb-5 group relative rounded-3xl bg-slate-900/90 border border-slate-800/80 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-950/40 transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer flex flex-col backdrop-blur-xl"
              >
                {/* Creator Header Chip */}
                <div
                  className="p-3.5 flex items-center justify-between border-b border-slate-800/60 bg-slate-950/40 z-10"
                  onClick={(e) => handleOpenProfile(e, post.user)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 cursor-pointer group/creator">
                    <img
                      src={safeAvatar}
                      alt={post.user?.name || 'Creator'}
                      className="w-8 h-8 rounded-full object-cover border border-purple-500/30 group-hover/creator:ring-2 group-hover/creator:ring-purple-400 transition shrink-0 shadow-md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-white group-hover/creator:text-purple-300 truncate transition">
                          {post.user?.name || post.user?.username || 'Member'}
                        </span>
                        <span title="Verified Human" className="inline-flex items-center shrink-0">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono truncate">@{post.user?.username || 'user'}</p>
                    </div>
                  </div>

                  {/* Media Type Badge */}
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 shrink-0 ${
                      isPhoto
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {isPhoto ? (
                      <>
                        <ImageIcon className="w-2.5 h-2.5" /> Photo
                      </>
                    ) : (
                      <>
                        <Quote className="w-2.5 h-2.5" /> Thought
                      </>
                    )}
                  </span>
                </div>

                {/* Media or Text Content */}
                {isPhoto && post.mediaUrl ? (
                  <div className="relative overflow-hidden bg-black flex items-center justify-center">
                    <img
                      src={post.mediaUrl}
                      alt={post.caption || 'Post image'}
                      className="w-full object-cover max-h-[440px] group-hover:scale-[1.02] transition duration-500"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="p-6 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-purple-950/40 border-b border-slate-800/40 relative">
                    <Quote className="w-8 h-8 text-purple-400/20 absolute top-4 right-4" />
                    <p className="text-sm text-slate-100 font-serif italic leading-relaxed line-clamp-6">
                      “{post.caption}”
                    </p>
                  </div>
                )}

                {/* Caption & Tags */}
                {!isTextOnly && post.caption && (
                  <div className="p-3.5 pb-2">
                    <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed">
                      {post.caption}
                    </p>
                  </div>
                )}

                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="px-3.5 pb-2 flex flex-wrap gap-1">
                    {post.tags.slice(0, 3).map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                      >
                        #{tag.replace(/^#/, '')}
                      </span>
                    ))}
                  </div>
                )}

                {/* Post Action Bar (Like, Comment, Share, Save) */}
                <div className="p-3 mt-auto bg-slate-950/70 border-t border-slate-800/60 flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-3">
                    {/* Like Button */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleLike(e, post)}
                      className={`flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer hover:scale-110 active:scale-95 ${
                        post.isLiked ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-rose-400'
                      }`}
                      title={post.isLiked ? 'Unlike' : 'Like'}
                    >
                      <Heart
                        className={`w-4 h-4 transition ${post.isLiked ? 'fill-rose-500 text-rose-500' : ''}`}
                      />
                      <span>{post.likes || 0}</span>
                    </button>

                    {/* Comment Toggle Button */}
                    <button
                      type="button"
                      onClick={(e) => toggleComments(post.id, e)}
                      className={`flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer hover:scale-110 active:scale-95 ${
                        expandedCommentsPostIds.has(post.id) ? 'text-purple-400 font-bold' : 'text-slate-400 hover:text-purple-400'
                      }`}
                      title={expandedCommentsPostIds.has(post.id) ? 'Collapse comments' : 'Expand comments'}
                    >
                      <MessageCircle className={`w-4 h-4 ${expandedCommentsPostIds.has(post.id) ? 'fill-purple-400/20' : ''}`} />
                      <span>{post.comments?.length || 0}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Share Button */}
                    <button
                      type="button"
                      onClick={(e) => handleShare(e, post)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition cursor-pointer hover:scale-110 active:scale-95"
                      title="Share link"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Save / Bookmark Button */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleSave(e, post)}
                      className={`p-1.5 rounded-xl transition cursor-pointer hover:scale-110 active:scale-95 ${
                        post.isBookmarked
                          ? 'text-purple-400 bg-purple-500/10'
                          : 'text-slate-400 hover:text-purple-400 hover:bg-slate-800'
                      }`}
                      title={post.isBookmarked ? 'Remove Bookmark' : 'Save to Collection'}
                    >
                      <Bookmark
                        className={`w-3.5 h-3.5 transition ${
                          post.isBookmarked ? 'fill-purple-400 text-purple-400' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Collapsible Comments Sub-Panel (Only displayed when clicking the comments button) */}
                <AnimatePresence>
                  {expandedCommentsPostIds.has(post.id) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden bg-slate-950/95 border-t border-slate-800/80"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-3.5 space-y-3">
                        {post.comments && post.comments.length > 0 ? (
                          <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                            {post.comments.map((comment) => {
                              const commentAuthorAvatar = getSafeAvatar(
                                comment.user?.avatar,
                                comment.user?.name || comment.user?.username,
                                comment.user?.id
                              );
                              return (
                                <div
                                  key={comment.id}
                                  className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-xs flex items-start gap-2.5"
                                >
                                  <img
                                    src={commentAuthorAvatar}
                                    alt={comment.user?.name || 'User'}
                                    onClick={(e) => handleOpenProfile(e, comment.user)}
                                    className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 cursor-pointer hover:ring-2 hover:ring-purple-400 transition"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <div
                                        className="flex items-center gap-1 cursor-pointer group/name"
                                        onClick={(e) => handleOpenProfile(e, comment.user)}
                                      >
                                        <span className="font-bold text-slate-200 group-hover/name:text-purple-300 transition text-[11px]">
                                          {comment.user?.name || comment.user?.username || 'Member'}
                                        </span>
                                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-0.5">
                                          <CheckCircle2 className="w-2.5 h-2.5" /> Safe
                                        </span>
                                        {comment.user?.id === currentUser?.id && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeComment(post.id, comment.id);
                                            }}
                                            className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                                            title="Delete comment"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <p className="text-slate-300 mt-0.5 leading-snug break-words text-[11px]">
                                      {comment.content}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500 italic py-1 text-center">
                            No comments yet. Be the first to start the discussion!
                          </p>
                        )}

                        {/* Comment Input Form */}
                        <form
                          onSubmit={(e) => handleCardCommentSubmit(post.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 pt-1"
                        >
                          <input
                            type="text"
                            value={cardCommentInputs[post.id] || ''}
                            disabled={submittingCardCommentId === post.id}
                            onChange={(e) =>
                              setCardCommentInputs({ ...cardCommentInputs, [post.id]: e.target.value })
                            }
                            placeholder={submittingCardCommentId === post.id ? 'Scanning safety...' : 'Write a comment... (AI verified safe)'}
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-full px-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 disabled:opacity-50"
                          />
                          <button
                            type="submit"
                            disabled={!cardCommentInputs[post.id]?.trim() || submittingCardCommentId === post.id}
                            className="px-3.5 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs disabled:opacity-40 transition-all flex items-center gap-1 shadow-md shrink-0 cursor-pointer disabled:cursor-not-allowed"
                            title={submittingCardCommentId === post.id ? 'AI Safety Scan in progress...' : 'Post Comment'}
                          >
                            {submittingCardCommentId === post.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                          </button>
                        </form>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Reel Detail Modal (Full Reel Viewer with Custom Player & Comments) */}
      {modalReel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => {
            setActiveModalReel(null);
            setIsModalCommentsOpen(false);
          }}
        >
          <div
            className="relative max-w-2xl w-full bg-slate-900 border border-purple-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div
                className="flex items-center gap-3 cursor-pointer group"
                onClick={(e) => handleOpenProfile(e, modalReel.user)}
              >
                <img
                  src={getSafeAvatar(modalReel.user?.avatar, modalReel.user?.name || modalReel.user?.username, modalReel.user?.id)}
                  alt={modalReel.user?.name || 'Creator'}
                  className="w-10 h-10 rounded-full object-cover border border-purple-500/30 group-hover:ring-2 group-hover:ring-purple-400 transition"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-sm text-white group-hover:text-purple-300 transition">
                      {modalReel.user?.name || modalReel.user?.username}
                    </h4>
                    <span title="Verified Human" className="inline-flex items-center shrink-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">@{modalReel.user?.username}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveModalReel(null);
                  setIsModalCommentsOpen(false);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Scrollable Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar my-4 space-y-4 pr-1">
              {/* Custom Video Player without PiP or Translator */}
              <ExploreVideoPlayer src={modalReel.videoUrl} />

              {/* Audio Title Bar */}
              {modalReel.audioTitle && (
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2 text-xs text-purple-300">
                  <Music className="w-4 h-4 text-purple-400 shrink-0 animate-pulse" />
                  <span className="font-semibold truncate">{modalReel.audioTitle}</span>
                </div>
              )}

              {/* Caption */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                  {modalReel.caption}
                </p>

                {modalReel.tags && modalReel.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {modalReel.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                      >
                        #{tag.replace(/^#/, '')}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between py-2 border-y border-slate-800/80 text-sm">
                <div className="flex items-center gap-4">
                  {/* Like Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleLikeReel(e, modalReel)}
                    className={`flex items-center gap-1.5 font-bold transition cursor-pointer hover:scale-105 active:scale-95 ${
                      modalReel.isLiked ? 'text-rose-500' : 'text-slate-300 hover:text-rose-400'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${modalReel.isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                    <span>{modalReel.likes || 0} Likes</span>
                  </button>

                  {/* Comment Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setIsModalCommentsOpen((prev) => !prev)}
                    className={`flex items-center gap-1.5 font-semibold transition cursor-pointer hover:scale-105 active:scale-95 ${
                      isModalCommentsOpen ? 'text-purple-400 font-bold' : 'text-slate-400 hover:text-purple-300'
                    }`}
                    title={isModalCommentsOpen ? 'Hide Comments' : 'Show Comments'}
                  >
                    <MessageCircle className={`w-5 h-5 ${isModalCommentsOpen ? 'fill-purple-400/20' : ''}`} />
                    <span>{Math.max(modalReel.commentsCount || 0, (reelCommentsMap[modalReel.id] || []).length)} Comments</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Share Button */}
                  <button
                    type="button"
                    onClick={(e) => handleShareReel(e, modalReel)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 transition text-xs font-semibold cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" /> Share
                  </button>

                  {/* Save Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleSaveReel(e, modalReel)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition text-xs font-semibold cursor-pointer ${
                      savedReelIds.has(modalReel.id)
                        ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    <Bookmark
                      className={`w-4 h-4 ${savedReelIds.has(modalReel.id) ? 'fill-purple-400 text-purple-400' : ''}`}
                    />
                    {savedReelIds.has(modalReel.id) ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Comments Section for Reel Modal */}
              {!isModalCommentsOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsModalCommentsOpen(true);
                    if (!reelCommentsMap[modalReel.id]) {
                      fetchReelComments(modalReel.id).then((comments) => {
                        setReelCommentsMap((m) => ({ ...m, [modalReel.id]: comments }));
                      }).catch(() => {});
                    }
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 hover:border-purple-500/40 text-xs text-slate-400 hover:text-purple-300 transition flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <MessageCircle className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition" />
                  <span>Click to view and write comments ({Math.max(modalReel.commentsCount || 0, (reelCommentsMap[modalReel.id] || []).length)})</span>
                </button>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Reel Discussion Thread ({Math.max(modalReel.commentsCount || 0, (reelCommentsMap[modalReel.id] || []).length)})
                    </h5>
                    <button
                      type="button"
                      onClick={() => setIsModalCommentsOpen(false)}
                      className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      Hide
                    </button>
                  </div>

                  {(reelCommentsMap[modalReel.id] || []).length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800/60">
                      No comments yet on this reel. Be the first to start the verified conversation!
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {(reelCommentsMap[modalReel.id] || []).map((c) => {
                        const authorAvatar = getSafeAvatar(c.user?.avatar, c.user?.name || c.user?.username, c.user?.id);
                        return (
                          <div
                            key={c.id}
                            className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5"
                          >
                            <img
                              src={authorAvatar}
                              alt={c.user?.name || 'User'}
                              onClick={(e) => handleOpenProfile(e, c.user)}
                              className="w-7 h-7 rounded-full object-cover border border-purple-500/20 shrink-0 cursor-pointer hover:ring-2 hover:ring-purple-400 transition mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div
                                  className="flex items-center gap-1 cursor-pointer group/name"
                                  onClick={(e) => handleOpenProfile(e, c.user)}
                                >
                                  <span className="text-xs font-bold text-white group-hover/name:text-purple-300 transition">
                                    {c.user?.name || c.user?.username || 'Member'}
                                  </span>
                                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Safe
                                  </span>
                                  <span className="text-[10px] text-slate-500">{c.timestamp}</span>
                                  {c.user?.id === currentUser?.id && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        removeComment(modalReel.id, c.id);
                                        setReelCommentsMap((prev) => ({
                                          ...prev,
                                          [modalReel.id]: (prev[modalReel.id] || []).filter((item) => item.id !== c.id),
                                        }));
                                      }}
                                      className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                                      title="Delete comment"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-slate-200 mt-1 break-words">{c.content}</p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={commentsEndRef} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Comment Input Footer (Only shown when comments are open) */}
            {isModalCommentsOpen && (
              <form
                onSubmit={handleModalCommentSubmit}
                className="pt-3 border-t border-slate-800 flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={commentInputText}
                  onChange={(e) => setCommentInputText(e.target.value)}
                  placeholder={currentUser ? 'Write a verified comment on this reel...' : 'Sign in to comment'}
                  disabled={!currentUser || isSubmittingComment}
                  className="flex-1 px-4 py-2.5 bg-slate-950 border border-purple-500/20 rounded-full text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 disabled:opacity-50 transition"
                />
                <button
                  type="submit"
                  disabled={!currentUser || !commentInputText.trim() || isSubmittingComment}
                  className="px-4 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-xs flex items-center gap-1.5 hover:shadow-lg hover:shadow-purple-900/30 disabled:opacity-50 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSubmittingComment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" /> Send
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Post Detail Modal (Photos or Thoughts Only) */}
      {modalPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => {
            setActiveModalPost(null);
            setIsModalCommentsOpen(false);
          }}
        >
          <div
            className="relative max-w-3xl w-full bg-slate-900 border border-purple-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div
                className="flex items-center gap-3 cursor-pointer group"
                onClick={(e) => handleOpenProfile(e, modalPost.user)}
              >
                <img
                  src={getSafeAvatar(
                    modalPost.user?.avatar,
                    modalPost.user?.name || modalPost.user?.username,
                    modalPost.user?.id
                  )}
                  alt={modalPost.user?.name || 'Creator'}
                  className="w-10 h-10 rounded-full object-cover border border-purple-500/30 group-hover:ring-2 group-hover:ring-purple-400 transition"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-sm text-white group-hover:text-purple-300 transition">
                      {modalPost.user?.name || modalPost.user?.username}
                    </h4>
                    <span title="Verified Human" className="inline-flex items-center shrink-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">@{modalPost.user?.username}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveModalPost(null);
                  setIsModalCommentsOpen(false);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Scrollable Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar my-4 space-y-4 pr-1">
              {/* Photo Image */}
              {modalPost.mediaUrl ? (
                <div className="rounded-2xl overflow-hidden bg-black max-h-[400px] flex items-center justify-center border border-slate-800">
                  <img
                    src={modalPost.mediaUrl}
                    alt="Post detail"
                    className="max-h-[400px] w-full object-contain"
                  />
                </div>
              ) : null}

              {/* Caption */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                  {modalPost.caption}
                </p>

                {modalPost.tags && modalPost.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {modalPost.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                      >
                        #{tag.replace(/^#/, '')}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons in Modal */}
              <div className="flex items-center justify-between py-2 border-y border-slate-800/80 text-sm">
                <div className="flex items-center gap-4">
                  {/* Like Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleLike(e, modalPost)}
                    className={`flex items-center gap-1.5 font-bold transition cursor-pointer hover:scale-105 active:scale-95 ${
                      modalPost.isLiked ? 'text-rose-500' : 'text-slate-300 hover:text-rose-400'
                    }`}
                  >
                    <Heart
                      className={`w-5 h-5 ${modalPost.isLiked ? 'fill-rose-500 text-rose-500' : ''}`}
                    />
                    <span>{modalPost.likes || 0} Likes</span>
                  </button>

                  {/* Comment Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setIsModalCommentsOpen((prev) => !prev)}
                    className={`flex items-center gap-1.5 font-semibold transition cursor-pointer hover:scale-105 active:scale-95 ${
                      isModalCommentsOpen ? 'text-purple-400 font-bold' : 'text-slate-400 hover:text-purple-300'
                    }`}
                    title={isModalCommentsOpen ? 'Hide Comments' : 'Show Comments'}
                  >
                    <MessageCircle className={`w-5 h-5 ${isModalCommentsOpen ? 'fill-purple-400/20' : ''}`} />
                    <span>{modalPost.comments?.length || 0} Comments</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Share Button */}
                  <button
                    type="button"
                    onClick={(e) => handleShare(e, modalPost)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 transition text-xs font-semibold cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" /> Share
                  </button>

                  {/* Save Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleSave(e, modalPost)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition text-xs font-semibold cursor-pointer ${
                      modalPost.isBookmarked
                        ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    <Bookmark
                      className={`w-4 h-4 ${
                        modalPost.isBookmarked ? 'fill-purple-400 text-purple-400' : ''
                      }`}
                    />
                    {modalPost.isBookmarked ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Comments Section (Only displayed when clicking the comments button) */}
              {!isModalCommentsOpen ? (
                <button
                  type="button"
                  onClick={() => setIsModalCommentsOpen(true)}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 hover:border-purple-500/40 text-xs text-slate-400 hover:text-purple-300 transition flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <MessageCircle className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition" />
                  <span>Click to view and write comments ({modalPost.comments?.length || 0})</span>
                </button>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Discussion Thread ({modalPost.comments?.length || 0})
                    </h5>
                    <button
                      type="button"
                      onClick={() => setIsModalCommentsOpen(false)}
                      className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      Hide
                    </button>
                  </div>

                  {modalPost.comments?.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800/60">
                      No comments yet. Be the first to start the verified conversation!
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {modalPost.comments?.map((comment) => {
                        const commentAuthorAvatar = getSafeAvatar(
                          comment.user?.avatar,
                          comment.user?.name || comment.user?.username,
                          comment.user?.id
                        );
                        return (
                          <div
                            key={comment.id}
                            className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5"
                          >
                            <img
                              src={commentAuthorAvatar}
                              alt={comment.user?.name || 'User'}
                              onClick={(e) => handleOpenProfile(e, comment.user)}
                              className="w-7 h-7 rounded-full object-cover border border-purple-500/20 shrink-0 cursor-pointer hover:ring-2 hover:ring-purple-400 transition mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div
                                  className="flex items-center gap-1 cursor-pointer group/name"
                                  onClick={(e) => handleOpenProfile(e, comment.user)}
                                >
                                  <span className="text-xs font-bold text-white group-hover/name:text-purple-300 transition">
                                    {comment.user?.name || comment.user?.username || 'Member'}
                                  </span>
                                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Safe
                                  </span>
                                  <span className="text-[10px] text-slate-500">{comment.timestamp}</span>
                                  {comment.user?.id === currentUser?.id && (
                                    <button
                                      type="button"
                                      onClick={() => removeComment(modalPost.id, comment.id)}
                                      className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                                      title="Delete comment"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-slate-200 mt-1 break-words">{comment.content}</p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={commentsEndRef} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Comment Input Footer (Only shown when comments are open) */}
            {isModalCommentsOpen && (
              <form
                onSubmit={handleModalCommentSubmit}
                className="pt-3 border-t border-slate-800 flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={commentInputText}
                  onChange={(e) => setCommentInputText(e.target.value)}
                  placeholder={currentUser ? 'Write a verified comment...' : 'Sign in to comment'}
                  disabled={!currentUser || isSubmittingComment}
                  className="flex-1 px-4 py-2.5 bg-slate-950 border border-purple-500/20 rounded-full text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 disabled:opacity-50 transition"
                />
                <button
                  type="submit"
                  disabled={!currentUser || !commentInputText.trim() || isSubmittingComment}
                  className="px-4 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-xs flex items-center gap-1.5 hover:shadow-lg hover:shadow-purple-900/30 disabled:opacity-50 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSubmittingComment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" /> Send
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


