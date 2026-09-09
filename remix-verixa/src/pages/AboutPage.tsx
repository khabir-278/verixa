import React from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldCheck,
  Sparkles,
  Heart,
  Zap,
  CheckCircle2,
  Award,
  Smile,
  Scale,
  ArrowLeft,
} from 'lucide-react';

export const AboutPage: React.FC = () => {
  const { setCurrentPage, isAuthenticated } = useApp();

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      {/* Top Left Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <button
          onClick={() => setCurrentPage(isAuthenticated ? 'home' : 'landing')}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-purple-400" />
          <span>{isAuthenticated ? 'Back to Feed' : 'Back to Welcome'}</span>
        </button>
      </div>

      {/* Hero */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" /> About VERIXA Platform
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-white">
          Reinventing Social Media for Mental Health & Cyber Safety
        </h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          VERIXA was created to eliminate toxicity, harassment, deepfakes, and hate speech from digital discourse using real-time Artificial Intelligence.
        </p>
      </div>

      {/* Impact Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-purple-500/20 text-center space-y-1 backdrop-blur-md">
          <div className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            99.4%
          </div>
          <div className="text-xs font-bold text-white">Toxicity Intercepted</div>
          <p className="text-[11px] text-slate-400">Harmful attacks blocked before reaching inboxes</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-purple-500/20 text-center space-y-1 backdrop-blur-md">
          <div className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
            &lt; 45ms
          </div>
          <div className="text-xs font-bold text-white">Inference Latency</div>
          <p className="text-[11px] text-slate-400">Instantaneous real-time neural verification</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-purple-500/20 text-center space-y-1 backdrop-blur-md">
          <div className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-purple-400 to-pink-300 bg-clip-text text-transparent">
            100%
          </div>
          <div className="text-xs font-bold text-white">Privacy First</div>
          <p className="text-[11px] text-slate-400">Zero data selling, private transient audits</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-purple-500/20 text-center space-y-1 backdrop-blur-md">
          <div className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-amber-400 to-rose-300 bg-clip-text text-transparent">
            12+
          </div>
          <div className="text-xs font-bold text-white">Dialects & Slang</div>
          <p className="text-[11px] text-slate-400">Understands Hinglish, colloquialisms & context</p>
        </div>
      </div>

      {/* Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 space-y-3">
          <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-400 w-fit">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-lg text-white">Zero Cyberbullying</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Our multi-layer sentiment classifiers catch harmful insults, threats, and toxic targeted harassment before comments reach the recipient.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 space-y-3">
          <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 w-fit">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-lg text-white">Deepfake & NSFW Defense</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Multimodal vision neural networks analyze every uploaded photo and video frame for face swaps, synthetic manipulation, or inappropriate content.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 space-y-3">
          <div className="p-3 rounded-2xl bg-pink-500/10 text-pink-400 w-fit">
            <Heart className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-lg text-white">Positive Community</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Transparent AI Trust Badges reward creators and everyday users who foster inspiring, respectful, and genuine social interactions.
          </p>
        </div>
      </div>

      {/* Core Principles & Commitments Section */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Our Guiding Philosophy & Standards
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto">
            Social networking should elevate human expression, inspire authentic connections, and respect mental health by default.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800/80 hover:border-purple-500/30 transition space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
                <Smile className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Proactive Prevention, Not Punitive Censorship</h4>
                <span className="text-[11px] text-purple-400 font-mono font-medium">Point-of-Ingestion Defense</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Traditional platforms rely on victims having to report abuse after emotional harm is already done. VERIXA intercepts hate speech and abusive harassment at the gate, offering creators automated peace of mind.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800/80 hover:border-purple-500/30 transition space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Transparent AI Trust Badges</h4>
                <span className="text-[11px] text-blue-400 font-mono font-medium">Reputation & Authenticity</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Instead of opaque shadowbans or arbitrary penalties, VERIXA rewards healthy community members with clear 0–100 Safety Scores and Verified Human Badges that celebrate genuine community standing.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800/80 hover:border-purple-500/30 transition space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-400">
                <Heart className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Digital Wellbeing & Mindful Connection</h4>
                <span className="text-[11px] text-pink-400 font-mono font-medium">Anti-Outrage Design</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Our recommendation feeds are strictly optimized for creative discovery, constructive discourse, and inspirational stories—not outrage loops or sensational doomscrolling that deplete mental health.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800/80 hover:border-purple-500/30 transition space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Ethical AI & Fair Appeal Rights</h4>
                <span className="text-[11px] text-indigo-400 font-mono font-medium">Human-in-the-Loop Oversight</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every automated decision provides full category breakdown and suggestion context. Users maintain direct appeal channels for edge cases and cultural nuances, guaranteeing fair creative freedom.
            </p>
          </div>
        </div>
      </div>

      {/* Comparison: Legacy Platforms vs VERIXA */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-purple-500/20 space-y-6">
        <div className="text-center space-y-1">
          <h3 className="text-xl font-bold text-white">The VERIXA Distinction</h3>
          <p className="text-xs text-slate-400">How our AI-first architectural paradigm compares to traditional social networks</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
              <span>Traditional Social Networks</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span> Outrage-driven algorithms designed to maximize conflict
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span> Delayed manual reporting requiring victims to endure abuse
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span> Unchecked synthetic deepfakes and mass bot engagement
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span> User behavioral data and private telemetry sold to ad brokers
              </li>
            </ul>
          </div>

          <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>VERIXA Safe Ecosystem</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span> Real-time AI moderation intercepts toxicity before delivery
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span> Multi-modal vision neural networks quarantine deepfakes & NSFW
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span> Transparent Trust Badges & Safety Scores incentivize kindness
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">✓</span> Zero data selling with end-to-end encrypted direct messaging
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
