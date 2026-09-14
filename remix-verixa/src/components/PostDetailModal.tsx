import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Post, Comment } from '../types';
import { fetchPostById, togglePostLike, addComment as addSupabaseComment } from '../lib/supabaseServices';
import {
  X,
  Heart,
  MessageCircle,
  Share2,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Send,
} from 'lucide-react';

interface PostDetailModalProps {
  postId: string;
  onClose: () => void;
}

export const PostDetailModal: React.FC<PostDetailModalProps> = ({ postId, onClose }) => {
  const { currentUser, addToast, openUserProfile } = useApp();
  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>('');
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const loadPost = async () => {
      setIsLoading(true);
      setNotFound(false);
      try {
        const fetched = await fetchPostById(postId, currentUser?.id);
        if (!isMounted) return;
        if (fetched) {
          setPost(fetched);
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.warn('Error loading direct post:', err);
        if (isMounted) setNotFound(true);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadPost();
    return () => {
      isMounted = false;
    };
  }, [postId, currentUser?.id]);

  const handleLike = async () => {
    if (!currentUser || !post) {
      addToast('warning', 'Sign In Required', 'Please sign in to like posts.');
      return;
    }
    const nextLiked = !post.isLiked;
    const nextCount = Math.max(0, post.likes + (nextLiked ? 1 : -1));
    setPost({ ...post, isLiked: nextLiked, likes: nextCount });

    try {
      await togglePostLike(post.id, currentUser.id, nextLiked);
    } catch (err: any) {
      setPost({ ...post, isLiked: !nextLiked, likes: post.likes });
      addToast('error', 'Error', err?.message || 'Could not update like.');
    }
  };

  const handleShare = async () => {
    if (!post) return;
    const postUrl = `${window.location.origin}/?post=${post.id}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Post by ${post.user.name} on VERIXA`,
          text: post.caption ? post.caption.slice(0, 100) : 'Check out this post on VERIXA',
          url: postUrl,
        });
        addToast('success', 'Shared Successfully', 'Post link shared via system dialog.');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          await navigator.clipboard.writeText(postUrl);
          addToast('success', 'Link Copied', 'Permanent post link copied to clipboard.');
        }
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(postUrl);
      addToast('success', 'Link Copied', 'Permanent post link copied to clipboard.');
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !commentText.trim() || isSubmittingComment) return;
    if (!currentUser) {
      addToast('warning', 'Sign In Required', 'Please log in to comment.');
      return;
    }

    setIsSubmittingComment(true);
    const contentToPost = commentText.trim();

    try {
      // 1. Moderate comment through server gateway
      const modRes = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: contentToPost,
          postId: post.id,
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
      const newCommentId = await addSupabaseComment(
        post.id,
        currentUser.id,
        currentUser.username,
        currentUser.avatar,
        contentToPost,
        modData.toxicity_score || 0
      );

      const newCommentObj: Comment = {
        id: newCommentId,
        postId: post.id,
        user: currentUser,
        content: contentToPost,
        timestamp: 'Just now',
        toxicityScore: modData.toxicity_score || 0,
        categories: ['Verified Safe'],
        aiStatus: 'safe',
        likes: 0,
      };

      setPost({
        ...post,
        comments: [...post.comments, newCommentObj],
      });
      setCommentText('');
      addToast('success', 'Comment Posted', 'Your comment was verified and published.');
    } catch (err: any) {
      console.error('Error adding comment:', err);
      addToast('error', 'Comment Error', err?.message || 'Failed to post comment.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-purple-500/30 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header Bar */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
              VERIXA Direct Post
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4">
          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
              <p className="text-sm text-slate-400">Retrieving verified post from database...</p>
            </div>
          ) : notFound || !post ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">Post Not Found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  This post does not exist, has been deleted by the author, or the link is invalid.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg transition cursor-pointer"
              >
                Back to Feed
              </button>
            </div>
          ) : (
            <>
              {/* Post Author Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={post.user.avatar}
                    alt={post.user.name}
                    className="w-11 h-11 rounded-full object-cover border border-purple-500/40 cursor-pointer"
                    onClick={() => {
                      onClose();
                      openUserProfile(post.user);
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="font-bold text-white hover:text-blue-400 transition cursor-pointer text-sm"
                        onClick={() => {
                          onClose();
                          openUserProfile(post.user);
                        }}
                      >
                        {post.user.name}
                      </span>
                      {post.user.verified && (
                        <CheckCircle2 className="w-4 h-4 text-blue-400 fill-blue-400/20 shrink-0" />
                      )}
                      <span title="Verified Human" className="inline-flex items-center shrink-0">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      @{post.user.username} • {post.timestamp}
                    </span>
                  </div>
                </div>
              </div>

              {/* Caption */}
              {post.caption && (
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                  {post.caption}
                </p>
              )}

              {/* Media */}
              {post.mediaUrl && (
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black max-h-[450px] flex items-center justify-center">
                  {post.mediaType === 'video' || post.mediaUrl.includes('.mp4') ? (
                    <video
                      src={post.mediaUrl}
                      controls
                      playsInline
                      className="w-full max-h-[450px] object-contain"
                    />
                  ) : (
                    <img
                      src={post.mediaUrl}
                      alt="Post attachment"
                      className="w-full max-h-[450px] object-contain"
                    />
                  )}
                  {/* AI Verified Safe Symbol */}
                  <div className="absolute top-3 right-3 p-1.5 rounded-full bg-black/70 border border-emerald-500/30 backdrop-blur-md shadow-lg flex items-center justify-center" title="AI Verified Safe">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                </div>
              )}

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-slate-400">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleLike}
                    className={`flex items-center gap-1.5 transition cursor-pointer ${
                      post.isLiked ? 'text-rose-500 font-bold' : 'hover:text-rose-400'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${post.isLiked ? 'fill-rose-500' : ''}`} />
                    <span>{post.likes}</span>
                  </button>

                  <div className="flex items-center gap-1.5 text-blue-400">
                    <MessageCircle className="w-5 h-5" />
                    <span>{post.comments.length}</span>
                  </div>

                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 hover:text-purple-400 transition cursor-pointer"
                    title="Share post"
                  >
                    <Share2 className="w-5 h-5" />
                    <span>Share</span>
                  </button>
                </div>
              </div>

              {/* Comments Section */}
              <div className="pt-3 border-t border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Comments ({post.comments.length})
                </h4>

                {post.comments.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    No comments yet. Start the conversation below!
                  </p>
                ) : (
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
                            <span className="font-semibold text-slate-200">
                              {comment.user.name}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {comment.timestamp}
                            </span>
                          </div>
                          <p className="text-slate-300 mt-0.5 whitespace-pre-line">
                            {comment.content}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Comment Input */}
                <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    disabled={isSubmittingComment}
                    placeholder="Write an AI verified comment..."
                    className="flex-1 bg-black/50 border border-white/15 focus:border-purple-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim() || isSubmittingComment}
                    className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white transition cursor-pointer"
                    title="Post comment"
                  >
                    {isSubmittingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
