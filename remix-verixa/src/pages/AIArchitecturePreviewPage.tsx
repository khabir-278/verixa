import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldCheck,
  Cpu,
  Zap,
  Bot,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Layers,
  Activity,
  ScanEye,
  Languages,
  Scale,
  Users,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ArchitectureNode {
  id: string;
  name: string;
  category: 'ingestion' | 'nlp' | 'vision' | 'behavioral' | 'arbitration' | 'enforcement';
  title: string;
  description: string;
  latency: string;
  accuracy: string;
  models: string[];
  features: string[];
  sampleInput: string;
  sampleOutput: string;
}

const ARCHITECTURE_NODES: Record<string, ArchitectureNode> = {
  ingestion: {
    id: 'ingestion',
    category: 'ingestion',
    name: 'Secure Ingestion & Stream Gateway',
    title: 'Multi-Modal Ingestion & Gateway Layer',
    description:
      'Intercepts and validates all incoming platform events — including raw comment text, image bytes, video chunks, and metadata payloads — over encrypted TLS 1.3 before dispatching to downstream neural pipelines.',
    latency: '0.4ms',
    accuracy: '100%',
    models: ['TLS 1.3 Wire Guard', 'Express Rate Limiter (Token Bucket)', 'Payload Sanity & MIME Validator'],
    features: [
      'Encrypted zero-trust payload ingestion with AES-256 in transit',
      'High-throughput rate limiting (60 requests/min per IP) to deter flood attacks',
      'MIME type and byte header inspection to prevent malicious disguised uploads',
      'Pre-processing tokenization & vector buffer allocation for downstream neural engines'
    ],
    sampleInput: 'POST /api/moderation/comment { content: "Sample payload...", userId: "usr_942" }',
    sampleOutput: '✅ VALIDATED (Handshake complete, 0.4ms stream routed to NLP Sentinel)'
  },
  nlp: {
    id: 'nlp',
    category: 'nlp',
    name: 'Multilingual NLP & Sentiment Core',
    title: 'Text & Linguistic Sentinel Engine',
    description:
      'Performs real-time sentiment extraction, cyberbullying identification, hate speech classification, and identity threat scoring across 12+ Indian and international languages.',
    latency: '36ms',
    accuracy: '99.4%',
    models: ['Gemini 2.5 Flash Neural Transformer', 'Hinglish Colloquial Tokenizer', 'Zero-Shot Toxicity Classifier'],
    features: [
      'Multi-dialect Hinglish & Romanized Hindi slang comprehension',
      'Context-aware sarcasm & aggressive tone classification',
      'Zero-tolerance suicide, self-harm, and direct physical threat interceptor',
      'Continuous vocabulary refinement via active feedback vectors'
    ],
    sampleInput: '"Tu bilkul bakwaas creator hai, get lost before I hurt you"',
    sampleOutput: '⚠️ BLOCKED (98.4% Toxicity, Direct Threat & Harassment detected in Hinglish)'
  },
  vision: {
    id: 'vision',
    category: 'vision',
    name: 'Vision & Deepfake AI Sentinel',
    title: 'Visual Defense & Synthetic Media Engine',
    description:
      'Scans uploaded imagery, avatars, reels, and video frames for synthetic deepfake artifacts, NSFW nudity, physical violence, weapons, and graphic gore.',
    latency: '52ms',
    accuracy: '98.9%',
    models: ['Vision Transformer (ViT-L/14)', 'Deepfake Facial Artifact CNN', 'Embedded OCR Text Extractor'],
    features: [
      'Spectral frequency analysis to uncover synthetic diffusion & GAN face swaps',
      'Frame-by-frame reel scanning with automated NSFW blur quarantine',
      'OCR text extraction to prevent hidden hateful text embedded in image memes',
      'Biometric boundary integrity verification for verified human badges'
    ],
    sampleInput: 'Uploaded Image / Video with altered face-swap or sensitive graphics',
    sampleOutput: '🛡️ QUARANTINED (94.6% Deepfake Confidence, Quarantined to Admin Review)'
  },
  behavioral: {
    id: 'behavioral',
    category: 'behavioral',
    name: 'Behavioral & Trust Matrix',
    title: 'Account Reputation & Sybil Shield',
    description:
      'Continuously tracks user activity velocity, coordinated bot cluster patterns, fake profile heuristics, and awards dynamic AI Safety Scores (0-100).',
    latency: '24ms',
    accuracy: '99.1%',
    models: ['Graph Neural Network (GNN)', 'Velocity Anomaly Detector', 'Reputation Scoring Matrix'],
    features: [
      'Identifies automated bot spam waves within 3 rapid interactions',
      'Calculates dynamic user Safety Score (0-100) visible on profiles',
      'Awards "Verified Human Safe" badges to authentic verified creators',
      'Auto-restricts suspicious burner accounts created within minutes'
    ],
    sampleInput: 'Rapid comment burst: 25 repetitive links posted in 10 seconds',
    sampleOutput: '🛑 RATE LIMIT & ACCOUNT FLAGGED (Automated bot pattern triggered)'
  },
  arbitration: {
    id: 'arbitration',
    category: 'arbitration',
    name: 'Policy & Arbitration Arbiter',
    title: 'Zero-Tolerance Decision Pipeline',
    description:
      'Triages signals from NLP, Vision, and Behavioral engines against platform safety thresholds (Lenient, Balanced, Strict, Zero Tolerance).',
    latency: '12ms',
    accuracy: '99.8%',
    models: ['Multi-Objective Policy Arbiter', 'Human-in-the-Loop Triage Router'],
    features: [
      'Tier 1 (<15% Risk): Instant pass-through to real-time feed',
      'Tier 2 (15-70% Risk): Auto-warning banner & non-intrusive sentiment advisory',
      'Tier 3 (>70% Risk): Instant block popup with educational rationale',
      'Immediate routing to appeals queue for rapid user dispute resolution'
    ],
    sampleInput: 'Aggregated Risk Score: 88.5 / 100',
    sampleOutput: 'ACTION: Immediate Block + Real-Time Toast + Audit Log Entry'
  },
  enforcement: {
    id: 'enforcement',
    category: 'enforcement',
    name: 'Real-Time Autonomous Enforcement',
    title: 'Edge Interception & Telemetry Ledger',
    description:
      'Executes instant UI interventions (modal popups, toast warnings, feed blur) and writes immutable audit logs to the secure Supabase ledger.',
    latency: '18ms',
    accuracy: '100%',
    models: ['Supabase Row-Level Security Ledger', 'Edge Webhook Dispatcher', 'Real-Time State Bus'],
    features: [
      'Sub-second user alert popups with psychological cooldown rationale',
      'Immutable cryptographic moderation audit trail',
      'Live WebSocket sync to Admin Telemetry Dashboard',
      'Seamless user appeal submission flow'
    ],
    sampleInput: 'Enforcement Command: INTERCEPT_COMMENT',
    sampleOutput: 'UI Event: BlockedCommentModal rendered with toxicity breakdown'
  }
};

