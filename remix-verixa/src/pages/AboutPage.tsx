import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, Bot, Sparkles, Heart, Zap, Lock, Globe, ArrowRight } from 'lucide-react';

export const AboutPage: React.FC = () => {
  const { setCurrentPage } = useApp();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
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

      {/* Action CTA */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-indigo-900/40 via-purple-900/40 to-pink-900/40 border border-purple-500/30 text-center space-y-4">
        <h2 className="text-2xl font-bold text-white">Ready for a Safer Social Experience?</h2>
        <p className="text-xs text-slate-300 max-w-xl mx-auto">
          Join thousands of users sharing memories without fear of internet toxicity.
        </p>
        <button
          onClick={() => setCurrentPage('signup')}
          className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-900/40 inline-flex items-center gap-2"
        >
          <span>Get Started Free</span> <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
