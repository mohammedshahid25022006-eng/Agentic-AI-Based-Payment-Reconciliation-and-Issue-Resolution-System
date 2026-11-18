import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { apiFetch, setStoredToken } from '../api';
import type { User } from '../types';

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email, password }
          : { name, email, password, organization };

      const res = await apiFetch<{ token: string; user: User }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'demo@reconai.fin',
          password: 'Demo@2026',
        }),
      });
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Architectural Briefing Panel */}
      <div className="lg:w-1/2 bg-slate-900 text-slate-50 p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="text-xl font-bold tracking-tight text-white font-display">
            ReconAI
          </div>
          <p className="mt-1 text-sm text-sky-300">
            Agentic Payment Reconciliation &amp; Issue Resolution Platform
          </p>

          <h1 className="mt-10 text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight max-w-xl [text-wrap:balance]">
            Multi-agent transaction matching, risk scoring, and human-in-the-loop resolution.
          </h1>
          <p className="mt-4 text-slate-300 text-base leading-relaxed max-w-lg">
            Upload corporate bank statements, UPI histories, digital wallet ledgers, receipts, and vendor invoices. A coordinated Supervisor Agent drives seven specialized agents to isolate mismatches, flag duplicates, retrieve policy clauses, and prepare audit-ready resolution reports.
          </p>

          <div className="mt-10 space-y-4 max-w-lg">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-white">
                  Supervisor + 7 Specialized Agents
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Document Processing, Exact &amp; Fuzzy Matching, Gemini Investigation, Rule-Based Anomaly Scoring, Policy RAG, Resolution, and Human-in-the-Loop review.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-white">
                  Zero Automated Fund Transfers
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  High-risk and high-value discrepancies require explicit analyst approval with full audit logging.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-800 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>CSV / XLSX / PDF / Image OCR</span>
          <span aria-hidden="true">·</span>
          <span>SQLite Persistent Ledger</span>
          <span aria-hidden="true">·</span>
          <span>PDF, CSV &amp; Excel Exports</span>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 font-display">
                {mode === 'login' ? 'Sign in to workspace' : 'Create analyst account'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'login'
                  ? 'Access your persisted reconciliation runs and audit logs'
                  : 'Register a dedicated workspace for your reconciliation data'}
              </p>
            </div>
          </div>

          <div className="mb-6 flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Priya Sharma"
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="auth-org"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Organization
                  </label>
                  <input
                    id="auth-org"
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Acme FinOps"
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Work Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@company.com"
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Lock className="w-4 h-4" />
              {loading
                ? 'Authenticating...'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Project Evaluation Demo Account
            </div>
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs text-slate-700 mb-3 space-y-1 font-mono">
              <div>Email: demo@reconai.fin</div>
              <div>Pass: Demo@2026</div>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleDemoLogin}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <UserCheck className="w-4 h-4" />
              Sign In as Demo Analyst
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
