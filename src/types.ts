export type NavSection =
  | 'dashboard'
  | 'upload'
  | 'reconciliation'
  | 'transactions'
  | 'ai_investigation'
  | 'agent_monitoring'
  | 'policy_center'
  | 'reports'
  | 'audit_logs'
  | 'settings';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
}

export interface UploadedFileRecord {
  id: string;
  filename: string;
  file_type: string;
  source_category: string;
  file_size: number;
  record_count: number;
  rejected_count: number;
  status: string;
  raw_preview: string;
  uploaded_at: string;
}

export interface SampleDataset {
  id: string;
  filename: string;
  title: string;
  description: string;
  format: 'CSV' | 'XLSX' | 'PDF';
  sourceCategory: string;
  recordCount: number;
}

export interface TransactionRecord {
  id: string;
  user_id: string;
  file_id: string;
  run_id: string | null;
  transaction_id: string;
  reference_id: string;
  tx_date: string;
  amount: number;
  currency: string;
  merchant_name: string;
  payment_method: string;
  tx_status: string;
  source: string;
  source_category: string;
  description: string;
  matching_status: 'Matched' | 'Unmatched' | 'Pending';
  matched_with_id: string | null;
  matched_with_tx_code: string | null;
  matched_with_source: string | null;
  match_type: 'Exact' | 'Fuzzy' | 'None';
  match_confidence: number;
  mismatch_reason: string | null;
  mismatch_details_json: string;
  risk_score: number;
  risk_level: 'Low Risk' | 'Medium Risk' | 'High Risk';
  is_duplicate: number;
  is_suspicious: number;
  risk_flags_json: string;
  investigation_report: string | null;
  ai_explanation: string | null;
  applicable_policy_id: string | null;
  applicable_policy_summary: string | null;
  recommended_action: string | null;
  hitl_required: number;
  resolution_status: string;
  user_notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface DashboardSummary {
  kpis: {
    totalTransactions: number;
    matchedTransactions: number;
    unmatchedTransactions: number;
    pendingTransactions: number;
    duplicateTransactions: number;
    suspiciousTransactions: number;
    totalAmount: number;
    reconciledAmount: number;
    pendingIssues: number;
    hitlPending: number;
    uploadedFiles: number;
  };
  charts: {
    statusBreakdown: Array<{ name: string; value: number; color: string }>;
    riskDistribution: Array<{ name: string; count: number; fill: string }>;
    bySource: Array<{ source: string; count: number; amount: number; unmatched: number }>;
    dailyTrend: Array<{ date: string; matched: number; unmatched: number; volume: number }>;
  };
  latestRun: ReconciliationRun | null;
}

export interface ReconciliationRun {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_count: number;
  matched_count: number;
  unmatched_count: number;
  duplicate_count: number;
  suspicious_count: number;
  total_amount: number;
  reconciled_amount: number;
  hitl_count: number;
  summary_notes: string | null;
}

export interface AgentExecutionRecord {
  id: string;
  run_id: string;
  agent_name: string;
  step_order: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  summary: string;
  metrics_json: string;
}

export interface PolicyRecord {
  id: string;
  code: string;
  title: string;
  category: string;
  sourceLabel: string;
  summary: string;
  fullText: string;
  resolutionTimeline: string;
  refundRules: string;
  disputeSteps: string;
  keywords: string;
  relevanceScore?: number;
  matchedTerms?: string[];
}

export interface AuditLogRecord {
  id: string;
  user_name: string;
  transaction_id: string | null;
  tx_code: string | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  notes: string | null;
  source_agent: string;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  channel: string;
  is_read: number;
  created_at: string;
}

export interface ChatMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  referenced_tx_ids: string;
  created_at: string;
}
