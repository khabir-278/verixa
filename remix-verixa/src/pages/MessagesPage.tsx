import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Send,
  Mic,
  ShieldCheck,
  Check,
  CheckCheck,
  PhoneCall,
  Video,
  MessageSquare,
  Users,
  ArrowLeft,
  Play,
  Pause,
  Trash2,
  Loader2,
} from 'lucide-react';
import { User, ChatMessage } from '../types';
import {
  getUserConversationPartners,
  getAllProfiles,
  uploadVoiceNote,
  getUserConversationsOverview,
  ConversationSnippet,
} from '../lib/supabaseServices';

interface ChatVoicePlayerProps {
  url: string;
  duration?: number | string;
  isMe?: boolean;
}

const ChatVoicePlayer: React.FC<ChatVoicePlayerProps> = ({ url, duration, isMe }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(() => {
    if (!duration) return 0;
    return typeof duration === 'string' ? parseFloat(duration) || 0 : duration;
  });
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.warn('Audio play error:', e));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && (!totalDuration || isNaN(totalDuration))) {
      setTotalDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-1 px-1 min-w-[200px] sm:min-w-[240px]">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />
      <button
        type="button"
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition shadow shrink-0 cursor-pointer ${
          isMe
            ? 'bg-white text-indigo-700 hover:bg-slate-100'
            : 'bg-purple-600 text-white hover:bg-purple-500'
        }`}
        title={isPlaying ? 'Pause' : 'Play voice note'}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 space-y-1">
        {/* Waveform / Progress bar */}
        <div className="w-full bg-black/30 h-2 rounded-full overflow-hidden relative">
          <div
            className={`h-full rounded-full transition-all duration-150 ${
              isMe ? 'bg-white' : 'bg-purple-400'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] opacity-85 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
};

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
    openUserProfile,
    startCall,
    isUserOnline,
    addToast,
  } = useApp();

  const [chatInput, setChatInput] = useState('');
  const [supabaseUsers, setSupabaseUsers] = useState<User[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState<boolean>(true);
  const [conversationsMap, setConversationsMap] = useState<Record<string, ConversationSnippet>>({});

  // Voice Recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadUsers = async () => {
      setIsLoadingContacts(true);
      try {
        if (currentUser?.id) {
          // Load conversation partners, all other community profiles, and conversation snippets
          const [partners, allProfiles, overview] = await Promise.all([
            getUserConversationPartners(currentUser.id),
            getAllProfiles(currentUser.id),
            getUserConversationsOverview(currentUser.id),
          ]);

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
            setConversationsMap(overview);
          }
        } else {
          const allProfiles = await getAllProfiles();
          if (isMounted) {
            setSupabaseUsers(allProfiles);
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

  // Keep conversationsMap in sync with the active chat's message feed
  useEffect(() => {
    if (activeChatUser?.id && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      let snippet = lastMsg.text || '';
      if (lastMsg.isVoice) {
        snippet = '🎙️ Voice note';
      } else if (lastMsg.mediaUrl && !lastMsg.text) {
        snippet = '📷 Photo';
      }
      setConversationsMap((prev) => ({
        ...prev,
        [activeChatUser.id]: {
          partnerId: activeChatUser.id,
          lastText: snippet,
          lastSenderId: lastMsg.senderId,
          lastTime: lastMsg.timestamp || 'Just now',
          createdAt: (lastMsg as any).created_at || new Date().toISOString(),
        },
      }));
    }
  }, [messages, activeChatUser?.id]);

  // Keep conversationsMap in sync with any incoming unread messages
  useEffect(() => {
    if (Object.keys(unreadChatSenders).length > 0) {
      setConversationsMap((prev) => {
        let changed = false;
        const updated = { ...prev };
        for (const [senderId, data] of Object.entries(unreadChatSenders)) {
          if (data?.lastText && (!updated[senderId] || updated[senderId].lastText !== data.lastText)) {
            updated[senderId] = {
              partnerId: senderId,
              lastText: data.lastText,
              lastSenderId: senderId,
              lastTime: data.lastTime,
              createdAt: new Date().toISOString(),
            };
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }
  }, [unreadChatSenders]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChatUser]);

  // Sort contacts: unread chats first, then recent conversations by timestamp, then remainder
  const contactsToDisplay = useMemo(() => {
    if (supabaseUsers.length <= 1) return supabaseUsers;
    return [...supabaseUsers].sort((a, b) => {
      const unreadA = (unreadChatSenders[a.id]?.count || 0) > 0 ? 1 : 0;
      const unreadB = (unreadChatSenders[b.id]?.count || 0) > 0 ? 1 : 0;
      if (unreadA !== unreadB) return unreadB - unreadA;

      const timeA = conversationsMap[a.id]?.createdAt ? new Date(conversationsMap[a.id].createdAt).getTime() : 0;
      const timeB = conversationsMap[b.id]?.createdAt ? new Date(conversationsMap[b.id].createdAt).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;

      return 0;
    });
  }, [supabaseUsers, conversationsMap, unreadChatSenders]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const textToSend = chatInput.trim();
    sendMessage(textToSend);
    setChatInput('');
    if (activeChatUser?.id && currentUser?.id) {
      setConversationsMap((prev) => ({
        ...prev,
        [activeChatUser.id]: {
          partnerId: activeChatUser.id,
          lastText: textToSend,
          lastSenderId: currentUser.id,
          lastTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdAt: new Date().toISOString(),
        },
      }));
    }
  };

  // --- VOICE RECORDING HANDLERS ---

  const startVoiceRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        addToast('error', 'Unsupported', 'Voice recording is not supported on this browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      addToast(
        'error',
        'Microphone Permission Denied',
        'Please allow microphone access in your browser settings to record voice messages.'
      );
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current.stop();
      } catch (e) {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  const sendVoiceRecording = async () => {
    if (!mediaRecorderRef.current || !currentUser?.id) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const duration = recordingSeconds;
    setIsUploadingVoice(true);

    mediaRecorderRef.current.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'audio/webm',
        });
        audioChunksRef.current = [];

        // Upload to Supabase Storage bucket
        const { signedUrl, path } = await uploadVoiceNote(currentUser.id, audioBlob);
        await sendMessage('', signedUrl || path, true, duration);
        if (activeChatUser?.id && currentUser?.id) {
          setConversationsMap((prev) => ({
            ...prev,
            [activeChatUser.id]: {
              partnerId: activeChatUser.id,
              lastText: '🎙️ Voice note',
              lastSenderId: currentUser.id,
              lastTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              createdAt: new Date().toISOString(),
            },
          }));
        }
      } catch (err: any) {
        addToast('error', 'Voice Upload Failed', err.message || 'Could not send voice message.');
      } finally {
        setIsRecordingVoice(false);
        setRecordingSeconds(0);
        setIsUploadingVoice(false);
      }
    };

    try {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
    } catch (e) {
      // ignore
    }
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
                const unreadData = unreadChatSenders[user.id];
                const unreadCount = unreadData?.count || 0;
                const isUnread = unreadCount > 0;
                const online = isUserOnline(user.id);
                const conversation = conversationsMap[user.id];

                // Determine message preview snippet and timestamp
                let snippetText = 'No messages yet';
                let snippetTime = '';

                if (conversation) {
                  const isMine = conversation.lastSenderId === currentUser?.id;
                  snippetText = isMine
                    ? `You: ${conversation.lastText || 'Sent a message'}`
                    : (conversation.lastText || 'Sent a message');
                  snippetTime = conversation.lastTime;
                } else if (unreadData?.lastText) {
                  snippetText = unreadData.lastText;
                  snippetTime = unreadData.lastTime;
                }

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
                      {/* Presence / Unread Status Badge */}
                      {isUnread ? (
                        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 border-2 border-slate-950 rounded-full shadow-[0_0_8px_rgba(59,130,246,1)] animate-pulse" />
                      ) : online ? (
                        <span
                          className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-950 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                          title="Online"
                        />
                      ) : (
                        <span
                          className="absolute bottom-0 right-0 w-3 h-3 bg-slate-600 rounded-full border-2 border-slate-950"
                          title="Offline"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-sm truncate ${isUnread ? 'font-black text-white' : 'font-bold text-slate-200'}`}>
                          {user.name}
                        </h4>
                        {snippetTime ? (
                          <span className={`text-[10px] shrink-0 ml-1 font-mono ${isUnread ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                            {snippetTime}
                          </span>
                        ) : online ? (
                          <span className="text-[10px] text-emerald-400 font-semibold shrink-0 ml-1">Online</span>
                        ) : (
                          <span className="text-[10px] text-slate-500 shrink-0 ml-1">Offline</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-xs truncate ${isUnread ? 'text-blue-200 font-semibold' : 'text-slate-400'}`}>
                          {snippetText}
                        </p>
                        {isUnread && (
                          <span className="min-w-[18px] h-[18px] px-1.5 flex items-center justify-center rounded-full bg-blue-600 text-white font-bold text-[10px] shadow-sm shrink-0 ml-1.5">
                            {unreadCount > 99 ? '99+' : unreadCount}
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
              {/* Chat Header with Profile Navigation & Calling */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-3">
                  {/* Mobile Back to Contacts */}
                  <button
                    type="button"
                    onClick={() => setActiveChatUser(null)}
                    className="md:hidden p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
                    title="Back to contacts"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  {/* Clickable Avatar & Name -> Navigate to Profile */}
                  <div
                    onClick={() => openUserProfile(activeChatUser)}
                    className="flex items-center gap-3 cursor-pointer group"
                    title={`View ${activeChatUser.name}'s Profile`}
                  >
                    <img
                      src={activeChatUser.avatar}
                      alt={activeChatUser.name}
                      className="w-10 h-10 rounded-full object-cover border border-purple-500/30 group-hover:border-purple-400 group-hover:ring-2 group-hover:ring-purple-500/40 transition"
                    />
                    <div>
                      <h3 className="font-bold text-sm text-white flex items-center gap-1.5 group-hover:text-purple-300 transition">
                        {activeChatUser.name}
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      </h3>
                      {isUserOnline(activeChatUser.id) ? (
                        <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                          Online • Encrypted & AI Moderated
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
                          Offline • Encrypted & AI Moderated
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Call Action Buttons */}
                <div className="flex items-center gap-2 text-slate-400">
                  <button
                    type="button"
                    onClick={() => startCall(activeChatUser, 'audio')}
                    title="Start Audio Call"
                    className="p-2.5 rounded-xl hover:bg-slate-800 hover:text-emerald-400 transition cursor-pointer"
                  >
                    <PhoneCall className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startCall(activeChatUser, 'video')}
                    title="Start Video Call"
                    className="p-2.5 rounded-xl hover:bg-slate-800 hover:text-purple-400 transition cursor-pointer"
                  >
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
                  messages.map((msg: ChatMessage) => {
                    const isMe = msg.senderId === currentUser?.id;
                    const isVoice = msg.isVoice || (msg.mediaUrl && (msg.mediaUrl.includes('/audio/') || msg.mediaUrl.endsWith('.webm') || msg.mediaUrl.endsWith('.mp3')));

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
                          {/* Voice Note Player */}
                          {isVoice && msg.mediaUrl ? (
                            <ChatVoicePlayer
                              url={msg.mediaUrl}
                              duration={msg.voiceDuration}
                              isMe={isMe}
                            />
                          ) : (
                            <p className="break-words">{msg.text}</p>
                          )}

                          {/* Message Footer: Timestamp and Delivery/Read Ticks */}
                          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-slate-300 opacity-80">
                            <span>{msg.timestamp}</span>
                            {isMe && (
                              <span title={msg.status ? `Status: ${msg.status}` : 'Sent'}>
                                {msg.status === 'read' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Bar & Voice Recorder */}
              {isRecordingVoice ? (
                /* Glowing Voice Recording Bar with live timer and controls */
                <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="w-3.5 h-3.5 rounded-full bg-rose-500 animate-ping shrink-0" />
                    <span className="text-xs font-mono font-bold text-rose-400">
                      Recording: {Math.floor(recordingSeconds / 60)}:
                      {(recordingSeconds % 60).toString().padStart(2, '0')}
                    </span>
                    <span className="text-xs text-slate-400 hidden sm:inline">
                      Encrypted audio note
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelVoiceRecording}
                      disabled={isUploadingVoice}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-400 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={sendVoiceRecording}
                      disabled={isUploadingVoice || recordingSeconds < 1}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingVoice ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Send Note
                    </button>
                  </div>
                </div>
              ) : (
                /* Standard Message Input Form */
                <form
                  onSubmit={handleSend}
                  className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 shrink-0"
                >
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    title="Record Voice Note"
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-purple-400 hover:text-purple-300 hover:bg-slate-800 transition cursor-pointer"
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
              )}
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
