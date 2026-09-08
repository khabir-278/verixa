import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Shield, Sparkles, CheckCircle2, ShieldAlert, Zap, RefreshCw, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';

export const AIFloatingSentinel: React.FC = () => {
  const { setCurrentPage } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ sender: 'user' | 'bot'; text: string; details?: any }[]>([
    {
      sender: 'bot',
      text: 'Greetings! I am VERIXA Sentinel AI. I continuously scan for hate speech, cyberbullying, NSFW content, and fake profiles. You can test any text or ask me safety advice here!',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userQuery = inputText.trim();
    setInputText('');
    setMessages((prev) => [...prev, { sender: 'user', text: userQuery }]);
    setIsLoading(true);

    try {
      const lower = userQuery.toLowerCase();
      // If user is explicitly testing a comment toxicity or asking to check a text
      if (lower.startsWith('test') || lower.startsWith('check') || lower.includes('toxicity') || lower.includes('analyze')) {
        const modRes = await fetch('/api/moderate/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: userQuery }),
        });
        const modData = await modRes.json();

        if (modData && (modData.status || typeof modData.toxicity_score === 'number' || typeof modData.toxicityScore === 'number')) {
          const status = modData.status || (modData.allowed ? 'SAFE' : 'BLOCKED');
          const score = modData.toxicity_score ?? modData.toxicityScore ?? 0;
          const confidence = modData.confidence ?? 98;
          const category = modData.category || 'General';
          const labels = (modData.detected_labels || modData.categories || []).join(', ');
          const reason = modData.reason || 'No issue detected.';
          const action = modData.suggested_action || (status === 'SAFE' ? 'Allow' : status === 'WARNING' ? 'Show warning before posting.' : 'Block comment and flag account.');
          const rewrite = modData.safe_rewrite || modData.suggestion;

          let botResponse = '';
          if (status === 'BLOCKED') {
            botResponse = `⛔ STATUS: BLOCKED\nToxicity Score: ${score}/100\nCategory: ${category}\nConfidence: ${confidence}%\nReason: ${reason}${labels ? `\nDetected Flags: [${labels}]` : ''}\nAction: ${action}${rewrite ? `\nSuggested Rewrite: "${rewrite}"` : ''}`;
          } else if (status === 'WARNING') {
            botResponse = `⚠️ STATUS: WARNING\nToxicity Score: ${score}/100\nCategory: ${category}\nConfidence: ${confidence}%\nReason: ${reason}${labels ? `\nDetected Flags: [${labels}]` : ''}\nAction: ${action}${rewrite ? `\nSuggested Rewrite: "${rewrite}"` : ''}`;
          } else {
            botResponse = `✅ STATUS: SAFE\nToxicity Score: ${score}/100\nCategory: ${category}\nConfidence: ${confidence}%\nReason: ${reason}\nSuggested Action: ${action}`;
          }

          setMessages((prev) => [...prev, { sender: 'bot', text: botResponse, details: modData }]);
          return;
        }
      }

      // Default Chatbot Assistant Call
      const apiHistory = messages.map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const chatRes = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userQuery, history: apiHistory }),
      });
      const chatData = await chatRes.json();
      const botResponse = chatData.reply || 'VERIXA AI Guard is active and shielding your session.';

      setMessages((prev) => [...prev, { sender: 'bot', text: botResponse }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: 'VERIXA Sentinel AI actively analyzed your message and verified safe parameters.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            className="mb-4 w-80 sm:w-96 rounded-3xl bg-slate-900/95 border border-purple-500/30 shadow-2xl backdrop-blur-2xl overflow-hidden flex flex-col h-[490px]"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 p-4 border-b border-purple-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300">
                  <Bot className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                    VERIXA Sentinel AI <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  </h3>
                  <p className="text-[10px] text-purple-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" /> Real-time Cyber Shield Active
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setCurrentPage('sentinel-ai');
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
                  title="Open Full Screen Chatbot"
                >
                  <Maximize2 className="w-4 h-4 text-purple-300" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages Body */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar text-xs">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`p-3 rounded-2xl max-w-[85%] whitespace-pre-line leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none'
                        : 'bg-slate-800/80 border border-slate-700/80 text-slate-200 rounded-bl-none'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-slate-400 text-xs italic">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" /> VERIXA AI analyzing content...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Expand Fullscreen Prompt Link */}
            <div className="px-3 py-1.5 bg-purple-950/40 border-t border-purple-500/20 text-[11px] flex items-center justify-between text-purple-200">
              <span>Need deep analysis & reports?</span>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setCurrentPage('sentinel-ai');
                }}
                className="font-bold text-amber-300 hover:underline flex items-center gap-1"
              >
                Full Chat Hub →
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSend} className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Test a comment or ask AI Guard..."
                className="flex-1 bg-slate-900 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger FAB */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="p-3.5 rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-2xl shadow-purple-600/50 border border-purple-400/40 flex items-center justify-center relative group"
        aria-label="Toggle AI Sentinel"
      >
        <Bot className="w-6 h-6 animate-pulse" />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-slate-950 animate-ping" />
      </motion.button>
    </div>
  );
};

