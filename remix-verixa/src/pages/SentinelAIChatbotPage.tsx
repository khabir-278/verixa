import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { useApp } from '../context/AppContext';
import {
  Bot,
  Sparkles,
  Send,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Volume2,
  VolumeX,
  RotateCcw,
  FileText,
  ScanEye,
  MessageSquare,
  Zap,
} from 'lucide-react';

import { useSentinel } from '../context/SentinelContext';

export const SentinelAIChatbotPage: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const {
    messages,
    isLoading,
    activeTab,
    setActiveTab,
    draftInput,
    setDraftInput,
    sendMessage,
    clearChat: contextClearChat,
  } = useSentinel();

  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const lastSpokenMsgIdRef = useRef<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Pick up any draft input typed in floating sentinel
  useEffect(() => {
    if (draftInput) {
      setInputText(draftInput);
      setDraftInput('');
    }
  }, [draftInput, setDraftInput]);

  // Speech synthesis for newest bot message
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (
      speechEnabled &&
      lastMsg &&
      lastMsg.sender === 'bot' &&
      lastMsg.id !== lastSpokenMsgIdRef.current
    ) {
      lastSpokenMsgIdRef.current = lastMsg.id;
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(lastMsg.text.replace(/[*#`>]/g, ''));
          utterance.rate = 1.0;
          window.speechSynthesis.speak(utterance);
          setIsSpeaking(true);
          utterance.onend = () => setIsSpeaking(false);
        } catch (e) {
          // Ignore speech errors
        }
      }
    }
  }, [messages, speechEnabled]);

  const quickPrompts = [
    {
      label: '🧪 Test Toxicity',
      text: 'Analyze this comment for toxicity or insults: "You are totally clueless and nobody asked for your opinion."',
      tab: 'test' as const,
    },
    {
      label: '✨ Polite Rephrase',
      text: 'Please rephrase this angry comment constructively: "Your video is trash and you do not know what you are talking about."',
      tab: 'chat' as const,
    },
    {
      label: '🛡️ Safety Advice',
      text: 'What should I do if someone is creating multiple accounts to harass me?',
      tab: 'chat' as const,
    },
  ];

  const handleSend = async (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || isLoading) return;

    if (!customText) setInputText('');
    await sendMessage(textToSend, activeTab);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    addToast('info', 'Copied', 'Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    contextClearChat();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    addToast('info', 'Reset', 'Chat history cleared');
  };

  const toggleSpeech = () => {
    if (speechEnabled) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setSpeechEnabled(false);
      addToast('info', 'Voice Off', 'Text-to-Speech disabled');
    } else {
      setSpeechEnabled(true);
      addToast('info', 'Voice On', 'Text-to-Speech enabled');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 border border-purple-400/40 text-white shadow-lg shadow-purple-600/30">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                VERIXA Sentinel AI
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[10px] font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" /> AI Assistant
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Interactive safety assistant for comment analysis, de-escalation, and safety advice.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSpeech}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
              speechEnabled
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/40'
                : 'bg-slate-800/80 text-gray-400 border-slate-700 hover:text-white'
            }`}
            title="Toggle Text-to-Speech"
          >
            {speechEnabled ? <Volume2 className="w-4 h-4 text-purple-400" /> : <VolumeX className="w-4 h-4" />}
            <span>Voice {speechEnabled ? 'On' : 'Off'}</span>
          </button>

          <button
            onClick={clearChat}
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-gray-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-gray-400" />
            <span>Reset Chat</span>
          </button>
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="w-full flex flex-col h-[650px] rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl overflow-hidden">
        {/* Mode Selector Tabs */}
        <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-slate-900/60 text-gray-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> AI Safety Chat
          </button>

          <button
            onClick={() => setActiveTab('test')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'test'
                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-rose-600/30'
                : 'bg-slate-900/60 text-gray-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ScanEye className="w-3.5 h-3.5" /> Toxicity Tester
          </button>

          <button
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'report'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-600/30'
                : 'bg-slate-900/60 text-gray-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Incident Reporter
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'bot' && (
                <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`group relative max-w-[88%] sm:max-w-[80%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-md ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-700 text-white rounded-br-none font-medium'
                    : 'bg-slate-800/90 border border-slate-700/80 text-gray-100 rounded-bl-none'
                }`}
              >
                {msg.sender === 'bot' ? (
                  <div className="markdown-body text-gray-200">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                )}

                <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-400">
                  <span className="font-mono">{msg.timestamp}</span>
                  <div className="flex items-center gap-2">
                    {msg.sender === 'bot' && (
                      <button
                        onClick={() => copyToClipboard(msg.text, msg.id)}
                        className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        title="Copy response"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <span className="opacity-60">{msg.sender === 'user' ? 'You' : 'Sentinel AI'}</span>
                  </div>
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-400/40 text-indigo-200 flex items-center justify-center shrink-0 mt-1">
                  {currentUser?.avatar ? (
                    <img src={currentUser.avatar} alt="User" className="w-full h-full rounded-xl object-cover" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-3 text-purple-300 text-xs italic bg-purple-950/40 border border-purple-500/20 p-3 rounded-2xl w-fit animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
              <span>Sentinel AI analyzing request...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts Container */}
        <div className="px-4 py-2 bg-slate-950/50 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 shrink-0 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" /> Quick
          </span>
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => {
                setActiveTab(qp.tab);
                handleSend(qp.text);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-purple-600/20 hover:border-purple-500/40 border border-slate-700/60 text-gray-300 hover:text-purple-200 text-xs shrink-0 transition whitespace-nowrap cursor-pointer"
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-4 bg-slate-950 border-t border-slate-800 flex gap-3 items-center"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              activeTab === 'test'
                ? 'Paste any comment or caption to test toxicity...'
                : activeTab === 'report'
                ? 'Describe harassment incident to generate an official report...'
                : 'Ask Sentinel AI anything about safety, moderation, or rephrasing...'
            }
            className="flex-1 bg-slate-900 border border-purple-500/30 rounded-2xl px-4 py-3 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 shadow-inner"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-lg shadow-purple-600/40 disabled:opacity-50 transition shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
