import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { apiDownload, apiFetch } from '../api';

interface ReportSummaryResponse {
  generatedAt: string;
  userName: string;
  organization: string;
  summary: {
    totalTransactions: number;
    matchedTransactions: number;
    unmatchedTransactions: number;
    duplicateTransactions: number;
    suspiciousTransactions: number;
    totalAmount: number;
    reconciledAmount: number;
    resolvedIssues: number;
    pendingIssues: number;
    hitlQueueCount: number;
  };
  transactions: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
}

export function ReportsView() {
  const [report, setReport] = useState<ReportSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<ReportSummaryResponse>('/api/reports/summary')
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (format: 'pdf' | 'csv' | 'xlsx') => {
    setDownloading(format);
    setError(null);
    try {
      const ext = format === 'xlsx' ? 'xlsx' : format;
      await apiDownload(
        `/api/reports/export?format=${format}`,
        `reconai-report.${ext}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
        Compiling live reconciliation summary and audit trail...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-red-700">
        {error || 'Unable to load report data.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Export Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">
            Final Reconciliation &amp; Issue Resolution Report
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            {report.organization} · Analyst: {report.userName} · Compiled{' '}
            {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload('pdf')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            {downloading === 'pdf' ? 'Generating PDF...' : 'Download PDF'}
          </button>
          <button
            type="button"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload('csv')}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            {downloading === 'csv' ? 'Generating CSV...' : 'Download CSV'}
          </button>
          <button
            type="button"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload('xlsx')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {downloading === 'xlsx' ? 'Generating Excel...' : 'Download Excel (.xlsx)'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Executive Summary Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 font-display mb-4">
          01. Executive Summary Metrics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-slate-500">Total Transactions</div>
            <div className="mt-1 text-xl font-bold font-mono text-slate-900">
              {report.summary.totalTransactions}
            </div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-slate-500">Matched / Unmatched</div>
            <div className="mt-1 text-xl font-bold font-mono text-slate-900">
              <span className="text-teal-700">{report.summary.matchedTransactions}</span> /{' '}
              <span className="text-amber-700">{report.summary.unmatchedTransactions}</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-slate-500">Duplicate / Suspicious</div>
            <div className="mt-1 text-xl font-bold font-mono text-slate-900">
              <span className="text-red-700">{report.summary.duplicateTransactions}</span> /{' '}
              <span className="text-indigo-700">{report.summary.suspiciousTransactions}</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-slate-500">Reconciled Amount</div>
            <div className="mt-1 text-lg font-bold font-mono text-slate-900">
              ₹{report.summary.reconciledAmount.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-slate-500">Resolved / Pending Issues</div>
            <div className="mt-1 text-xl font-bold font-mono text-slate-900">
              <span className="text-teal-700">{report.summary.resolvedIssues}</span> /{' '}
              <span className="text-amber-700">{report.summary.pendingIssues}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Investigation & Recommended Actions Preview */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 font-display">
            02. Investigation Results, Risk Analysis &amp; Recommended Actions ({report.transactions.length})
          </h3>
        </div>
        {report.transactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No transactions available yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4">Transaction ID</th>
                  <th className="py-3 px-4">Merchant</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Match</th>
                  <th className="py-3 px-4 text-right">Risk</th>
                  <th className="py-3 px-4">Recommended Action</th>
                  <th className="py-3 px-4">Resolution Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.transactions.slice(0, 25).map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                      {String(t.transaction_id)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-800">{String(t.merchant_name)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {String(t.currency)} {Number(t.amount).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4">{String(t.matching_status)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {String(t.risk_score)} ({String(t.risk_level)})
                    </td>
                    <td className="py-2.5 px-4">{String(t.recommended_action || '-')}</td>
                    <td className="py-2.5 px-4 font-semibold">{String(t.resolution_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Trail Preview */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 font-display">
            03. Included Audit Trail ({report.auditLogs.length} entries)
          </h3>
        </div>
        {report.auditLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No audit entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Actor / Agent</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.auditLogs.slice(0, 15).map((a, i) => (
                  <tr key={i}>
                    <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(String(a.created_at)).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {String(a.user_name)} ({String(a.source_agent)})
                    </td>
                    <td className="py-2.5 px-4 text-slate-800">{String(a.action)}</td>
                    <td className="py-2.5 px-4 text-slate-600">{String(a.notes || '-')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
