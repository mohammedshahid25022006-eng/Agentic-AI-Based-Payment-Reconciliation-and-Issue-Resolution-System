import React from 'react';
import { Activity, CheckCircle2, Clock } from 'lucide-react';
import type { AgentExecutionRecord, ReconciliationRun } from '../types';

interface AgentMonitoringViewProps {
  latestRun: ReconciliationRun | null;
  runs: ReconciliationRun[];
  agents: AgentExecutionRecord[];
}

export function AgentMonitoringView({
  latestRun,
  runs,
  agents,
}: AgentMonitoringViewProps) {
  return (
    <div className="space-y-6">
      {/* Current Run Execution Telemetry */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Multi-Agent Execution Telemetry
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real execution timings, output metrics, and completion statuses from SQLite run logs
            </p>
          </div>
          {latestRun && (
            <div className="text-xs font-mono text-slate-700">
              Latest Run: <strong>{latestRun.id}</strong> ({latestRun.status})
            </div>
          )}
        </div>

        {agents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            No reconciliation runs recorded yet. Start Reconciliation to monitor all 8 agent execution steps.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4">Step</th>
                  <th className="py-3 px-4">Agent Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                  <th className="py-3 px-4">Execution Summary</th>
                  <th className="py-3 px-4">Metrics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((agent) => {
                  let metricsObj: Record<string, unknown> = {};
                  try {
                    metricsObj = JSON.parse(agent.metrics_json);
                  } catch {
                    // ignore
                  }
                  const metricPairs = Object.entries(metricsObj)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ');

                  return (
                    <tr key={agent.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-500">
                        0{agent.step_order}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-indigo-600" />
                          {agent.agent_name}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-semibold text-teal-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {agent.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {agent.duration_ms} ms
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-md">{agent.summary}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {metricPairs || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historical Reconciliation Runs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Reconciliation Run History ({runs.length})
          </h3>
        </div>
        {runs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No historical runs yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4">Run ID</th>
                  <th className="py-3 px-4">Started</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Matched</th>
                  <th className="py-3 px-4 text-right">Unmatched</th>
                  <th className="py-3 px-4 text-right">Duplicates</th>
                  <th className="py-3 px-4 text-right">HITL Queue</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">{r.id}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{r.total_count}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-teal-700 font-semibold">
                      {r.matched_count}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700 font-semibold">
                      {r.unmatched_count}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700 font-semibold">
                      {r.duplicate_count}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-indigo-700 font-semibold">
                      {r.hitl_count}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.summary_notes}</td>
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
