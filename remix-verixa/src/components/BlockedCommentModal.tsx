import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldAlert, AlertOctagon, Lightbulb, CheckCircle, ArrowRight, ShieldCheck, HeartHandshake } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const BlockedCommentModal: React.FC = () => {
  const { blockedCommentModal, closeBlockedCommentModal, setCurrentPage } = useApp();

  if (!blockedCommentModal.open) return null;

  const isCaption = blockedCommentModal.contentType === 'caption';
  const isTitle = blockedCommentModal.contentType === 'title';
  const typeLabel = isCaption ? 'Caption' : isTitle ? 'Title' : 'Comment';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative max-w-lg w-full bg-slate-900/90 border border-rose-500/40 rounded-3xl p-6 md:p-8 shadow-2xl shadow-rose-950/50 overflow-hidden"
        >
          {/* Animated Glow Backdrops */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-600/30 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

          {/* Header Banner */}
          <div className="flex items-center gap-4 border-b border-rose-500/20 pb-5">
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 shrink-0 shadow-inner">
              <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold uppercase tracking-wider">
                <AlertOctagon className="w-3.5 h-3.5" /> {typeLabel} Blocked
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-white mt-1">
                Please Rewrite Your {typeLabel}
              </h2>
            </div>
          </div>

          {/* Content Body */}
          <div className="mt-5 space-y-4">
            {/* Warning Message Box */}
            <div id="blocked-comment-notice-box" className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 shadow-inner">
              <p className="text-xs uppercase tracking-wider text-rose-300 font-bold flex items-center gap-1.5">
                <HeartHandshake className="w-4 h-4 text-rose-400" /> Moderation Notice
              </p>
              <p className="text-sm font-semibold text-rose-100 mt-1.5 leading-relaxed">
                {blockedCommentModal.message || "Your comment couldn't be posted because it may contain offensive or inappropriate content."}
              </p>
              {blockedCommentModal.reason && (
                <p className="text-xs text-rose-300/80 mt-1 font-medium">
                  {blockedCommentModal.reason}
                </p>
              )}
            </div>

            {/* Blocked Content Preview */}
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-500 font-mono uppercase">YOUR ATTEMPTED {typeLabel}:</span>
                {blockedCommentModal.languageDetected && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {blockedCommentModal.languageDetected}
                  </span>
                )}
              </div>
              <p className="italic font-medium text-slate-200 line-clamp-3">
                "{blockedCommentModal.commentText}"
              </p>
            </div>

            {/* Toxicity Gauge & Confidence */}
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-400 flex items-center gap-2">
                  <span>AI Toxicity Analysis Score</span>
                  {typeof blockedCommentModal.confidence === 'number' && (
                    <span className="text-[11px] text-purple-300 font-mono bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/30">
                      {blockedCommentModal.confidence}% conf
                    </span>
                  )}
                </span>
                <span className="text-rose-400 font-bold">{blockedCommentModal.toxicityScore}% Harm Risk</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-700">
                <div
                  className="bg-gradient-to-r from-amber-500 via-rose-500 to-red-600 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${Math.max(blockedCommentModal.toxicityScore, 10)}%` }}
                />
              </div>
            </div>

            {/* Flagged Categories Badges */}
            {blockedCommentModal.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {blockedCommentModal.categories.map((cat, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-mono"
                  >
                    #{cat}
                  </span>
                ))}
              </div>
            )}

            {/* AI Rephrasing Tip */}
            {blockedCommentModal.suggestion && (
              <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-indigo-200 block">AI Constructive Suggestion:</span>
                  <p className="text-indigo-300 mt-0.5">{blockedCommentModal.suggestion}</p>
                </div>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <button
              id="edit-comment-try-again-btn"
              onClick={closeBlockedCommentModal}
              className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white font-semibold text-sm transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" /> Edit Comment & Try Again
            </button>
            <button
              id="view-community-guidelines-btn"
              onClick={() => {
                closeBlockedCommentModal();
                setCurrentPage('terms');
              }}
              className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium text-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-purple-400" /> Community Rules <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
