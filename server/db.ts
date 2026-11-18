import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'reconcile.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Reconciliation Analyst',
    organization TEXT NOT NULL DEFAULT 'Enterprise Finance',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    source_category TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    record_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Processed',
    raw_preview TEXT NOT NULL DEFAULT '[]',
    uploaded_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    total_count INTEGER NOT NULL DEFAULT 0,
    matched_count INTEGER NOT NULL DEFAULT 0,
    unmatched_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    suspicious_count INTEGER NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    reconciled_amount REAL NOT NULL DEFAULT 0,
    hitl_count INTEGER NOT NULL DEFAULT 0,
    summary_notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_executions (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (run_id) REFERENCES reconciliation_runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    run_id TEXT,
    transaction_id TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    tx_date TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    merchant_name TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    tx_status TEXT NOT NULL,
    source TEXT NOT NULL,
    source_category TEXT NOT NULL,
    description TEXT NOT NULL,
    matching_status TEXT NOT NULL DEFAULT 'Pending',
    matched_with_id TEXT,
    matched_with_tx_code TEXT,
    matched_with_source TEXT,
    match_type TEXT NOT NULL DEFAULT 'None',
    match_confidence INTEGER NOT NULL DEFAULT 0,
    mismatch_reason TEXT,
    mismatch_details_json TEXT NOT NULL DEFAULT '{}',
    risk_score INTEGER NOT NULL DEFAULT 0,
    risk_level TEXT NOT NULL DEFAULT 'Low Risk',
    is_duplicate INTEGER NOT NULL DEFAULT 0,
    is_suspicious INTEGER NOT NULL DEFAULT 0,
    risk_flags_json TEXT NOT NULL DEFAULT '[]',
    investigation_report TEXT,
    ai_explanation TEXT,
    applicable_policy_id TEXT,
    applicable_policy_summary TEXT,
    recommended_action TEXT,
    hitl_required INTEGER NOT NULL DEFAULT 0,
    resolution_status TEXT NOT NULL DEFAULT 'Open',
    user_notes TEXT,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    source_label TEXT NOT NULL,
    summary TEXT NOT NULL,
    full_text TEXT NOT NULL,
    resolution_timeline TEXT NOT NULL,
    refund_rules TEXT NOT NULL,
    dispute_steps TEXT NOT NULL,
    keywords TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    transaction_id TEXT,
    tx_code TEXT,
    action TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    notes TEXT,
    source_agent TEXT NOT NULL DEFAULT 'Human Analyst',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'In-App',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    referenced_tx_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function seedDemoData(): void {
  const now = new Date().toISOString();

  // Seed Demo Account
  const demoEmail = 'demo@reconai.fin';
  const existingUser = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(demoEmail) as { id: string } | undefined;

  if (!existingUser) {
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, organization, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'user-demo-001',
      'Arjun Mehta',
      demoEmail,
      hashPassword('Demo@2026'),
      'Lead Reconciliation Analyst',
      'Meridian FinOps (Demo)',
      now
    );
  }

  // Seed Sample Policy Knowledge Base
  const samplePolicies = [
    {
      id: 'pol-upi-reversal',
      code: 'SAMPLE-POL-UPI-01',
      title: 'UPI Failed Transaction Debit & Auto-Reversal',
      category: 'UPI & Instant Rails',
      source_label: 'Sample Policy KB (Demonstration Only — Not Official Bank Policy)',
      summary:
        'Governs cases where a customer bank statement shows a completed debit while the UPI app or merchant gateway reports Failed or Pending.',
      full_text:
        'When a bank ledger records a debit for a UPI transaction whose status in the UPI payment app is Failed or Timed Out, the funds are held in suspense by the remitter or beneficiary PSP. Standard simulated reconciliation guidelines expect automated T+1 reversal; if unresolved after T+5 business days, a formal dispute with UTR evidence should be filed.',
      resolution_timeline: 'T+1 auto-reversal; up to T+5 business days via dispute',
      refund_rules:
        '100% principal reversal required if merchant confirms non-receipt and UTR status remains Failed.',
      dispute_steps:
        '1) Verify UTR across Bank Statement and UPI History. 2) Confirm merchant did not issue goods/services. 3) Raise UPI Dispute with UTR, date, and amount.',
      keywords:
        'upi failed debited reversal utr status conflict timeout pending bank statement',
    },
    {
      id: 'pol-dup-debit',
      code: 'SAMPLE-POL-DUP-02',
      title: 'Duplicate Debit & Double Settlement Chargeback',
      category: 'Duplicate & Chargeback',
      source_label: 'Sample Policy KB (Demonstration Only — Not Official Bank Policy)',
      summary:
        'Defines investigation and dispute procedure when identical amount, merchant, and date appear twice in the same ledger source.',
      full_text:
        'Duplicate debits occur due to payment gateway retry storms, network timeouts, or batch settlement replay. Both entries must be preserved in the audit log; the second leg must never be auto-settled and should be raised as a duplicate chargeback dispute with supporting merchant invoice.',
      resolution_timeline: '5 to 7 business days after dispute submission',
      refund_rules:
        'Duplicate leg eligible for full refund once single-delivery invoice is confirmed.',
      dispute_steps:
        '1) Freeze settlement on secondary transaction ID. 2) Attach invoice/receipt showing single order. 3) Submit Duplicate Debit Dispute to acquiring bank.',
      keywords:
        'duplicate double debit chargeback reversal replay same amount merchant',
    },
    {
      id: 'pol-amt-mismatch',
      code: 'SAMPLE-POL-AMT-03',
      title: 'Amount Discrepancy, Partial Settlement & Fee Variance',
      category: 'Amount Variance',
      source_label: 'Sample Policy KB (Demonstration Only — Not Official Bank Policy)',
      summary:
        'Handles cross-source mismatches where the bank debit differs from the vendor invoice, receipt, or wallet record.',
      full_text:
        'Differences between bank debit and merchant receipt may arise from convenience fees, MDR deductions, FX conversion spreads, or unauthorized over-billing. Variances above 2% or exceeding ₹100 require formal dispute or vendor credit note request.',
      resolution_timeline: '3 to 7 business days',
      refund_rules:
        'Overcharged difference refundable via merchant credit note or partial chargeback.',
      dispute_steps:
        '1) Compare line-item receipt total against bank settled amount. 2) Check for disclosed gateway fees. 3) Raise partial amount dispute if variance lacks tax/fee documentation.',
      keywords:
        'amount discrepancy mismatch difference partial settlement fee invoice receipt variance',
    },
    {
      id: 'pol-missing-ref',
      code: 'SAMPLE-POL-REF-04',
      title: 'Missing Reference ID & Unmatched Settlement Tracing',
      category: 'Traceability & Audit',
      source_label: 'Sample Policy KB (Demonstration Only — Not Official Bank Policy)',
      summary:
        'Applies to transactions lacking a UTR/RRN or gateway reference ID that cannot be automatically verified.',
      full_text:
        'Transactions without a valid Reference ID cannot pass automated exact matching. Analysts must request the payment gateway transaction receipt or bank RRN from the initiating source before marking the item resolved.',
      resolution_timeline: '2 to 4 business days for evidence collection',
      refund_rules:
        'No refund initiated until missing reference establishes whether settlement occurred.',
      dispute_steps:
        '1) Select Request Additional Information. 2) Obtain UTR/RRN or PDF receipt. 3) Re-run matching once reference ID is populated.',
      keywords:
        'missing reference utr rrn unmatched tracing receipt information request',
    },
    {
      id: 'pol-high-risk',
      code: 'SAMPLE-POL-RISK-05',
      title: 'High-Risk Anomaly, Outlier & Human-in-the-Loop Escalation',
      category: 'Risk & Compliance',
      source_label: 'Sample Policy KB (Demonstration Only — Not Official Bank Policy)',
      summary:
        'Mandatory human review policy for transactions scoring >= 70/100 risk, unusual high-value outliers, or flagged descriptors.',
      full_text:
        'Any transaction flagged as High Risk (>= 70/100), exhibiting statistical amount outliers, velocity bursts, or exceeding the ₹25,000 high-value threshold must enter Human-in-the-Loop review. Automated systems are strictly prohibited from executing transfers or marking high-risk cases resolved without analyst sign-off.',
      resolution_timeline: 'Immediate freeze; 24-48 hours compliance review',
      refund_rules:
        'Unauthorized transactions must be escalated to fraud support within 24 hours.',
      dispute_steps:
        '1) Escalate for Manual Review. 2) Verify beneficiary identity and authorization logs. 3) Approve or Reject AI recommendation with audit notes.',
      keywords:
        'high risk suspicious anomaly outlier velocity offshore unauthorized hitl manual review escalate',
    },
    {
      id: 'pol-wallet-invoice',
      code: 'SAMPLE-POL-WAL-06',
      title: 'Wallet Ledger & Vendor Invoice Reconciliation Standard',
      category: 'Wallet & AP',
      source_label: 'Sample Policy KB (Demonstration Only — Not Official Bank Policy)',
      summary:
        'Governs T+1 to T+3 settlement windows between corporate wallets, bank accounts, and vendor invoices.',
      full_text:
        'Wallet top-ups and merchant payouts often reflect a 1-to-3 day settlement lag against bank statements and abbreviated merchant descriptors. Fuzzy matching within a 3-day window with identical amounts and verified merchant tokens qualifies for settlement verification.',
      resolution_timeline: 'T+3 business days settlement window',
      refund_rules:
        'Unsettled wallet debits after T+3 qualify for merchant or wallet provider ticket.',
      dispute_steps:
        '1) Confirm T+3 cutoff has elapsed. 2) Verify abbreviated merchant name against invoice. 3) Mark as Resolved if matched, else Request Additional Information.',
      keywords:
        'wallet invoice fuzzy merchant abbreviated settlement window t+3',
    },
  ];

  const insertPol = db.prepare(`
    INSERT OR IGNORE INTO policies (
      id, code, title, category, source_label, summary, full_text,
      resolution_timeline, refund_rules, dispute_steps, keywords
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of samplePolicies) {
    insertPol.run(
      p.id,
      p.code,
      p.title,
      p.category,
      p.source_label,
      p.summary,
      p.full_text,
      p.resolution_timeline,
      p.refund_rules,
      p.dispute_steps,
      p.keywords
    );
  }
}

seedDemoData();
