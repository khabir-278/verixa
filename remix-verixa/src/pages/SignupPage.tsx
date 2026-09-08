import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, User, Mail, Lock, Sparkles, Loader2, CheckCircle2, Shield, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

export const SignupPage: React.FC = () => {
  const { currentUser, signup, loginWithGoogle, setCurrentPage, canGoBack, goBack, openUnauthorizedDomainModal } = useApp();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const hasUserInteracted = useRef(false);

  // Strictly enforce empty credentials on mount and suppress aggressive browser autofill
  useEffect(() => {
    hasUserInteracted.current = false;
    setName('');
    setUsername('');
    setEmail('');
    setPassword('');

    const timers = [
      setTimeout(() => {
        if (!hasUserInteracted.current) {
          setEmail('');
          setPassword('');
        }
      }, 50),
      setTimeout(() => {
        if (!hasUserInteracted.current) {
          setEmail('');
          setPassword('');
        }
      }, 200),
      setTimeout(() => {
        if (!hasUserInteracted.current) {
          setEmail('');
          setPassword('');
        }
      }, 500),
    ];

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  const handleGoogleSignup = async () => {
    setErrorMessage('');
    setIsGoogleLoading(true);
    const res = await loginWithGoogle();
    if (!res.success && !res.cancelled && res.error) {
      setIsGoogleLoading(false);
      setErrorMessage(res.error);
    }
    // Do NOT navigate to 'home' here. The browser is redirecting to Google's account selection screen.
    // Keeping isGoogleLoading true provides seamless feedback until the redirect occurs.
  };

  // Password strength calculation
  const getPasswordStrength = () => {
    if (!password) return { score: 0, text: 'Empty', color: 'bg-slate-800' };
    if (password.length < 6) return { score: 25, text: 'Weak', color: 'bg-rose-500' };
    if (password.length < 10) return { score: 60, text: 'Medium', color: 'bg-amber-500' };
    if (/[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) {
      return { score: 100, text: 'Unbreakable AI Grade', color: 'bg-emerald-500' };
    }
    return { score: 80, text: 'Strong', color: 'bg-indigo-500' };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!name || !username || !email || !password) return;
    setIsLoading(true);
    const res = await signup(name, username, email, password);
    setIsLoading(false);
    if (!res.success) {
      setErrorMessage(res.error || 'Failed to create account.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-65px)] flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/4 w-96 h-96 bg-pink-600/15 rounded-full blur-[140px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900/80 border border-purple-500/30 rounded-3xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl relative z-10"
      >
        {canGoBack && (
          <button
            type="button"
            onClick={goBack}
            className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-purple-400" />
            <span>Back</span>
          </button>
        )}

        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex p-1 rounded-2xl bg-gradient-to-tr from-indigo-600/20 via-purple-600/20 to-pink-600/20 border border-purple-500/30 shadow-xl shadow-purple-600/20 mb-2">
            <img
              src="/verixa-logo.jpg"
              alt="VERIXA Logo"
              className="w-16 h-16 rounded-xl object-cover"
            />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Join VERIXA</h2>
          <p className="text-xs text-slate-400">
            Create your account on the world's safest AI-shielded social network.
          </p>
        </div>

        {/* Current Active Account Banner */}
        {currentUser && (
          <div className="mb-5 p-3 rounded-2xl bg-purple-950/40 border border-purple-500/30 text-purple-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name} className="w-7 h-7 rounded-full object-cover shrink-0 border border-purple-400/40" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold shrink-0">
                  {currentUser.name?.[0] || 'U'}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-white truncate text-xs">{currentUser.name}</p>
                <p className="text-[11px] text-purple-300 truncate">@{currentUser.username}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage('home')}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shrink-0 transition flex items-center gap-1 shadow-md shadow-purple-900/30 cursor-pointer"
            >
              <span>Go to Feed</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="leading-relaxed font-medium">{errorMessage}</p>
              {errorMessage.toLowerCase().includes('already exists') && (
                <button
                  type="button"
                  onClick={() => setCurrentPage('login')}
                  className="text-purple-300 hover:text-purple-200 underline font-semibold text-[11px] block mt-1"
                >
                  Click here to Sign In with this email →
                </button>
              )}
              {errorMessage.toLowerCase().includes('domain') && (
                <button
                  type="button"
                  onClick={openUnauthorizedDomainModal}
                  className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-[11px] transition border border-amber-500/30 cursor-pointer"
                >
                  <span>Open Domain Authorization Setup / Bypass</span>
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
          {/* Decoy fields to intercept aggressive browser credential manager autofill */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 0,
              height: 0,
              opacity: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
              zIndex: -1,
            }}
            aria-hidden="true"
            tabIndex={-1}
          >
            <input
              type="text"
              name="prevent_autofill_signup_user"
              id="prevent_autofill_signup_user"
              tabIndex={-1}
              autoComplete="username"
            />
            <input
              type="password"
              name="prevent_autofill_signup_pass"
              id="prevent_autofill_signup_pass"
              tabIndex={-1}
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="text"
                name="verixa_signup_fullname"
                id="verixa_signup_fullname"
                autoComplete="off"
                value={name}
                onChange={(e) => {
                  hasUserInteracted.current = true;
                  setName(e.target.value);
                }}
                placeholder="e.g. Jordan Lee"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Username</label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-xs text-purple-400 font-bold">@</span>
              <input
                type="text"
                name="verixa_signup_username"
                id="verixa_signup_username"
                autoComplete="off"
                value={username}
                onChange={(e) => {
                  hasUserInteracted.current = true;
                  setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''));
                }}
                placeholder="jordan_verixa"
                className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="email"
                name="verixa_signup_email_clean"
                id="verixa_signup_email_clean"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-lpignore="true"
                data-form-type="other"
                value={email}
                onChange={(e) => {
                  hasUserInteracted.current = true;
                  setEmail(e.target.value);
                }}
                placeholder="jordan@domain.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="password"
                name="verixa_signup_password_clean"
                id="verixa_signup_password_clean"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-lpignore="true"
                data-form-type="other"
                value={password}
                onChange={(e) => {
                  hasUserInteracted.current = true;
                  setPassword(e.target.value);
                }}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                required
              />
            </div>

            {/* Strength Meter */}
            {password && (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Password Strength</span>
                  <span className="font-bold text-slate-200">{strength.text}</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${strength.color}`}
                    style={{ width: `${strength.score}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-400 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 rounded bg-slate-950 border-slate-800 text-purple-600 focus:ring-purple-500"
              required
            />
            <span>
              I agree to the <button type="button" onClick={() => setCurrentPage('terms')} className="text-purple-400 underline">Community Guidelines</button> and zero-tolerance policy against cyberbullying & hate speech.
            </span>
          </label>

          <button
            type="submit"
            disabled={isLoading || !agreed}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-sm transition shadow-lg shadow-purple-900/40 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Provisioning Account...
              </>
            ) : (
              'Create VERIXA Account'
            )}
          </button>
        </form>

        <div className="mt-6 space-y-3">
          <div className="relative text-center text-xs text-slate-500">
            <span className="relative z-10 px-2 bg-slate-900 text-slate-400 font-medium">or continue with</span>
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={isLoading || isGoogleLoading}
            className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 active:scale-[0.99] text-slate-900 font-bold text-sm transition shadow-lg shadow-black/30 flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
          >
            {isGoogleLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          Already have an account?{' '}
          <button
            onClick={() => setCurrentPage('login')}
            className="text-purple-400 font-bold hover:underline"
          >
            Sign In
          </button>
        </div>
      </motion.div>
    </div>
  );
};
