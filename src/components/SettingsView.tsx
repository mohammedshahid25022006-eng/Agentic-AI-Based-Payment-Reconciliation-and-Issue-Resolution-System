import React, { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { apiFetch } from '../api';
import type { User } from '../types';

interface SettingsViewProps {
  user: User;
  onUserUpdated: (user: User) => void;
  onWorkspaceReset: () => Promise<void>;
}

export function SettingsView({
  user,
  onUserUpdated,
  onWorkspaceReset,
}: SettingsViewProps) {
  const [name, setName] = useState(user.name);
  const [organization, setOrganization] = useState(user.organization);
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ user: User }>('/api/settings/profile', {
        method: 'PUT',
        body: JSON.stringify({ name, organization, role }),
      });
      onUserUpdated(res.user);
      setFeedback('Analyst profile settings saved to SQLite database.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetWorkspace = async () => {
    setResetting(true);
    setFeedback(null);
    try {
      await apiFetch('/api/settings/reset-workspace', { method: 'POST' });
      setConfirmReset(false);
      await onWorkspaceReset();
      setFeedback('Workspace transactions, files, runs, and audit logs have been cleared.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Form */}
        <form
          onSubmit={handleSaveProfile}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Analyst Profile &amp; Workspace Settings
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Update identity details embedded in audit logs and exported PDF/Excel reports.
            </p>
          </div>

          {feedback && (
            <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-800">
              {feedback}
            </div>
          )}

          <div>
            <label htmlFor="set-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name
            </label>
            <input
              id="set-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-org" className="block text-xs font-semibold text-slate-700 mb-1">
              Organization
            </label>
            <input
              id="set-org"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-role" className="block text-xs font-semibold text-slate-700 mb-1">
              Role Title
            </label>
            <input
              id="set-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>

        {/* Workspace Reset Control */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Demonstration Workspace Reset
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Reset uploaded statements, reconciliation runs, transaction records, chat history, and audit logs for a fresh live demonstration. Policy Knowledge Base documents and your user account are preserved.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Workspace Data
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-red-700">
                  Confirm clearing all uploaded data &amp; runs?
                </span>
                <button
                  type="button"
                  disabled={resetting}
                  onClick={handleResetWorkspace}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg"
                >
                  {resetting ? 'Clearing...' : 'Yes, Clear Workspace'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reference Architecture Diagram */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 font-display">
          System Architecture &amp; Agentic Workflow Blueprint
        </h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Reference flow implemented across the Supervisor Agent, seven specialized agents, and analyst action controls.
        </p>
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
          <img
            src="/assets/aistudio/WhatsApp_Image_2026-11-17_at_12.02.42_PM_31b3b162.jpeg"
            alt="Agentic AI-Based Payment Reconciliation and Issue Resolution System Workflow Diagram"
            referrerPolicy="no-referrer"
            className="w-full max-w-4xl mx-auto block"
          />
        </div>
      </div>
    </div>
  );
}
