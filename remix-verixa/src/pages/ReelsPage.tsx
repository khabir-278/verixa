import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Heart,
  MessageCircle,
  Share2,
  ShieldCheck,
  Volume2,
  VolumeX,
  Plus,
  X,
  Upload,
  Loader2,
  Send,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { Reel, Comment } from '../types';
import { extractVideoFrames } from '../lib/videoFrameExtractor';
import {
  uploadPostMedia,
  deleteStorageFile,
  fetchReelById,
  addReelComment,
  subscribeReelComments,
} from '../lib/supabaseServices';

interface ReelsPageProps {
  directReelId?: string | null;
  onClearDirectReel?: () => void;
}

export const ReelsPage: React.FC<ReelsPageProps> = ({ directReelId, onClearDirectReel }) => {
  const { reels, likeReel, addReel, addToast, currentUser, openUserProfile } = useApp();
  const [currentReelIdx, setCurrentReelIdx] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isPublishingReel, setIsPublishingReel] = useState(false);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadAudioTitle, setUploadAudioTitle] = useState('Original Audio • Verified Clean');

  // Direct reel fetching state
  const [directReel, setDirectReel] = useState<Reel | null>(null);
  const [isDirectLoading, setIsDirectLoading] = useState<boolean>(false);
  const [directNotFound, setDirectNotFound] = useState<boolean>(false);

  // Reel Comments Drawer state
  const [isCommentsDrawerOpen, setIsCommentsDrawerOpen] = useState<boolean>(false);
  const [reelComments, setReelComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState<boolean>(false);
  const [commentInputText, setCommentInputText] = useState<string>('');
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);

  // Handle directReelId
  useEffect(() => {
    if (!directReelId) {
      setDirectReel(null);
      setDirectNotFound(false);
      return;
    }

    // Check if reel exists in local list
    const foundIdx = reels.findIndex((r) => r.id === directReelId);
    if (foundIdx >= 0) {
      setCurrentReelIdx(foundIdx);
      setDirectReel(null);
      setDirectNotFound(false);
      return;
    }

    // Fetch from Supabase
    let isMounted = true;
    setIsDirectLoading(true);
    setDirectNotFound(false);

    fetchReelById(directReelId, currentUser?.id)
      .then((r) => {
        if (!isMounted) return;
        if (r) {
          setDirectReel(r);
        } else {
          setDirectNotFound(true);
        }
      })
      .catch(() => {
        if (isMounted) setDirectNotFound(true);
      })
      .finally(() => {
        if (isMounted) setIsDirectLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [directReelId, reels, currentUser?.id]);

  const activeReel: Reel =
    directReel ||
    reels[currentReelIdx] ||
    reels[0] || {
      id: 'reel_empty',
      user: {
        id: 'usr_verixa',
        username: 'verixa_safety',
        name: 'VERIXA Sentinel',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        aiTrustBadge: 'Verified Platform',
        bio: 'VERIXA AI Safety Guardian Sentinel',
        verified: true,
        safetyScore: 100,
        followersCount: 5000,
        followingCount: 0,
        postsCount: 12,
      },
      caption: 'Welcome to VERIXA Reels! Tap the + button to upload the first verified authentic short video.',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-cyber-security-system-in-a-computer-room-41551-large.mp4',
      audioTitle: 'VERIXA Original Sound - AI Safety Engine',
      likes: 1200,
      isLiked: false,
      commentsCount: 34,
      sharesCount: 12,
      aiTrustBadge: 'Verified Authentic Reel',
      deepfakeRisk: 1,
      moderationStatus: 'APPROVED',
      tags: ['AISafety', 'VERIXA'],
    };

  // Subscribe to real-time comments for active reel
  useEffect(() => {
    if (!isCommentsDrawerOpen || !activeReel.id || activeReel.id === 'reel_empty') return;

    setIsLoadingComments(true);
    const unsubscribe = subscribeReelComments(activeReel.id, (comments) => {
      setReelComments(comments);
      setIsLoadingComments(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isCommentsDrawerOpen, activeReel.id]);

  const handleNext = () => {
    if (directReel) {
      setDirectReel(null);
      if (onClearDirectReel) onClearDirectReel();
      setCurrentReelIdx(0);
      return;
    }
    if (currentReelIdx < reels.length - 1) {
      setCurrentReelIdx((prev) => prev + 1);
    } else {
      setCurrentReelIdx(0);
    }
  };

  const handlePrev = () => {
    if (directReel) {
      setDirectReel(null);
      if (onClearDirectReel) onClearDirectReel();
      return;
    }
    if (currentReelIdx > 0) {
      setCurrentReelIdx((prev) => prev - 1);
    }
  };

  const handleShareReel = async () => {
    const reelUrl = `${window.location.origin}/?reel=${activeReel.id}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Reel by ${activeReel.user.name} on VERIXA`,
          text: activeReel.caption ? activeReel.caption.slice(0, 100) : 'Check out this Reel on VERIXA',
          url: reelUrl,
        });
        addToast('success', 'Shared Successfully', 'Reel link shared via system dialog.');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          await navigator.clipboard.writeText(reelUrl);
          addToast('success', 'Link Copied', 'Permanent Reel link copied to clipboard.');
        }
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(reelUrl);
      addToast('success', 'Link Copied', 'Permanent Reel link copied to clipboard.');
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInputText.trim() || isSubmittingComment) return;
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please sign in to write comments.');
      return;
    }

    setIsSubmittingComment(true);
    const content = commentInputText.trim();

    try {
      // 1. Moderate comment through server gateway
      const modRes = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: content,
          postId: activeReel.id,
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

      // 2. Persist to Supabase
      const newCommentId = await addReelComment(
        activeReel.id,
        currentUser.id,
        currentUser.username,
        currentUser.avatar,
        content,
        modData.toxicity_score || 0
      );

      const optimisticComment: Comment = {
        id: newCommentId,
        postId: activeReel.id,
        user: currentUser,
        content,
        timestamp: 'Just now',
        toxicityScore: modData.toxicity_score || 0,
        categories: ['Verified Safe'],
        aiStatus: 'safe',
        likes: 0,
      };

      setReelComments((prev) => [...prev, optimisticComment]);
      activeReel.commentsCount = (activeReel.commentsCount || 0) + 1;
      setCommentInputText('');
      addToast('success', 'Comment Posted', 'Your comment was verified and published.');
    } catch (err: any) {
      console.error('Reel comment error:', err);
      addToast('error', 'Comment Error', err?.message || 'Could not post comment.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleReelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsPublishingReel(true);
    let storagePath = '';

    try {
      addToast('info', 'Scanning Reel', 'Extracting video frames for authentic safety and deepfake analysis...');
      let frames: Array<{ timestamp: number; data: string }> | undefined;
      try {
        const extraction = await extractVideoFrames(file, 1.0, 8);
        frames = extraction.frames;
      } catch (extractErr) {
        console.warn('Notice extracting video frames:', extractErr);
      }

      storagePath = await uploadPostMedia(file);

      const success = await addReel(
        storagePath,
        uploadCaption.trim() || 'New authentic short reel 🎬',
        uploadAudioTitle.trim() || 'Original Audio • Verified Clean',
        ['Reels', 'AISafety'],
        frames
      );

      if (success) {
        setShowUploadModal(false);
        setUploadCaption('');
        setCurrentReelIdx(0);
      } else {
        await deleteStorageFile(storagePath);
      }
    } catch (err: any) {
      console.error('Reel upload error:', err);
      if (storagePath) await deleteStorageFile(storagePath);
      addToast('error', 'Upload Failed', err.message || 'Could not upload reel.');
    } finally {
      setIsPublishingReel(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-[calc(100vh-65px)] flex items-center justify-center p-4 bg-slate-950 relative">
      {/* If direct loading or not found */}
      {isDirectLoading ? (
        <div className="py-24 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
          <p className="text-sm text-slate-400">Loading requested Reel from database...</p>
        </div>
      ) : directNotFound ? (
        <div className="py-20 text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">Reel Not Found</h3>
            <p className="text-xs text-slate-400">
              This reel does not exist, has been deleted, or the link is invalid.
            </p>
          </div>
          <button
            onClick={() => {
              setDirectNotFound(false);
              setDirectReel(null);
              if (onClearDirectReel) onClearDirectReel();
            }}
            className="px-5 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg transition cursor-pointer"
          >
            Explore Available Reels
          </button>
        </div>
      ) : (
        <div className="relative max-w-sm w-full h-[640px] rounded-3xl bg-slate-900 border border-purple-500/30 overflow-hidden shadow-2xl flex flex-col justify-between">
          {/* Reel Video Player Background */}
          <video
            src={activeReel.videoUrl}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0"
          />

          {/* Top Overlay Badge */}
          <div className="relative z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/80 border border-purple-500/40 backdrop-blur-md text-xs font-semibold text-purple-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{activeReel.aiTrustBadge}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUploadModal(true)}
                title="Upload Reel"
                className="p-2 rounded-full bg-purple-600/80 hover:bg-purple-500 text-white backdrop-blur-md transition shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/80 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Right Action Sidebar Overlay */}
          <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-5">
            <button
              onClick={() => likeReel(activeReel.id)}
              className="flex flex-col items-center gap-1 group cursor-pointer"
            >
              <div
                className={`p-3 rounded-full backdrop-blur-md transition ${
                  activeReel.isLiked ? 'bg-rose-500/80 text-white' : 'bg-black/60 text-slate-200'
                }`}
              >
                <Heart className={`w-6 h-6 ${activeReel.isLiked ? 'fill-white' : ''}`} />
              </div>
              <span className="text-xs text-white font-bold drop-shadow">{activeReel.likes}</span>
            </button>

            <button
              onClick={() => setIsCommentsDrawerOpen(true)}
              className="flex flex-col items-center gap-1 cursor-pointer"
              title="View & Post Comments"
            >
              <div className="p-3 rounded-full bg-black/60 text-slate-200 backdrop-blur-md hover:bg-black/80 transition">
                <MessageCircle className="w-6 h-6" />
              </div>
              <span className="text-xs text-white font-bold drop-shadow">{activeReel.commentsCount}</span>
            </button>

            <button
              onClick={handleShareReel}
              className="flex flex-col items-center gap-1 cursor-pointer"
              title="Share Reel Link"
            >
              <div className="p-3 rounded-full bg-black/60 text-slate-200 backdrop-blur-md hover:bg-black/80 transition">
                <Share2 className="w-6 h-6" />
              </div>
              <span className="text-xs text-white font-bold drop-shadow">{activeReel.sharesCount}</span>
            </button>
          </div>

          {/* Bottom Details Overlay */}
          <div className="relative z-10 p-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent space-y-2">
            <div
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={() => openUserProfile(activeReel.user)}
            >
              <img
                src={activeReel.user.avatar}
                alt={activeReel.user.name}
                className="w-9 h-9 rounded-full object-cover border-2 border-purple-500/40 group-hover:border-purple-400 transition"
              />
              <span className="font-bold text-sm text-white group-hover:text-blue-400 transition">
                {activeReel.user.name}
              </span>
            </div>

            <p className="text-xs text-slate-200 line-clamp-2">{activeReel.caption}</p>

            <div className="flex items-center justify-between text-[11px] text-purple-300 font-mono">
              <span>🎵 {activeReel.audioTitle}</span>
              <span className="text-emerald-400">Deepfake Risk: {activeReel.deepfakeRisk}%</span>
            </div>

            {activeReel.moderationStatus && (
              <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                <span>Status: <strong className="text-emerald-400">{activeReel.moderationStatus}</strong></span>
                <span className="text-slate-500">VERIXA Verified</span>
              </div>
            )}

            {/* Navigation Controls */}
            <div className="pt-2 flex justify-between gap-2 text-xs">
              <button
                onClick={handlePrev}
                disabled={!directReel && currentReelIdx === 0}
                className="flex-1 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-200 font-bold disabled:opacity-30 cursor-pointer"
              >
                ▲ Previous
              </button>
              <button
                onClick={handleNext}
                className="flex-1 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-lg shadow-purple-900/40 cursor-pointer"
              >
                ▼ Next Reel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reel Comments Drawer / Bottom Sheet */}
      {isCommentsDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="relative max-w-sm w-full h-[520px] bg-slate-900 border border-purple-500/30 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/80 shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-sm text-white">Reel Comments ({activeReel.commentsCount})</h3>
              </div>
              <button
                onClick={() => setIsCommentsDrawerOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Comments List */}
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-3">
              {isLoadingComments ? (
                <div className="py-16 text-center space-y-2 text-slate-400 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
                  <p>Loading verified comments...</p>
                </div>
              ) : reelComments.length === 0 ? (
                <div className="py-16 text-center space-y-2 text-slate-400 text-xs">
                  <p className="font-semibold text-slate-300">No comments yet</p>
                  <p className="text-slate-500 text-[11px]">Be the first to share an AI verified comment!</p>
                </div>
              ) : (
                reelComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-3 rounded-2xl bg-white/5 border border-white/5 text-xs flex items-start gap-2.5"
                  >
                    <img
                      src={comment.user.avatar}
                      alt={comment.user.name}
                      className="w-7 h-7 rounded-full object-cover shrink-0 cursor-pointer"
                      onClick={() => {
                        setIsCommentsDrawerOpen(false);
                        openUserProfile(comment.user);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span
                          className="font-bold text-white hover:text-blue-400 transition cursor-pointer"
                          onClick={() => {
                            setIsCommentsDrawerOpen(false);
                            openUserProfile(comment.user);
                          }}
                        >
                          {comment.user.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {comment.timestamp}
                        </span>
                      </div>
                      <p className="text-slate-200 mt-1 whitespace-pre-line leading-relaxed">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment Input */}
            <form onSubmit={handleCommentSubmit} className="p-3 bg-slate-950 border-t border-white/10 flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={commentInputText}
                onChange={(e) => setCommentInputText(e.target.value)}
                disabled={isSubmittingComment}
                placeholder="Write a comment... (AI scanned safe)"
                className="flex-1 bg-slate-900 border border-white/15 focus:border-purple-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
              />
              <button
                type="submit"
                disabled={!commentInputText.trim() || isSubmittingComment}
                className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white transition cursor-pointer"
                title="Send comment"
              >
                {isSubmittingComment ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reel Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative max-w-sm w-full bg-slate-900 border border-purple-500/30 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-white">Upload Authentic Reel</h3>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Caption</label>
                <input
                  type="text"
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="Write a reel caption..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Audio Title</label>
                <input
                  type="text"
                  value={uploadAudioTitle}
                  onChange={(e) => setUploadAudioTitle(e.target.value)}
                  placeholder="Original Audio"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="border-2 border-dashed border-slate-800 hover:border-purple-500/50 rounded-xl p-4 text-center bg-slate-950/50">
                <input
                  type="file"
                  accept="video/*"
                  id="reel-file-input"
                  className="hidden"
                  disabled={isPublishingReel}
                  onChange={handleReelFileUpload}
                />
                <label
                  htmlFor="reel-file-input"
                  className={`cursor-pointer flex flex-col items-center gap-1.5 ${isPublishingReel ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {isPublishingReel ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                      <span className="text-xs text-purple-300 font-semibold">Extracting Frames & Scanning...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-purple-400" />
                      <span className="text-xs text-slate-200 font-semibold">Select Video File (.mp4, .webm)</span>
                      <span className="text-[10px] text-slate-500">Extracts frames for server-side verification</span>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

