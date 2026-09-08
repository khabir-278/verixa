import React from 'react';
import { ShieldAlert, CheckCircle2, FileText } from 'lucide-react';

export const TermsPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
          Terms & Conditions <FileText className="w-6 h-6 text-purple-400" />
        </h1>
        <p className="text-xs text-slate-400">
          Zero-Tolerance Policy for Hate Speech, Cyberbullying & Deepfake Impersonation.
        </p>
      </div>

      <div className="space-y-6 text-xs sm:text-sm text-slate-300 leading-relaxed">
        <section className="p-6 rounded-3xl bg-slate-900/80 border border-rose-500/30 space-y-2">
          <h2 className="font-bold text-base text-rose-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" /> 1. Zero-Tolerance Harassment Policy
          </h2>
          <p>
            VERIXA strictly prohibits any form of cyberbullying, hate speech, racial slurs, gender-based harassment, or targeted threats. Violations trigger immediate comment blocks and potential account ban.
          </p>
        </section>

        <section className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 space-y-2">
          <h2 className="font-bold text-base text-white flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-purple-400" /> 2. Account Authenticity
          </h2>
          <p>
            Creating fake profiles, bot clusters, or deploying unapproved automated engagement scripts is prohibited. Verified Human badges require passing AI behavioral verification.
          </p>
        </section>
      </div>
    </div>
  );
};
