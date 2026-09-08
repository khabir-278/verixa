import React from 'react';
import { useApp } from '../context/AppContext';
import { Bell, ShieldAlert, Heart, UserPlus, MessageCircle, AtSign, CheckCheck, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export const NotificationsPage: React.FC = () => {
  const {
    notifications,
    markNotificationsAsRead,
    markSingleNotificationAsRead,
    unreadNotifCount,
    openUserProfile,
  } = useApp();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            Notifications <Bell className="w-6 h-6 text-purple-400" />
          </h1>
          <p className="text-xs text-slate-400">
            Real-time activity alerts and AI Guard protection updates.
          </p>
        </div>

        {unreadNotifCount > 0 && (
          <button
            onClick={markNotificationsAsRead}
            className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 font-semibold text-xs transition flex items-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4" /> Mark All Read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
              <Bell className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">All Caught Up!</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              You have no new notifications. Real-time updates about likes, comments, follows, and AI safety alerts will appear here.
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const isAIWarning = notif.type === 'ai_warning';
            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  if (!notif.read) markSingleNotificationAsRead(notif.id);
                }}
                className={`p-4 rounded-2xl border backdrop-blur-xl transition flex items-start gap-3.5 cursor-pointer ${
                  isAIWarning
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-100 shadow-lg shadow-rose-950/30'
                    : notif.read
                    ? 'bg-slate-900/60 border-slate-800 text-slate-300'
                    : 'bg-slate-900/90 border-purple-500/30 text-white shadow-md hover:border-purple-500/50'
                }`}
              >
                <div className="relative mt-0.5 shrink-0">
                  {notif.user?.avatar && !isAIWarning ? (
                    <div className="relative">
                      <img
                        src={notif.user.avatar}
                        alt={notif.user.name || 'User'}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border-2 border-slate-700 shadow-md"
                      />
                      <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-slate-950 border border-slate-800 shadow-sm flex items-center justify-center">
                        {notif.type === 'like' && <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
                        {notif.type === 'follow' && <UserPlus className="w-3.5 h-3.5 text-indigo-400" />}
                        {notif.type === 'comment' && <MessageCircle className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20" />}
                        {notif.type === 'mention' && <AtSign className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      {notif.type === 'ai_warning' && <ShieldAlert className="w-5 h-5 text-rose-400" />}
                      {notif.type === 'like' && <Heart className="w-5 h-5 text-rose-400 fill-rose-400" />}
                      {notif.type === 'follow' && <UserPlus className="w-5 h-5 text-indigo-400" />}
                      {notif.type === 'comment' && <MessageCircle className="w-5 h-5 text-purple-400" />}
                      {notif.type === 'mention' && <AtSign className="w-5 h-5 text-emerald-400" />}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        onClick={(e) => {
                          if (notif.user) {
                            e.stopPropagation();
                            openUserProfile(notif.user);
                          }
                        }}
                        className={`font-bold text-sm ${notif.user ? 'hover:text-purple-400 transition' : ''}`}
                      >
                        {isAIWarning ? '🛡️ VERIXA Shield Alert' : (notif.user?.name || notif.user?.username || 'User')}
                      </span>
                      {notif.user?.username && !isAIWarning && (
                        <span className="text-xs text-slate-400 font-normal">@{notif.user.username}</span>
                      )}
                      {notif.user?.verified && (
                        <span className="text-blue-400 text-xs font-bold" title="Verified Human">✓</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">{notif.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{notif.text}</p>
                  {notif.detail && (
                    <div
                      className={`mt-2 p-2.5 rounded-xl text-xs ${
                        isAIWarning
                          ? 'bg-rose-950/60 border border-rose-500/30 text-rose-300 font-mono text-[11px]'
                          : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 italic'
                      }`}
                    >
                      {notif.detail}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};
