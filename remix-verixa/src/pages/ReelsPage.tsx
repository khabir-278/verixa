import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Heart, MessageCircle, Share2, ShieldCheck, Volume2, VolumeX, Flame, Bot, Sparkles, Plus, X, Upload, Loader2, AlertTriangle } from 'lucide-react';
import { Reel } from '../types';
import { extractVideoFrames } from '../lib/videoFrameExtractor';
import { uploadPostMedia, deleteStorageFile } from '../lib/supabaseServices';

export const ReelsPage: React.FC = () => {
  const { reels, likeReel, addReel, addToast } = useApp();
  const [currentReelIdx, setCurrentReelIdx] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isPublishingReel, setIsPublishingReel] = useState(false);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadAudioTitle, setUploadAudioTitle] = useState('Original Audio • Verified Clean');

  const activeReel: Reel = reels[currentReelIdx] || reels[0] || {
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

  const handleNext = () => {
    if (currentReelIdx < reels.length - 1) {
      setCurrentReelIdx((prev) => prev + 1);
    } else {
      setCurrentReelIdx(0);
    }
  };

  const handlePrev = () => {
    if (currentReelIdx > 0) {
      setCurrentReelIdx((prev) => prev - 1);
    }
  };

  const handleReelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsPublishingReel(true);
    let storagePath = '';

    try {
      // 1. Extract frames at configurable 1.0s intervals for authentic frame-by-frame moderation
      addToast('info', 'Scanning Reel', 'Extracting video frames for authentic safety and deepfake analysis...');
      let frames: Array<{ timestamp: number; data: string }> | undefined;
      try {
        const extraction = await extractVideoFrames(file, 1.0, 8);
        frames = extraction.frames;
      } catch (extractErr) {
        console.warn('Notice extracting video frames:', extractErr);
      }

      // 2. Upload permanent video media to Supabase Storage
      storagePath = await uploadPostMedia(file);

      // 3. Pre-publication video moderation & persistence via server
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
    <div className="min-h-[calc(100vh-65px)] flex items-center justify-center p-4 bg-slate-950">
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
              className="p-2 rounded-full bg-purple-600/80 hover:bg-purple-500 text-white backdrop-blur-md transition shadow-md"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/80"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Right Action Sidebar Overlay */}
        <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-5">
          <button
            onClick={() => likeReel(activeReel.id)}
            className="flex flex-col items-center gap-1 group"
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
            onClick={() => addToast('info', 'Comments', `${activeReel.commentsCount} AI moderated comments.`)}
            className="flex flex-col items-center gap-1"
          >
            <div className="p-3 rounded-full bg-black/60 text-slate-200 backdrop-blur-md">
              <MessageCircle className="w-6 h-6" />
            </div>
            <span className="text-xs text-white font-bold drop-shadow">{activeReel.commentsCount}</span>
          </button>

          <button
            onClick={() => addToast('info', 'Share', 'Reel link copied.')}
            className="flex flex-col items-center gap-1"
          >
            <div className="p-3 rounded-full bg-black/60 text-slate-200 backdrop-blur-md">
              <Share2 className="w-6 h-6" />
            </div>
            <span className="text-xs text-white font-bold drop-shadow">{activeReel.sharesCount}</span>
          </button>
        </div>

        {/* Bottom Details Overlay */}
        <div className="relative z-10 p-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent space-y-2">
          <div className="flex items-center gap-2.5">
            <img
              src={activeReel.user.avatar}
              alt={activeReel.user.name}
              className="w-9 h-9 rounded-full object-cover border-2 border-purple-500/40"
            />
            <span className="font-bold text-sm text-white">{activeReel.user.name}</span>
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
              disabled={currentReelIdx === 0}
              className="flex-1 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-200 font-bold disabled:opacity-30"
            >
              ▲ Previous
            </button>
            <button
              onClick={handleNext}
              className="flex-1 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-lg shadow-purple-900/40"
            >
              ▼ Next Reel
            </button>
          </div>
        </div>
      </div>

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
                className="p-1 text-slate-400 hover:text-white rounded-lg"
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
