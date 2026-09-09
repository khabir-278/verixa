import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { Bot, Send, X, Shield, Sparkles, CheckCircle2, ShieldAlert, Zap, RefreshCw, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { useSentinel } from '../context/SentinelContext';

export const AIFloatingSentinel: React.FC = () => {
  const { currentPage, setCurrentPage } = useApp();
  const { messages, isLoading, sendMessage, setDraftInput } = useSentinel();

  const hiddenPages = [
    'messages',
    'landing',
    'about',
    'ai-architecture',
    'ai-dashboard',
    'ai_dashboard',
    'privacy',
    'terms',
    'help',
    'contact',
    'login',
    'signup',
    'verify-email',
    'sentinel-ai',
  ];

  if (hiddenPages.includes(currentPage as string)) {
    return null;
  }

  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, isLoading]);

  const handleOpenFullChat = () => {
    if (inputText.trim()) {
      setDraftInput(inputText.trim());
      setInputText('');
    }
    setIsOpen(false);
    setCurrentPage('sentinel-ai');
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputText.trim();
    if (!query || isLoading) return;

    setInputText('');
    await sendMessage(query, 'chat');
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
                  onClick={handleOpenFullChat}
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
                    className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none whitespace-pre-line'
                        : 'bg-slate-800/80 border border-slate-700/80 text-slate-200 rounded-bl-none'
                    }`}
                  >
                    {m.sender === 'bot' ? (
                      <div className="markdown-body text-slate-200">
                        <Markdown>{m.text}</Markdown>
                      </div>
                    ) : (
                      m.text
                    )}
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
                onClick={handleOpenFullChat}
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
                placeholder="Ask anything, test a comment, get advice..."
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

