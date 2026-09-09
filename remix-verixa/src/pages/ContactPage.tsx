import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Mail, MessageSquare, Send, ShieldCheck, CheckCircle2, Clock, ArrowLeft } from 'lucide-react';

export const ContactPage: React.FC = () => {
  const { addToast, setCurrentPage, isAuthenticated } = useApp();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) return;
    setSubmitted(true);
    addToast('success', 'Ticket Dispatched', 'AI Security support ticket created (#VRX-8291).');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      {/* Top Left Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <button
          onClick={() => setCurrentPage(isAuthenticated ? 'home' : 'landing')}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-purple-400" />
          <span>{isAuthenticated ? 'Back to Feed' : 'Back to Welcome'}</span>
        </button>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold text-white flex items-center justify-center gap-2">
          Contact VERIXA Support <Mail className="w-6 h-6 text-purple-400" />
        </h1>
        <p className="text-xs text-slate-400">
          Have questions or need assistance with AI moderation appeal? Reach out below.
        </p>
      </div>

      <div className="p-8 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-2xl">
        {submitted ? (
          <div className="text-center py-8 space-y-3">
            <div className="p-3 rounded-full bg-emerald-500/20 text-emerald-400 w-fit mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-lg text-white">Ticket Submitted to VERIXA Support</h3>
            <p className="text-xs text-slate-300">
              Our automated system triaged your request. Typical response time is under 5 minutes.
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                setSubject('');
                setMessage('');
              }}
              className="px-4 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs"
            >
              Submit Another Inquiry
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Content Moderation Appeal"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Message Details</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your request or appeal..."
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                <Clock className="w-4 h-4 text-purple-400" />
                <span>AI Auto-Triage Active</span>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-900/30 flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> Send Ticket
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
