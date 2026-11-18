import React, { useEffect, useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import { apiFetch } from '../api';
import type { PolicyRecord } from '../types';

export function PolicyCenterView() {
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Disputes & Refunds');
  const [summary, setSummary] = useState('');
  const [fullText, setFullText] = useState('');
  const [timeline, setTimeline] = useState('3-5 business days');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadPolicies = async (searchQ = '') => {
    setLoading(true);
    try {
      const url = searchQ.trim()
        ? `/api/policies?q=${encodeURIComponent(searchQ.trim())}`
        : '/api/policies';
      const res = await apiFetch<{ policies: PolicyRecord[] }>(url);
      setPolicies(res.policies);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies('');
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadPolicies(query);
  };

  const handleAddPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await apiFetch('/api/policies', {
        method: 'POST',
        body: JSON.stringify({
          title,
          category,
          summary,
          fullText,
          resolutionTimeline: timeline,
        }),
      });
      setTitle('');
      setSummary('');
      setFullText('');
      setShowAddForm(false);
      setFeedback('Custom organization policy indexed into Policy / RAG Agent knowledge base.');
      await loadPolicies(query);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & RAG Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Policy Center &amp; RAG Knowledge Base
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">
              Retrieval-based policy index used by the Policy / RAG Agent to ground refund rules, dispute steps, and turnaround timelines. Note: Bundled entries are clearly labeled as Sample Demonstration Policies and not official financial institution regulations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {showAddForm ? 'Cancel' : 'Add Custom Policy'}
          </button>
        </div>

        <form onSubmit={handleSearch} className="mt-5 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <label htmlFor="policy-rag-search" className="sr-only">
              Search policies
            </label>
            <input
              id="policy-rag-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search RAG policies (e.g., UPI failed debit, duplicate chargeback, missing UTR, high risk)..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
          >
            Retrieve Policies
          </button>
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                loadPolicies('');
              }}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </form>

        {feedback && (
          <div className="mt-4 p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-800">
            {feedback}
          </div>
        )}
      </div>

      {/* Add Custom Policy Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddPolicy}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Add Organization Policy Document
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="pol-title" className="block text-xs font-semibold text-slate-700 mb-1">
                Policy Title
              </label>
              <input
                id="pol-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Corporate Card FX Spread Tolerance Policy"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="pol-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                Category
              </label>
              <input
                id="pol-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label htmlFor="pol-summary" className="block text-xs font-semibold text-slate-700 mb-1">
              Summary
            </label>
            <input
              id="pol-summary"
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short scope of when this policy applies"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="pol-text" className="block text-xs font-semibold text-slate-700 mb-1">
              Full Policy Clauses &amp; Dispute Rules
            </label>
            <textarea
              id="pol-text"
              required
              rows={3}
              value={fullText}
              onChange={(e) => setFullText(e.target.value)}
              placeholder="Detailed settlement rules and escalation steps..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="w-64">
              <label htmlFor="pol-time" className="block text-xs font-semibold text-slate-700 mb-1">
                Resolution Timeline
              </label>
              <input
                id="pol-time"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
            >
              {saving ? 'Indexing...' : 'Save & Index Policy'}
            </button>
          </div>
        </form>
      )}

      {/* Policy Cards */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
          Retrieving policy knowledge base...
        </div>
      ) : policies.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
          No policies matched your search query.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {policies.map((pol) => (
            <div
              key={pol.id}
              className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 font-mono">
                  <span>
                    {pol.code} · {pol.category}
                  </span>
                  {typeof pol.relevanceScore === 'number' && (
                    <span className="text-indigo-700 font-semibold">
                      Match Score: {pol.relevanceScore}
                    </span>
                  )}
                </div>
                <h3 className="mt-1.5 text-sm font-bold text-slate-900 font-display flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>{pol.title}</span>
                </h3>
                <div className="mt-1 text-[11px] font-semibold text-amber-700">
                  {pol.sourceLabel}
                </div>
                <p className="mt-2 text-xs text-slate-700 leading-relaxed">{pol.fullText}</p>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-800">Timeline: </span>
                  <span className="text-slate-600">{pol.resolutionTimeline}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Refund Rule: </span>
                  <span className="text-slate-600">{pol.refundRules}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Dispute Procedure: </span>
                  <span className="text-slate-600">{pol.disputeSteps}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
