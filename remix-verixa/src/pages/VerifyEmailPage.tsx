import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Mail, ShieldCheck, ArrowLeft, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || 'your email';
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  if (localPart.length <= 2) {
    return `${localPart}***@${domain}`;
  }
  return `${localPart.slice(0, 2)}****@${domain}`;
}

export const VerifyEmailPage: React.FC = () => {
  const {
    pendingVerificationEmail,
    verifyEmailOtp,
    resendVerificationOtp,
    setCurrentPage,
    canGoBack,
    goBack,
  } = useApp();

  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [manualEmail, setManualEmail] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // 2-minute visual countdown (120 seconds) - UI indicator only
  const [countdown, setCountdown] = useState<number>(120);
  const [countdownKey, setCountdownKey] = useState<number>(0);

  // 60-second resend cooldown timer
  const [resendCooldown, setResendCooldown] = useState<number>(60);
  const [resendCooldownKey, setResendCooldownKey] = useState<number>(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const targetEmail = (pendingVerificationEmail || manualEmail).trim();
  const displayEmail = targetEmail ? maskEmail(targetEmail) : 'your email address';

  // Visual countdown timer (2 minutes)
  useEffect(() => {
    setCountdown(120);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdownKey]);

  // Resend cooldown timer (60 seconds)
  useEffect(() => {
    setResendCooldown(60);
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldownKey]);

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const handlePastedCode = (digits: string, startIndex: number = 0) => {
    const cleanDigits = digits.replace(/\D/g, '').slice(0, 6);
    if (!cleanDigits) return;

    // If full 6-digit code or pasted at first position, populate all 6 boxes from 0
    const startPos = cleanDigits.length === 6 ? 0 : startIndex;
    const newOtp = [...otp];
    for (let i = 0; i < cleanDigits.length && startPos + i < 6; i++) {
      newOtp[startPos + i] = cleanDigits[i];
    }
    setOtp(newOtp);
    setErrorMessage('');

    const nextIndex = Math.min(startPos + cleanDigits.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleOtpChange = (index: number, val: string) => {
    const numeric = val.replace(/\D/g, '');
    if (!numeric && val !== '') return;

    if (numeric.length > 1) {
      handlePastedCode(numeric, index);
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = numeric.slice(-1);
    setOtp(newOtp);
    setErrorMessage('');

    if (numeric && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otp[index]) {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      } else if (index > 0) {
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData ? (e.clipboardData.getData('text/plain') || e.clipboardData.getData('text')) : '';
    if (pasted) {
      handlePastedCode(pasted, 0);
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isVerifying) return;

    const token = otp.join('');
    if (token.length !== 6) {
      setErrorMessage('Please enter all 6 digits of your verification code.');
      return;
    }

    if (!targetEmail || !targetEmail.includes('@')) {
      setErrorMessage('Please provide a valid email address to verify.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsVerifying(true);

    const res = await verifyEmailOtp(targetEmail, token);
    setIsVerifying(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Invalid verification code. Please check the code and try again.');
    }
    // On success, AppContext automatically establishes session, syncs user, and routes to 'home'
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    if (!targetEmail || !targetEmail.includes('@')) {
      setErrorMessage('Please provide a valid email address to resend the code.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsResending(true);

    const res = await resendVerificationOtp(targetEmail);
    setIsResending(false);

    if (res.success) {
      setOtp(['', '', '', '', '', '']);
      setSuccessMessage('A new 6-digit verification code has been sent to your email.');
      setCountdownKey((prev) => prev + 1);
      setResendCooldownKey((prev) => prev + 1);
      inputRefs.current[0]?.focus();
    } else {
      setErrorMessage(res.error || 'Failed to resend code. Please wait a moment and try again.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900/80 border border-purple-500/30 rounded-3xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl relative z-10 text-center"
      >
        {canGoBack && (
          <div className="text-left">
            <button
              type="button"
              onClick={goBack}
              className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-purple-400" />
              <span>Back</span>
            </button>
          </div>
        )}

        {/* Icon Header */}
        <div className="inline-flex p-4 rounded-3xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 text-white shadow-xl shadow-purple-600/30 mb-4">
          <Mail className="w-10 h-10 animate-bounce" />
        </div>

        <h2 className="text-2xl font-black text-white tracking-tight mb-2">
          Enter Verification Code
        </h2>

        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-slate-200 text-xs sm:text-sm leading-relaxed mb-5">
          We&apos;ve sent a 6-digit verification code to{' '}
          <span className="font-semibold text-purple-300">{displayEmail}</span>.
          Enter the code below to verify your account.
        </div>

        {/* Fallback Email Input if pendingVerificationEmail is absent */}
        {!pendingVerificationEmail && (
          <div className="mb-4 text-left">
            <label htmlFor="verify-email-input" className="block text-xs text-slate-400 font-medium mb-1.5">
              Account Email
            </label>
            <input
              id="verify-email-input"
              type="email"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500 transition"
            />
          </div>
        )}

        <form onSubmit={handleVerify}>
          {/* 6-Digit OTP Inputs */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 my-5">
            {otp.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={digit}
                onChange={(e) => handleOtpChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                aria-label={`Digit ${idx + 1} of 6`}
                className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-extrabold rounded-2xl transition duration-150 focus:outline-none focus:ring-2 focus:ring-purple-500/50 shadow-inner ${
                  digit
                    ? 'border-2 border-purple-500/80 bg-purple-950/30 text-white shadow-purple-900/30'
                    : 'border border-slate-800 bg-slate-950/80 text-white hover:border-slate-700'
                }`}
              />
            ))}
          </div>

          {/* Visual 2-minute Countdown Display */}
          <div className="mb-4 text-center">
            {countdown > 0 ? (
              <p className="text-xs text-slate-400">
                Code expires in{' '}
                <span className="font-mono font-bold text-purple-400">
                  {formatTime(countdown)}
                </span>
              </p>
            ) : (
              <p className="text-xs text-amber-400/90 font-medium">
                Code display timer reached 00:00. If your verification fails, please request a new code below.
              </p>
            )}
          </div>

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 text-left animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 text-left animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Verify Button */}
          <button
            type="submit"
            disabled={isVerifying || otp.join('').length !== 6 || !targetEmail}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-sm shadow-lg shadow-purple-900/40 hover:scale-[1.01] active:scale-[0.99] transition transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Code</span>
              </>
            )}
          </button>
        </form>

        {/* Resend Code & Back to Sign In */}
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 pt-3 border-t border-slate-800/60">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || isResending || !targetEmail}
            className="inline-flex items-center gap-1.5 font-semibold text-purple-400 hover:text-purple-300 disabled:text-slate-500 disabled:cursor-not-allowed transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
            <span>
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : 'Resend Code'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentPage('login')}
            className="text-slate-400 hover:text-white transition underline underline-offset-4"
          >
            Back to Sign In
          </button>
        </div>

        {/* Trust Safeguard Footer */}
        <div className="mt-5 pt-3 border-t border-slate-800/40 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>VERIXA AI Identity Safeguard</span>
        </div>
      </motion.div>
    </div>
  );
};
