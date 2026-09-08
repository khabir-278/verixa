import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { deleteCurrentUserAccount } from '../lib/supabaseServices';
import {
  ShieldCheck,
  Moon,
  Sun,
  Sliders,
  Bell,
  Lock,
  Globe,
  Trash2,
  Check,
  Smartphone,
  ShieldAlert,
  User,
  Eye,
  EyeOff,
  Sparkles,
  Download,
  KeyRound,
  UserX,
  Volume2,
  SlidersHorizontal,
  Info,
  CheckCircle2,
  Mail,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type SettingsTab = 'moderation' | 'privacy' | 'notifications' | 'appearance' | 'account';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, addToast, logout, currentUser } = useApp();
  const [activeTab, setActiveTab] = useState<SettingsTab>('moderation');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([
    { id: 'b_1', name: 'Crypto Bot 9000', username: 'crypto_spammer_x', reason: 'Automated Phishing Links' },
    { id: 'b_2', name: 'Troll Account #88', username: 'hater_anon', reason: 'Toxicity & Harassment' },
  ]);

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'moderation', label: 'AI Shield', icon: <ShieldCheck className="w-4 h-4" />, badge: 'Active' },
    { id: 'privacy', label: 'Privacy & Security', icon: <Lock className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Moon className="w-4 h-4" /> },
    { id: 'account', label: 'Account & Data', icon: <User className="w-4 h-4" /> },
  ];

  const strictnessLevels: Array<'LENIENT' | 'BALANCED' | 'STRICT' | 'ZERO_TOLERANCE'> = [
    'LENIENT',
    'BALANCED',
    'STRICT',
    'ZERO_TOLERANCE',
  ];

  const languages = ['English (US)', 'Spanish (Español)', 'Japanese (日本語)', 'German (Deutsch)', 'French (Français)'];

  const unblockUser = (id: string, name: string) => {
    setBlockedUsers((prev) => prev.filter((u) => u.id !== id));
    addToast('info', 'User Unblocked', `${name} has been removed from your blocked list.`);
  };

  const exportDataArchive = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      user: currentUser,
      settings: settings,
      exportedAt: new Date().toISOString(),
      platform: 'VERIXA Social AI',
    }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `verixa_data_archive_${currentUser?.username || 'user'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    addToast('success', 'Data Exported', 'Your VERIXA account archive (.json) download started.');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-wider">
              Control Center
            </span>
            <span className="text-xs text-gray-500 font-mono">v2.4 Shielded</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5 mt-2">
            Settings & Safety Controls <Sliders className="w-6 h-6 text-purple-400" />
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Customize your AI moderation strictness, privacy parameters, notification alerts, and account security.
          </p>
        </div>

        {/* Quick User Badge */}
        {currentUser && (
          <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10 shrink-0">
            <img src={currentUser.avatar} alt={currentUser.name} className="w-9 h-9 rounded-full object-cover border border-white/20" />
            <div>
              <p className="font-bold text-xs text-white truncate max-w-[140px]">{currentUser.name}</p>
              <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-400" /> {currentUser.safetyScore}% AI Trust Score
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Responsive Horizontal Tab Navigation Bar */}
      <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 border-b border-white/5">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 relative ${
                active
                  ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/5'
              }`}
            >
              <span className={active ? 'text-white' : 'text-purple-400'}>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-1.5 py-0.2 rounded-full bg-green-500/20 text-green-300 text-[9px] font-extrabold uppercase">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="space-y-6"
        >
          {/* TAB 1: AI MODERATION SHIELD */}
          {activeTab === 'moderation' && (
            <div className="space-y-6">
              {/* AI Strictness Selector */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-bold text-base text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-purple-400" /> Gemini AI Strictness Guard
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Choose how aggressively the AI scans & shields comments, captions, and incoming media.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-mono font-bold uppercase">
                    Level: {settings.aiStrictness}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  {strictnessLevels.map((lvl) => {
                    const active = settings.aiStrictness === lvl;
                    return (
                      <button
                        key={lvl}
                        onClick={() => updateSettings({ aiStrictness: lvl })}
                        className={`p-4 rounded-2xl border text-left transition relative overflow-hidden ${
                          active
                            ? 'bg-purple-950/70 border-purple-500 text-white shadow-lg shadow-purple-950/40 ring-2 ring-purple-500/50'
                            : 'bg-slate-950/60 border-slate-800 text-gray-400 hover:border-slate-700 hover:bg-slate-900/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs uppercase tracking-wider">{lvl.replace('_', ' ')}</span>
                          {active && <Check className="w-4 h-4 text-purple-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                          {lvl === 'LENIENT' && 'Allows casual slang; flags severe hate speech and explicit threats.'}
                          {lvl === 'BALANCED' && 'Recommended balance. Blocks harassment, insults, phishing, and spam.'}
                          {lvl === 'STRICT' && 'High protection. Flags mild profanity, rude tones, and bot activity.'}
                          {lvl === 'ZERO_TOLERANCE' && 'Maximum AI Shield. Zero negativity, toxicity, or unverified links allowed.'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Advanced Shield Toggles */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-400" /> Automated AI Protections
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-white block">Auto-Filter Toxic Comments</span>
                      <span className="text-gray-400">Instantly quarantine hostile comments before they appear on your posts.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.autoFilterToxic ?? true}
                      onChange={(e) => updateSettings({ autoFilterToxic: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-white block">Deepfake & AI Media Warnings</span>
                      <span className="text-gray-400">Display watermarks on synthetic photos or AI-altered video uploads.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.warnDeepfakes ?? true}
                      onChange={(e) => updateSettings({ warnDeepfakes: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-white block">Blur Sensitive & NSFW Content</span>
                      <span className="text-gray-400">Automatically apply blur overlays to media flagged as potentially graphic.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.blurSensitiveMedia ?? false}
                      onChange={(e) => updateSettings({ blurSensitiveMedia: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRIVACY & SECURITY */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              {/* Profile Privacy Level */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-emerald-400" /> Account & Feed Privacy
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { key: 'PUBLIC', label: 'Public Feed', desc: 'Everyone on VERIXA can view your posts & safety badges.' },
                    { key: 'FRIENDS_ONLY', label: 'Followers Only', desc: 'Only confirmed followers can view your feed & stories.' },
                    { key: 'ENCRYPTED_PRIVATE', label: 'Encrypted Vault', desc: 'Maximum security. All posts are end-to-end encrypted.' },
                  ].map((mode) => {
                    const active = settings.privacyLevel === mode.key;
                    return (
                      <button
                        key={mode.key}
                        onClick={() => updateSettings({ privacyLevel: mode.key as any })}
                        className={`p-4 rounded-2xl border text-left transition ${
                          active
                            ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-lg ring-2 ring-emerald-500/40'
                            : 'bg-slate-950/60 border-slate-800 text-gray-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-xs uppercase">
                          <span>{mode.label}</span>
                          {active && <Check className="w-4 h-4 text-emerald-400" />}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2">{mode.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Two-Factor Authentication & Direct Messages */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-indigo-400" /> Security Credentials & Interactions
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <span className="font-bold text-white block">Two-Factor Authentication (2FA)</span>
                        <span className="text-gray-400">Require an authenticator app code on every new device login.</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.twoFactorAuth}
                      onChange={(e) => updateSettings({ twoFactorAuth: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div className="flex items-center gap-3">
                      <EyeOff className="w-5 h-5 text-amber-400 shrink-0" />
                      <div>
                        <span className="font-bold text-white block">Hide Active Online Status</span>
                        <span className="text-gray-400">Keep your active status hidden from non-followed accounts.</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.hideOnlineStatus ?? false}
                      onChange={(e) => updateSettings({ hideOnlineStatus: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-blue-400 shrink-0" />
                      <div>
                        <span className="font-bold text-white block">Allow Direct Messages from Everyone</span>
                        <span className="text-gray-400">Allow incoming DMs from users you don't follow (scanned by AI Guard).</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.allowDMsFromNonFollowers ?? true}
                      onChange={(e) => updateSettings({ allowDMsFromNonFollowers: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Blocked Accounts List */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <UserX className="w-5 h-5 text-rose-400" /> Blocked Accounts ({blockedUsers.length})
                </h3>

                {blockedUsers.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center">You have no blocked users on your list.</p>
                ) : (
                  <div className="space-y-2">
                    {blockedUsers.map((u) => (
                      <div key={u.id} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                        <div>
                          <p className="font-bold text-white">{u.name} <span className="text-gray-500 font-normal">@{u.username}</span></p>
                          <p className="text-[11px] text-rose-400/80 mt-0.5">Reason: {u.reason}</p>
                        </div>
                        <button
                          onClick={() => unblockUser(u.id, u.name)}
                          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-bold text-xs transition"
                        >
                          Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: NOTIFICATIONS & ALERTS */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-amber-400" /> Notification Channels & Triggers
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-white block">Push Notifications</span>
                      <span className="text-gray-400">Real-time alerts for mentions, comments, and direct messages.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.pushNotifications}
                      onChange={(e) => updateSettings({ pushNotifications: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-white block">Critical Email Security Alerts</span>
                      <span className="text-gray-400">Immediate email notifications if suspicious activity or login is detected.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.emailAlerts}
                      onChange={(e) => updateSettings({ emailAlerts: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-white block">Comment & Like Interactions</span>
                      <span className="text-gray-400">Notify me when someone likes or comments on my posts.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.commentAlerts ?? true}
                      onChange={(e) => updateSettings({ commentAlerts: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-white block">Weekly AI Safety Digest</span>
                      <span className="text-gray-400">Receive a weekly summary of blocked spam, trust stats, and platform security.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.weeklyDigest ?? true}
                      onChange={(e) => updateSettings({ weeklyDigest: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: APPEARANCE & ACCESSIBILITY */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Moon className="w-5 h-5 text-indigo-400" /> Theme & Visual Interface
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => updateSettings({ darkMode: true })}
                    className={`p-4 rounded-2xl border text-left flex items-center justify-between transition ${
                      settings.darkMode
                        ? 'bg-purple-950/60 border-purple-500 text-white shadow-lg ring-2 ring-purple-500/40'
                        : 'bg-slate-950/60 border-slate-800 text-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Moon className="w-5 h-5 text-purple-400" />
                      <div>
                        <span className="font-bold text-xs block text-white">VERIXA Dark Cyber</span>
                        <span className="text-[10px] text-gray-400">Optimized for high contrast and night viewing.</span>
                      </div>
                    </div>
                    {settings.darkMode && <Check className="w-4 h-4 text-purple-400" />}
                  </button>

                  <button
                    onClick={() => {
                      updateSettings({ darkMode: false });
                      addToast('info', 'Theme Preference', 'Light theme set (Dark theme recommended).');
                    }}
                    className={`p-4 rounded-2xl border text-left flex items-center justify-between transition ${
                      !settings.darkMode
                        ? 'bg-purple-950/60 border-purple-500 text-white shadow-lg ring-2 ring-purple-500/40'
                        : 'bg-slate-950/60 border-slate-800 text-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Sun className="w-5 h-5 text-amber-400" />
                      <div>
                        <span className="font-bold text-xs block text-white">Clean Light Canvas</span>
                        <span className="text-[10px] text-gray-400">Bright background with crisp typography.</span>
                      </div>
                    </div>
                    {!settings.darkMode && <Check className="w-4 h-4 text-purple-400" />}
                  </button>
                </div>
              </div>

              {/* Language & Accessibility */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-blue-400" /> Language & Motion Accessibility
                </h3>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-white block mb-1.5">System Language</label>
                    <select
                      value={settings.language}
                      onChange={(e) => updateSettings({ language: e.target.value })}
                      className="w-full max-w-xs bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-purple-500"
                    >
                      {languages.map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
                    <div>
                      <span className="font-bold text-white block">High Contrast Mode</span>
                      <span className="text-gray-400">Enhance border definition and font sharpness.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.highContrast ?? false}
                      onChange={(e) => updateSettings({ highContrast: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
                    <div>
                      <span className="font-bold text-white block">Reduced Motion & Animations</span>
                      <span className="text-gray-400">Minimize ambient background glows and transition motion.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.reducedMotion ?? false}
                      onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ACCOUNT & DATA CONTROL */}
          {activeTab === 'account' && (
            <div className="space-y-6">
              {/* Profile Credentials Card */}
              {currentUser && (
                <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-purple-400" /> Account Identity
                  </h3>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 gap-4">
                    <div className="flex items-center gap-3">
                      <img src={currentUser.avatar} alt={currentUser.name} className="w-12 h-12 rounded-full object-cover border border-purple-500/30" />
                      <div>
                        <h4 className="font-bold text-sm text-white">{currentUser.name}</h4>
                        <p className="text-xs text-gray-400">@{currentUser.username}</p>
                        <p className="text-[10px] text-purple-300 font-mono mt-0.5">{currentUser.role}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => addToast('info', 'Password Reset', 'A password reset email link has been sent to your registered inbox.')}
                      className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-bold transition flex items-center gap-2 shrink-0"
                    >
                      <KeyRound className="w-4 h-4" /> Reset Password
                    </button>
                  </div>
                </div>
              )}

              {/* Data Export Card */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Download className="w-5 h-5 text-blue-400" /> Export Personal Data Archive
                </h3>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs gap-4">
                  <div>
                    <span className="font-bold text-white block">Download Account & Safety Logs</span>
                    <span className="text-gray-400">Export your posts, verified human badges, settings, and AI audit history in JSON format.</span>
                  </div>
                  <button
                    onClick={exportDataArchive}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition flex items-center gap-2 shrink-0 shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                  >
                    <Download className="w-4 h-4" /> Export Archive
                  </button>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="p-6 rounded-3xl bg-rose-950/20 border border-rose-500/30 backdrop-blur-xl shadow-xl space-y-4">
                <h3 className="font-bold text-base text-rose-300 flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-rose-400" /> Danger Zone
                </h3>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-4 p-4 rounded-2xl bg-slate-950 border border-rose-900/40">
                  <div>
                    <span className="font-bold text-slate-200 block">Delete VERIXA Account</span>
                    <span className="text-gray-400">Permanently erase your social data, posts, comments, and AI trust history.</span>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/40 text-rose-300 font-bold transition shrink-0"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldAlert className="w-8 h-8" />
              <h3 className="font-bold text-lg text-white">Confirm Account Erasure</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure? This operation is permanent. All your verified human credentials and AI trust history will be erased from VERIXA Servers.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    await deleteCurrentUserAccount();
                    setShowDeleteModal(false);
                    addToast('info', 'Account Erased', 'Your account and personal records have been permanently removed.');
                    await logout();
                  } catch (err: any) {
                    console.error('Account erasure error:', err);
                    addToast('error', 'Erasure Failed', err.message || 'Could not complete account erasure.');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition flex items-center gap-2"
              >
                {isDeleting ? 'Erasing Data...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
