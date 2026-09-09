import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldCheck,
  Search,
  Bell,
  MessageSquare,
  PlusSquare,
  Sparkles,
  Menu,
  X,
  User,
  LogOut,
  Sliders,
  HelpCircle,
  Flame,
  ScanEye,
  ArrowLeft,
} from 'lucide-react';
import { PageView } from '../types';

export const Navbar: React.FC<{
  onOpenCreatePost: () => void;
  onOpenMobileSidebar: () => void;
}> = ({ onOpenCreatePost, onOpenMobileSidebar }) => {
  const {
    currentPage,
    setCurrentPage,
    canGoBack,
    goBack,
    currentUser,
    unreadNotifCount,
    totalUnreadMessagesCount,
    isAuthenticated,
    logout,
    openScannerModal,
    exploreSearchQuery,
    setExploreSearchQuery,
    openUserProfile,
  } = useApp();

  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const isPublicView =
    ['login', 'signup', 'landing', 'verify-email', 'about', 'privacy', 'terms', 'help', 'contact', 'ai-architecture'].includes(currentPage) ||
    (!isAuthenticated && (currentPage === 'ai-dashboard' || (currentPage as string) === 'ai_dashboard'));

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPage !== 'explore') {
      setCurrentPage('explore');
    }
  };

  return (
    <header className="fixed top-0 z-40 w-full bg-black/40 backdrop-blur-md border-b border-white/10 px-4 lg:px-6 h-16 flex items-center justify-between transition-all">
      <div className="max-w-[1600px] mx-auto w-full flex items-center justify-between gap-4">
        {/* Left Brand + Back Button + Mobile Menu Button */}
        <div className="flex items-center gap-3">
          {!isPublicView && (
            <button
              onClick={() => onOpenMobileSidebar?.()}
              className="lg:hidden p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition"
              aria-label="Open Navigation"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}

          {canGoBack && !['about', 'privacy', 'terms', 'help', 'contact', 'ai-architecture'].includes(currentPage) && (
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold transition"
              title="Back to previous page"
            >
              <ArrowLeft className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          <button
            onClick={() => setCurrentPage(isAuthenticated ? 'home' : 'landing')}
            className="flex items-center gap-3 group text-left focus:outline-none"
          >
            <img
              src="/verixa-logo.jpg"
              alt="VERIXA Logo"
              className="w-8 h-8 rounded-lg object-cover shadow-[0_0_15px_rgba(37,99,235,0.4)] group-hover:scale-105 transition-all border border-purple-500/30"
            />
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                VERIXA
              </span>
              <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                AI SAFE
              </span>
            </div>
          </button>
        </div>

        {/* Search Bar with AI Smart Suggestions */}
        {!isPublicView && (
          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex flex-1 max-w-md relative items-center mx-8"
          >
            <Search className="w-4 h-4 absolute left-4 text-gray-500" />
            <input
              type="text"
              value={exploreSearchQuery}
              onChange={(e) => setExploreSearchQuery(e.target.value)}
              placeholder="Search secure feeds, topics, AI trust badges..."
              className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
            {exploreSearchQuery && (
              <button
                type="button"
                onClick={() => setExploreSearchQuery('')}
                className="absolute right-4 text-gray-500 hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>
        )}

        {/* Right Actions & Profile */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Quick AI Scanner Launcher */}
          {!isPublicView && (
            <button
              onClick={() => openScannerModal('image')}
              title="Scan Media with AI"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-blue-400 text-xs font-semibold transition"
            >
              <ScanEye className="w-4 h-4 text-blue-400" />
              <span>AI Scanner</span>
            </button>
          )}

          {/* AI Shield Status Badge */}
          {!isPublicView && (
            <button
              onClick={() => setCurrentPage('settings')}
              className="hidden xl:flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[11px] font-bold text-green-400 hover:bg-green-500/20 transition"
            >
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
              <span className="uppercase tracking-widest text-[10px]">AI Verified Safe</span>
            </button>
          )}

          {isAuthenticated ? (
            <>
              {/* Create Post Button */}
              {!isPublicView && (
                <button
                  onClick={onOpenCreatePost}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-full font-bold text-xs sm:text-sm text-white transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] cursor-pointer"
                >
                  <PlusSquare className="w-4 h-4" />
                  <span className="hidden sm:inline uppercase tracking-wider">POST</span>
                </button>
              )}

              {/* Messages Shortcut */}
              <button
                onClick={() => setCurrentPage('messages')}
                className={`relative p-2 rounded-xl transition cursor-pointer ${
                  currentPage === 'messages'
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
                title="Direct Messages"
              >
                <MessageSquare className="w-5 h-5" />
                {totalUnreadMessagesCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,1)] animate-pulse" />
                )}
              </button>

              {/* Notifications */}
              <button
                onClick={() => setCurrentPage('notifications')}
                className={`relative p-2 rounded-xl transition cursor-pointer ${
                  currentPage === 'notifications'
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>

              {/* Avatar Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-2 p-0.5 rounded-full border-2 border-purple-500/50 hover:border-purple-400 transition overflow-hidden cursor-pointer"
                >
                  <img
                    src={currentUser?.avatar}
                    alt={currentUser?.name}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                </button>

                {showUserDropdown && (
                  <div className="absolute right-0 mt-3 w-60 rounded-2xl bg-[#0a0a0f] border border-white/10 shadow-2xl backdrop-blur-md py-2 z-50 text-xs">
                    <div className="px-4 py-3 border-b border-white/5">
                      <p className="font-bold text-gray-100 text-sm">{currentUser?.name}</p>
                      <p className="text-gray-400">@{currentUser?.username}</p>
                      <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-green-400 font-semibold px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                        <ShieldCheck className="w-3 h-3" /> Safety Score: {currentUser?.safetyScore}/100
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => {
                          openUserProfile(currentUser);
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-white/5 text-gray-200 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <User className="w-4 h-4 text-blue-400" /> My Profile
                      </button>

                      <button
                        onClick={() => {
                          setCurrentPage('settings');
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-white/5 text-gray-200 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <Sliders className="w-4 h-4 text-gray-400" /> Settings
                      </button>

                      <button
                        onClick={() => {
                          setCurrentPage('help');
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-white/5 text-gray-200 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <HelpCircle className="w-4 h-4 text-gray-400" /> Help Center
                      </button>
                    </div>

                    <div className="border-t border-white/5 pt-1">
                      <button
                        onClick={() => {
                          logout();
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 flex items-center gap-2.5 transition font-medium cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-red-400" /> Log Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage('login')}
                className="px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Log In
              </button>
              <button
                onClick={() => setCurrentPage('signup')}
                className="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-full font-bold text-xs sm:text-sm text-white transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] cursor-pointer"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
