import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldAlert, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={`pointer-events-auto p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-start gap-3.5 transition-all ${
                isError
                  ? 'bg-rose-950/80 border-rose-500/50 text-rose-100 shadow-rose-900/30'
                  : isSuccess
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-100 shadow-emerald-900/30'
                  : isWarning
                  ? 'bg-amber-950/80 border-amber-500/50 text-amber-100 shadow-amber-900/30'
                  : 'bg-indigo-950/80 border-indigo-500/50 text-indigo-100 shadow-indigo-900/30'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isError && <ShieldAlert className="w-5 h-5 text-rose-400" />}
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                {!isError && !isSuccess && !isWarning && <Info className="w-5 h-5 text-indigo-400" />}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm leading-tight">{toast.title}</h4>
                <p className="text-xs mt-1 text-slate-300 leading-relaxed">{toast.message}</p>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
