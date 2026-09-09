import React from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldAlert,
  FileText,
  ScanEye,
  UserCheck,
  ArrowLeft,
  HeartHandshake,
  EyeOff,
  HelpCircle,
} from 'lucide-react';

export const TermsPage: React.FC = () => {
  const { setCurrentPage, isAuthenticated } = useApp();

  const sections = [
    {
      id: 'harassment',
      title: '1. Zero Cyberbullying & Hate Speech',
      icon: <ShieldAlert className="w-5 h-5 text-rose-400" />,
      badge: 'ZERO TOLERANCE',
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      summary: 'VERIXA strictly blocks any form of cyberbullying, harassment, or abusive behavior.',
      points: [
        'Hate speech targeting race, religion, caste, gender, sexual orientation, or disability is banned.',
        'Direct threats, doxxing, persistent stalking, and suicide/self-harm encouragement are strictly prohibited.',
        'Our real-time NLP neural filter inspects English, Hindi, Hinglish, and regional slang. Evading filters via leetspeak is a direct violation.'
      ]
    },
    {
      id: 'deepfakes',
      title: '2. Deepfakes & Impersonation',
      icon: <ScanEye className="w-5 h-5 text-purple-400" />,
      badge: 'AI VISION INTEGRITY',
      badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      summary: 'Protecting real human identity against synthetic media abuse and digital deception.',
      points: [
        'Non-consensual face swaps, simulated likeness, or clone audio lead to immediate permanent ban.',
        'Deceptively impersonating creators, public figures, or other users will trigger instant account quarantine.',
        'AI-generated art is welcomed but must be transparently disclosed where appropriate.'
      ]
    },
    {
      id: 'authenticity',
      title: '3. Authenticity & AI Safety Scores',
      icon: <UserCheck className="w-5 h-5 text-blue-400" />,
      badge: 'REPUTATION MATRIX',
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      summary: 'Dynamic AI Safety Scores (0–100) reward authentic and positive community interactions.',
      points: [
        'Deploying bot swarms, coordinated engagement pods, or scraper scripts is strictly forbidden.',
        'Users maintaining high safety scores and passing verification earn the Verified Human Trust Badge.',
        'Repeated toxic violations decrease your score, leading to commenting mutes or discovery limits.'
      ]
    },
    {
      id: 'media',
      title: '4. Visual Safety (No NSFW or Violence)',
      icon: <EyeOff className="w-5 h-5 text-indigo-400" />,
      badge: 'ZERO NSFW',
      badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      summary: 'All photos, reels, and stories undergo automated vision neural screening.',
      points: [
        'Explicit pornography, non-consensual nudity, and sexual solicitation are strictly barred.',
        'Real-world physical brutality, gore, weapons facilitation, or illegal contraband are prohibited.',
        'Uploaded media scoring above safety thresholds is automatically blurred and quarantined.'
      ]
    },
    {
      id: 'ownership',
      title: '5. Creator Rights & Human Appeals',
      icon: <HeartHandshake className="w-5 h-5 text-emerald-400" />,
      badge: 'CREATOR FIRST',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      summary: 'You own 100% of your content, with fair human-in-the-loop dispute resolution.',
      points: [
        'You retain full intellectual property ownership of your media. VERIXA never sells your personal data.',
        'Direct messages (DMs) are protected in transit with cryptographic encryption.',
        'Dispute false-positive interceptions with 1-click appeals within 14 days for human moderator review.'
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8 selection:bg-purple-500 selection:text-white">
      {/* Top Header & Navigation */}
      <div className="space-y-3 border-b border-slate-800 pb-6">
        <button
          onClick={() => setCurrentPage(isAuthenticated ? 'home' : 'landing')}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-purple-400" />
          <span>{isAuthenticated ? 'Back to Feed' : 'Back to Welcome'}</span>
        </button>

        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold mb-2">
            <FileText className="w-3.5 h-3.5 text-purple-400" /> COMMUNITY GUIDELINES
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Terms & Community Standards
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Key safety policies governing zero cyberbullying, deepfake defense, and creator rights.
          </p>
        </div>
      </div>

      {/* Concise Terms Cards */}
      <div className="space-y-4">
        {sections.map((sec) => (
          <div
            key={sec.id}
            className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-purple-500/30 backdrop-blur-xl transition space-y-3 shadow-lg"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex-shrink-0">
                  {sec.icon}
                </div>
                <h2 className="font-bold text-sm sm:text-base text-white">
                  {sec.title}
                </h2>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide border self-start sm:self-center ${sec.badgeColor}`}
              >
                {sec.badge}
              </span>
            </div>

            <p className="text-xs text-slate-400">{sec.summary}</p>

            <ul className="space-y-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
              {sec.points.map((pt, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">•</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom Help & Architecture Strip */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-purple-950/30 to-slate-900 border border-purple-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-white">Have questions or want to challenge an interception?</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            You can visit our Help Center or inspect our AI Neural Defense Architecture.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button
            onClick={() => setCurrentPage('help')}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-purple-900/30"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Help Center</span>
          </button>
          <button
            onClick={() => setCurrentPage('ai-architecture')}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            <span>AI Architecture</span>
          </button>
        </div>
      </div>
    </div>
  );
};
