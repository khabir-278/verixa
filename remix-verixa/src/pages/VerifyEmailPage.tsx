import React from 'react';
import { useApp } from '../context/AppContext';
import { Mail, LogIn, ShieldCheck, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

export const VerifyEmailPage: React.FC = () => {
  const { pendingVerificationEmail, setCurrentPage, canGoBack, goBack } = useApp();

  const userEmail = pendingVerificationEmail || 'your email';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900/80 border border-purple-500/30 rounded-3xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl relative z-10 text-center"
      >
        {canGoBack && (
          <div className="text-left">
            <button
              type="button"
              onClick={goBack}
              className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-purple-400" />
              <span>Back</span>
            </button>
          </div>
        )}

        {/* Icon Header */}
        <div className="inline-flex p-4 rounded-3xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 text-white shadow-xl shadow-purple-600/30 mb-6">
          <Mail className="w-10 h-10 animate-bounce" />
        </div>

        <h2 className="text-2xl font-black text-white tracking-tight mb-3">
          Email Verification Required
        </h2>

        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-slate-200 text-sm leading-relaxed mb-6">
          We have sent you a verification email to <span className="font-semibold text-purple-300">{userEmail}</span>. Please verify it and log in.
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setCurrentPage('login')}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-purple-900/40 hover:scale-[1.02] transition transform flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>Login</span>
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>VERIXA AI Identity Safeguard</span>
        </div>
      </motion.div>
    </div>
  );
};
