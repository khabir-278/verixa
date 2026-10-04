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
  Paperclip,
  Image as ImageIcon,
  Film,
  FileText,
  Smile,
  Reply,
  Share2,
  Copy,
  Edit3,
  Info,
  X,
  Download,
  AlertCircle,
  Search,
  MoreVertical,
  Plus,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { User, ChatMessage, MessageType } from '../types';
import {
  getUserConversationPartners,
  getAllProfiles,
  uploadVoiceNote,
  getUserConversationsOverview,
  ConversationSnippet,
  uploadMessageAttachment,
  getSignedMediaUrl,
} from '../lib/supabaseServices';

// ================= DATE HELPERS ================= //

export const formatMessageDateSeparator = (dateStr?: string): string => {
  if (!dateStr) return 'Today';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Today';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();

  if (year === today.getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${year}`;
};

export const isNewDay = (prevDateStr?: string, currDateStr?: string): boolean => {
  if (!currDateStr) return false;
  if (!prevDateStr) return true;
  const d1 = new Date(prevDateStr);
  const d2 = new Date(currDateStr);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  return d1.toDateString() !== d2.toDateString();
};

export const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const highlightText = (text: string, query?: string): React.ReactNode => {
  if (!text || !query || !query.trim()) return text;
  const trimmed = query.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length <= 1) return text;
  return parts.map((part, index) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      <mark
        key={index}
        className="bg-amber-400/30 text-amber-200 px-0.5 rounded font-semibold underline decoration-amber-400/80"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
};

// ================= VOICE PLAYER ================= //

interface ChatVoicePlayerProps {
  url: string;
  duration?: number | string;
  isMe?: boolean;
}

const ChatVoicePlayer: React.FC<ChatVoicePlayerProps> = ({ url, duration, isMe }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Parse initial duration prop defensively
  const parsedDuration = useMemo(() => {
    if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
      return duration;
    }
    if (typeof duration === 'string') {
      const parsed = parseFloat(duration);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }, [duration]);

  const [totalDuration, setTotalDuration] = useState<number>(parsedDuration);

  // Playable URL state (resolves storage path to signed URL if needed)
  const isDirectUrl = !!url && (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:'));
  const [resolvedUrl, setResolvedUrl] = useState<string>(isDirectUrl ? url : '');
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(!isDirectUrl && !!url);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Update totalDuration if prop updates with a valid finite number
  useEffect(() => {
    if (parsedDuration > 0) {
      setTotalDuration(parsedDuration);
    }
  }, [parsedDuration]);

  // Dynamically resolve storage path to signed URL if not a direct URL
  useEffect(() => {
    let isCancelled = false;
    setHasError(false);

    if (!url) {
      setResolvedUrl('');
      setIsLoadingUrl(false);
      return;
    }

    if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) {
      setResolvedUrl(url);
      setIsLoadingUrl(false);
      return;
    }

    // It's a private storage path (e.g. userId/audio/voice.webm)
    setIsLoadingUrl(true);
    getSignedMediaUrl(url, 3600)
      .then((signed) => {
        if (!isCancelled) {
          if (signed) {
            setResolvedUrl(signed);
          } else {
            setHasError(true);
          }
          setIsLoadingUrl(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('Could not resolve signed voice URL:', err);
          setHasError(true);
          setIsLoadingUrl(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [url]);

  const togglePlay = () => {
    if (!audioRef.current || hasError || !resolvedUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.warn('Audio play error:', e);
          setHasError(true);
          setIsPlaying(false);
        });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration;

    if (Number.isFinite(dur) && dur > 0) {
      setTotalDuration(dur);
    } else if (dur === Infinity) {
      // Browser MediaRecorder WebM duration recovery
      const audio = audioRef.current;
      const onDurationChange = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setTotalDuration(audio.duration);
          audio.removeEventListener('durationchange', onDurationChange);
        }
      };
      audio.addEventListener('durationchange', onDurationChange);
      audio.currentTime = 1e101;
      setTimeout(() => {
        if (audio) {
          audio.currentTime = 0;
          audio.removeEventListener('durationchange', onDurationChange);
        }
      }, 50);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleError = () => {
    if (resolvedUrl) {
      setHasError(true);
      setIsPlaying(false);
    }
  };

  // Safe duration formatter that never returns NaN or Infinity
  const formatTime = (secs: number): string => {
    if (!Number.isFinite(secs) || isNaN(secs) || secs < 0) return '0:00';
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  if (hasError) {
    return (
      <div className="flex items-center gap-2 py-1 px-1.5 text-xs text-rose-300">
        <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
        <span className="italic text-[11px]">This audio message is no longer available.</span>
      </div>
    );
  }

  if (isLoadingUrl) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
        <span className="text-[11px]">Loading audio...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-1 px-1 min-w-[200px] sm:min-w-[240px]">
      <audio
        ref={audioRef}
        src={resolvedUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
      />
      <button
        type="button"
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition shadow shrink-0 cursor-pointer ${
          isMe
            ? 'bg-white text-indigo-700 hover:bg-slate-100'
            : 'bg-purple-600 text-white hover:bg-purple-500'
        }`}
        title={isPlaying ? 'Pause voice message' : 'Play voice message'}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 space-y-1">
        <div
          className="w-full bg-black/30 h-2 rounded-full overflow-hidden relative cursor-pointer"
          onClick={(e) => {
            if (audioRef.current && totalDuration > 0) {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const newTime = (clickX / rect.width) * totalDuration;
              audioRef.current.currentTime = newTime;
              setCurrentTime(newTime);
            }
          }}
        >
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

// ================= MAIN MESSAGES PAGE ================= //

export const MessagesPage: React.FC = () => {
  const {
    activeChatUser,
    setActiveChatUser,
    messages,
    isMessagesLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    deleteMessagePermanent,
    reactToMessage,
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

  // Message Actions state
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const [deletingMessage, setDeletingMessage] = useState<ChatMessage | null>(null);
  const [permanentDeleteMessage, setPermanentDeleteMessage] = useState<ChatMessage | null>(null);
  const [infoMessage, setInfoMessage] = useState<ChatMessage | null>(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [showFullPickerMessageId, setShowFullPickerMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Scoped Messages Search & Filter state (Local to Messages page only - NOT synced to explore page)
  const [chatSearchQuery, setChatSearchQuery] = useState<string>('');
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'unread'>('all');

  // In-Chat Message Search state
  const [showInChatSearch, setShowInChatSearch] = useState<boolean>(false);
  const [inChatQuery, setInChatQuery] = useState<string>('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const inChatSearchInputRef = useRef<HTMLInputElement>(null);

  // Media Attachment state
  const [showAttachMenu, setShowAttachMenu] = useState<boolean>(false);
  const [selectedAttachment, setSelectedAttachment] = useState<{
    file: File;
    previewUrl: string;
    type: MessageType;
    name: string;
    size: number;
  } | null>(null);
  const [attachmentCaption, setAttachmentCaption] = useState<string>('');
  const [isUploadingAttachment, setIsUploadingAttachment] = useState<boolean>(false);

  // File Inputs
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const prevMessagesLengthRef = useRef<number>(messages.length);
  const prevLastMsgIdRef = useRef<string | undefined>(messages[messages.length - 1]?.id);
  const prevActiveChatUserIdRef = useRef<string | undefined>(activeChatUser?.id);

  const handleChatScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 150;
  };

  // Load Contacts
  useEffect(() => {
    let isMounted = true;
    const loadUsers = async () => {
      setIsLoadingContacts(true);
      try {
        if (currentUser?.id) {
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

  // Keep conversationsMap in sync with the active chat's message feed without mutating ordering timestamps on view
  useEffect(() => {
    if (!activeChatUser?.id || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];

    // Ensure lastMsg actually belongs to this conversation
    const isForActiveChat =
      (lastMsg.senderId === activeChatUser.id && lastMsg.receiverId === currentUser?.id) ||
      (lastMsg.senderId === currentUser?.id && lastMsg.receiverId === activeChatUser.id);
    if (!isForActiveChat) return;

    let snippet = lastMsg.text || '';
    if (lastMsg.isVoice) {
      snippet = '🎙️ Voice note';
    } else if (lastMsg.mediaUrl && !lastMsg.text) {
      snippet = lastMsg.messageType === 'video' ? '🎥 Video' : lastMsg.messageType === 'file' ? '📁 File' : '📷 Photo';
    }

    setConversationsMap((prev) => {
      const existing = prev[activeChatUser.id];
      const messageCreatedAt = lastMsg.created_at || (lastMsg as any).createdAt;
      // Do NOT artificially update createdAt to Date.now() when opening or viewing a chat
      const effectiveCreatedAt = messageCreatedAt || existing?.createdAt || '';

      if (
        existing &&
        existing.lastText === snippet &&
        existing.lastSenderId === lastMsg.senderId &&
        existing.createdAt === effectiveCreatedAt
      ) {
        return prev;
      }

      return {
        ...prev,
        [activeChatUser.id]: {
          partnerId: activeChatUser.id,
          lastText: snippet,
          lastSenderId: lastMsg.senderId,
          lastTime: lastMsg.timestamp || existing?.lastTime || 'Just now',
          createdAt: effectiveCreatedAt,
        },
      };
    });
  }, [messages, activeChatUser?.id, currentUser?.id]);

  // Intelligent scroll anchoring: only auto-scroll on conversation switch, own sent messages, or incoming messages when already at bottom
  useEffect(() => {
    const activeChatChanged = prevActiveChatUserIdRef.current !== activeChatUser?.id;
    prevActiveChatUserIdRef.current = activeChatUser?.id;

    const currentLength = messages.length;
    const prevLength = prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = currentLength;

    const lastMsg = currentLength > 0 ? messages[currentLength - 1] : undefined;
    const prevLastMsgId = prevLastMsgIdRef.current;
    prevLastMsgIdRef.current = lastMsg?.id;

    // CASE 1: Initial chat load or user switched conversation
    if (activeChatChanged) {
      isNearBottomRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      return;
    }

    // CASE 2: Message mutations (reactions, edits, deletes, status updates)
    // If length didn't change and the last message id didn't change: DO NOT scroll!
    if (currentLength === prevLength && lastMsg?.id === prevLastMsgId) {
      return;
    }

    // CASE 3: A new message arrived at the bottom
    if (lastMsg && lastMsg.id !== prevLastMsgId) {
      const isMyMessage = lastMsg.senderId === currentUser?.id;
      if (isMyMessage) {
        // Outgoing message sent by currentUser: always scroll to show sent message
        isNearBottomRef.current = true;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else if (isNearBottomRef.current) {
        // Incoming message while user is actively reading newest messages
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      // If user was reading historical messages (isNearBottomRef is false), preserve scroll position
    }
  }, [messages, activeChatUser?.id, currentUser?.id]);

  // Sort contacts deterministically: latest authentic message activity first, then alphabetical (no jumps on click)
  const contactsToDisplay = useMemo(() => {
    if (supabaseUsers.length <= 1) return supabaseUsers;
    return [...supabaseUsers].sort((a, b) => {
      const timeA = conversationsMap[a.id]?.createdAt ? new Date(conversationsMap[a.id].createdAt).getTime() : 0;
      const timeB = conversationsMap[b.id]?.createdAt ? new Date(conversationsMap[b.id].createdAt).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;

      return a.name.localeCompare(b.name);
    });
  }, [supabaseUsers, conversationsMap]);

  // Filtered contacts based on search query and active tab filter (scoped to messages only)
  const filteredContacts = useMemo(() => {
    let list = contactsToDisplay;

    // Tab filter
    if (activeFilterTab === 'unread') {
      list = list.filter((u) => (unreadChatSenders[u.id]?.count || 0) > 0);
    }

    const q = chatSearchQuery.trim().toLowerCase();
    if (!q) return list;

    return list.filter((u) => {
      const nameMatch = u.name?.toLowerCase().includes(q);
      const usernameMatch = u.username?.toLowerCase().includes(q);
      const snippet = conversationsMap[u.id]?.lastText?.toLowerCase() || '';
      const snippetMatch = snippet.includes(q);
      return nameMatch || usernameMatch || snippetMatch;
    });
  }, [contactsToDisplay, activeFilterTab, chatSearchQuery, unreadChatSenders, conversationsMap]);

  const unreadCountTotal = useMemo(() => {
    return supabaseUsers.filter((u) => (unreadChatSenders[u.id]?.count || 0) > 0).length;
  }, [supabaseUsers, unreadChatSenders]);

  // In-Chat search matching message IDs
  const matchingMessageIds = useMemo(() => {
    const q = inChatQuery.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => !m.deletedAt && m.text && m.text.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, inChatQuery]);

  const scrollToMatch = (msgId: string) => {
    setHighlightedMessageId(msgId);
    const targetEl = document.getElementById(`msg-${msgId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const goToNextMatch = () => {
    if (matchingMessageIds.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matchingMessageIds.length;
    setCurrentMatchIndex(nextIdx);
    scrollToMatch(matchingMessageIds[nextIdx]);
  };

  const goToPrevMatch = () => {
    if (matchingMessageIds.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matchingMessageIds.length) % matchingMessageIds.length;
    setCurrentMatchIndex(prevIdx);
    scrollToMatch(matchingMessageIds[prevIdx]);
  };

  // Scroll to active match when inChatQuery changes
  useEffect(() => {
    if (matchingMessageIds.length > 0) {
      setCurrentMatchIndex(0);
      scrollToMatch(matchingMessageIds[0]);
    } else {
      if (inChatQuery.trim()) {
        setHighlightedMessageId(null);
      }
    }
  }, [matchingMessageIds, inChatQuery]);

  // Reset in-chat search when switching active chat
  useEffect(() => {
    setInChatQuery('');
    setShowInChatSearch(false);
    setCurrentMatchIndex(0);
  }, [activeChatUser?.id]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMenuMessageId(null);
      setShowAttachMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // --- SEND HANDLER ---

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const textToSend = chatInput.trim();

    if (editingMessage) {
      await editMessage(editingMessage.id, textToSend);
      setEditingMessage(null);
      setChatInput('');
      return;
    }

    const replyOpt = replyingTo ? {
      replyToMessageId: replyingTo.id,
      replyTo: {
        id: replyingTo.id,
        senderId: replyingTo.senderId,
        senderName: replyingTo.senderId === currentUser?.id ? 'You' : (activeChatUser?.name || 'Contact'),
        text: replyingTo.text,
        isVoice: replyingTo.isVoice,
        mediaUrl: replyingTo.mediaUrl,
      },
    } : undefined;
    sendMessage(textToSend, undefined, false, undefined, replyOpt);
    setChatInput('');
    setReplyingTo(null);

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

  // --- ATTACHMENT SELECTION & SEND HANDLERS ---

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>, type: MessageType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // File size guard (max 50MB for video/files, 15MB for images)
    const maxSize = type === 'video' || type === 'file' ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > maxSize) {
      addToast('error', 'File Too Large', `Selected file exceeds the ${type === 'video' ? '50MB' : '15MB'} limit.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedAttachment({
      file,
      previewUrl,
      type,
      name: file.name,
      size: file.size,
    });
    setAttachmentCaption('');
    setShowAttachMenu(false);
    // Reset inputs
    e.target.value = '';
  };

  const cancelAttachment = () => {
    if (selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(selectedAttachment.previewUrl);
    }
    setSelectedAttachment(null);
    setAttachmentCaption('');
  };

  const sendAttachment = async () => {
    if (!selectedAttachment || !currentUser?.id || !activeChatUser?.id) return;
    setIsUploadingAttachment(true);
    try {
      // 1. Upload to Supabase Storage (returns permanent relative storage path)
      const storagePath = await uploadMessageAttachment(selectedAttachment.file);

      const replyOpt = replyingTo ? {
        replyToMessageId: replyingTo.id,
        replyTo: {
          id: replyingTo.id,
          senderId: replyingTo.senderId,
          senderName: replyingTo.senderId === currentUser?.id ? 'You' : (activeChatUser?.name || 'Contact'),
          text: replyingTo.text,
          isVoice: replyingTo.isVoice,
          mediaUrl: replyingTo.mediaUrl,
        },
      } : undefined;

      // 2. Dispatch message
      await sendMessage(
        attachmentCaption.trim(),
        storagePath,
        false,
        undefined,
        {
          mediaName: selectedAttachment.name,
          mediaSize: selectedAttachment.size,
          messageType: selectedAttachment.type,
          replyToMessageId: replyingTo?.id,
          replyTo: replyOpt?.replyTo,
        }
      );

      cancelAttachment();
      setReplyingTo(null);
    } catch (err: any) {
      addToast('error', 'Upload Failed', err.message || 'Could not send attachment.');
    } finally {
      setIsUploadingAttachment(false);
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
        const { path, signedUrl } = await uploadVoiceNote(currentUser.id, audioBlob);
        let localBlobUrl = '';
        try {
          localBlobUrl = URL.createObjectURL(audioBlob);
        } catch {}

        const playableUrl = signedUrl || localBlobUrl;

        // Persist stable storage path so voice messages remain playable forever
        await sendMessage('', path, true, duration, {
          messageType: 'audio',
          replyToMessageId: replyingTo?.id,
          optimisticMediaUrl: playableUrl,
        });

        setReplyingTo(null);

        if (activeChatUser?.id && currentUser?.id) {
          const nowIso = new Date().toISOString();
          setConversationsMap((prev) => ({
            ...prev,
            [activeChatUser.id]: {
              partnerId: activeChatUser.id,
              lastText: '🎙️ Voice note',
              lastSenderId: currentUser.id,
              lastTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              createdAt: nowIso,
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

  // --- MESSAGE ACTIONS HANDLERS ---

  const handleCopyText = (msg: ChatMessage) => {
    if (!msg.text || msg.deletedAt) return;
    navigator.clipboard.writeText(msg.text);
    setCopiedMessageId(msg.id);
    addToast('success', 'Copied', 'Message text copied to clipboard.');
    setTimeout(() => setCopiedMessageId(null), 2000);
    setActiveMenuMessageId(null);
  };

  const handleStartReply = (msg: ChatMessage) => {
    setReplyingTo(msg);
    setEditingMessage(null);
    setActiveMenuMessageId(null);
  };

  const handleStartEdit = (msg: ChatMessage) => {
    if (msg.senderId !== currentUser?.id || msg.deletedAt || msg.isVoice) return;
    setEditingMessage(msg);
    setChatInput(msg.text);
    setReplyingTo(null);
    setActiveMenuMessageId(null);
  };

  const handleForwardMessage = async (targetUser: User) => {
    if (!forwardingMessage || !currentUser?.id) return;
    try {
      await sendMessage(
        forwardingMessage.text,
        forwardingMessage.mediaUrl,
        forwardingMessage.isVoice,
        forwardingMessage.voiceDuration,
        {
          recipientId: targetUser.id,
          isForwarded: true,
          forwardedFromMessageId: forwardingMessage.id,
          messageType: forwardingMessage.messageType,
          mediaName: forwardingMessage.mediaName,
          mediaSize: forwardingMessage.mediaSize,
        }
      );
      addToast('success', 'Forwarded', `Message forwarded to ${targetUser.name}.`);
      setForwardingMessage(null);
      setForwardSearchQuery('');
    } catch (err: any) {
      addToast('error', 'Forward Failed', err.message || 'Could not forward message.');
    }
  };

  const quickReactions = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

  const categorizedEmojis = [
    {
      category: 'Smileys & Emotion',
      emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '😎', '🤩', '🥳', '🥺', '😢', '😭', '😱', '🤯', '😴', '😡', '🤬'],
    },
    {
      category: 'Gestures & People',
      emojis: ['👍', '👎', '👏', '🙌', '👐', '🤝', '🙏', '✌️', '🤞', '👊', '✊', '🤛', '🤜', '🤙', '👋', '💪', '👌', '🤌', '👈', '👉', '👆', '👇'],
    },
    {
      category: 'Hearts & Love',
      emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
    },
    {
      category: 'Celebration & Symbols',
      emojis: ['🔥', '✨', '⭐', '🌟', '💥', '💯', '🎉', '🎊', '🚀', '💡', '⚡', '☕', '🍕', '🎯', '🏆', '👑', '💎', '👀'],
    },
  ];

  return (
    <div className="w-full h-full max-w-7xl mx-auto flex flex-col min-h-0">
      {/* Hidden File Inputs for Attachment Picker */}
      <input
        type="file"
        ref={photoInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => handleSelectFile(e, 'image')}
      />
      <input
        type="file"
        ref={videoInputRef}
        accept="video/*"
        className="hidden"
        onChange={(e) => handleSelectFile(e, 'video')}
      />
      <input
        type="file"
        ref={gifInputRef}
        accept="image/gif"
        className="hidden"
        onChange={(e) => handleSelectFile(e, 'gif')}
      />
      <input
        type="file"
        ref={fileInputRef}
        accept="*/*"
        className="hidden"
        onChange={(e) => handleSelectFile(e, 'file')}
      />

      <div className="bg-slate-900/80 border border-purple-500/20 rounded-3xl backdrop-blur-xl shadow-2xl overflow-hidden flex-1 grid grid-cols-1 md:grid-cols-12 h-full min-h-0">
        {/* Left Contacts Sidebar */}
        <div
          className={`md:col-span-4 border-r border-slate-800 flex flex-col h-full min-h-0 bg-slate-950/70 ${
            activeChatUser ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-3.5 border-b border-slate-800 space-y-2.5 shrink-0 bg-slate-950/90 backdrop-blur-md">
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

            {/* Sidebar Search Bar (Scoped purely to Messages - NOT synced to Explore) */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                placeholder="Search users or message content..."
                className="w-full bg-slate-900/90 border border-slate-800 focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 rounded-xl pl-8 pr-8 py-2 text-xs text-white placeholder-slate-400 transition outline-none"
              />
              {chatSearchQuery && (
                <button
                  type="button"
                  onClick={() => setChatSearchQuery('')}
                  className="absolute right-2.5 p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs (All, Unread, Media) */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => setActiveFilterTab('all')}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  activeFilterTab === 'all'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setActiveFilterTab('unread')}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeFilterTab === 'unread'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <span>Unread</span>
                {unreadCountTotal > 0 && (
                  <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCountTotal}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 min-h-0">
            {isLoadingContacts ? (
              <div className="p-6 text-center text-slate-500 text-xs space-y-2">
                <div className="w-6 h-6 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin mx-auto" />
                <p>Loading contacts...</p>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-3">
                <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                  <Search className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-300">
                  {chatSearchQuery
                    ? `No chats matching "${chatSearchQuery}"`
                    : activeFilterTab === 'unread'
                    ? 'No unread messages'
                    : 'No community members yet'}
                </p>
                {(chatSearchQuery || activeFilterTab !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setChatSearchQuery('');
                      setActiveFilterTab('all');
                    }}
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold underline cursor-pointer"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              filteredContacts.map((user) => {
                const isActive = activeChatUser?.id === user.id;
                const unreadData = unreadChatSenders[user.id];
                const unreadCount = unreadData?.count || 0;
                const isUnread = unreadCount > 0;
                const online = isUserOnline(user.id);
                const conversation = conversationsMap[user.id];

                let snippetText = 'No messages yet';
                let snippetTime = '';

                if (conversation) {
                  const isMine = conversation.lastSenderId === currentUser?.id;
                  snippetText = isMine ? `You: ${conversation.lastText}` : conversation.lastText;
                  snippetTime = conversation.lastTime || '';
                }

                return (
                  <button
                    key={user.id}
                    onClick={() => {
                      setActiveChatUser(user);
                      markChatAsRead(user.id);
                      setReplyingTo(null);
                      setEditingMessage(null);
                      cancelAttachment();
                    }}
                    className={`w-full p-3 rounded-2xl flex items-center gap-3 transition cursor-pointer text-left ${
                      isActive
                        ? 'bg-purple-600/20 border border-purple-500/40 shadow-sm'
                        : isUnread
                        ? 'bg-slate-900 border border-blue-500/30 hover:bg-slate-800/80'
                        : 'hover:bg-slate-900/60 border border-transparent'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-11 h-11 rounded-full object-cover border border-purple-500/20"
                      />
                      {online && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="font-bold text-xs text-white truncate flex items-center gap-1">
                          {highlightText(user.name, chatSearchQuery)}
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        </h4>
                        {snippetTime && (
                          <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                            {snippetTime}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p
                          className={`text-[11px] truncate ${
                            isUnread ? 'text-blue-300 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {highlightText(snippetText, chatSearchQuery)}
                        </p>
                        {unreadCount > 0 && (
                          <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-extrabold flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.8)]">
                            {unreadCount}
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

        {/* Right Active Chat Pane */}
        <div
          className={`md:col-span-8 flex flex-col h-full min-h-0 bg-slate-950/40 relative ${
            activeChatUser ? 'flex' : 'hidden md:flex'
          }`}
        >
          {activeChatUser ? (
            <>
              {/* Chat Header */}
              <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/90 backdrop-blur-md shrink-0 z-20">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveChatUser(null);
                      setReplyingTo(null);
                      setEditingMessage(null);
                      cancelAttachment();
                    }}
                    className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    aria-label="Back to contacts list"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

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

                {/* Search & Call Action Buttons */}
                <div className="flex items-center gap-1.5 text-slate-400">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInChatSearch((prev) => {
                        const next = !prev;
                        if (next) {
                          setTimeout(() => inChatSearchInputRef.current?.focus(), 50);
                        } else {
                          setInChatQuery('');
                          setHighlightedMessageId(null);
                        }
                        return next;
                      });
                    }}
                    title={showInChatSearch ? 'Close search' : 'Search in this chat'}
                    aria-label="Search in this chat"
                    className={`p-2.5 rounded-xl transition cursor-pointer ${
                      showInChatSearch
                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-sm'
                        : 'hover:bg-slate-800 hover:text-purple-400'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startCall(activeChatUser, 'audio')}
                    title="Start Audio Call"
                    aria-label="Start Audio Call"
                    className="p-2.5 rounded-xl hover:bg-slate-800 hover:text-emerald-400 transition cursor-pointer"
                  >
                    <PhoneCall className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startCall(activeChatUser, 'video')}
                    title="Start Video Call"
                    aria-label="Start Video Call"
                    className="p-2.5 rounded-xl hover:bg-slate-800 hover:text-purple-400 transition cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* In-Chat Search Bar */}
              {showInChatSearch && (
                <div className="px-4 py-2 bg-slate-900/95 border-b border-purple-500/20 backdrop-blur-md flex items-center gap-2 animate-in slide-in-from-top-2 duration-150 z-20 shrink-0">
                  <div className="relative flex-1 flex items-center">
                    <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 pointer-events-none" />
                    <input
                      ref={inChatSearchInputRef}
                      type="text"
                      value={inChatQuery}
                      onChange={(e) => {
                        setInChatQuery(e.target.value);
                        setCurrentMatchIndex(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (e.shiftKey) goToPrevMatch();
                          else goToNextMatch();
                        } else if (e.key === 'Escape') {
                          setShowInChatSearch(false);
                          setInChatQuery('');
                          setHighlightedMessageId(null);
                        }
                      }}
                      placeholder={`Search in messages with ${activeChatUser.name}...`}
                      className="w-full bg-slate-950/80 border border-slate-700/60 focus:border-purple-500/60 rounded-xl pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-400 outline-none transition"
                    />
                    {inChatQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setInChatQuery('');
                          setCurrentMatchIndex(0);
                          setHighlightedMessageId(null);
                        }}
                        className="absolute right-2.5 text-slate-400 hover:text-white p-0.5 rounded transition"
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Match Counter & Navigation */}
                  {inChatQuery.trim() && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                        {matchingMessageIds.length > 0
                          ? `${currentMatchIndex + 1}/${matchingMessageIds.length}`
                          : '0 matches'}
                      </span>
                      <button
                        type="button"
                        disabled={matchingMessageIds.length === 0}
                        onClick={goToPrevMatch}
                        className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition cursor-pointer"
                        title="Previous match (Shift+Enter)"
                        aria-label="Previous match"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={matchingMessageIds.length === 0}
                        onClick={goToNextMatch}
                        className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition cursor-pointer"
                        title="Next match (Enter)"
                        aria-label="Next match"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowInChatSearch(false);
                      setInChatQuery('');
                      setHighlightedMessageId(null);
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Close search (Esc)"
                    aria-label="Close search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Messages Feed */}
              <div
                ref={scrollContainerRef}
                onScroll={handleChatScroll}
                className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-3 min-h-0"
              >
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
                      Say hello to {activeChatUser.name}! All messages are protected and verified safe.
                    </p>
                  </div>
                ) : (
                  messages.map((msg: ChatMessage, index: number) => {
                    const prevMsg = index > 0 ? messages[index - 1] : undefined;
                    const showDateSeparator = isNewDay(prevMsg?.created_at, msg.created_at);

                    const isMe = msg.senderId === currentUser?.id;
                    const isVoice = msg.isVoice || (msg.mediaUrl && (msg.mediaUrl.includes('/audio/') || msg.mediaUrl.endsWith('.webm') || msg.mediaUrl.endsWith('.mp3')));
                    const isDeleted = !!msg.deletedAt;
                    const isHighlighted = highlightedMessageId === msg.id;

                    const reactionsMap = msg.reactions || {};
                    const reactionEntries = Object.entries(reactionsMap);
                    // Group reactions by emoji: { [emoji]: count }
                    const reactionCounts: Record<string, number> = {};
                    reactionEntries.forEach(([_, emoji]) => {
                      reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
                    });
                    const myReaction = currentUser?.id ? reactionsMap[currentUser.id] : undefined;

                    return (
                      <React.Fragment key={msg.id}>
                        {/* Date / Day Separator */}
                        {showDateSeparator && (
                          <div className="flex items-center justify-center my-4 select-none">
                            <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent flex-1" />
                            <span className="px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-semibold text-slate-400 shadow-sm">
                              {formatMessageDateSeparator(msg.created_at)}
                            </span>
                            <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent flex-1" />
                          </div>
                        )}

                        {/* Message Row */}
                        <div
                          id={`msg-${msg.id}`}
                          className={`group relative flex flex-col ${isMe ? 'items-end' : 'items-start'} transition-all`}
                        >
                          {/* Action Toolbar */}
                          {!isDeleted && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute -top-7 ${
                                isMe ? 'right-0' : 'left-0'
                              } opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-900/95 border border-purple-500/30 shadow-xl backdrop-blur-md z-20 text-xs`}
                            >
                              {/* Reply Button */}
                              <button
                                type="button"
                                onClick={() => handleStartReply(msg)}
                                className="p-1 rounded-full hover:bg-white/10 text-slate-300 hover:text-purple-300 transition cursor-pointer"
                                title="Reply to message"
                                aria-label="Reply to message"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>

                              {/* Emoji React Button (Click / Tap accessible) */}
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id);
                                    setActiveMenuMessageId(null);
                                  }}
                                  className={`p-1 rounded-full transition cursor-pointer ${
                                    activeReactionMessageId === msg.id
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'hover:bg-white/10 text-slate-300 hover:text-amber-300'
                                  }`}
                                  title="React with emoji"
                                  aria-label="React to message"
                                >
                                  <Smile className="w-3.5 h-3.5" />
                                </button>

                                {/* Click/Tap Toggleable Reaction Picker */}
                                {activeReactionMessageId === msg.id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className={`absolute bottom-full mb-1.5 ${
                                      isMe ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'
                                    } p-1.5 bg-slate-900/95 border border-purple-500/40 rounded-full shadow-2xl flex items-center gap-1 z-40 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-32px)] overflow-x-auto custom-scrollbar`}
                                  >
                                    {quickReactions.map((emoji) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => {
                                          reactToMessage(msg.id, emoji);
                                          setActiveReactionMessageId(null);
                                        }}
                                        className="w-7 h-7 flex items-center justify-center text-sm rounded-full hover:bg-white/10 hover:scale-125 transition active:scale-95 cursor-pointer"
                                        title={`React ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                    {/* Plus button to open full categorized emoji picker */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowFullPickerMessageId(msg.id);
                                        setActiveReactionMessageId(null);
                                      }}
                                      className="w-7 h-7 flex items-center justify-center text-xs font-bold text-purple-300 bg-purple-950/60 hover:bg-purple-800/80 rounded-full hover:scale-110 transition cursor-pointer"
                                      title="More emojis (+)"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* More Actions Dropdown Toggle */}
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuMessageId(activeMenuMessageId === msg.id ? null : msg.id);
                                    setActiveReactionMessageId(null);
                                  }}
                                  className="p-1 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                                  title="More actions"
                                  aria-label="More message actions"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>

                                {activeMenuMessageId === msg.id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className={`absolute ${
                                      isMe ? 'right-0' : 'left-0'
                                    } ${
                                      index >= messages.length - 2 ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                                    } w-44 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl py-1.5 z-40 text-xs text-slate-200 max-h-[70vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100`}
                                  >
                                    {/* Quick react option in menu for touch devices */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveReactionMessageId(msg.id);
                                        setActiveMenuMessageId(null);
                                      }}
                                      className="w-full px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-left transition sm:hidden text-amber-300"
                                      aria-label="React with emoji"
                                    >
                                      <Smile className="w-3.5 h-3.5" />
                                      <span>React with emoji</span>
                                    </button>
                                    {/* Copy Text */}
                                    {msg.text && (
                                      <button
                                        type="button"
                                        onClick={() => handleCopyText(msg)}
                                        className="w-full px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-left transition"
                                        aria-label="Copy message"
                                      >
                                        <Copy className="w-3.5 h-3.5 text-blue-400" />
                                        <span>Copy text</span>
                                      </button>
                                    )}

                                    {/* Forward */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setForwardingMessage(msg);
                                        setActiveMenuMessageId(null);
                                      }}
                                      className="w-full px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-left transition"
                                      aria-label="Forward message"
                                    >
                                      <Share2 className="w-3.5 h-3.5 text-purple-400" />
                                      <span>Forward</span>
                                    </button>

                                    {/* Message Info */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInfoMessage(msg);
                                        setActiveMenuMessageId(null);
                                      }}
                                      className="w-full px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-left transition"
                                      aria-label="Message info"
                                    >
                                      <Info className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>Message info</span>
                                    </button>

                                    {/* Edit (Own text messages only) */}
                                    {isMe && !isVoice && msg.text && msg.messageType !== 'image' && msg.messageType !== 'video' && (
                                      <button
                                        type="button"
                                        onClick={() => handleStartEdit(msg)}
                                        className="w-full px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 text-left transition"
                                        aria-label="Edit message"
                                      >
                                        <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Edit</span>
                                      </button>
                                    )}

                                    {/* Delete (Own messages only) */}
                                    {isMe && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDeletingMessage(msg);
                                          setActiveMenuMessageId(null);
                                        }}
                                        className="w-full px-3 py-1.5 hover:bg-rose-500/15 text-rose-400 flex items-center gap-2 text-left transition font-semibold"
                                        aria-label="Delete message"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Delete</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Message Bubble */}
                          <div
                            className={`p-3.5 rounded-2xl max-w-md text-xs sm:text-sm leading-relaxed transition-all duration-300 ${
                              isHighlighted ? 'ring-2 ring-purple-400 scale-[1.01]' : ''
                            } ${
                              isDeleted
                                ? 'bg-slate-900/60 border border-slate-800 text-slate-500 italic'
                                : isMe
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none shadow-lg shadow-purple-900/30'
                                : 'bg-slate-800/90 border border-slate-700 text-slate-200 rounded-bl-none'
                            }`}
                          >
                            {/* Forwarded Indicator */}
                            {msg.isForwarded && !isDeleted && (
                              <div className="flex items-center gap-1 text-[10px] text-purple-300 opacity-90 italic mb-1.5">
                                <Share2 className="w-3 h-3 text-purple-300" />
                                <span>Forwarded</span>
                              </div>
                            )}

                            {/* Quoted Reply Preview */}
                            {msg.replyTo && !isDeleted && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (msg.replyTo?.id) {
                                    const targetEl = document.getElementById(`msg-${msg.replyTo.id}`);
                                    if (targetEl) {
                                      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      setHighlightedMessageId(msg.replyTo.id);
                                      setTimeout(() => setHighlightedMessageId(null), 1800);
                                    } else {
                                      addToast('info', 'Original Message', 'The referenced message was earlier in conversation history.');
                                    }
                                  }
                                }}
                                className="mb-2 p-2 rounded-xl bg-black/30 border-l-2 border-purple-400 text-[11px] cursor-pointer hover:bg-black/40 transition"
                                title="Click to view replied message"
                              >
                                <span className="font-bold text-purple-300 block text-[10px]">
                                  {msg.replyTo.senderId === currentUser?.id ? 'You' : activeChatUser?.name || 'Contact'}
                                </span>
                                <p className="truncate opacity-85">
                                  {msg.replyTo.text || (msg.replyTo.isVoice ? '🎙️ Voice note' : 'Media attachment')}
                                </p>
                              </div>
                            )}

                            {/* Soft-Deleted Notice */}
                            {isDeleted ? (
                              <p className="italic">This message was deleted</p>
                            ) : (
                              <>
                                {/* Voice Note Player */}
                                {isVoice && msg.mediaUrl ? (
                                  <ChatVoicePlayer
                                    url={msg.mediaUrl}
                                    duration={msg.voiceDuration}
                                    isMe={isMe}
                                  />
                                ) : null}

                                {/* Image Attachment */}
                                {!isVoice && msg.mediaUrl && (msg.messageType === 'image' || msg.messageType === 'gif' || (!msg.messageType && !msg.isVoice)) && (
                                  <div className="mb-2 rounded-xl overflow-hidden cursor-pointer max-w-sm">
                                    <img
                                      src={msg.mediaUrl}
                                      alt={msg.mediaName || 'Attachment image'}
                                      className="w-full h-auto max-h-72 object-cover rounded-xl hover:opacity-95 transition"
                                      onClick={() => window.open(msg.mediaUrl, '_blank')}
                                      loading="lazy"
                                    />
                                  </div>
                                )}

                                {/* Video Attachment */}
                                {!isVoice && msg.mediaUrl && msg.messageType === 'video' && (
                                  <div className="mb-2 rounded-xl overflow-hidden max-w-sm bg-black">
                                    <video
                                      src={msg.mediaUrl}
                                      controls
                                      playsInline
                                      preload="metadata"
                                      className="w-full max-h-72 rounded-xl"
                                    />
                                  </div>
                                )}

                                {/* File Attachment */}
                                {!isVoice && msg.mediaUrl && msg.messageType === 'file' && (
                                  <a
                                    href={msg.mediaUrl}
                                    download={msg.mediaName || 'download'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mb-2 p-2.5 rounded-xl bg-black/25 border border-white/10 flex items-center justify-between gap-3 text-xs hover:bg-black/35 transition cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                                      <div className="min-w-0">
                                        <p className="font-semibold text-white truncate text-xs">
                                          {msg.mediaName || 'Attachment File'}
                                        </p>
                                        {msg.mediaSize && (
                                          <span className="text-[10px] text-slate-400">{formatFileSize(msg.mediaSize)}</span>
                                        )}
                                      </div>
                                    </div>
                                    <Download className="w-4 h-4 text-slate-300 shrink-0 hover:text-white" />
                                  </a>
                                )}

                                {/* Message Text */}
                                {msg.text && (
                                  <p className="break-words whitespace-pre-wrap">
                                    {highlightText(msg.text, inChatQuery || chatSearchQuery)}
                                  </p>
                                )}
                              </>
                            )}

                            {/* Message Footer: Timestamp, Edited status, and Delivery Ticks */}
                            <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-slate-300 opacity-80">
                              {msg.editedAt && <span className="italic text-[9px] text-slate-400">(edited)</span>}
                              <span>{msg.timestamp}</span>
                              {isMe && !isDeleted && (
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

                          {/* Reaction Pills Row */}
                          {Object.keys(reactionCounts).length > 0 && !isDeleted && (
                            <div className="flex flex-wrap items-center gap-1 mt-1 z-0">
                              {Object.entries(reactionCounts).map(([emoji, count]) => {
                                const isSelected = myReaction === emoji;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => reactToMessage(msg.id, emoji)}
                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                                      isSelected
                                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50 shadow-sm'
                                        : 'bg-slate-900/80 border border-slate-800 text-slate-300 hover:bg-slate-800'
                                    }`}
                                    title={`Reacted ${count} time(s)`}
                                  >
                                    <span>{emoji}</span>
                                    <span className="text-[10px]">{count}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Permanent deletion button for author on tombstones */}
                          {isDeleted && isMe && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPermanentDeleteMessage(msg);
                              }}
                              className="mt-1 text-[11px] text-slate-500 hover:text-rose-400 flex items-center gap-1 transition cursor-pointer"
                              title="Permanently remove from conversation"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete permanently</span>
                            </button>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Replying Preview Bar */}
              {replyingTo && (
                <div className="px-4 py-2.5 bg-slate-900/95 border-t border-purple-500/30 flex items-center justify-between text-xs shrink-0 backdrop-blur-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Reply className="w-4 h-4 text-purple-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-purple-300">
                        Replying to {replyingTo.senderId === currentUser?.id ? 'yourself' : activeChatUser?.name}
                      </span>
                      <p className="text-slate-400 truncate text-[11px]">
                        {replyingTo.text || (replyingTo.isVoice ? '🎙️ Voice note' : 'Media attachment')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Cancel reply"
                    aria-label="Cancel reply"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Editing Preview Bar */}
              {editingMessage && (
                <div className="px-4 py-2.5 bg-slate-900/95 border-t border-amber-500/30 flex items-center justify-between text-xs shrink-0 backdrop-blur-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-amber-300">Editing message</span>
                      <p className="text-slate-400 truncate text-[11px]">{editingMessage.text}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMessage(null);
                      setChatInput('');
                    }}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Cancel edit"
                    aria-label="Cancel edit"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Media Attachment Preview Card */}
              {selectedAttachment && (
                <div className="p-3 bg-slate-900/95 border-t border-purple-500/30 shrink-0 backdrop-blur-md space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300 pb-1 border-b border-slate-800">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-purple-400" />
                      Attachment Preview ({selectedAttachment.type.toUpperCase()})
                    </span>
                    <button
                      type="button"
                      onClick={cancelAttachment}
                      disabled={isUploadingAttachment}
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                      title="Cancel attachment"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Visual Thumbnail */}
                    {selectedAttachment.type === 'image' || selectedAttachment.type === 'gif' ? (
                      <img
                        src={selectedAttachment.previewUrl}
                        alt="Preview"
                        className="w-16 h-16 rounded-xl object-cover border border-purple-500/30 shrink-0"
                      />
                    ) : selectedAttachment.type === 'video' ? (
                      <video
                        src={selectedAttachment.previewUrl}
                        className="w-16 h-16 rounded-xl object-cover border border-purple-500/30 shrink-0 bg-black"
                        muted
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center text-blue-400 shrink-0">
                        <FileText className="w-7 h-7" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs text-white truncate">{selectedAttachment.name}</p>
                      <p className="text-[11px] text-slate-400">{formatFileSize(selectedAttachment.size)}</p>
                      <input
                        type="text"
                        value={attachmentCaption}
                        onChange={(e) => setAttachmentCaption(e.target.value)}
                        placeholder="Add a caption (optional)..."
                        className="w-full mt-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                        disabled={isUploadingAttachment}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={sendAttachment}
                      disabled={isUploadingAttachment}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-md shadow-purple-900/30 shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingAttachment ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>Send</span>
                    </button>
                  </div>
                </div>
              )}

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
                      title="Cancel voice recording"
                      aria-label="Cancel voice recording"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={sendVoiceRecording}
                      disabled={isUploadingVoice || recordingSeconds < 1}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition cursor-pointer disabled:opacity-50"
                      title="Send voice note"
                      aria-label="Send voice note"
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
                  className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 shrink-0 relative"
                >
                  {/* Attachment Button & Popover */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      title="Add attachment"
                      aria-label="Open attachments"
                      className={`p-2.5 rounded-xl transition cursor-pointer ${
                        showAttachMenu
                          ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                          : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    {showAttachMenu && (
                      <div className="absolute bottom-full left-0 mb-2 w-44 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl py-1.5 z-40 text-xs">
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          className="w-full px-3 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left text-slate-200 transition cursor-pointer"
                          aria-label="Send photo"
                        >
                          <ImageIcon className="w-4 h-4 text-emerald-400" />
                          <span>Photos</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => videoInputRef.current?.click()}
                          className="w-full px-3 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left text-slate-200 transition cursor-pointer"
                          aria-label="Send video"
                        >
                          <Film className="w-4 h-4 text-purple-400" />
                          <span>Videos</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => gifInputRef.current?.click()}
                          className="w-full px-3 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left text-slate-200 transition cursor-pointer"
                          aria-label="Send GIF"
                        >
                          <Smile className="w-4 h-4 text-amber-400" />
                          <span>GIFs</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full px-3 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left text-slate-200 transition cursor-pointer"
                          aria-label="Send file"
                        >
                          <FileText className="w-4 h-4 text-blue-400" />
                          <span>Files</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Microphone / Voice Note Button */}
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    title="Record Voice Note"
                    aria-label="Record voice note"
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-purple-400 hover:text-purple-300 hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  {/* Text Input */}
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={
                      editingMessage
                        ? 'Edit message content...'
                        : replyingTo
                        ? `Reply to ${replyingTo.senderId === currentUser?.id ? 'yourself' : activeChatUser?.name}...`
                        : 'Send an encrypted message...'
                    }
                    className="flex-1 bg-slate-900 border border-purple-500/20 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white disabled:opacity-50 transition shadow-md shadow-purple-900/30 cursor-pointer"
                    title={editingMessage ? 'Save Edit' : 'Send message'}
                    aria-label={editingMessage ? 'Save Edit' : 'Send message'}
                  >
                    {editingMessage ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
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

      {/* ================= FORWARD MODAL ================= */}
      {forwardingMessage && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/30 rounded-3xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                <Share2 className="w-4 h-4 text-purple-400" /> Forward Message
              </h3>
              <button
                type="button"
                onClick={() => {
                  setForwardingMessage(null);
                  setForwardSearchQuery('');
                }}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message Preview */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
              <p className="italic text-slate-400 text-[11px] mb-1">Forwarding content:</p>
              <p className="line-clamp-2">
                {forwardingMessage.text || (forwardingMessage.isVoice ? '🎙️ Voice note' : 'Media attachment')}
              </p>
            </div>

            {/* Recipient Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={forwardSearchQuery}
                onChange={(e) => setForwardSearchQuery(e.target.value)}
                placeholder="Search friends & contacts..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Recipient List */}
            <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
              {supabaseUsers
                .filter((u) => u.id !== currentUser?.id)
                .filter((u) => {
                  if (!forwardSearchQuery) return true;
                  const q = forwardSearchQuery.toLowerCase();
                  return (
                    u.name?.toLowerCase().includes(q) ||
                    u.username?.toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                  <div
                    key={u.id}
                    className="p-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between gap-2 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={u.avatar}
                        alt={u.name}
                        className="w-8 h-8 rounded-full object-cover border border-purple-500/20"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-white truncate">{u.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">@{u.username}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleForwardMessage(u)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1 transition shadow cursor-pointer"
                    >
                      <Share2 className="w-3 h-3" /> Forward
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= DELETE CONFIRMATION MODAL ================= */}
      {deletingMessage && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">Delete message?</h3>
                <p className="text-xs text-slate-400">This message will be removed from the conversation.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingMessage(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteMessage(deletingMessage.id);
                  setDeletingMessage(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-lg shadow-rose-950/40 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MESSAGE INFO MODAL ================= */}
      {infoMessage && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/30 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" /> Message Info
              </h3>
              <button
                type="button"
                onClick={() => setInfoMessage(null)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300">
                <p className="italic text-[11px] text-slate-400 mb-1">Content:</p>
                <p className="line-clamp-2">
                  {infoMessage.text || (infoMessage.isVoice ? '🎙️ Voice note' : 'Media attachment')}
                </p>
              </div>

              <div className="space-y-2 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-slate-400" /> Sent:
                  </span>
                  <span className="font-semibold text-white font-mono text-[11px]">
                    {infoMessage.created_at ? new Date(infoMessage.created_at).toLocaleString() : 'Recent'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <CheckCheck className="w-3.5 h-3.5 text-slate-400" /> Delivered:
                  </span>
                  <span className="font-semibold text-white font-mono text-[11px]">
                    {infoMessage.delivered_at
                      ? new Date(infoMessage.delivered_at).toLocaleString()
                      : infoMessage.status === 'delivered' || infoMessage.status === 'read'
                      ? 'Delivered'
                      : 'Pending'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <CheckCheck className="w-3.5 h-3.5 text-blue-400" /> Read:
                  </span>
                  <span className="font-semibold text-blue-400 font-mono text-[11px]">
                    {infoMessage.read_at
                      ? new Date(infoMessage.read_at).toLocaleString()
                      : infoMessage.status === 'read'
                      ? 'Read'
                      : 'Unread'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setInfoMessage(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ================= PERMANENT DELETE CONFIRMATION MODAL ================= */}
      {permanentDeleteMessage && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">Permanently delete message?</h3>
                <p className="text-xs text-slate-400">
                  This message tombstone will be permanently removed from the conversation and cannot be recovered.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPermanentDeleteMessage(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = permanentDeleteMessage.id;
                  setPermanentDeleteMessage(null);
                  await deleteMessagePermanent(targetId);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-lg shadow-rose-950/40 cursor-pointer"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FULL CATEGORIZED EMOJI PICKER MODAL ================= */}
      {showFullPickerMessageId && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowFullPickerMessageId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[80vh] rounded-3xl bg-slate-900 border border-purple-500/30 p-5 shadow-2xl flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Smile className="w-4 h-4 text-amber-400" />
                <span>Choose a Reaction</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFullPickerMessageId(null)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 max-h-[60vh] custom-scrollbar">
              {categorizedEmojis.map((group) => (
                <div key={group.category} className="space-y-1.5">
                  <h4 className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider">
                    {group.category}
                  </h4>
                  <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5">
                    {group.emojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          reactToMessage(showFullPickerMessageId, emoji);
                          setShowFullPickerMessageId(null);
                        }}
                        className="w-9 h-9 flex items-center justify-center text-lg rounded-xl hover:bg-purple-600/20 hover:scale-125 transition active:scale-95 cursor-pointer"
                        title={`React ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
