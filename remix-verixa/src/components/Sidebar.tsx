import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Home,
  Compass,
  Film,
  MessageSquare,
  Bell,
  User,
  Settings,
  Info,
  Mail,
  ShieldCheck,
  FileText,
  HelpCircle,
  X,
  Sparkles,
  Lock,
  Flame,
  AlertTriangle,
  ScanEye,
  Bot,
} from 'lucide-react';
import { PageView } from '../types';

export const Sidebar: React.FC<{
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onOpenCreatePost: () => void;
}> = ({ isOpenMobile = false, onCloseMobile, onOpenCreatePost }) => {
  const {
    currentPage,
    setCurrentPage,
    unreadNotifCount,
    totalUnreadMessagesCount,
    currentUser,
    openScannerModal,
    openUserProfile,
  } = useApp();

  const navItems: { id: PageView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'home', label: 'Home Feed', icon: <Home className="w-5 h-5" /> },
    { id: 'explore', label: 'Explore', icon: <Compass className="w-5 h-5" /> },
    { id: 'reels', label: 'Reels', icon: <Film className="w-5 h-5" /> },
    {
      id: 'messages',
      label: 'Messages',
      icon: <MessageSquare className="w-5 h-5" />,
      badge: totalUnreadMessagesCount > 0 ? totalUnreadMessagesCount : undefined,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-5 h-5" />,
      badge: unreadNotifCount,
    },
    { id: 'sentinel-ai', label: 'Sentinel AI Chatbot', icon: <Bot className="w-5 h-5 text-purple-400" /> },
    { id: 'ai-dashboard', label: 'AI Dashboard', icon: <Sparkles className="w-5 h-5 text-amber-400" /> },
    { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  const infoItems: { id: PageView; label: string; icon: React.ReactNode }[] = [
    { id: 'about', label: 'About VERIXA', icon: <Info className="w-4 h-4" /> },
    { id: 'contact', label: 'Contact Support', icon: <Mail className="w-4 h-4" /> },
    { id: 'privacy', label: 'Privacy Policy', icon: <Lock className="w-4 h-4" /> },
    { id: 'terms', label: 'Terms & Rules', icon: <FileText className="w-4 h-4" /> },
    { id: 'help', label: 'Help Center', icon: <HelpCircle className="w-4 h-4" /> },
  ];

  const navigateTo = (page: PageView) => {
    if (page === 'profile') {
      openUserProfile(currentUser);
    } else {
      setCurrentPage(page);
    }
    onCloseMobile?.();
  };

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full py-3 px-2.5">
      {/* Top Section: User Bar & Main Navigation */}
      <div className="space-y-3">
        {/* User Compact Card */}
        {currentUser && (
          <div
            onClick={() => navigateTo('profile')}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer flex items-center justify-between gap-2.5"
            title="View Profile"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover border border-white/20 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-xs text-white truncate">{currentUser.name}</h4>
                <p className="text-[11px] text-gray-400 truncate">@{currentUser.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold shrink-0">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>{currentUser.safetyScore}</span>
            </div>
          </div>
        )}

        {/* Main Nav Items */}
        <div className="space-y-0.5">
          <p className="px-2.5 text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-1">
            Navigation
          </p>
          {navItems.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                  active
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-[0_0_12px_rgba(37,99,235,0.2)] font-bold'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={active ? 'text-blue-400' : 'text-gray-400'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-white text-[9px] font-bold ${
                      item.id === 'messages'
                        ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.7)]'
                        : 'bg-rose-500'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Quick AI Scanner Action */}
        <button
          onClick={() => {
            openScannerModal('image');
            onCloseMobile?.();
          }}
          className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-blue-900/30 to-purple-900/30 hover:from-blue-900/50 hover:to-purple-900/50 border border-blue-500/20 text-xs font-semibold text-blue-300 hover:text-white flex items-center justify-between transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <ScanEye className="w-4 h-4 text-blue-400" />
            <span>AI Safety Shield</span>
          </div>
          <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase">LIVE</span>
        </button>
      </div>

      {/* Bottom Section: Protocol Links & Footer */}
      <div className="pt-3 border-t border-white/5 space-y-2">
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          {infoItems.slice(0, 4).map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={`text-left px-2 py-1 rounded-lg truncate transition cursor-pointer ${
                  active ? 'text-blue-400 font-bold bg-blue-500/10' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-2 pt-1 border-t border-white/5 text-[9px] text-gray-600 font-mono">
          <span>© 2026 VERIXA</span>
          <span className="text-emerald-500/80 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
            SHIELD ACTIVE
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-[270px] shrink-0 bg-black/20 backdrop-blur-md border-r border-white/5 min-h-[calc(100vh-64px)] sticky top-[64px] h-[calc(100vh-64px)] overflow-y-auto custom-scrollbar">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
          />
          <div className="relative w-72 max-w-[80vw] bg-slate-950 border-r border-purple-500/20 h-full overflow-y-auto z-10 shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <span className="font-extrabold text-lg text-white tracking-wider flex items-center gap-2.5">
                <img
                  src="/verixa-logo.jpg"
                  alt="VERIXA Logo"
                  className="w-6 h-6 rounded-lg object-cover shadow-[0_0_10px_rgba(147,51,234,0.4)] border border-purple-500/30"
                />
                VERIXA
              </span>
              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
