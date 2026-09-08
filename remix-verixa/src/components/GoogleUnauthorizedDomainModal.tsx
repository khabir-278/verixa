import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { X, ExternalLink, Copy, Check, ShieldAlert, RefreshCw } from 'lucide-react';

export const GoogleUnauthorizedDomainModal: React.FC = () => {
  const {
    isUnauthorizedDomainModalOpen,
    closeUnauthorizedDomainModal,
    loginWithGoogle,
  } = useApp();

  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  if (!isUnauthorizedDomainModalOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://run.app';
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jnbaumemwxydjktwedtz.supabase.co';
  const supabaseCallbackUrl = `${supabaseUrl}/auth/v1/callback`;
  const supabaseConsoleUrl = 'https://supabase.com/dashboard/project/jnbaumemwxydjktwedtz/auth/url-configuration';

  const handleCopyOrigin = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2000);
    }
  };

  const handleCopyCallback = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(supabaseCallbackUrl);
      setCopiedCallback(true);
      setTimeout(() => setCopiedCallback(false), 2000);
    }
  };

  const handleRetryGoogleLogin = async () => {
    setIsRetrying(true);
    closeUnauthorizedDomainModal();
    await loginWithGoogle();
    setIsRetrying(false);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeUnauthorizedDomainModal}
          className="fixed inset-0 bg-black/85 backdrop-blur-sm"
        />

        {/* Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative w-full max-w-lg bg-[#111215] text-white rounded-3xl border border-amber-500/30 shadow-2xl overflow-hidden z-10 font-sans"
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Supabase Google OAuth Setup</h3>
                <p className="text-xs text-amber-400/90 font-mono">Redirect URL / Domain Configuration</p>
              </div>
            </div>

            <button
              onClick={closeUnauthorizedDomainModal}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5 text-sm max-h-[82vh] overflow-y-auto">
            <p className="text-gray-300 text-xs leading-relaxed">
              To enable Google Sign-In with Supabase, ensure your site redirect URL is listed in Supabase and the Supabase callback URL is configured in Google Cloud Console.
            </p>

            {/* Step 1: Site Redirect URL */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Step 1: Add to Supabase Redirect URLs
              </label>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/50 border border-white/10 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-gray-400">Current Site URL / Origin</div>
                  <div className="text-xs font-mono text-purple-300 truncate">{currentOrigin}</div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyOrigin}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedOrigin ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Step 2: Supabase Callback URL */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Step 2: Google Cloud Console Callback URL
              </label>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/50 border border-white/10 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-gray-400">Authorized Redirect URI</div>
                  <div className="text-xs font-mono text-purple-300 truncate">{supabaseCallbackUrl}</div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCallback}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedCallback ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Step 3: Open Supabase Dashboard */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Step 3: Supabase Dashboard
              </label>
              <a
                href={supabaseConsoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full p-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-200 font-semibold text-xs transition flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span>Open Supabase Auth &rarr; URL Configuration</span>
                </div>
                <span className="text-[11px] text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded">Dashboard</span>
              </a>
            </div>

            {/* Retry Button */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
              <span>Ready to try again?</span>
              <button
                type="button"
                onClick={handleRetryGoogleLogin}
                disabled={isRetrying}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold flex items-center gap-2 transition cursor-pointer shadow-lg shadow-purple-900/30"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>Retry Google Sign-In</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
