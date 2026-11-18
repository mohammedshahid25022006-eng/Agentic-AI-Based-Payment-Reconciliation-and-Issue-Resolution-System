import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { db } from '../db.ts';

export interface ReportPayload {
  generatedAt: string;
  userName: string;
  organization: string;
  summary: {
    totalTransactions: number;
    matchedTransactions: number;
    unmatchedTransactions: number;
    duplicateTransactions: number;
    suspiciousTransactions: number;
    totalAmount: number;
    reconciledAmount: number;
    resolvedIssues: number;
    pendingIssues: number;
    hitlQueueCount: number;
  };
  transactions: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
}

export function buildReportPayload(
  userId: string,
  userName: string,
  organization: string
): ReportPayload {
  const transactions = db
    .prepare(
      `SELECT transaction_id, reference_id, tx_date, amount, currency, merchant_name,
              payment_method, tx_status, source, matching_status, match_type,
              match_confidence, mismatch_reason, risk_score, risk_level,
              is_duplicate, is_suspicious, investigation_report,
              applicable_policy_summary, recommended_action, hitl_required,
              resolution_status, user_notes
       FROM transactions WHERE user_id = ? ORDER BY tx_date DESC, risk_score DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  const auditLogs = db
    .prepare(
      `SELECT created_at, user_name, tx_code, action, previous_status, new_status, source_agent, notes
       FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`
    )
    .all(userId) as Array<Record<string, unknown>>;

  let matchedTransactions = 0;
  let unmatchedTransactions = 0;
  let duplicateTransactions = 0;
  let suspiciousTransactions = 0;
  let totalAmount = 0;
  let reconciledAmount = 0;
  let resolvedIssues = 0;
  let pendingIssues = 0;
  let hitlQueueCount = 0;

  for (const tx of transactions) {
    const amt = Number(tx.amount) || 0;
    totalAmount += amt;
    if (tx.matching_status === 'Matched') {
      matchedTransactions++;
      if (!tx.is_duplicate && !tx.is_suspicious) reconciledAmount += amt;
    } else if (tx.matching_status === 'Unmatched') {
      unmatchedTransactions++;
    }
    if (tx.is_duplicate) duplicateTransactions++;
    if (tx.is_suspicious) suspiciousTransactions++;
    if (tx.hitl_required) hitlQueueCount++;

    const resStatus = String(tx.resolution_status || 'Open');
    if (resStatus === 'Resolved' || resStatus === 'Approved') {
      resolvedIssues++;
    } else if (
      tx.matching_status === 'Unmatched' ||
      tx.is_duplicate ||
      tx.is_suspicious ||
      resStatus === 'Disputed' ||
      resStatus === 'Escalated' ||
      resStatus === 'Info Requested'
    ) {
      pendingIssues++;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    userName,
    organization,
    summary: {
      totalTransactions: transactions.length,
      matchedTransactions,
      unmatchedTransactions,
      duplicateTransactions,
      suspiciousTransactions,
      totalAmount: Math.round(totalAmount * 100) / 100,
      reconciledAmount: Math.round(reconciledAmount * 100) / 100,
      resolvedIssues,
      pendingIssues,
      hitlQueueCount,
    },
    transactions,
    auditLogs,
  };
}

export function generateCsvReport(payload: ReportPayload): Buffer {
  const summaryLines = [
    'RECONCILIATION SUMMARY',
    `Generated At,${payload.generatedAt}`,
    `Analyst,${payload.userName}`,
    `Organization,${payload.organization}`,
    `Total Transactions,${payload.summary.totalTransactions}`,
    `Matched Transactions,${payload.summary.matchedTransactions}`,
    `Unmatched Transactions,${payload.summary.unmatchedTransactions}`,
    `Duplicate Transactions,${payload.summary.duplicateTransactions}`,
    `Suspicious Transactions,${payload.summary.suspiciousTransactions}`,
    `Total Reconciled Amount,${payload.summary.reconciledAmount.toFixed(2)}`,
    `Resolved Issues,${payload.summary.resolvedIssues}`,
    `Pending Issues,${payload.summary.pendingIssues}`,
    '',
    'TRANSACTION RECONCILIATION & INVESTIGATION DETAILS',
  ];

  const headers = [
    'Transaction ID',
    'Reference ID',
    'Date',
    'Merchant',
    'Amount',
    'Currency',
    'Source',
    'Payment Method',
    'Matching Status',
    'Match Type',
    'Risk Score',
    'Risk Level',
    'Duplicate',
    'Suspicious',
    'Recommended Action',
    'Resolution Status',
    'Mismatch Reason',
    'Investigation Report',
    'Applicable Policy',
  ];

  const esc = (v: unknown) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = payload.transactions.map((t) =>
    [
      t.transaction_id,
      t.reference_id,
      t.tx_date,
      t.merchant_name,
      Number(t.amount).toFixed(2),
      t.currency,
      t.source,
      t.payment_method,
      t.matching_status,
      t.match_type,
      t.risk_score,
      t.risk_level,
      t.is_duplicate ? 'Yes' : 'No',
      t.is_suspicious ? 'Yes' : 'No',
      t.recommended_action,
      t.resolution_status,
      t.mismatch_reason,
      t.investigation_report,
      t.applicable_policy_summary,
    ]
      .map(esc)
      .join(',')
  );

  const auditSection = [
    '',
    'AUDIT TRAIL',
    'Timestamp,Actor,Transaction Code,Action,Previous Status,New Status,Agent/Source,Notes',
    ...payload.auditLogs.map((a) =>
      [
        a.created_at,
        a.user_name,
        a.tx_code || '-',
        a.action,
        a.previous_status || '-',
        a.new_status || '-',
        a.source_agent,
        a.notes || '',
      ]
        .map(esc)
        .join(',')
    ),
  ];

  const csv = [...summaryLines, headers.join(','), ...rows, ...auditSection].join('\n');
  return Buffer.from(csv, 'utf8');
}

export function generateExcelReport(payload: ReportPayload): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    { Metric: 'Generated At', Value: payload.generatedAt },
    { Metric: 'Analyst', Value: payload.userName },
    { Metric: 'Organization', Value: payload.organization },
    { Metric: 'Total Transactions', Value: payload.summary.totalTransactions },
    { Metric: 'Matched Transactions', Value: payload.summary.matchedTransactions },
    { Metric: 'Unmatched Transactions', Value: payload.summary.unmatchedTransactions },
    { Metric: 'Duplicate Transactions', Value: payload.summary.duplicateTransactions },
    { Metric: 'Suspicious Transactions', Value: payload.summary.suspiciousTransactions },
    { Metric: 'Total Volume Amount', Value: payload.summary.totalAmount },
    { Metric: 'Total Reconciled Amount', Value: payload.summary.reconciledAmount },
    { Metric: 'Resolved Issues', Value: payload.summary.resolvedIssues },
    { Metric: 'Pending Issues', Value: payload.summary.pendingIssues },
    { Metric: 'Human-in-the-Loop Cases', Value: payload.summary.hitlQueueCount },
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(summaryRows),
    'Reconciliation Summary'
  );

  const txRows = payload.transactions.map((t) => ({
    TransactionID: t.transaction_id,
    ReferenceID: t.reference_id,
    Date: t.tx_date,
    Merchant: t.merchant_name,
    Amount: t.amount,
    Currency: t.currency,
    Source: t.source,
    Method: t.payment_method,
    MatchingStatus: t.matching_status,
    MatchType: t.match_type,
    RiskScore: t.risk_score,
    RiskLevel: t.risk_level,
    Duplicate: t.is_duplicate ? 'Yes' : 'No',
    Suspicious: t.is_suspicious ? 'Yes' : 'No',
    RecommendedAction: t.recommended_action,
    ResolutionStatus: t.resolution_status,
    MismatchReason: t.mismatch_reason || '',
    InvestigationReport: t.investigation_report || '',
    ApplicablePolicy: t.applicable_policy_summary || '',
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(txRows),
    'Transactions & Risk'
  );

  const auditRows = payload.auditLogs.map((a) => ({
    Timestamp: a.created_at,
    Actor: a.user_name,
    TransactionCode: a.tx_code || '-',
    Action: a.action,
    PreviousStatus: a.previous_status || '-',
    NewStatus: a.new_status || '-',
    SourceAgent: a.source_agent,
    Notes: a.notes || '',
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(auditRows),
    'Audit Trail'
  );

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function generatePdfReport(payload: ReportPayload): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('ReconAI — Payment Reconciliation & Issue Resolution Report', 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Organization: ${payload.organization}   |   Analyst: ${payload.userName}   |   Generated: ${new Date(payload.generatedAt).toLocaleString()}`,
    14,
    22
  );

  autoTable(doc, {
    startY: 27,
    head: [
      [
        'Total Txns',
        'Matched',
        'Unmatched',
        'Duplicates',
        'Suspicious',
        'Reconciled Amount',
        'Resolved Issues',
        'Pending Issues',
      ],
    ],
    body: [
      [
        String(payload.summary.totalTransactions),
        String(payload.summary.matchedTransactions),
        String(payload.summary.unmatchedTransactions),
        String(payload.summary.duplicateTransactions),
        String(payload.summary.suspiciousTransactions),
        `INR ${payload.summary.reconciledAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        String(payload.summary.resolvedIssues),
        String(payload.summary.pendingIssues),
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  const afterSummaryY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Transaction Investigation, Risk & Resolution Matrix', 14, afterSummaryY);

  autoTable(doc, {
    startY: afterSummaryY + 3,
    head: [
      [
        'Txn ID',
        'Date',
        'Merchant',
        'Source',
        'Amount',
        'Match',
        'Risk',
        'Recommended Action',
        'Status',
        'Key Finding',
      ],
    ],
    body: payload.transactions.slice(0, 60).map((t) => [
      String(t.transaction_id),
      String(t.tx_date),
      String(t.merchant_name).slice(0, 22),
      String(t.source).slice(0, 18),
      `${t.currency} ${Number(t.amount).toFixed(2)}`,
      String(t.matching_status),
      `${t.risk_score} (${String(t.risk_level).replace(' Risk', '')})`,
      String(t.recommended_action || '-'),
      String(t.resolution_status || 'Open'),
      String(t.mismatch_reason || t.investigation_report || 'Verified').slice(0, 52),
    ]),
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [13, 148, 136] },
  });

  if (payload.auditLogs.length > 0) {
    doc.addPage();
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Human-in-the-Loop & Agent Audit Trail', 14, 16);

    autoTable(doc, {
      startY: 21,
      head: [['Timestamp', 'Actor', 'Txn Code', 'Action', 'Status Change', 'Source Agent', 'Notes']],
      body: payload.auditLogs.slice(0, 50).map((a) => [
        new Date(String(a.created_at)).toLocaleString(),
        String(a.user_name),
        String(a.tx_code || '-'),
        String(a.action),
        `${a.previous_status || '-'} -> ${a.new_status || '-'}`,
        String(a.source_agent),
        String(a.notes || '').slice(0, 65),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] },
    });
  }

  return Buffer.from(doc.output('arraybuffer'));
}
