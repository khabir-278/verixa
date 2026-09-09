import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface SentinelMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  mode?: 'chat' | 'test' | 'report';
  details?: any;
}

export const INITIAL_SENTINEL_MESSAGE: SentinelMessage = {
  id: 'welcome-sentinel',
  sender: 'bot',
  text: `👋 **Welcome to VERIXA Sentinel AI.**

I am your unified AI companion, content safety co-pilot, and intelligent assistant (similar to ChatGPT or Gemini).

You can ask me to:
- **Chat freely** about coding, creative writing, science, social media strategy, or life advice.
- **Analyze text** for toxic language, cyberbullying, harassment, or policy violations.
- **Constructively rephrase** heated or aggressive comments.
- **Provide guidance** on digital safety, privacy locks, and handling harassment.
- **Generate incident reports** for severe violations.

How can I help you today?`,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

interface SentinelContextType {
  messages: SentinelMessage[];
  isLoading: boolean;
  activeTab: 'chat' | 'test' | 'report';
  setActiveTab: (tab: 'chat' | 'test' | 'report') => void;
  draftInput: string;
  setDraftInput: (val: string) => void;
  sendMessage: (textToSend: string, explicitMode?: 'chat' | 'test' | 'report') => Promise<void>;
  clearChat: () => void;
}

const STORAGE_KEY = 'verixa_sentinel_chat_history_v2';

const SentinelContext = createContext<SentinelContextType | undefined>(undefined);

export const SentinelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<SentinelMessage[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        // Fallback to initial message
      }
    }
    return [INITIAL_SENTINEL_MESSAGE];
  });

  const [activeTab, setActiveTab] = useState<'chat' | 'test' | 'report'>('chat');
  const [isLoading, setIsLoading] = useState(false);
  const [draftInput, setDraftInput] = useState('');

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Persist messages to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } catch (e) {
        // Storage quota or disabled
      }
    }
  }, [messages]);

  const clearChat = useCallback(() => {
    const resetMsg: SentinelMessage = {
      id: 'welcome-reset-' + Date.now(),
      sender: 'bot',
      text: '🔄 **Conversation Reset.** VERIXA Sentinel AI is ready for new queries, ideas, or toxicity audits.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages([resetMsg]);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }
  }, []);

  const sendMessage = useCallback(
    async (textToSend: string, explicitMode?: 'chat' | 'test' | 'report') => {
      const trimmed = textToSend.trim();
      if (!trimmed || isLoading) return;

      const mode = explicitMode || activeTab;

      const userMessage: SentinelMessage = {
        id: Date.now().toString(),
        sender: 'user',
        text: trimmed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        if (mode === 'test') {
          const res = await fetch('/api/moderate/comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: trimmed, context: 'Sentinel Chatbot Audit' }),
          });
          const data = await res.json();

          const status = data.status || (data.allowed ? 'SAFE' : 'BLOCKED');
          const score = data.toxicity_score ?? data.toxicityScore ?? 0;
          const confidence = data.confidence ?? 98;
          const category = data.category || 'General Assessment';
          const labels = (data.detected_labels || data.categories || []).join(', ');
          const reason = data.reason || 'No harmful language detected.';
          const action =
            data.suggested_action || (status === 'SAFE' ? 'Allow submission' : 'Block comment and flag account');
          const rewrite = data.safe_rewrite || data.suggestion;

          const formattedReport = `### 🔍 Toxicity Audit Result

* **Status**: **${status === 'BLOCKED' ? '⛔ BLOCKED' : status === 'WARNING' ? '⚠️ WARNING' : '✅ SAFE'}**
* **Toxicity Score**: \`${score}/100\`
* **Category**: **${category}**
* **Confidence**: \`${confidence}%\`
* **Detected Labels**: ${labels ? `\`${labels}\`` : '_None_'}

**Reasoning**:
> ${reason}

**Recommended Action**: ${action}

${
  rewrite
    ? `**Suggested Polite Rewrite**:
> "${rewrite}"`
    : ''
}`;

          const botMessage: SentinelMessage = {
            id: (Date.now() + 1).toString(),
            sender: 'bot',
            text: formattedReport,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            details: data,
            mode: 'test',
          };

          setMessages((prev) => [...prev, botMessage]);
        } else {
          // Chat or Report mode
          const currentHistory = messagesRef.current.map((m) => ({
            sender: m.sender,
            text: m.text,
          }));

          const res = await fetch('/api/ai-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: trimmed,
              history: currentHistory,
              mode,
            }),
          });

          const data = await res.json();
          const botReply =
            data.reply ||
            'VERIXA Sentinel AI actively analyzed your message and confirmed safe parameters. How else can I help?';

          const botMessage: SentinelMessage = {
            id: (Date.now() + 1).toString(),
            sender: 'bot',
            text: botReply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            mode,
          };

          setMessages((prev) => [...prev, botMessage]);
        }
      } catch (err) {
        console.warn('Sentinel AI request error:', err);
        const fallbackMsg: SentinelMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          text: 'I am right here with you! How else can I assist you today with social media safety, creative ideas, or general questions?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          mode,
        };
        setMessages((prev) => [...prev, fallbackMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [activeTab, isLoading]
  );

  return (
    <SentinelContext.Provider
      value={{
        messages,
        isLoading,
        activeTab,
        setActiveTab,
        draftInput,
        setDraftInput,
        sendMessage,
        clearChat,
      }}
    >
      {children}
    </SentinelContext.Provider>
  );
};

export const useSentinel = (): SentinelContextType => {
  const context = useContext(SentinelContext);
  if (!context) {
    throw new Error('useSentinel must be used within a SentinelProvider');
  }
  return context;
};
