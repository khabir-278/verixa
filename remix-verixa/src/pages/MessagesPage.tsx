import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  Send,
  Image as ImageIcon,
  Mic,
  Smile,
  ShieldCheck,
  ShieldAlert,
  CheckCheck,
  Circle,
  PhoneCall,
  Video,
  MessageSquare,
  Users,
  ArrowLeft,
} from 'lucide-react';
import { User } from '../types';
import {
  getUserConversationPartners,
  getAllProfiles,
} from '../lib/supabaseServices';

export const MessagesPage: React.FC = () => {
  const {
    activeChatUser,
    setActiveChatUser,
    messages,
    isMessagesLoading,
    sendMessage,
    currentUser,
    unreadChatSenderIds,
    unreadChatSenders,
    markChatAsRead,
  } = useApp();

  const [chatInput, setChatInput] = useState('');
  const [supabaseUsers, setSupabaseUsers] = useState<User[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const loadUsers = async () => {
      setIsLoadingContacts(true);
      try {
        if (currentUser?.id) {
          // First try to load conversation partners
          const partners = await getUserConversationPartners(currentUser.id);
          // Also load all other community profiles
          const allProfiles = await getAllProfiles(currentUser.id);

          const seen = new Set<string>();
          const combined: User[] = [];

          for (const p of partners) {
            if (!seen.has(p.id)) {
              seen.add(p.id);
              combined.push(p);
            }
          }

          for (const p of allProfiles) {
            if (!seen.has(p.id)) {
              seen.add(p.id);
              combined.push(p);
            }
          }

          if (isMounted) {
            setSupabaseUsers(combined);
            // Do NOT auto-open: chat only opens when user explicitly clicks/opens it
          }
        } else {
          const allProfiles = await getAllProfiles();
          if (isMounted) {
            setSupabaseUsers(allProfiles);
            // Do NOT auto-open: chat only opens when user explicitly clicks/opens it
          }
        }
      } catch (err) {
        console.warn('Notice: Could not load Supabase contacts:', err);
      } finally {
        if (isMounted) setIsLoadingContacts(false);
      }
    };
    loadUsers();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChatUser]);

  const contactsToDisplay = supabaseUsers;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendMessage(chatInput);
    setChatInput('');
  };

  const handleVoiceMessage = () => {
    sendMessage('🎙️ Voice message (0:14) - Verified clean audio frequency.');
  };

  return (
    <div className="w-full h-full max-w-7xl mx-auto flex flex-col min-h-0">
      <div className="bg-slate-900/80 border border-purple-500/20 rounded-3xl backdrop-blur-xl shadow-2xl overflow-hidden flex-1 grid grid-cols-1 md:grid-cols-12 h-full min-h-0">
        {/* Left Contacts Sidebar */}
        <div
          className={`md:col-span-4 border-r border-slate-800 flex flex-col h-full min-h-0 bg-slate-950/70 ${
            activeChatUser ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-4 border-b border-slate-800 space-y-3 shrink-0 bg-slate-950/90 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-lg text-white flex items-center gap-2">
                Messages <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </h2>
              {unreadChatSenderIds.size > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-bold">
                  {unreadChatSenderIds.size} unread
                </span>
              )}
            </div>
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 min-h-0">
            {isLoadingContacts ? (
              <div className="p-6 text-center text-slate-500 text-xs space-y-2">
                <div className="w-6 h-6 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin mx-auto" />
                <p>Loading contacts...</p>
              </div>
            ) : contactsToDisplay.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <Users className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">No community members yet</p>
                <p className="text-[11px] text-slate-500">Other registered members will appear here.</p>
              </div>
            ) : (
              contactsToDisplay.map((user) => {
                const isActive = activeChatUser?.id === user.id;
                const isUnread = unreadChatSenderIds.has(user.id);
                const unreadData = unreadChatSenders[user.id];

                return (
                  <button
                    key={user.id}
                    onClick={() => {
                      setActiveChatUser(user);
                      markChatAsRead(user.id);
                    }}
                    className={`w-full p-3 rounded-2xl flex items-center gap-3 transition text-left cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border border-purple-500/30 shadow-md'
                        : isUnread
                        ? 'bg-blue-950/40 hover:bg-blue-900/50 border border-blue-500/50 shadow-[0_0_15px_rgba(37,99,235,0.2)]'
                        : 'hover:bg-slate-900/60 border border-transparent'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className={`w-11 h-11 rounded-full object-cover border transition ${
                          isUnread ? 'border-blue-400 ring-2 ring-blue-500/60' : 'border-purple-500/30'
                        }`}
                      />
                      {/* Unread indicator dot badge on avatar if unread, or live dot */}
                      {isUnread ? (
                        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 border-2 border-slate-950 rounded-full shadow-[0_0_8px_rgba(59,130,246,1)] animate-pulse" />
                      ) : (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-sm truncate ${isUnread ? 'font-black text-white' : 'font-bold text-slate-200'}`}>
                          {user.name}
                        </h4>
                        {isUnread ? (
                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            {/* Dot symbol on user chat */}
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,1)] animate-pulse" />
                            {unreadData && unreadData.count > 1 ? (
                              <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-bold text-[10px]">
                                {unreadData.count}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">
                                New
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500">Live</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-xs truncate ${isUnread ? 'text-blue-300 font-semibold' : 'text-purple-300/70'}`}>
                          {isUnread && unreadData?.lastText ? unreadData.lastText : user.aiTrustBadge}
                        </p>
                        {isUnread && unreadData?.lastTime && (
                          <span className="text-[9px] text-blue-400 shrink-0 ml-1 font-mono">
                            {unreadData.lastTime}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Chat Conversation Area */}
        <div
          className={`md:col-span-8 flex flex-col h-full min-h-0 bg-slate-900/40 ${
            activeChatUser ? 'flex' : 'hidden md:flex'
          }`}
        >
          {activeChatUser ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-3">
                  {/* Mobile Back to Contacts button */}
                  <button
                    type="button"
                    onClick={() => setActiveChatUser(null)}
                    className="md:hidden p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
                    title="Back to contacts"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <img
                    src={activeChatUser.avatar}
                    alt={activeChatUser.name}
                    className="w-10 h-10 rounded-full object-cover border border-purple-500/30"
                  />
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                      {activeChatUser.name}
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    </h3>
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" /> Online • Encrypted & AI Moderated
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-slate-400">
                  <button className="p-2 rounded-xl hover:bg-slate-800 hover:text-white transition">
                    <PhoneCall className="w-4 h-4" />
                  </button>
                  <button className="p-2 rounded-xl hover:bg-slate-800 hover:text-white transition">
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-3 min-h-0">
                {isMessagesLoading ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                    <div className="w-6 h-6 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin mr-2" />
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-2">
                    <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-white">No messages yet</p>
                    <p className="text-xs text-slate-400 max-w-xs">
                      Say hello to {activeChatUser.name}! All messages are protected and checked for safety.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderId === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`p-3.5 rounded-2xl max-w-md text-xs sm:text-sm leading-relaxed ${
                            isMe
                              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none shadow-lg shadow-purple-900/30'
                              : 'bg-slate-800/90 border border-slate-700 text-slate-200 rounded-bl-none'
                          }`}
                        >
                          <p>{msg.text}</p>
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-300 opacity-80">
                            <span>{msg.timestamp}</span>
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Box (Pinned to bottom, always visible) */}
              <form onSubmit={handleSend} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleVoiceMessage}
                  title="Send Voice Message"
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-purple-400 hover:text-purple-300 hover:bg-slate-800 transition"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send an encrypted message..."
                  className="flex-1 bg-slate-900 border border-purple-500/20 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />

                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white disabled:opacity-50 transition shadow-md shadow-purple-900/30 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
              <div className="w-14 h-14 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">Select a Conversation</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Choose a community member from the contacts list to start messaging.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
