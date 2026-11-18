import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  FileBarChart2,
  GitMerge,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Play,
  Settings,
  UploadCloud,
  X,
} from 'lucide-react';
import { apiFetch, getStoredToken, setStoredToken } from './api';
import { AgentMonitoringView } from './components/AgentMonitoringView';
import { AiInvestigationView } from './components/AiInvestigationView';
import { AuditLogsView } from './components/AuditLogsView';
import { AuthScreen } from './components/AuthScreen';
import { DashboardView } from './components/DashboardView';
import { PolicyCenterView } from './components/PolicyCenterView';
import { ReconciliationView } from './components/ReconciliationView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { TransactionsView } from './components/TransactionsView';
import { UploadDataView } from './components/UploadDataView';
import type {
  AgentExecutionRecord,
  AuditLogRecord,
  NavSection,
  NotificationRecord,
  ReconciliationRun,
  SampleDataset,
  TransactionRecord,
  UploadedFileRecord,
  User,
} from './types';

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload Data', icon: UploadCloud },
  { id: 'reconciliation', label: 'Reconciliation', icon: GitMerge },
  { id: 'transactions', label: 'Transactions', icon: ListChecks },
  { id: 'ai_investigation', label: 'AI Investigation', icon: Bot },
  { id: 'agent_monitoring', label: 'Agent Monitoring', icon: Activity },
  { id: 'policy_center', label: 'Policy Center', icon: BookOpen },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
  { id: 'audit_logs', label: 'Audit Logs', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [files, setFiles] = useState<UploadedFileRecord[]>([]);
  const [samples, setSamples] = useState<SampleDataset[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [latestRun, setLatestRun] = useState<ReconciliationRun | null>(null);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [agents, setAgents] = useState<AgentExecutionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  const refreshAllData = useCallback(async () => {
    const [filesRes, samplesRes, txRes, latestRes, runsRes, logsRes, notifRes] =
      await Promise.all([
        apiFetch<{ files: UploadedFileRecord[] }>('/api/files'),
        apiFetch<{ datasets: SampleDataset[] }>('/api/samples'),
        apiFetch<{ transactions: TransactionRecord[] }>('/api/transactions'),
        apiFetch<{ run: ReconciliationRun | null; agents: AgentExecutionRecord[] }>(
          '/api/reconcile/latest'
        ),
        apiFetch<{ runs: ReconciliationRun[] }>('/api/reconcile/runs'),
        apiFetch<{ logs: AuditLogRecord[] }>('/api/audit-logs'),
        apiFetch<{ notifications: NotificationRecord[] }>('/api/notifications'),
      ]);

    setFiles(filesRes.files);
    setSamples(samplesRes.datasets);
    setTransactions(txRes.transactions);
    setLatestRun(latestRes.run);
    setAgents(latestRes.agents);
    setRuns(runsRes.runs);
    setAuditLogs(logsRes.logs);
    setNotifications(notifRes.notifications);
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    apiFetch<{ user: User }>('/api/auth/me')
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        setStoredToken(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  useEffect(() => {
    if (user) {
      refreshAllData().catch((err) => {
        setBannerError(err instanceof Error ? err.message : 'Failed to load workspace data');
      });
    }
  }, [user, refreshAllData]);

  const handleStartReconciliation = async () => {
    setBannerError(null);
    setBannerNotice(null);
    setReconciling(true);
    try {
      const result = await apiFetch<{
        runId: string;
        matchedCount: number;
        unmatchedCount: number;
        duplicateCount: number;
        hitlCount: number;
        geminiWarning?: string;
      }>('/api/reconcile/start', { method: 'POST' });

      await refreshAllData();
      setBannerNotice(
        `Supervisor Agent completed ${result.runId}: ${result.matchedCount} matched, ${result.unmatchedCount} unmatched, ${result.duplicateCount} duplicate(s), ${result.hitlCount} queued for Human-in-the-Loop review.${
          result.geminiWarning ? ` (${result.geminiWarning})` : ''
        }`
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  const handleLoadSamplesAndReconcile = async () => {
    setBannerError(null);
    setBannerNotice(null);
    setReconciling(true);
    try {
      await apiFetch('/api/files/load-sample', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshAllData();
      await handleStartReconciliation();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to load and reconcile samples');
      setReconciling(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setTransactions([]);
    setFiles([]);
  };

  const handleToggleNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next && notifications.some((n) => n.is_read === 0)) {
      await apiFetch('/api/notifications/read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    }
  };

  const navigateTo = (section: NavSection) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
    if (section !== 'transactions') {
      setSelectedTxId(null);
    }
  };

  const openTransactionDetail = (txId: string) => {
    setSelectedTxId(txId);
    setActiveSection('transactions');
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Verifying workspace session...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={(u) => setUser(u)} />;
  }

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;
  const activeNavLabel =
    NAV_ITEMS.find((i) => i.id === activeSection)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 text-slate-100 border-r border-slate-800">
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="text-lg font-bold tracking-tight text-white font-display">
            ReconAI
          </div>
          <div className="mt-0.5 text-xs text-sky-300 truncate">{user.organization}</div>
        </div>

        <nav aria-label="Primary Navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="text-xs">
            <div className="font-semibold text-white truncate">{user.name}</div>
            <div className="text-slate-400 truncate">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-xs bg-slate-900 text-slate-100 flex flex-col z-50">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-base font-bold text-white font-display">ReconAI</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav aria-label="Mobile Navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
                      active
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 px-3 bg-slate-800 text-slate-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 font-display truncate">
              {activeNavLabel}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0 relative">
            <button
              type="button"
              onClick={handleToggleNotifications}
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-indigo-600 text-white text-[10px] font-mono font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={reconciling || transactions.length === 0}
              onClick={handleStartReconciliation}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              {reconciling ? 'Reconciling...' : 'Start Reconciliation'}
            </button>

            {/* Notifications Popover */}
            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Confirmations &amp; Alerts
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Close
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 text-center">
                      No confirmation alerts yet.
                    </div>
                  ) : (
                    notifications.slice(0, 8).map((n) => (
                      <div key={n.id} className="p-3 text-xs">
                        <div className="font-semibold text-slate-900">{n.title}</div>
                        <p className="mt-0.5 text-slate-600">{n.message}</p>
                        <div className="mt-1 text-[10px] font-mono text-slate-400">
                          {n.channel} · {new Date(n.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto space-y-5">
          {bannerNotice && (
            <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center justify-between gap-4">
              <span>{bannerNotice}</span>
              <button
                type="button"
                onClick={() => setBannerNotice(null)}
                className="text-teal-800 font-semibold shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {bannerError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-4"
            >
              <span>{bannerError}</span>
              <button
                type="button"
                onClick={() => setBannerError(null)}
                className="text-red-800 font-semibold shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeSection === 'dashboard' && (
            <DashboardView
              transactions={transactions}
              latestRun={latestRun}
              uploadedFilesCount={files.length}
              reconciling={reconciling}
              onStartReconciliation={handleStartReconciliation}
              onNavigate={navigateTo}
              onLoadSamplesAndReconcile={handleLoadSamplesAndReconcile}
            />
          )}

          {activeSection === 'upload' && (
            <UploadDataView
              files={files}
              samples={samples}
              onRefresh={refreshAllData}
              onStartReconciliation={handleStartReconciliation}
              reconciling={reconciling}
            />
          )}

          {activeSection === 'reconciliation' && (
            <ReconciliationView
              latestRun={latestRun}
              agents={agents}
              transactions={transactions}
              reconciling={reconciling}
              onStartReconciliation={handleStartReconciliation}
              onSelectTransaction={(tx) => openTransactionDetail(tx.id)}
              onNavigate={navigateTo}
            />
          )}

          {activeSection === 'transactions' && (
            <TransactionsView
              transactions={transactions}
              selectedTransactionId={selectedTxId}
              onSelectTransactionId={setSelectedTxId}
              onActionCompleted={refreshAllData}
            />
          )}

          {activeSection === 'ai_investigation' && (
            <AiInvestigationView
              transactions={transactions}
              onInspectTransaction={openTransactionDetail}
            />
          )}

          {activeSection === 'agent_monitoring' && (
            <AgentMonitoringView
              latestRun={latestRun}
              runs={runs}
              agents={agents}
            />
          )}

          {activeSection === 'policy_center' && <PolicyCenterView />}

          {activeSection === 'reports' && <ReportsView />}

          {activeSection === 'audit_logs' && <AuditLogsView logs={auditLogs} />}

          {activeSection === 'settings' && (
            <SettingsView
              user={user}
              onUserUpdated={setUser}
              onWorkspaceReset={refreshAllData}
            />
          )}
        </main>
      </div>
    </div>
  );
}
