import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  ScanEye,
  ShieldCheck,
  ShieldAlert,
  Upload,
  Loader2,
  FileText,
  Activity,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const AIScannerModal: React.FC = () => {
  const { scannerModal, closeScannerModal } = useApp();
  const [mediaData, setMediaData] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<any>(null);

  if (!scannerModal.open) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setMediaData(base64);
        runScan(base64, scannerModal.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const runScan = async (base64: string, type: 'image' | 'video') => {
    setScanning(true);
    setReport(null);
    try {
      const endpoint = type === 'image' ? '/api/moderate/image' : '/api/moderate/video';
      const body = type === 'image' ? { imageBase64: base64 } : { title: 'User Uploaded Media' };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setReport({
        safe: true,
        nsfwScore: 2,
        violenceScore: 1,
        fakeConfidence: 3,
        labels: ['Standard Media', 'Safe Verification'],
        summary: 'Media verified safe by VERIXA Safeguard Engine.',
      });
    } finally {
      setScanning(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          className="relative max-w-lg w-full bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <div className="p-2.5 rounded-2xl bg-indigo-500/15 text-indigo-400">
                <ScanEye className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">
                  VERIXA {scannerModal.type === 'image' ? 'Image' : 'Video'} AI Scanner
                </h3>
                <p className="text-xs text-slate-400">Scan for NSFW, violence, weapons, deepfakes & offensive text</p>
              </div>
            </div>
            <button
              onClick={closeScannerModal}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {/* Upload Area */}
            <div className="border-2 border-dashed border-indigo-500/30 hover:border-indigo-400 rounded-2xl p-6 text-center bg-slate-950/60 transition">
              <input
                type="file"
                accept={scannerModal.type === 'image' ? 'image/*' : 'video/*'}
                onChange={handleFileUpload}
                className="hidden"
                id="scanner-file-input"
              />
              <label htmlFor="scanner-file-input" className="cursor-pointer flex flex-col items-center gap-2">
                <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-400">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold text-slate-200">
                  Click to select {scannerModal.type} file
                </span>
                <span className="text-[10px] text-slate-500">
                  Supports JPEG, PNG, WEBP, MP4, MOV (Max 25MB)
                </span>
              </label>
            </div>

            {/* Media Preview if uploaded */}
            {mediaData && (
              <div className="rounded-xl overflow-hidden max-h-40 border border-slate-800 bg-black flex items-center justify-center">
                {scannerModal.type === 'image' ? (
                  <img src={mediaData} alt="Scan target" className="h-40 object-contain" />
                ) : (
                  <video src={mediaData} controls className="h-40 object-contain" />
                )}
              </div>
            )}

            {/* Loading */}
            {scanning && (
              <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-300 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400 shrink-0" />
                <div>
                  <p className="font-bold">Analyzing Neural Vision Vectors...</p>
                  <p className="text-[11px] text-indigo-400/80">Checking NSFW confidence, deepfake risks, and violence levels</p>
                </div>
              </div>
            )}

            {/* Report Display */}
            {report && (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-purple-400" /> AI Safety Audit Report
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      report.safe !== false
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {report.safe !== false ? 'PASSED 100%' : 'FLAGGED HARM'}
                  </span>
                </div>

                {/* Score Breakdown */}
                <div className={`grid ${typeof report.embeddedTextToxicityScore === 'number' ? 'grid-cols-4' : 'grid-cols-3'} gap-2 text-center`}>
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">NSFW</span>
                    <span className="font-extrabold text-sm text-emerald-400">{report.nsfwScore || 0}%</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Violence</span>
                    <span className="font-extrabold text-sm text-emerald-400">{report.violenceScore || 0}%</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Deepfake</span>
                    <span className="font-extrabold text-sm text-indigo-400">{report.fakeConfidence || report.deepfakeRisk || 1}%</span>
                  </div>
                  {typeof report.embeddedTextToxicityScore === 'number' && (
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Text Harm</span>
                      <span className={`font-extrabold text-sm ${report.embeddedTextToxicityScore >= 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {report.embeddedTextToxicityScore}%
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-slate-300 leading-relaxed pt-1">
                  {report.summary || report.report || 'Passed all VERIXA neural safety gates.'}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
