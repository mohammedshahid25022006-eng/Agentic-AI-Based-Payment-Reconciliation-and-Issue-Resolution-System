import React, { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import type { AuditLogRecord } from '../types';

interface AuditLogsViewProps {
  logs: AuditLogRecord[];
}

export function AuditLogsView({ logs }: AuditLogsViewProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return logs;
    const q = query.trim().toLowerCase();
    return logs.filter((l) =>
      `${l.action} ${l.tx_code || ''} ${l.user_name} ${l.source_agent} ${l.notes || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [logs, query]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            Immutable Audit Logs ({filtered.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Chronological log of all agent executions, file uploads, and Human-in-the-Loop analyst decisions
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <label htmlFor="audit-search" className="sr-only">
            Filter audit logs
          </label>
          <input
            id="audit-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by action, txn ID, agent..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No audit events recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Source / Agent</th>
                  <th className="py-3 px-4">Txn Code</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Status Transition</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {log.user_name}
                    </td>
                    <td className="py-3 px-4 text-indigo-700 font-medium whitespace-nowrap">
                      {log.source_agent}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-800 whitespace-nowrap">
                      {log.tx_code || '-'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{log.action}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {log.previous_status || '-'} → {log.new_status || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-md">{log.notes || '-'}</td>
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
