import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  Image as ImageIcon,
  Film,
  Sparkles,
  ShieldCheck,
  Upload,
  MapPin,
  Tag,
  Loader2,
  AlertTriangle,
  Smile,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  uploadPostMedia,
  getSignedMediaUrl,
  deleteStorageFile,
} from '../lib/supabaseServices';
import { extractVideoFrames } from '../lib/videoFrameExtractor';
import { scanPrivacyInText } from '../lib/privacyScanner';

export const CreatePostModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { addPost, currentUser, addToast } = useApp();
  const [caption, setCaption] = useState('');
  const [mediaStoragePath, setMediaStoragePath] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState<any>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  if (!isOpen) return null;

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video');
    setMediaType(isVideo ? 'video' : 'image');
    setIsScanning(true);
    setScanPreview(null);

    // Read base64 for fast local inspection
    let base64Data: string | undefined;
    if (!isVideo) {
      try {
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } catch {
        // Non-blocking fallback
      }
    }

    // Extract frames if video for authentic frame-by-frame inspection
    let videoFrames: Array<{ timestamp: number; data: string }> | undefined;
    if (isVideo) {
      try {
        const extraction = await extractVideoFrames(file, 1.0, 8);
        videoFrames = extraction.frames;
      } catch (extractErr) {
        console.warn('Notice extracting video frames:', extractErr);
      }
    }

    try {
      // 1. Upload to Supabase Storage: ${auth.uid()}/posts/<uuid>.<extension> (with resilient fallback)
      const storagePath = await uploadPostMedia(file);
      setMediaStoragePath(storagePath);

      // 2. Generate signed or public URL for preview and scanning
      const signedUrl = await getSignedMediaUrl(storagePath, 3600);
      const displayUrl = signedUrl || (storagePath.startsWith('data:') ? storagePath : URL.createObjectURL(file));
      setMediaUrl(displayUrl);

      // 3. AI moderation
      await triggerScan(
        displayUrl,
        storagePath,
        isVideo,
        base64Data || (storagePath.startsWith('data:') ? storagePath : undefined),
        file.type,
        videoFrames
      );
    } catch (err: any) {
      console.error('Post media upload failed:', err);
      addToast('error', 'Upload Failed', err.message || 'Upload failed. Please try again.');
      setMediaUrl('');
      setMediaStoragePath('');
      setScanPreview(null);
    } finally {
      setIsScanning(false);
      e.target.value = '';
    }
  };

  const triggerScan = async (
    url: string,
    storagePath: string,
    isVideo: boolean,
    imageBase64?: string,
    mimeType?: string,
    frames?: Array<{ timestamp: number; data: string }>
  ) => {
    setIsScanning(true);
    setScanPreview(null);
    try {
      const isGif = mimeType?.includes('gif') || url.toLowerCase().includes('.gif');
      const contentType = isVideo ? 'video' : (isGif ? 'gif' : 'image');
      const contentPayload = imageBase64 || url;

      const res = await fetch('/api/moderation/gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: contentPayload,
          content_type: contentType,
          mime_type: mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
          context: 'post media upload',
          frames,
          interval_seconds: 1.0,
        }),
      });
      const data = await res.json();
      
      const isSafe = data.allowed === true && data.decision === 'ALLOW';
      const isQuarantined = data.decision === 'QUARANTINE' || data.status === 'QUARANTINED' || data.state === 'REVIEW_REQUIRED';

      setScanPreview({
        safe: isSafe,
        status: data.status,
        decision: data.decision,
        summary: data.reason || (isSafe ? 'Media passed VERIXA AI safety inspection.' : isQuarantined ? 'Review Required: Media held in quarantine pending safety review.' : 'Media violates VERIXA safety guidelines.'),
        toxicityScore: data.toxicity_score || 0,
        labels: data.categories || data.labels || [],
      });

      if (!isSafe) {
        const flagReason = data.reason || data.message || 'Uploaded media violated safety guidelines.';
        if (isQuarantined) {
          addToast('warning', 'Review Required', flagReason);
        } else {
          addToast('error', 'Media Blocked by AI', flagReason);
        }
        await deleteStorageFile(storagePath);
        setMediaStoragePath('');
        setMediaUrl('');
      }
    } catch (err) {
      // Strict Security Requirement: Never use AI failure -> SAFE! Fail closed: QUARANTINED / REVIEW_REQUIRED
      setScanPreview({
        safe: false,
        status: 'QUARANTINED',
        decision: 'QUARANTINE',
        summary: 'Media scan service connection error. Held in quarantine for security review.',
        labels: ['Quarantine', 'Review Required'],
      });
      addToast('warning', 'Review Required', 'AI verification service temporarily unreachable. Media held for safety review.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim() && !mediaStoragePath && !mediaUrl) return;

    if (scanPreview && scanPreview.safe === false) {
      addToast('error', 'Post Blocked', scanPreview.summary || 'Uploaded media violated safety guidelines.');
      return;
    }

    setIsPublishing(true);
    const result = await addPost(caption, mediaStoragePath || undefined, mediaType);
    setIsPublishing(false);

    if (result.success) {
      setCaption('');
      setMediaUrl('');
      setMediaStoragePath('');
      setScanPreview(null);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          className="relative max-w-xl w-full bg-slate-900 border border-purple-500/30 rounded-3xl p-6 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-500/15 text-purple-300">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg text-white">Create Safe Post</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* User header */}
            <div className="flex items-center gap-3">
              <img
                src={currentUser?.avatar}
                alt={currentUser?.name}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover border border-purple-500/30"
              />
              <div>
                <h4 className="font-bold text-sm text-white">{currentUser?.name}</h4>
                <p className="text-xs text-purple-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Protected by VERIXA AI
                </p>
              </div>
            </div>

            {/* Caption Input */}
            <div className="space-y-2">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Share something positive, creative, or insightful..."
                rows={3}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 custom-scrollbar resize-none"
              />

              {/* Privacy Scanner Real-Time Warning */}
              {(() => {
                const privacyScan = scanPrivacyInText(caption);
                if (!privacyScan.has_sensitive_data) return null;
                return (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-amber-400 font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Privacy Alert: Sensitive personal data detected</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCaption(privacyScan.redacted_text)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/40 transition shrink-0"
                      >
                        Redact Sensitive Data
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {privacyScan.detected_types.map((type) => (
                        <span
                          key={type}
                          className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-500/40 text-[10px] font-mono text-amber-300 capitalize"
                        >
                          {type.replace('_', ' ')}
                        </span>
                      ))}
                      <span className="text-[10px] text-slate-400">
                        Posting PII publicly puts your privacy and security at risk.
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Media Upload & Preview */}
            {mediaUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-purple-500/30 bg-slate-950 max-h-60 flex items-center justify-center">
                {mediaType === 'image' ? (
                  <img src={mediaUrl} alt="Upload preview" className="w-full h-full object-cover" />
                ) : (
                  <video src={mediaUrl} controls className="w-full h-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={async () => {
                    if (mediaStoragePath) {
                      await deleteStorageFile(mediaStoragePath);
                    }
                    setMediaUrl('');
                    setMediaStoragePath('');
                    setScanPreview(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-black/70 rounded-full text-white hover:bg-rose-600 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-800 hover:border-purple-500/50 rounded-2xl p-6 text-center bg-slate-950/50 transition">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleMediaUpload}
                  className="hidden"
                  id="media-file-input"
                />
                <label
                  htmlFor="media-file-input"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <div className="p-3 rounded-full bg-purple-500/10 text-purple-400">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold text-slate-300">
                    Drag & Drop or click to upload photo/video
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Automatic AI NSFW & Deepfake pre-scanning enabled
                  </span>
                </label>
              </div>
            )}

            {/* AI Scanning Status Badge */}
            {isScanning && (
              <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-xs text-purple-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span>VERIXA Vision AI scanning uploaded media for NSFW & Deepfake markers...</span>
              </div>
            )}

            {scanPreview && (() => {
              const isQuarantined = scanPreview.status === 'QUARANTINED' || scanPreview.decision === 'QUARANTINE';
              const cardColor = scanPreview.safe
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : isQuarantined
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300';
              const iconColor = scanPreview.safe
                ? 'text-emerald-400'
                : isQuarantined
                ? 'text-amber-400'
                : 'text-rose-400';
              const headerTitle = scanPreview.safe
                ? 'AI Safety Scan Passed'
                : isQuarantined
                ? 'Safety Review Required'
                : 'Potential Harm Detected';

              return (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${cardColor}`}>
                  {scanPreview.safe ? (
                    <ShieldCheck className={`w-5 h-5 ${iconColor} shrink-0`} />
                  ) : (
                    <AlertTriangle className={`w-5 h-5 ${iconColor} shrink-0`} />
                  )}
                  <div>
                    <p className="font-bold">{headerTitle}</p>
                    <p className="text-[11px] opacity-90">{scanPreview.summary}</p>
                  </div>
                </div>
              );
            })()}

            {/* Submit Action */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Zero Hate Speech Guaranteed</span>
              </div>

              <button
                type="submit"
                disabled={isPublishing || (!caption.trim() && !mediaUrl)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm transition disabled:opacity-50 shadow-lg shadow-purple-900/30 flex items-center gap-2"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Publishing...
                  </>
                ) : (
                  'Publish Safe Post'
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
