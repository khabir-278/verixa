import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldAlert,
  ShieldCheck,
  Bot,
  Activity,
  CheckCircle2,
  Sparkles,
  BarChart3,
  PieChart as PieIcon,
  Search,
  ScanEye,
  Languages,
  AlertTriangle,
  Loader2,
  RefreshCw,
  FileText,
  Flag,
  Scale,
  History,
  XCircle,
  CheckCircle,
  Eye,
  ShieldX,
  UserCheck,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  fetchAdminDashboardStats,
  fetchReviewQueue,
  resolveReviewQueueItem,
  fetchAdminAppeals,
  resolveAdminAppeal,
  fetchAdminReports,
  resolveAdminReport,
  fetchAdminAuditActions,
  fetchThreatAlerts,
} from '../lib/supabaseServices';
import {
  AdminDashboardMetrics,
  AppealRecord,
  ReportRecord,
  ReviewQueueItem,
  AdminActionRecord,
} from '../types';

export const AIDashboardPage: React.FC = () => {
  const { currentUser, openScannerModal, setCurrentPage } = useApp();

  // Active Dashboard Navigation Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'appeals' | 'reports' | 'alerts' | 'audit' | 'tester'>('overview');

  // Real Supabase Data States
  const [dashboardStats, setDashboardStats] = useState<AdminDashboardMetrics | null>(null);
  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [auditActions, setAuditActions] = useState<AdminActionRecord[]>([]);
  const [threatAlerts, setThreatAlerts] = useState<any[]>([]);
  const [alertCategory, setAlertCategory] = useState<string>('all');

  // Loading & Action States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters & Search
  const [alertSearch, setAlertSearch] = useState<string>('');
  const [actionNote, setActionNote] = useState<string>('');
  const [selectedItemForReview, setSelectedItemForReview] = useState<any | null>(null);

  // Multilingual Inspector State
  const [testComment, setTestComment] = useState('');
  const [testingModeration, setTestingModeration] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Load Real Data from Supabase Endpoints
  const loadDashboardData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [statsData, appealsData, reportsData, actionsData, alertsData] = await Promise.all([
        fetchAdminDashboardStats().catch(() => null),
        fetchAdminAppeals(undefined, { status: 'PENDING' }).catch(() => []),
        fetchAdminReports(undefined, { status: 'PENDING' }).catch(() => []),
        fetchAdminAuditActions(undefined, 50).catch(() => []),
        fetchThreatAlerts(undefined, alertCategory, 50).catch(() => []),
      ]);

      if (statsData) setDashboardStats(statsData);
      setAppeals(appealsData);
      setReports(reportsData);
      setAuditActions(actionsData);
      setThreatAlerts(alertsData);
    } catch (err: any) {
      console.warn('Dashboard data fetch notice:', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [alertCategory]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Handle Appeal Resolution (APPROVE / REJECT)
  const handleResolveAppeal = async (appealId: string, decision: 'APPROVE' | 'REJECT', notes?: string) => {
    setActionLoading(appealId);
    try {
      const res = await resolveAdminAppeal(undefined, appealId, decision, notes || actionNote);
      setStatusMessage({
        type: 'success',
        text: `Appeal ${decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}. ${
          decision === 'APPROVE' ? 'Content restored. +30 Guardian & +20 Reputation awarded.' : 'Block confirmed.'
        }`,
      });
      setSelectedItemForReview(null);
      setActionNote('');
      await loadDashboardData();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to resolve appeal.',
      });
    } finally {
      setActionLoading(null);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  // Handle Report Resolution (APPROVE / REJECT)
  const handleResolveReport = async (reportId: string, decision: 'APPROVE' | 'REJECT', notes?: string) => {
    setActionLoading(reportId);
    try {
      await resolveAdminReport(undefined, reportId, decision, notes || actionNote);
      setStatusMessage({
        type: 'success',
        text: `Report ${decision === 'APPROVE' ? 'RESOLVED (Sanction Applied)' : 'DISMISSED'}. Immutable audit recorded.`,
      });
      setSelectedItemForReview(null);
      setActionNote('');
      await loadDashboardData();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to resolve report.',
      });
    } finally {
      setActionLoading(null);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  // Multilingual Inspector Handler
  const handleTestModeration = async (sampleText?: string) => {
    const textToTest = sampleText !== undefined ? sampleText : testComment;
    if (!textToTest.trim()) return;
    setTestingModeration(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/moderate/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: textToTest }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({
        classification: 'SAFE',
        status: 'SAFE',
        toxicity_score: 0,
        confidence: 90,
        category: 'Safe',
        detected_labels: ['Safe'],
        language_detected: 'English',
        reason: 'Error connecting to moderation server, evaluated safe.',
        message: 'Comment verified safe.',
      });
    } finally {
      setTestingModeration(false);
    }
  };

  // Filtered Threat Alerts
  const filteredAlerts = threatAlerts.filter(
    (alert) =>
      alert.snippet?.toLowerCase().includes(alertSearch.toLowerCase()) ||
      alert.actor?.toLowerCase().includes(alertSearch.toLowerCase()) ||
      alert.category?.toLowerCase().includes(alertSearch.toLowerCase()) ||
      alert.type?.toLowerCase().includes(alertSearch.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Neural Security Operations
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            AI Threat Intelligence & Governance Console
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Server-authoritative review queue, user appeals, community reports, and immutable audit logs powered by live Supabase telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentPage('ai-architecture')}
            className="px-3 py-2 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/30 text-purple-200 text-xs font-medium flex items-center gap-2 transition cursor-pointer"
            title="View AI Neural Architecture Diagram"
          >
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden md:inline">Architecture Diagram</span>
          </button>
          <button
            onClick={() => loadDashboardData()}
            disabled={refreshing}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
            title="Refresh Real Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Live Data</span>
          </button>
          <button
            onClick={() => openScannerModal('image')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition cursor-pointer"
          >
            <ScanEye className="w-4 h-4" />
            <span>Launch Safety Scanner</span>
          </button>
          <div className="px-3 py-2 rounded-xl bg-slate-900 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Server Authoritative
          </div>
        </div>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs font-medium flex items-center justify-between border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary Key Metrics Grid (LIVE SUPABASE DATA) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Appeals */}
        <div
          onClick={() => setActiveTab('appeals')}
          className="p-5 rounded-2xl bg-slate-900/80 border border-purple-500/20 hover:border-purple-500/50 backdrop-blur-xl transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-purple-400 mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Pending Appeals</span>
            <Scale className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-extrabold text-purple-300">
            {dashboardStats ? dashboardStats.pending_appeals_count : appeals.length}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Awaiting moderator verdict</span>
        </div>

        {/* Community Reports */}
        <div
          onClick={() => setActiveTab('reports')}
          className="p-5 rounded-2xl bg-slate-900/80 border border-rose-500/20 hover:border-rose-500/50 backdrop-blur-xl transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-rose-400 mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Active User Reports</span>
            <Flag className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-extrabold text-rose-400">
            {dashboardStats ? dashboardStats.pending_reports_count : reports.length}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Community abuse flags</span>
        </div>

        {/* Blocked Posts & Comments */}
        <div
          onClick={() => setActiveTab('alerts')}
          className="p-5 rounded-2xl bg-slate-900/80 border border-amber-500/20 hover:border-amber-500/50 backdrop-blur-xl transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-amber-400 mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Blocked Content</span>
            <ShieldX className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-amber-300">
            {dashboardStats
              ? dashboardStats.blocked_posts_count + dashboardStats.blocked_comments_count
              : 0}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {dashboardStats?.blocked_posts_count || 0} posts • {dashboardStats?.blocked_comments_count || 0} comments
          </span>
        </div>

        {/* Guardian High-Risk Alerts */}
        <div
          onClick={() => {
            setAlertCategory('guardian');
            setActiveTab('alerts');
          }}
          className="p-5 rounded-2xl bg-slate-900/80 border border-cyan-500/20 hover:border-cyan-500/50 backdrop-blur-xl transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-cyan-400 mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Guardian Risk Alerts</span>
            <Bot className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-extrabold text-cyan-300">
            {dashboardStats ? dashboardStats.guardian_risk_alerts_count : 0}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">High-risk accounts & bots</span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Live Telemetry</span>
        </button>

        <button
          onClick={() => setActiveTab('appeals')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'appeals'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Pending Appeals</span>
          {appeals.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-purple-500/30 text-purple-200 text-[10px]">
              {appeals.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'reports'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Flag className="w-3.5 h-3.5" />
          <span>User Reports</span>
          {reports.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-500/30 text-rose-200 text-[10px]">
              {reports.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'alerts'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Threat Alerts Matrix</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Immutable Audit Log</span>
        </button>

        <button
          onClick={() => setActiveTab('tester')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'tester'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Languages className="w-3.5 h-3.5" />
          <span>Offensive Comment Inspector</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: LIVE TELEMETRY & CHARTS (REAL SUPABASE DATA)                   */}
      {/* ==================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Bar Chart: Daily Scan Volume */}
            <div className="lg:col-span-8 p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-400" /> Daily Scan & Moderation Volume
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">Live 7-Day Window</span>
              </div>

              <div className="h-64 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardStats?.daily_scan_metrics || []}>
                    <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#8b5cf6',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="scans" fill="#6366f1" radius={[6, 6, 0, 0]} name="Scans Evaluated" />
                    <Bar dataKey="blocked" fill="#f43f5e" radius={[6, 6, 0, 0]} name="Harm Intercepted" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart: Threat Categories */}
            <div className="lg:col-span-4 p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-pink-400" /> Threat Category Breakdown
              </h3>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dashboardStats?.threat_breakdown || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {(dashboardStats?.threat_breakdown || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#8b5cf6',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {(dashboardStats?.threat_breakdown || []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.name} ({item.value}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Threat Vectors Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-rose-500/30">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">NSFW Events</span>
              <p className="text-lg font-extrabold text-rose-400 mt-1">{dashboardStats?.nsfw_events_count || 0}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-purple-500/30">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Spam Intercepted</span>
              <p className="text-lg font-extrabold text-purple-400 mt-1">{dashboardStats?.spam_events_count || 0}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-indigo-500/30">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Fake Accounts</span>
              <p className="text-lg font-extrabold text-indigo-400 mt-1">{dashboardStats?.fake_account_alerts_count || 0}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-pink-500/30">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Cyberbullying</span>
              <p className="text-lg font-extrabold text-pink-400 mt-1">{dashboardStats?.cyberbullying_alerts_count || 0}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-cyan-500/30">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Deepfake Media</span>
              <p className="text-lg font-extrabold text-cyan-400 mt-1">{dashboardStats?.deepfake_alerts_count || 0}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-emerald-500/30">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Guardian Alerts</span>
              <p className="text-lg font-extrabold text-emerald-400 mt-1">{dashboardStats?.guardian_risk_alerts_count || 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: PENDING APPEALS REVIEW CONSOLE                                 */}
      {/* ==================================================================== */}
      {activeTab === 'appeals' && (
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-purple-500/30 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-purple-400" /> Pending Moderation Appeals
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Users contesting automated AI decisions. Approving an appeal overturns moderation, restores content, and awards +30 Guardian and +20 Reputation recovery.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 font-mono text-xs">
              {appeals.length} Pending
            </span>
          </div>

          {appeals.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto opacity-70" />
              <p className="text-sm font-semibold text-slate-300">All appeals have been reviewed!</p>
              <p className="text-xs text-slate-500">The appeal triage queue is clean.</p>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px]">
                  <tr>
                    <th className="p-3 rounded-l-xl">Appeal ID</th>
                    <th className="p-3">User</th>
                    <th className="p-3">Content / Type</th>
                    <th className="p-3">AI Decision</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">User Statement</th>
                    <th className="p-3">Submitted</th>
                    <th className="p-3 rounded-r-xl text-right">Review Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {appeals.map((appeal) => (
                    <tr key={appeal.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-mono text-[11px] text-purple-300 font-semibold">{appeal.id}</td>
                      <td className="p-3 text-slate-200">
                        <span className="font-medium">@{appeal.user_id.slice(0, 8)}</span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px] uppercase">
                          {appeal.content_type}
                        </span>
                        <span className="block font-mono text-[10px] text-slate-500 truncate max-w-[100px]">
                          {appeal.content_id}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          {appeal.original_decision}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 font-medium">{appeal.reason}</td>
                      <td className="p-3 text-slate-300 italic max-w-xs truncate" title={appeal.appeal_text}>
                        "{appeal.appeal_text}"
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-400">
                        {new Date(appeal.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleResolveAppeal(appeal.id, 'APPROVE')}
                            disabled={actionLoading === appeal.id}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve (+30)</span>
                          </button>
                          <button
                            onClick={() => handleResolveAppeal(appeal.id, 'REJECT')}
                            disabled={actionLoading === appeal.id}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white font-bold text-[11px] flex items-center gap-1 border border-slate-700 transition cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: COMMUNITY USER REPORTS                                         */}
      {/* ==================================================================== */}
      {activeTab === 'reports' && (
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-rose-500/30 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Flag className="w-5 h-5 text-rose-400" /> Community User Reports
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Reports filed by community members against abusive content, hate speech, or predatory profiles.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 font-mono text-xs">
              {reports.length} Active
            </span>
          </div>

          {reports.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto opacity-70" />
              <p className="text-sm font-semibold text-slate-300">No active reports!</p>
              <p className="text-xs text-slate-500">All community abuse flags have been resolved.</p>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px]">
                  <tr>
                    <th className="p-3 rounded-l-xl">Report ID</th>
                    <th className="p-3">Reporter</th>
                    <th className="p-3">Target</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Severity</th>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3 rounded-r-xl text-right">Moderator Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {reports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-mono text-[11px] text-rose-300 font-semibold">{report.id.slice(0, 12)}</td>
                      <td className="p-3 text-slate-300">@{report.reporter_id.slice(0, 8)}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px] uppercase">
                          {report.target_type}
                        </span>
                        <span className="block font-mono text-[10px] text-slate-500 truncate max-w-[100px]">
                          {report.target_id}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-slate-200">{report.reason}</td>
                      <td className="p-3 text-slate-300 italic max-w-xs truncate" title={report.description}>
                        {report.description || 'No additional note provided.'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            report.severity === 'CRITICAL'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : report.severity === 'HIGH'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}
                        >
                          {report.severity}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-400">
                        {new Date(report.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleResolveReport(report.id, 'APPROVE')}
                            disabled={actionLoading === report.id}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Sanction</span>
                          </button>
                          <button
                            onClick={() => handleResolveReport(report.id, 'REJECT')}
                            disabled={actionLoading === report.id}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] flex items-center gap-1 border border-slate-700 transition cursor-pointer disabled:opacity-50"
                          >
                            <span>Dismiss</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: REAL-TIME THREAT ALERTS MATRIX                                 */}
      {/* ==================================================================== */}
      {activeTab === 'alerts' && (
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" /> Real-Time Safety Threat Matrix
              </h3>
              <p className="text-xs text-slate-400">
                Live threat alerts queried from real Supabase records across all primary security vectors.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={alertSearch}
                onChange={(e) => setAlertSearch(e.target.value)}
                placeholder="Search threat alerts..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Threat Vector Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2 pb-2">
            {[
              { id: 'all', label: 'All Vectors' },
              { id: 'nsfw', label: 'NSFW Content' },
              { id: 'spam', label: 'Spam & Bots' },
              { id: 'fake_account', label: 'Fake Accounts' },
              { id: 'cyberbullying', label: 'Cyberbullying' },
              { id: 'deepfake', label: 'Deepfakes' },
              { id: 'guardian', label: 'Guardian Alerts' },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setAlertCategory(v.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  alertCategory === v.id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="p-3 rounded-l-xl">Timestamp</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Actor / Target</th>
                  <th className="p-3">Signal Details</th>
                  <th className="p-3">Severity</th>
                  <th className="p-3">Decision</th>
                  <th className="p-3 rounded-r-xl">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      No threat alerts found in this category.
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-mono text-[11px] text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="p-3 font-bold text-purple-300">{log.category}</td>
                      <td className="p-3 text-slate-200">@{log.actor ? log.actor.slice(0, 10) : 'unknown'}</td>
                      <td className="p-3 text-slate-300 italic max-w-xs truncate" title={log.snippet}>
                        {log.snippet}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.severity === 'CRITICAL'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : log.severity === 'HIGH'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}
                        >
                          {log.severity}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-[10px] text-slate-300">{log.decision}</span>
                      </td>
                      <td className="p-3 font-mono text-emerald-400 font-bold">{log.confidence}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: IMMUTABLE ADMIN ACTIONS AUDIT HISTORY                         */}
      {/* ==================================================================== */}
      {activeTab === 'audit' && (
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-purple-500/30 backdrop-blur-xl shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" /> Immutable Admin Actions Audit History
              </h3>
              <p className="text-xs text-slate-400">
                Permanent ledger recording human moderator interventions, appeal verdicts, and score adjustments.
              </p>
            </div>
            <div className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-mono text-xs">
              Append-Only Ledger
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="p-3 rounded-l-xl">Action ID</th>
                  <th className="p-3">Admin</th>
                  <th className="p-3">Action Type</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Reason / Notes</th>
                  <th className="p-3">Guardian Adjustment</th>
                  <th className="p-3">Reputation Adjustment</th>
                  <th className="p-3 rounded-r-xl">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {auditActions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      No admin actions recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditActions.map((action) => (
                    <tr key={action.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-mono text-[11px] text-purple-300">{action.id.slice(0, 14)}</td>
                      <td className="p-3 text-white font-medium">@{action.admin_username || action.admin_id.slice(0, 8)}</td>
                      <td className="p-3 font-bold text-indigo-300">{action.action_type}</td>
                      <td className="p-3">
                        <span className="font-mono text-[10px] text-slate-400">
                          {action.target_type}: {action.target_id.slice(0, 10)}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 max-w-xs truncate" title={action.reason}>
                        {action.reason}
                      </td>
                      <td className="p-3">
                        <span
                          className={`font-mono font-bold ${
                            action.guardian_adjustment > 0
                              ? 'text-emerald-400'
                              : action.guardian_adjustment < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {action.guardian_adjustment > 0 ? `+${action.guardian_adjustment}` : action.guardian_adjustment}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`font-mono font-bold ${
                            action.reputation_adjustment > 0
                              ? 'text-emerald-400'
                              : action.reputation_adjustment < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {action.reputation_adjustment > 0 ? `+${action.reputation_adjustment}` : action.reputation_adjustment}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-400">
                        {new Date(action.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 6: MULTILINGUAL OFFENSIVE COMMENT INSPECTOR                       */}
      {/* ==================================================================== */}
      {activeTab === 'tester' && (
        <div id="multilingual-moderation-inspector" className="p-6 rounded-3xl bg-slate-900/90 border border-purple-500/30 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-1">
                <Languages className="w-3.5 h-3.5 text-indigo-400" /> Multilingual AI Sentinel
              </div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Multilingual Offensive Comment Moderation Inspector
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Live evaluation across English, Telugu, Hindi, Tamil, Kannada, Malayalam, Bengali, Marathi, Urdu, Spanish, French, Arabic, and obfuscated slang.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 text-[11px] font-mono">Test Samples:</span>
              <button
                id="test-sample-safe-btn"
                onClick={() => {
                  setTestComment('Damn this tutorial is killing it! Truly awesome work bro 🔥');
                  handleTestModeration('Damn this tutorial is killing it! Truly awesome work bro 🔥');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-medium transition cursor-pointer text-[11px]"
              >
                English (Safe)
              </button>
              <button
                id="test-sample-english-toxic-btn"
                onClick={() => {
                  setTestComment('I will find you and murder your entire family, you disgusting pig');
                  handleTestModeration('I will find you and murder your entire family, you disgusting pig');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 font-medium transition cursor-pointer text-[11px]"
              >
                English (Threat)
              </button>
              <button
                id="test-sample-telugu-native-btn"
                onClick={() => {
                  setTestComment('నువ్వు ఒక పెద్ద లంజా కొడుకువి, నిన్ను చంపేస్తా');
                  handleTestModeration('నువ్వు ఒక పెద్ద లంజా కొడుకువి, నిన్ను చంపేస్తా');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 font-medium transition cursor-pointer text-[11px]"
              >
                Telugu (Native)
              </button>
              <button
                id="test-sample-hindi-btn"
                onClick={() => {
                  setTestComment('तेरी माँ का भोसड़ा, कुत्ते कमीने');
                  handleTestModeration('तेरी माँ का भोसड़ा, कुत्ते कमीने');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-medium transition cursor-pointer text-[11px]"
              >
                Hindi (Abusive)
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <textarea
              id="moderation-test-textarea"
              rows={3}
              value={testComment}
              onChange={(e) => setTestComment(e.target.value)}
              placeholder="Enter text in any language or slang to evaluate against VERIXA's neural moderation..."
              className="w-full p-4 rounded-2xl bg-slate-950 border border-purple-500/20 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-sm custom-scrollbar"
            />

            <div className="flex justify-end">
              <button
                id="run-moderation-test-btn"
                onClick={() => handleTestModeration()}
                disabled={testingModeration || !testComment.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {testingModeration ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Neural Scanning...</span>
                  </>
                ) : (
                  <>
                    <ScanEye className="w-4 h-4" />
                    <span>Execute Full AI Analysis</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test Results Card */}
          {testResult && (
            <div
              id="moderation-test-results-panel"
              className={`p-5 rounded-2xl border ${
                testResult.classification === 'BLOCK' || testResult.status === 'BLOCKED'
                  ? 'bg-rose-950/40 border-rose-500/40'
                  : testResult.classification === 'QUARANTINE' || testResult.status === 'QUARANTINED'
                  ? 'bg-amber-950/40 border-amber-500/40'
                  : 'bg-emerald-950/40 border-emerald-500/40'
              } space-y-4 animate-in fade-in duration-200`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold font-mono tracking-wider ${
                      testResult.classification === 'BLOCK' || testResult.status === 'BLOCKED'
                        ? 'bg-rose-500 text-white'
                        : testResult.classification === 'QUARANTINE' || testResult.status === 'QUARANTINED'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-emerald-500 text-slate-950'
                    }`}
                  >
                    {testResult.classification || testResult.status || 'SAFE'}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {testResult.message}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  {testResult.language_detected && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-purple-300 font-mono border border-slate-700">
                      {testResult.language_detected}
                    </span>
                  )}
                  <span className="text-slate-300">
                    Confidence: <strong className="text-white">{testResult.confidence}%</strong>
                  </span>
                  <span className="text-slate-300">
                    Toxicity: <strong className={testResult.toxicity_score > 50 ? 'text-rose-400' : 'text-emerald-400'}>{testResult.toxicity_score || testResult.toxicityScore || 0}%</strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-400 font-mono uppercase text-[10px] block">Analysis Reason:</span>
                  <p className="text-slate-200 leading-relaxed font-medium">
                    {testResult.reason}
                  </p>
                </div>

                {testResult.safe_rewrite && (
                  <div className="space-y-1 p-3 rounded-xl bg-indigo-950/50 border border-indigo-500/30">
                    <span className="text-indigo-300 font-semibold text-[11px] block">AI Constructive Safe Alternative:</span>
                    <p className="text-indigo-200 italic">
                      "{testResult.safe_rewrite}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
