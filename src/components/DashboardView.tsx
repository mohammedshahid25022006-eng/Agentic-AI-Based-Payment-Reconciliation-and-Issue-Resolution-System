import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Filter,
  Play,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NavSection, ReconciliationRun, TransactionRecord } from '../types';

interface DashboardViewProps {
  transactions: TransactionRecord[];
  latestRun: ReconciliationRun | null;
  uploadedFilesCount: number;
  reconciling: boolean;
  onStartReconciliation: () => void;
  onNavigate: (section: NavSection) => void;
  onLoadSamplesAndReconcile: () => void;
}

export function DashboardView({
  transactions,
  latestRun,
  uploadedFilesCount,
  reconciling,
  onStartReconciliation,
  onNavigate,
  onLoadSamplesAndReconcile,
}: DashboardViewProps) {
  const [dateFilter, setDateFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [merchantFilter, setMerchantFilter] = useState('');

  const availableDates = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.tx_date))).sort(),
    [transactions]
  );
  const availableMethods = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.payment_method))).sort(),
    [transactions]
  );

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (dateFilter !== 'all' && t.tx_date !== dateFilter) return false;
      if (methodFilter !== 'all' && t.payment_method !== methodFilter) return false;
      if (statusFilter !== 'all' && t.matching_status !== statusFilter) return false;
      if (riskFilter !== 'all' && t.risk_level !== riskFilter) return false;
      if (
        merchantFilter.trim() &&
        !t.merchant_name.toLowerCase().includes(merchantFilter.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [transactions, dateFilter, methodFilter, statusFilter, riskFilter, merchantFilter]);

  const metrics = useMemo(() => {
    let matched = 0;
    let unmatched = 0;
    let duplicate = 0;
    let suspicious = 0;
    let reconciledAmount = 0;
    let pendingIssues = 0;

    const riskBuckets = { 'Low Risk': 0, 'Medium Risk': 0, 'High Risk': 0 };
    const sourceMap = new Map<string, { source: string; matched: number; unmatched: number; amount: number }>();
    const dateMap = new Map<string, { date: string; matched: number; unmatched: number; amount: number }>();

    for (const t of filtered) {
      if (t.matching_status === 'Matched') {
        matched++;
        if (!t.is_duplicate && !t.is_suspicious) reconciledAmount += t.amount;
      } else if (t.matching_status === 'Unmatched') {
        unmatched++;
      }

      if (t.is_duplicate) duplicate++;
      if (t.is_suspicious) suspicious++;

      if (t.risk_level in riskBuckets) {
        riskBuckets[t.risk_level]++;
      }

      const unresolved = t.resolution_status !== 'Resolved' && t.resolution_status !== 'Approved';
      if (
        unresolved &&
        (t.matching_status === 'Unmatched' || t.is_duplicate || t.is_suspicious || t.hitl_required)
      ) {
        pendingIssues++;
      }

      const src = sourceMap.get(t.source) ?? {
        source: t.source,
        matched: 0,
        unmatched: 0,
        amount: 0,
      };
      if (t.matching_status === 'Matched') src.matched++;
      else src.unmatched++;
      src.amount += t.amount;
      sourceMap.set(t.source, src);

      const dt = dateMap.get(t.tx_date) ?? {
        date: t.tx_date,
        matched: 0,
        unmatched: 0,
        amount: 0,
      };
      if (t.matching_status === 'Matched') dt.matched++;
      else dt.unmatched++;
      dt.amount += t.amount;
      dateMap.set(t.tx_date, dt);
    }

    const statusPie = [
      { name: 'Matched', value: matched, color: '#0d9488' },
      { name: 'Unmatched', value: unmatched, color: '#d97706' },
      { name: 'Duplicates', value: duplicate, color: '#dc2626' },
      { name: 'Suspicious', value: suspicious, color: '#4f46e5' },
    ].filter((d) => d.value > 0);

    const riskBars = [
      { name: 'Low Risk', count: riskBuckets['Low Risk'], fill: '#0d9488' },
      { name: 'Medium Risk', count: riskBuckets['Medium Risk'], fill: '#d97706' },
      { name: 'High Risk', count: riskBuckets['High Risk'], fill: '#dc2626' },
    ];

    return {
      total: filtered.length,
      matched,
      unmatched,
      duplicate,
      suspicious,
      reconciledAmount,
      pendingIssues,
      statusPie,
      riskBars,
      bySource: Array.from(sourceMap.values()),
      byDate: Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [filtered]);

  if (transactions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-3xl mx-auto mt-6">
        <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center mx-auto text-sky-700">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900 font-display">
          No financial statements uploaded yet
        </h2>
        <p className="mt-2 text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
          Upload Bank Statements, UPI payment histories, Wallet exports, Receipts, or Invoices to activate the Supervisor Agent and seven specialized reconciliation agents.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('upload')}
            className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          >
            <UploadCloud className="w-4 h-4" />
            Upload Financial Data
          </button>
          <button
            type="button"
            disabled={reconciling}
            onClick={onLoadSamplesAndReconcile}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Play className="w-4 h-4" />
            {reconciling ? 'Running Sample Pipeline...' : 'Load Sample Datasets & Reconcile'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">
            Reconciliation Summary
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{uploadedFilesCount} file(s) ingested</span>
            <span aria-hidden="true">·</span>
            <span>
              {latestRun
                ? `Last run ${latestRun.id} (${latestRun.status})`
                : 'Awaiting initial reconciliation run'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            Inspect Ledger
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={reconciling}
            onClick={onStartReconciliation}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            {reconciling ? 'Agents Running...' : 'Start Reconciliation'}
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-3">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          Dashboard Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="dash-date" className="block text-xs text-slate-500 mb-1">
              Date
            </label>
            <select
              id="dash-date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="all">All Dates</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dash-method" className="block text-xs text-slate-500 mb-1">
              Payment Method
            </label>
            <select
              id="dash-method"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="all">All Methods</option>
              {availableMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dash-status" className="block text-xs text-slate-500 mb-1">
              Matching Status
            </label>
            <select
              id="dash-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="all">All Statuses</option>
              <option value="Matched">Matched</option>
              <option value="Unmatched">Unmatched</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div>
            <label htmlFor="dash-risk" className="block text-xs text-slate-500 mb-1">
              Risk Category
            </label>
            <select
              id="dash-risk"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="all">All Risk Levels</option>
              <option value="Low Risk">Low Risk</option>
              <option value="Medium Risk">Medium Risk</option>
              <option value="High Risk">High Risk</option>
            </select>
          </div>
          <div>
            <label htmlFor="dash-merchant" className="block text-xs text-slate-500 mb-1">
              Merchant Search
            </label>
            <input
              id="dash-merchant"
              type="text"
              value={merchantFilter}
              onChange={(e) => setMerchantFilter(e.target.value)}
              placeholder="Filter merchant..."
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Total Transactions</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.total}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Matched
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.matched}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" />
            Unmatched
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.unmatched}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700">
            <Copy className="w-3.5 h-3.5" />
            Duplicates
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.duplicate}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700">
            <ShieldAlert className="w-3.5 h-3.5" />
            Suspicious
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.suspicious}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Reconciled Volume</div>
          <div className="mt-2 text-xl font-bold text-slate-900 font-mono tabular-nums">
            ₹{metrics.reconciledAmount.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Pending Issues</div>
          <div className="mt-2 text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {metrics.pendingIssues}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart: Reconciliation Classification */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Reconciliation Status Breakdown
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribution of verified matches, unmatched items, duplicates, and suspicious flags
          </p>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={
                    metrics.statusPie.length > 0
                      ? metrics.statusPie
                      : [{ name: 'Pending', value: metrics.total, color: '#94a3b8' }]
                  }
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={88}
                  paddingAngle={2}
                >
                  {(metrics.statusPie.length > 0
                    ? metrics.statusPie
                    : [{ name: 'Pending', value: metrics.total, color: '#94a3b8' }]
                  ).map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart: Risk Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Risk Score Classification
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Rule-based anomaly distribution across Low (0-34), Medium (35-69), and High (70-100)
          </p>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.riskBars} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip />
                <Bar dataKey="count" name="Transactions" radius={[6, 6, 0, 0]}>
                  {metrics.riskBars.map((b) => (
                    <Cell key={b.name} fill={b.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Line / Area Chart: Daily Settlement & Mismatch Trend */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Daily Matched vs. Unmatched Trend
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Chronological settlement verification across uploaded dates
          </p>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.byDate} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="matched"
                  name="Matched"
                  stroke="#0d9488"
                  fill="#ccfbf1"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="unmatched"
                  name="Unmatched / Pending"
                  stroke="#d97706"
                  fill="#fef3c7"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart: Cross-Source Comparison */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Transactions by Payment Source
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Matched vs. unmatched transaction counts across uploaded sources
          </p>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.bySource} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="source" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="matched" name="Matched" stackId="a" fill="#0d9488" />
                <Bar dataKey="unmatched" name="Unmatched" stackId="a" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
