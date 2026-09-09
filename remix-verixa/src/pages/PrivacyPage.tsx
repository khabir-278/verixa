import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, Lock, Eye, Server, CheckCircle2, ArrowLeft } from 'lucide-react';

export const PrivacyPage: React.FC = () => {
  const { setCurrentPage, isAuthenticated } = useApp();

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

      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
          Privacy Policy & Encryption Guarantees <Lock className="w-6 h-6 text-purple-400" />
        </h1>
        <p className="text-xs text-slate-400">
          Last updated: May 2026 • Compliant with international data safety & AI security standards.
        </p>
      </div>

      <div className="space-y-6 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <section className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 space-y-2">
          <h2 className="font-bold text-base text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-purple-400" /> 1. Server-Side AI Processing
          </h2>
          <p>
            All AI content moderation (Gemini 2.5 Flash) is processed exclusively via secure server-side proxies (`/api/moderate/*`). API keys and sensitive user telemetry never expose client-side tokens.
          </p>
        </section>

        <section className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 space-y-2">
          <h2 className="font-bold text-base text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-400" /> 2. Data Protection & Encryption
          </h2>
          <p>
            VERIXA encrypts user direct messages and post payloads at rest using AES-256 and in transit via TLS 1.3. Your personal conversations are never sold to data brokers or advertising networks.
          </p>
        </section>

        <section className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 space-y-2">
          <h2 className="font-bold text-base text-white flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" /> 3. Biometric & Vision Media Audits
          </h2>
          <p>
            Photos and videos submitted for AI scan are evaluated in transient memory to detect deepfake vectors and NSFW compliance. Media files are automatically discarded if flagged unsafe.
          </p>
        </section>
      </div>
    </div>
  );
};
