import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldCheck,
  Zap,
  Sparkles,
  Bot,
  Lock,
  ArrowRight,
  CheckCircle2,
  Users,
  ShieldAlert,
  Flame,
  Activity,
  ChevronRight,
  Check,
} from 'lucide-react';
import { motion } from 'motion/react';

export const LandingPage: React.FC = () => {
  const { setCurrentPage, stats, isAuthenticated, currentUser } = useApp();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden selection:bg-purple-500 selection:text-white">
      {/* Background Animated Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[140px] animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[160px]" />
        <div className="absolute top-1/2 left-1/3 w-[400px] h-[400px] bg-pink-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex justify-center"
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur-xl opacity-60 group-hover:opacity-80 transition duration-500" />
              <img
                src="/verixa-logo.jpg"
                alt="VERIXA Logo"
                className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl object-cover shadow-2xl border border-purple-500/40"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-purple-500/30 text-purple-300 text-xs sm:text-sm font-semibold tracking-wide backdrop-blur-md"
          >
            <Sparkles className="w-4 h-4 text-purple-400 animate-spin" />
            <span>Next-Gen AI Social Safety • Zero Cyberbullying</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight"
          >
            Welcome to{' '}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
              VERIXA
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg sm:text-2xl text-slate-300 font-light max-w-2xl mx-auto leading-relaxed"
          >
            The Future of Safe Social Media Powered by Artificial Intelligence.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-sm sm:text-base text-slate-400 max-w-3xl mx-auto"
          >
            Detects and prevents toxic comments, hate speech, cyberbullying, fake profiles, NSFW media, spam, and deepfakes before they ever reach your feed.
          </motion.p>

          {/* Hero Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-4 pt-4"
          >
            <button
              onClick={() => setCurrentPage('signup')}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-base shadow-xl shadow-purple-900/40 hover:scale-105 transition transform flex items-center gap-2 cursor-pointer"
            >
              <span>Get Started</span> <ArrowRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => setCurrentPage('login')}
              className="px-8 py-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-purple-500/30 text-white font-semibold text-base backdrop-blur-xl transition hover:border-purple-400 cursor-pointer"
            >
              Login to Account
            </button>

            <button
              onClick={() => setCurrentPage('about')}
              className="px-6 py-4 rounded-2xl text-slate-400 hover:text-white text-sm font-medium transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>Learn More</span> <ChevronRight className="w-4 h-4" />
            </button>

            {isAuthenticated && currentUser && (
              <div className="w-full flex justify-center pt-2">
                <button
                  onClick={() => setCurrentPage('home')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/30 text-purple-200 text-xs font-medium transition cursor-pointer"
                >
                  <span>Signed in as @{currentUser.username} • Continue to Feed</span>
                  <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
                </button>
              </div>
            )}
          </motion.div>
        </div>

        {/* Floating AI Network Graphic Preview */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-16 relative rounded-3xl border border-purple-500/30 bg-slate-900/60 backdrop-blur-2xl p-6 sm:p-10 shadow-2xl overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-pulse" />

          {/* Simulated Active Moderation Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>COMMENT SCANNER</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> LIVE
                </span>
              </div>
              <p className="text-xs text-slate-300 italic">"This platform is so uplifting and safe!"</p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono">
                <ShieldCheck className="w-3.5 h-3.5" /> VERIFIED SAFE • 0.2% RISK
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-rose-950/40 border border-rose-500/40 space-y-3 shadow-lg shadow-rose-950/30">
              <div className="flex items-center justify-between text-xs font-semibold text-rose-300">
                <span>HATE SPEECH GUARD</span>
                <span className="text-rose-400 flex items-center gap-1 font-bold">
                  <ShieldAlert className="w-3.5 h-3.5" /> BLOCKED
                </span>
              </div>
              <p className="text-xs text-rose-200 line-through">"Attempted toxic comment insult..."</p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[11px] font-mono font-bold">
                ⚠️ COMMENT BLOCKED • 96% TOXICITY
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>VISION & DEEPFAKE AI</span>
                <span className="text-purple-400 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> 100% ACCURATE
                </span>
              </div>
              <p className="text-xs text-slate-300">Synthetic media & face swaps automatically quarantined.</p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[11px] font-mono">
                <Bot className="w-3.5 h-3.5" /> DEEPFAKE SHIELD PASS
              </div>
            </div>
          </div>
        </motion.div>

        {/* Live Statistics Counters */}
        <div className="mt-16 grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-purple-500/20 backdrop-blur-xl text-center">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-500">
              {stats.toxicBlocked.toLocaleString()}+
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">✔ Toxic Comments Blocked</p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-purple-500/20 backdrop-blur-xl text-center">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">
              {stats.fakeProfilesDetected.toLocaleString()}+
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">✔ Fake Profiles Detected</p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-purple-500/20 backdrop-blur-xl text-center">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              {stats.usersProtected.toLocaleString()}+
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">✔ Users Protected</p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-purple-500/20 backdrop-blur-xl text-center">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
              {stats.aiAccuracy}%
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">✔ AI Accuracy Rate</p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-purple-500/20 backdrop-blur-xl text-center col-span-2 lg:col-span-1">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
              {stats.dailyScans}
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">✔ Daily Scans Executed</p>
          </div>
        </div>

        {/* Core Pillars Feature Grid */}
        <div className="mt-24 space-y-12">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Built for Ultimate Online Safety
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              VERIXA combines cutting-edge AI neural networks with sleek social media design.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-slate-900/50 border border-purple-500/20 backdrop-blur-xl hover:border-purple-500/40 transition">
              <div className="p-4 rounded-2xl bg-purple-500/10 text-purple-400 w-fit mb-6">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Real-Time Comment Shield</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                When a user writes a comment, VERIXA instantly evaluates toxicity, hate speech, threats, and harassment. Harmful comments are blocked instantly with an explanatory popup.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/50 border border-purple-500/20 backdrop-blur-xl hover:border-purple-500/40 transition">
              <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-400 w-fit mb-6">
                <Zap className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Image & Video Vision AI</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Uploaded images and videos undergo AI inspection for NSFW content, violence, weapons, blood, and deepfake artifacts with real-time confidence scores.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/50 border border-purple-500/20 backdrop-blur-xl hover:border-purple-500/40 transition">
              <div className="p-4 rounded-2xl bg-pink-500/10 text-pink-400 w-fit mb-6">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">AI Trust Badges & Scores</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every user profile features a transparent AI Safety Score and Verified Human Trust Badge, shielding real users from bot clusters and fake accounts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