export const AIArchitecturePreviewPage: React.FC = () => {
  const { setCurrentPage, isAuthenticated, currentUser } = useApp();
  const [selectedNodeId, setSelectedNodeId] = useState<string>('ingestion');

  const selectedNode = ARCHITECTURE_NODES[selectedNodeId] || ARCHITECTURE_NODES.ingestion;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white pb-24">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-10 left-1/4 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[160px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[150px]" />
        <div className="absolute bottom-10 left-1/3 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[170px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-12">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(isAuthenticated ? 'home' : 'landing')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-purple-400" />
            <span>{isAuthenticated ? 'Back to Home Feed' : 'Back to Welcome Page'}</span>
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Neural Sentinel v2.5 Online • 99.4% Uptime</span>
          </div>
        </div>

        {/* Hero Header */}
        <div className="text-center max-w-4xl mx-auto space-y-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold tracking-wide"
          >
            <Cpu className="w-4 h-4 text-purple-400" />
            <span>VERIXA AUTONOMOUS SAFETY PIPELINE</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight"
          >
            AI Neural Defense{' '}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
              Architecture
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed"
          >
            Explore how VERIXA’s multi-tier deep neural network inspects, classifies, and neutralizes cyberbullying, hate speech, deepfakes, and harassment in real time.
          </motion.p>
        </div>

        {/* System Architecture Diagram (Interactive Data Flow Visualizer) */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
                <Layers className="w-4 h-4" /> Pipeline Dataflow Diagram
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Multi-Stage Neural Interception Pipeline
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Click any pipeline stage below to view its neural architecture, machine learning models, and live test specs.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Selected Layer:</span>
              <span className="px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-bold uppercase">
                {selectedNode.name}
              </span>
            </div>
          </div>

          {/* Flow Diagram Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 relative">
            {/* Step 1: Input Ingestion (Interactive) */}
            <button
              onClick={() => setSelectedNodeId('ingestion')}
              className={`p-5 rounded-2xl text-left flex flex-col justify-between space-y-4 transition cursor-pointer relative overflow-hidden ${
                selectedNodeId === 'ingestion'
                  ? 'bg-blue-950/40 border-2 border-blue-400 shadow-xl shadow-blue-950/50'
                  : 'bg-slate-900/60 border border-slate-800 hover:border-blue-500/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-400 tracking-wider uppercase">STAGE 01</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-300">
                    GATEWAY
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 w-fit">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-base">Interaction Inflow</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Comments, posts, reels, stories, and profile updates stream into the platform.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>TLS 1.3 Ingestion</span>
                <span className="text-blue-400 font-bold">0.4ms</span>
              </div>
            </button>

            {/* Step 2: NLP Core (Interactive) */}
            <button
              onClick={() => setSelectedNodeId('nlp')}
              className={`p-5 rounded-2xl text-left flex flex-col justify-between space-y-4 transition cursor-pointer relative overflow-hidden ${
                selectedNodeId === 'nlp'
                  ? 'bg-purple-950/40 border-2 border-purple-400 shadow-xl shadow-purple-950/50'
                  : 'bg-slate-900/60 border border-slate-800 hover:border-purple-500/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-purple-400 tracking-wider uppercase">STAGE 02A</span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-[10px] font-bold text-purple-300">
                    NLP
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 w-fit">
                  <Languages className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-base">Multilingual NLP</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Deep sentiment, Hinglish slang, cyberbullying, and threat classification.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Latency</span>
                <span className="text-purple-400 font-bold">36ms</span>
              </div>
            </button>

            {/* Step 3: Vision Core (Interactive) */}
            <button
              onClick={() => setSelectedNodeId('vision')}
              className={`p-5 rounded-2xl text-left flex flex-col justify-between space-y-4 transition cursor-pointer relative overflow-hidden ${
                selectedNodeId === 'vision'
                  ? 'bg-indigo-950/40 border-2 border-indigo-400 shadow-xl shadow-indigo-950/50'
                  : 'bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase">STAGE 02B</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-300">
                    VISION
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 w-fit">
                  <ScanEye className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-base">Vision & Deepfake AI</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Face-swap artifact detection, NSFW filter, and embedded meme OCR scan.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Accuracy</span>
                <span className="text-indigo-400 font-bold">98.9%</span>
              </div>
            </button>

            {/* Step 4: Policy Arbiter (Interactive) */}
            <button
              onClick={() => setSelectedNodeId('arbitration')}
              className={`p-5 rounded-2xl text-left flex flex-col justify-between space-y-4 transition cursor-pointer relative overflow-hidden ${
                selectedNodeId === 'arbitration'
                  ? 'bg-pink-950/40 border-2 border-pink-400 shadow-xl shadow-pink-950/50'
                  : 'bg-slate-900/60 border border-slate-800 hover:border-pink-500/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-pink-400 tracking-wider uppercase">STAGE 03</span>
                  <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-[10px] font-bold text-pink-300">
                    POLICY
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-pink-500/10 text-pink-400 w-fit">
                  <Scale className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-base">Decision Arbiter</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Triages toxicity scores against zero-tolerance rules and safety thresholds.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Threshold</span>
                <span className="text-pink-400 font-bold">Triple-Tier</span>
              </div>
            </button>

            {/* Step 5: Real-time Enforcement (Interactive) */}
            <button
              onClick={() => setSelectedNodeId('enforcement')}
              className={`p-5 rounded-2xl text-left flex flex-col justify-between space-y-4 transition cursor-pointer relative overflow-hidden ${
                selectedNodeId === 'enforcement'
                  ? 'bg-emerald-950/40 border-2 border-emerald-400 shadow-xl shadow-emerald-950/50'
                  : 'bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">STAGE 04</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-300">
                    ACTION
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-base">Instant Enforcement</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Instant block modal intercept, feed quarantine, and Supabase audit logging.
                </p>
              </div>
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Result</span>
                <span className="text-emerald-400 font-bold">100% Intercept</span>
              </div>
            </button>
          </div>

          {/* Deep-Dive Inspector Panel for Selected Node */}
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedNode.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-purple-500/30 backdrop-blur-xl shadow-2xl space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                      ARCHITECTURE SPECIFICATION
                    </span>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-white">{selectedNode.title}</h3>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Latency: </span>
                    <span className="text-purple-400 font-bold">{selectedNode.latency}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Accuracy: </span>
                    <span className="text-emerald-400 font-bold">{selectedNode.accuracy}</span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed max-w-4xl">{selectedNode.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Models & Features */}
                <div className="space-y-4">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Core Neural Capabilities
                  </h5>
                  <div className="space-y-2">
                    {selectedNode.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-2">
                    Models & Algorithms
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedNode.models.map((model, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-purple-300"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Right: Sample Execution Flow */}
                <div className="space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Telemetry Execution Trace
                  </h5>
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] block">PAYLOAD INGESTION:</span>
                      <span className="text-slate-200">{selectedNode.sampleInput}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-900">
                      <span className="text-purple-400 text-[10px] block">AI SENTINEL DECISION:</span>
                      <span className="text-emerald-300 font-semibold">{selectedNode.sampleOutput}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 4 Core Pillars of VERIXA AI Platform */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="p-6 rounded-3xl bg-slate-900/50 border border-purple-500/20 space-y-3">
            <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-400 w-fit">
              <Languages className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white text-base">Hinglish & Multi-Dialect</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Standard moderation tools fail on romanized Indian slang. VERIXA's model understands colloquial Hinglish context with 99.4% accuracy.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/50 border border-purple-500/20 space-y-3">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 w-fit">
              <ScanEye className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white text-base">Deepfake Frequency Scan</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Diffusion and GAN synthetic face-swaps produce micro-spectral frequency patterns that our vision transformer flags before feeds refresh.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/50 border border-purple-500/20 space-y-3">
            <div className="p-3 rounded-2xl bg-pink-500/10 text-pink-400 w-fit">
              <Activity className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white text-base">Real-Time Trust Badges</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every user account earns an AI Safety Score (0-100). Constructive users receive Verified Human Badges, deterring coordinated troll swarms.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/50 border border-purple-500/20 space-y-3">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 w-fit">
              <Scale className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white text-base">Fair Dispute Appeals</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Users can challenge false positives with one click. Appeals enter the Admin Triage station for human-in-the-loop review within hours.
            </p>
          </div>
        </div>

        {/* Bottom CTA: Ready to Explore */}
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-slate-900/90 to-purple-950/50 border border-purple-500/30 text-center space-y-6 relative overflow-hidden shadow-2xl">
          <div className="p-4 rounded-3xl bg-purple-500/10 border border-purple-500/30 text-purple-300 w-fit mx-auto shadow-xl shadow-purple-900/30">
            <Sparkles className="w-10 h-10 text-purple-400 animate-pulse" />
          </div>

          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
              Ready to Explore Safe Social Media?
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Join thousands of creators and users protected by autonomous multi-layer neural defense. Connect, post, share stories, and explore content with zero cyberbullying and deepfake defense.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl mx-auto text-xs text-slate-300">
            <span className="px-3 py-1 rounded-full bg-slate-950/80 border border-purple-500/20 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Zero Cyberbullying
            </span>
            <span className="px-3 py-1 rounded-full bg-slate-950/80 border border-purple-500/20 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Deepfake & NSFW Shield
            </span>
            <span className="px-3 py-1 rounded-full bg-slate-950/80 border border-purple-500/20 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> AI Verified Human Badges
            </span>
            <span className="px-3 py-1 rounded-full bg-slate-950/80 border border-purple-500/20 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" /> Sub-50ms Real-Time Guard
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={() => setCurrentPage(isAuthenticated ? 'home' : 'signup')}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-base shadow-xl shadow-purple-900/50 hover:scale-105 transition transform flex items-center gap-2 cursor-pointer"
            >
              <span>{isAuthenticated ? 'Explore Home Feed' : 'Ready to Explore • Get Started'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            {!isAuthenticated ? (
              <button
                onClick={() => setCurrentPage('login')}
                className="px-8 py-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-purple-500/30 hover:border-purple-400 text-white font-semibold text-base backdrop-blur-xl transition cursor-pointer"
              >
                Log In to Account
              </button>
            ) : (
              <button
                onClick={() => setCurrentPage('ai-dashboard')}
                className="px-8 py-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-purple-500/30 hover:border-purple-400 text-white font-semibold text-base backdrop-blur-xl transition cursor-pointer"
              >
                Open Live AI Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
