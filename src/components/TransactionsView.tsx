import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileWarning,
  Search,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { apiFetch } from '../api';
import type { AuditLogRecord, PolicyRecord, TransactionRecord } from '../types';

interface TransactionsViewProps {
  transactions: TransactionRecord[];
  selectedTransactionId: string | null;
  onSelectTransactionId: (id: string | null) => void;
  onActionCompleted: () => Promise<void>;
}

interface TransactionDetailPayload {
  transaction: TransactionRecord;
  matchedPartner: TransactionRecord | null;
  policy: PolicyRecord | null;
  auditLogs: AuditLogRecord[];
}

export function TransactionsView({
  transactions,
  selectedTransactionId,
  onSelectTransactionId,
  onActionCompleted,
}: TransactionsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const [detail, setDetail] = useState<TransactionDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionNotes, setActionNotes] = useState('');
  const [missingRefInput, setMissingRefInput] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sources = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.source))).sort(),
    [transactions]
  );

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (statusFilter !== 'all' && t.matching_status !== statusFilter) return false;
      if (riskFilter !== 'all' && t.risk_level !== riskFilter) return false;
      if (sourceFilter !== 'all' && t.source !== sourceFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${t.transaction_id} ${t.reference_id} ${t.merchant_name} ${t.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, statusFilter, riskFilter, sourceFilter, searchQuery]);

  useEffect(() => {
    if (!selectedTransactionId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setActionFeedback(null);
    setActionError(null);
    setActionNotes('');
    setMissingRefInput('');

    apiFetch<TransactionDetailPayload>(`/api/transactions/${selectedTransactionId}`)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setActionError(err instanceof Error ? err.message : 'Failed to load details');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTransactionId]);

  const handleAction = async (
    actionType: 'resolve' | 'dispute' | 'add_info' | 'approve' | 'reject' | 'escalate'
  ) => {
    if (!detail) return;
    if (actionType === 'add_info' && !missingRefInput.trim() && !actionNotes.trim()) {
      setActionError('Please enter a Reference ID or resolution note before submitting.');
      return;
    }

    setActionBusy(true);
    setActionError(null);
    setActionFeedback(null);
    try {
      await apiFetch(`/api/transactions/${detail.transaction.id}/action`, {
        method: 'POST',
        body: JSON.stringify({
          actionType,
          notes: actionNotes.trim() || undefined,
          referenceIdUpdate: missingRefInput.trim() || undefined,
        }),
      });
      const updatedDetail = await apiFetch<TransactionDetailPayload>(
        `/api/transactions/${detail.transaction.id}`
      );
      setDetail(updatedDetail);
      setActionFeedback(
        `Action recorded in Audit Log. Status is now "${updatedDetail.transaction.resolution_status}".`
      );
      setActionNotes('');
      setMissingRefInput('');
      await onActionCompleted();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  if (selectedTransactionId) {
    const tx = detail?.transaction;
    const riskFlags = (() => {
      if (!tx) return [];
      try {
        const arr = JSON.parse(tx.risk_flags_json);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    })();

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onSelectTransactionId(null)}
            className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-2 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Transactions Table
          </button>
          {tx && (
            <div className="text-xs font-mono text-slate-600">
              {tx.transaction_id} · Status: <strong className="text-slate-900">{tx.resolution_status}</strong>
            </div>
          )}
        </div>

        {loadingDetail || !tx ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
            {actionError || 'Loading full transaction investigation record...'}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left 2 Columns: Evidence, Match Comparison, Investigation, Policy */}
            <div className="xl:col-span-2 space-y-6">
              {/* Transaction Overview */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <div className="text-xs font-mono text-slate-500">
                      {tx.transaction_id} · Ref: {tx.reference_id}
                    </div>
                    <h2 className="mt-1 text-xl font-bold text-slate-900 font-display">
                      {tx.merchant_name}
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">{tx.description}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                      {tx.currency} {tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 font-mono">
                      {tx.tx_date} · {tx.payment_method} · {tx.source}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500">Source Status</div>
                    <div className="mt-1 font-semibold text-slate-900">{tx.tx_status}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Matching Status</div>
                    <div
                      className={`mt-1 font-semibold ${
                        tx.matching_status === 'Matched' ? 'text-teal-700' : 'text-amber-700'
                      }`}
                    >
                      {tx.matching_status} ({tx.match_type}, {tx.match_confidence}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Risk Score</div>
                    <div
                      className={`mt-1 font-mono font-bold ${
                        tx.risk_score >= 70
                          ? 'text-red-700'
                          : tx.risk_score >= 35
                            ? 'text-amber-700'
                            : 'text-teal-700'
                      }`}
                    >
                      {tx.risk_score}/100 ({tx.risk_level})
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Resolution Status</div>
                    <div className="mt-1 font-semibold text-indigo-700">
                      {tx.resolution_status}
                    </div>
                  </div>
                </div>
              </div>

              {/* Matching Records & Mismatch Details */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-sm font-bold text-slate-900 font-display">
                  Cross-Source Matching &amp; Mismatch Details
                </h3>
                {tx.mismatch_reason && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                    <div>
                      <span className="font-semibold">Discrepancy Detected: </span>
                      {tx.mismatch_reason}
                    </div>
                  </div>
                )}

                {detail.matchedPartner ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-3">Field</th>
                          <th className="py-2 px-3">Current Record ({tx.source})</th>
                          <th className="py-2 px-3">Counter-Record ({detail.matchedPartner.source})</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        <tr>
                          <td className="py-2 px-3 font-sans text-slate-500">Transaction ID</td>
                          <td className="py-2 px-3 text-slate-900">{tx.transaction_id}</td>
                          <td className="py-2 px-3 text-slate-900">
                            {detail.matchedPartner.transaction_id}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-sans text-slate-500">Reference ID</td>
                          <td className="py-2 px-3 text-slate-900">{tx.reference_id}</td>
                          <td className="py-2 px-3 text-slate-900">
                            {detail.matchedPartner.reference_id}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-sans text-slate-500">Amount</td>
                          <td className="py-2 px-3 text-slate-900">
                            {tx.currency} {tx.amount.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-slate-900">
                            {detail.matchedPartner.currency} {detail.matchedPartner.amount.toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-sans text-slate-500">Date</td>
                          <td className="py-2 px-3 text-slate-900">{tx.tx_date}</td>
                          <td className="py-2 px-3 text-slate-900">
                            {detail.matchedPartner.tx_date}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-sans text-slate-500">Merchant</td>
                          <td className="py-2 px-3 font-sans text-slate-900">{tx.merchant_name}</td>
                          <td className="py-2 px-3 font-sans text-slate-900">
                            {detail.matchedPartner.merchant_name}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-sans text-slate-500">Source Status</td>
                          <td className="py-2 px-3 font-sans text-slate-900">{tx.tx_status}</td>
                          <td className="py-2 px-3 font-sans text-slate-900">
                            {detail.matchedPartner.tx_status}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-600">
                    No matching counter-record was located across other uploaded sources.
                  </p>
                )}
              </div>

              {/* Agent Investigation & AI Explanation */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-display">
                    Investigation Agent Report &amp; Gemini Explanation
                  </h3>
                  <p className="mt-2 text-xs text-slate-700 leading-relaxed">
                    {tx.investigation_report ||
                      'Run reconciliation to generate full Gemini AI investigation report.'}
                  </p>
                </div>

                {tx.ai_explanation && (
                  <div className="pt-4 border-t border-slate-100">
                    <div className="text-xs font-semibold text-indigo-700">
                      AI Resolution Rationale
                    </div>
                    <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                      {tx.ai_explanation}
                    </p>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-900">
                    Risk &amp; Anomaly Analysis ({tx.risk_score}/100 · {tx.risk_level})
                  </div>
                  <div className="mt-2 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        tx.risk_score >= 70
                          ? 'bg-red-600'
                          : tx.risk_score >= 35
                            ? 'bg-amber-500'
                            : 'bg-teal-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(4, tx.risk_score))}%` }}
                    />
                  </div>
                  {riskFlags.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {riskFlags.map(
                        (
                          flag: { code: string; label: string; points: number; detail: string },
                          i: number
                        ) => (
                          <li
                            key={`${flag.code}-${i}`}
                            className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                          >
                            <div className="flex items-center justify-between font-semibold text-slate-900">
                              <span>{flag.label}</span>
                              <span className="font-mono text-red-700">+{flag.points} pts</span>
                            </div>
                            <p className="mt-1 text-slate-600">{flag.detail}</p>
                          </li>
                        )
                      )}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      No anomaly or duplicate risk flags triggered.
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-900">
                    Applicable Policy (Policy / RAG Agent)
                  </div>
                  <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                    {tx.applicable_policy_summary || 'No specific sample policy matched.'}
                  </p>
                  {detail.policy && (
                    <div className="mt-2 p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-slate-700 space-y-1">
                      <div className="font-semibold text-sky-900">
                        {detail.policy.code} — {detail.policy.title}
                      </div>
                      <div className="text-sky-800">{detail.policy.sourceLabel}</div>
                      <div>Dispute Steps: {detail.policy.disputeSteps}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Review & Take Action + Transaction Audit Trail */}
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-sm font-bold text-slate-900 font-display">
                  Review &amp; Take Action
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  AI Recommendation:{' '}
                  <strong className="text-indigo-700">
                    {tx.recommended_action || 'Pending Analysis'}
                  </strong>
                </p>

                {actionFeedback && (
                  <div className="mt-3 p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-800">
                    {actionFeedback}
                  </div>
                )}
                {actionError && (
                  <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {actionError}
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor="tx-missing-ref"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Update Missing Reference / UTR (Optional)
                    </label>
                    <input
                      id="tx-missing-ref"
                      type="text"
                      value={missingRefInput}
                      onChange={(e) => setMissingRefInput(e.target.value)}
                      placeholder="e.g. UTR8849201999"
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tx-action-notes"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Analyst Review Notes
                    </label>
                    <textarea
                      id="tx-action-notes"
                      rows={3}
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="Document justification for audit log..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleAction('approve')}
                    className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    Approve Recommendation
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleAction('resolve')}
                    className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark as Resolved
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleAction('dispute')}
                    className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <FileWarning className="w-3.5 h-3.5" />
                    Raise Dispute
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleAction('add_info')}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Add Missing Information
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleAction('escalate')}
                    className="w-full py-2 px-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Escalate to Support
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleAction('reject')}
                    className="w-full py-2 px-3 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-800 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                    Reject Recommendation
                  </button>
                </div>
              </div>

              {/* Case Audit Log */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-sm font-bold text-slate-900 font-display mb-3">
                  Case Audit Trail ({detail.auditLogs.length})
                </h3>
                {detail.auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No human actions recorded on this transaction yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {detail.auditLogs.map((log) => (
                      <li
                        key={log.id}
                        className="pb-3 border-b border-slate-100 last:border-0 last:pb-0 text-xs"
                      >
                        <div className="font-semibold text-slate-900">{log.action}</div>
                        <div className="text-slate-500 font-mono mt-0.5">
                          {log.user_name} · {new Date(log.created_at).toLocaleString()}
                        </div>
                        {log.notes && <p className="mt-1 text-slate-700">{log.notes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor="tx-search" className="block text-xs text-slate-500 mb-1">
            Search ID / Reference / Merchant
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              id="tx-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="BNK-2026, UTR, Amazon..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
        </div>
        <div>
          <label htmlFor="tx-status-filter" className="block text-xs text-slate-500 mb-1">
            Matching Status
          </label>
          <select
            id="tx-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">All Statuses</option>
            <option value="Matched">Matched</option>
            <option value="Unmatched">Unmatched</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
        <div>
          <label htmlFor="tx-risk-filter" className="block text-xs text-slate-500 mb-1">
            Risk Classification
          </label>
          <select
            id="tx-risk-filter"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">All Risk Levels</option>
            <option value="Low Risk">Low Risk</option>
            <option value="Medium Risk">Medium Risk</option>
            <option value="High Risk">High Risk</option>
          </select>
        </div>
        <div>
          <label htmlFor="tx-source-filter" className="block text-xs text-slate-500 mb-1">
            Payment Source
          </label>
          <select
            id="tx-source-filter"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">All Sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Transactions Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 font-display">
            Transactions Ledger ({filtered.length} of {transactions.length})
          </h2>
          <span className="text-xs text-slate-500">Click any row to inspect &amp; take action</span>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No transactions match your current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Transaction ID</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Merchant</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Payment Source</th>
                  <th className="py-3 px-4">Matching Status</th>
                  <th className="py-3 px-4 text-right">Risk Score</th>
                  <th className="py-3 px-4">Recommended Action</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-sky-50/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {tx.transaction_id}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {tx.tx_date}
                    </td>
                    <td className="py-3 px-4 text-slate-900 font-medium">
                      <div>{tx.merchant_name}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        Ref: {tx.reference_id}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {tx.currency} {tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {tx.source}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`font-semibold inline-flex items-center gap-1 ${
                          tx.matching_status === 'Matched'
                            ? 'text-teal-700'
                            : tx.matching_status === 'Unmatched'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {tx.matching_status === 'Matched' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        {tx.matching_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <span
                        className={`font-bold ${
                          tx.risk_score >= 70
                            ? 'text-red-700'
                            : tx.risk_score >= 35
                              ? 'text-amber-700'
                              : 'text-teal-700'
                        }`}
                      >
                        {tx.risk_score}
                      </span>
                      <span className="text-slate-400"> / 100</span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <div className="font-medium">{tx.recommended_action || 'Pending'}</div>
                      <div className="text-[11px] text-slate-500">
                        Resolution: {tx.resolution_status}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectTransactionId(tx.id)}
                        aria-label={`Inspect ${tx.transaction_id}`}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-semibold"
                      >
                        Details
                      </button>
                    </td>
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
