import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldAlert, ArrowLeft, Bot, Sparkles } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const { setCurrentPage } = useApp();

  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col items-center justify-center p-4 bg-slate-950 text-center space-y-6">
      <div className="relative">
        <div className="p-6 rounded-3xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
          <Bot className="w-16 h-16 animate-bounce" />
        </div>
        <div className="absolute -top-2 -right-2 px-3 py-1 rounded-full bg-rose-500 text-white font-mono font-extrabold text-xs shadow-lg">
          404
        </div>
      </div>

      <div className="space-y-2 max-w-md">
        <h1 className="text-3xl font-extrabold text-white">Neural Pathway Not Found</h1>
        <p className="text-xs text-slate-400">
          The requested resource URL was relocated or quarantined by VERIXA AI Guard.
        </p>
      </div>

      <button
        onClick={() => setCurrentPage('home')}
        className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-900/40 inline-flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> Return to Safe Feed
      </button>
    </div>
  );
};
