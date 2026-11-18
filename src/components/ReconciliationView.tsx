import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  FileSearch,
  GitCompare,
  Play,
  ShieldAlert,
  Target,
  UserCheck,
} from 'lucide-react';
import type {
  AgentExecutionRecord,
  NavSection,
  ReconciliationRun,
  TransactionRecord,
} from '../types';

interface ReconciliationViewProps {
  latestRun: ReconciliationRun | null;
  agents: AgentExecutionRecord[];
  transactions: TransactionRecord[];
  reconciling: boolean;
  onStartReconciliation: () => Promise<void>;
  onSelectTransaction: (tx: TransactionRecord) => void;
  onNavigate: (section: NavSection) => void;
}

const PIPELINE_STEPS = [
  {
    name: 'Document Processing Agent',
    icon: FileSearch,
    role: 'Extracts CSV, XLSX, PDF & image text; cleans and outputs structured transactions.',
    output: 'Structured Transactions',
  },
  {
    name: 'Transaction Matching Agent',
    icon: GitCompare,
    role: 'Exact & fuzzy matching across Bank, UPI, Wallet, Receipts, and Invoices.',
    output: 'Matched / Unmatched',
  },
  {
    name: 'Investigation Agent',
    icon: Cpu,
    role: 'Investigates unmatched cases, gathers evidence, and builds Gemini reports.',
    output: 'Investigation Report',
  },
  {
    name: 'Risk / Anomaly Agent',
    icon: ShieldAlert,
    role: 'Detects duplicates, outliers, velocity bursts, and computes 0-100 risk scores.',
    output: 'Risk Score & Insights',
  },
  {
    name: 'Policy / RAG Agent',
    icon: BookOpen,
    role: 'Retrieves applicable refund & dispute clauses and resolution timelines.',
    output: 'Applicable Policies',
  },
  {
    name: 'Resolution Agent',
    icon: Target,
    role: 'Synthesizes findings to recommend non-executing actions (Resolve/Dispute/Escalate).',
    output: 'Recommended Action',
  },
  {
    name: 'Human-in-the-Loop Agent',
    icon: UserCheck,
    role: 'Routes high-risk, duplicate, and high-value transactions for analyst approval.',
    output: 'Human Decision Queue',
  },
];

export function ReconciliationView({
  latestRun,
  agents,
  transactions,
  reconciling,
  onStartReconciliation,
  onSelectTransaction,
  onNavigate,
}: ReconciliationViewProps) {
  const hitlQueue = transactions.filter((t) => t.hitl_required === 1);
  const agentMap = new Map(agents.map((a) => [a.agent_name, a]));
  const supervisorStep = agentMap.get('Supervisor Agent');

  return (
    <div className="space-y-6">
      {/* Supervisor Orchestration Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Supervisor Agent &amp; Multi-Agent Reconciliation Pipeline
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">
              Coordinates seven specialized agents end-to-end across your {transactions.length} uploaded transaction record(s).
            </p>
            {latestRun && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                <span>Run {latestRun.id}</span>
                <span aria-hidden="true">·</span>
                <span>{latestRun.matched_count} Matched</span>
                <span aria-hidden="true">·</span>
                <span>{latestRun.unmatched_count} Unmatched</span>
                <span aria-hidden="true">·</span>
                <span>{latestRun.duplicate_count} Duplicates</span>
                <span aria-hidden="true">·</span>
                <span>{latestRun.hitl_count} HITL Cases</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('upload')}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              Upload More Data
            </button>
            <button
              type="button"
              disabled={reconciling || transactions.length === 0}
              onClick={onStartReconciliation}
              className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              {reconciling ? 'Supervisor Orchestrating...' : 'Start Reconciliation'}
            </button>
          </div>
        </div>

        {/* Supervisor Banner */}
        <div className="mt-5 p-4 rounded-xl bg-sky-50 border border-sky-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-900">
              Central Coordinator: Supervisor Agent
            </div>
            <p className="text-xs text-slate-700 mt-0.5">
              {reconciling
                ? 'Assigning tasks and synchronizing outputs across all 7 specialized agents...'
                : supervisorStep
                  ? supervisorStep.summary
                  : 'Ready to orchestrate Document Processing, Matching, Investigation, Risk, Policy RAG, Resolution, and HITL agents.'}
            </p>
          </div>
          <div className="text-xs font-mono font-semibold text-sky-800 whitespace-nowrap">
            {reconciling ? 'Executing' : supervisorStep ? supervisorStep.status : 'Standby'}
          </div>
        </div>

        {/* 7-Agent Grid */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {PIPELINE_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const exec = agentMap.get(step.name);
            const completed = Boolean(exec) && !reconciling;
            return (
              <div
                key={step.name}
                className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Icon className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>
                        0{idx + 1}. {step.name}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                    {exec ? exec.summary : step.role}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">{step.output}</span>
                  <span
                    className={`font-mono font-semibold inline-flex items-center gap-1 ${
                      reconciling
                        ? 'text-amber-700'
                        : completed
                          ? 'text-teal-700'
                          : 'text-slate-400'
                    }`}
                  >
                    {completed && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {reconciling ? 'Running' : exec ? `${exec.duration_ms}ms` : 'Pending'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Human-in-the-Loop Queue */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-display">
              Human-in-the-Loop Review Queue ({hitlQueue.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              High-risk (&ge; 70), duplicate, or high-value (&ge; ₹25,000) cases requiring analyst decision
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 whitespace-nowrap"
          >
            View All Transactions
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {hitlQueue.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {latestRun
              ? 'No transactions currently flagged for mandatory Human-in-the-Loop escalation.'
              : 'Run reconciliation to evaluate transactions for Human-in-the-Loop review.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Transaction ID</th>
                  <th className="py-3 px-4">Merchant</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Risk Score</th>
                  <th className="py-3 px-4">Recommended Action</th>
                  <th className="py-3 px-4">Resolution Status</th>
                  <th className="py-3 px-4 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {hitlQueue.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {tx.transaction_id}
                    </td>
                    <td className="py-3 px-4 text-slate-800">{tx.merchant_name}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {tx.currency} {tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-red-700">
                      {tx.risk_score}/100 ({tx.risk_level})
                    </td>
                    <td className="py-3 px-4 text-indigo-700 font-medium">
                      {tx.recommended_action}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">
                      {tx.resolution_status}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectTransaction(tx)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-semibold whitespace-nowrap"
                      >
                        Review Case
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
