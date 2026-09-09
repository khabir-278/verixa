import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { HelpCircle, Search, Sparkles, ShieldCheck, ChevronRight, FileQuestion, ArrowLeft } from 'lucide-react';

export const HelpCenterPage: React.FC = () => {
  const { setCurrentPage, isAuthenticated } = useApp();
  const [search, setSearch] = useState('');

  const faqs = [
    {
      q: 'How does VERIXA detect toxic comments in real time?',
      a: 'When you type a comment and press post, VERIXA sends the text payload to our server-side Gemini 2.5 Flash neural model. If toxicity score exceeds threshold, the comment is blocked instantly.',
    },
    {
      q: 'What should I do if my comment was blocked by mistake?',
      a: 'You can submit an AI moderation appeal directly via the Blocked Comment modal or open a ticket in our Contact Support section.',
    },
    {
      q: 'How do I earn a Verified Human AI Trust Badge?',
      a: 'Maintain a clean posting history for 7 consecutive days with zero moderation flags to achieve 98+ Safety Score.',
    },
    {
      q: 'How does media scanning detect deepfakes?',
      a: 'VERIXA Vision AI evaluates facial symmetry, lighting inconsistencies, frame rate jitter, and synthetic pixel artifacts.',
    },
  ];

  const filtered = faqs.filter(
    (f) =>
      f.q.toLowerCase().includes(search.toLowerCase()) ||
      f.a.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
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

      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold text-white flex items-center justify-center gap-2">
          Help Center & FAQs <HelpCircle className="w-7 h-7 text-purple-400" />
        </h1>
        <p className="text-xs text-slate-400">
          Everything you need to know about VERIXA safety features and AI guard systems.
        </p>

        <div className="relative max-w-md mx-auto pt-2">
          <Search className="w-4 h-4 absolute left-3.5 top-5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search help articles..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-purple-500/20 rounded-full text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((faq, idx) => (
          <div key={idx} className="p-5 rounded-2xl bg-slate-900/80 border border-purple-500/20 space-y-2">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <FileQuestion className="w-4 h-4 text-purple-400 shrink-0" /> {faq.q}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed pl-6">{faq.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
