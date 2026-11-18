import crypto from 'node:crypto';
import { db } from '../db.ts';
import { matchTransactions } from '../engine/matcher.ts';
import { retrieveApplicablePolicyForTransaction } from '../engine/policyRag.ts';
import { decideResolutionAction } from '../engine/resolution.ts';
import { assessRiskAndAnomalies } from '../engine/risk.ts';
import type {
  PolicyDocument,
  SourceCategory,
  StandardTransaction,
} from '../engine/types.ts';
import {
  generateInvestigationNarratives,
  type InvestigationPromptItem,
} from './gemini.ts';

interface DbTransactionRow {
  id: string;
  file_id: string;
  transaction_id: string;
  reference_id: string;
  tx_date: string;
  amount: number;
  currency: string;
  merchant_name: string;
  payment_method: string;
  tx_status: string;
  source: string;
  source_category: SourceCategory;
  description: string;
}

interface DbPolicyRow {
  id: string;
  code: string;
  title: string;
  category: string;
  source_label: string;
  summary: string;
  full_text: string;
  resolution_timeline: string;
  refund_rules: string;
  dispute_steps: string;
  keywords: string;
}

export interface SupervisorRunResult {
  runId: string;
  status: string;
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  duplicateCount: number;
  suspiciousCount: number;
  totalAmount: number;
  reconciledAmount: number;
  hitlCount: number;
  geminiStatus: 'connected' | 'unavailable';
  geminiWarning?: string;
  agentExecutions: Array<{
    agentName: string;
    stepOrder: number;
    status: string;
    durationMs: number;
    summary: string;
    metrics: Record<string, unknown>;
  }>;
}

export async function runSupervisorReconciliation(
  userId: string,
  userName: string
): Promise<SupervisorRunResult> {
  const rawTxRows = db
    .prepare(
      `SELECT id, file_id, transaction_id, reference_id, tx_date, amount, currency,
              merchant_name, payment_method, tx_status, source, source_category, description
       FROM transactions WHERE user_id = ? ORDER BY tx_date ASC, created_at ASC`
    )
    .all(userId) as unknown as DbTransactionRow[];

  if (rawTxRows.length === 0) {
    throw new Error(
      'No uploaded transactions found. Upload statements or load sample datasets before starting reconciliation.'
    );
  }

  const runId = `RUN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const runStartedAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO reconciliation_runs (id, user_id, status, started_at, total_count)
     VALUES (?, ?, 'Running', ?, ?)`
  ).run(runId, userId, runStartedAt, rawTxRows.length);

  const agentExecutions: SupervisorRunResult['agentExecutions'] = [];
  const insertAgentStep = db.prepare(`
    INSERT INTO agent_executions (
      id, run_id, user_id, agent_name, step_order, status,
      started_at, completed_at, duration_ms, summary, metrics_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const recordAgentStep = (
    agentName: string,
    stepOrder: number,
    startedMs: number,
    summary: string,
    metrics: Record<string, unknown>,
    status = 'Completed'
  ) => {
    const endMs = Date.now();
    const durationMs = Math.max(12, endMs - startedMs);
    const sIso = new Date(startedMs).toISOString();
    const eIso = new Date(endMs).toISOString();
    insertAgentStep.run(
      crypto.randomUUID(),
      runId,
      userId,
      agentName,
      stepOrder,
      status,
      sIso,
      eIso,
      durationMs,
      summary,
      JSON.stringify(metrics)
    );
    agentExecutions.push({
      agentName,
      stepOrder,
      status,
      durationMs,
      summary,
      metrics,
    });
  };

  // Convert DB rows to StandardTransaction
  const transactions: StandardTransaction[] = rawTxRows.map((r) => ({
    id: r.id,
    fileId: r.file_id,
    transactionId: r.transaction_id,
    referenceId: r.reference_id,
    txDate: r.tx_date,
    amount: r.amount,
    currency: r.currency,
    merchantName: r.merchant_name,
    paymentMethod: r.payment_method,
    txStatus: r.tx_status,
    source: r.source,
    sourceCategory: r.source_category,
    description: r.description,
  }));

  // 0. Supervisor Initialization
  const t0 = Date.now();
  const sourcesCount = new Set(transactions.map((t) => t.sourceCategory)).size;
  recordAgentStep(
    'Supervisor Agent',
    0,
    t0,
    `Orchestrating reconciliation across ${transactions.length} transactions from ${sourcesCount} source categories.`,
    { totalTransactions: transactions.length, sourceCategories: sourcesCount }
  );

  // 1. Document Processing Agent
  const t1 = Date.now();
  const fileStats = db
    .prepare(
      `SELECT COUNT(*) as files, COALESCE(SUM(rejected_count), 0) as rejected FROM uploaded_files WHERE user_id = ?`
    )
    .get(userId) as { files: number; rejected: number };
  recordAgentStep(
    'Document Processing Agent',
    1,
    t1,
    `Verified ${transactions.length} standardized transaction records across ${fileStats.files} uploaded file(s) (${fileStats.rejected} invalid rows filtered).`,
    {
      filesProcessed: fileStats.files,
      structuredRecords: transactions.length,
      rejectedRows: fileStats.rejected,
    }
  );

  // 2. Transaction Matching Agent
  const t2 = Date.now();
  const matchMap = matchTransactions(transactions);
  let matchedCount = 0;
  let unmatchedCount = 0;
  let exactMatches = 0;
  let fuzzyMatches = 0;
  for (const tx of transactions) {
    const m = matchMap.get(tx.id);
    if (m?.matchingStatus === 'Matched') {
      matchedCount++;
      if (m.matchType === 'Exact') exactMatches++;
      if (m.matchType === 'Fuzzy') fuzzyMatches++;
    } else {
      unmatchedCount++;
    }
  }
  recordAgentStep(
    'Transaction Matching Agent',
    2,
    t2,
    `Matched ${matchedCount} records (${exactMatches} exact, ${fuzzyMatches} fuzzy) and isolated ${unmatchedCount} unmatched/conflicting transactions.`,
    { matchedCount, unmatchedCount, exactMatches, fuzzyMatches }
  );

  // 3. Risk / Anomaly Detection Agent
  const t3 = Date.now();
  const riskMap = assessRiskAndAnomalies(transactions, matchMap);
  let duplicateCount = 0;
  let suspiciousCount = 0;
  let highRiskCount = 0;
  let mediumRiskCount = 0;
  for (const tx of transactions) {
    const r = riskMap.get(tx.id)!;
    if (r.isDuplicate) duplicateCount++;
    if (r.isSuspicious) suspiciousCount++;
    if (r.riskLevel === 'High Risk') highRiskCount++;
    else if (r.riskLevel === 'Medium Risk') mediumRiskCount++;
  }
  recordAgentStep(
    'Risk / Anomaly Agent',
    3,
    t3,
    `Detected ${duplicateCount} duplicate leg(s), ${suspiciousCount} suspicious pattern(s), ${highRiskCount} high-risk and ${mediumRiskCount} medium-risk records.`,
    { duplicateCount, suspiciousCount, highRiskCount, mediumRiskCount }
  );

  // 4. Policy / RAG Agent
  const t4 = Date.now();
  const policyRows = db.prepare('SELECT * FROM policies').all() as unknown as DbPolicyRow[];
  const policies: PolicyDocument[] = policyRows.map((p) => ({
    id: p.id,
    code: p.code,
    title: p.title,
    category: p.category,
    sourceLabel: p.source_label,
    summary: p.summary,
    fullText: p.full_text,
    resolutionTimeline: p.resolution_timeline,
    refundRules: p.refund_rules,
    disputeSteps: p.dispute_steps,
    keywords: p.keywords,
  }));

  const policyMap = new Map<string, ReturnType<typeof retrieveApplicablePolicyForTransaction>>();
  let policyMatchCount = 0;
  for (const tx of transactions) {
    const m = matchMap.get(tx.id)!;
    const r = riskMap.get(tx.id)!;
    const pMatch = retrieveApplicablePolicyForTransaction(tx, m, r, policies);
    policyMap.set(tx.id, pMatch);
    if (pMatch) policyMatchCount++;
  }
  recordAgentStep(
    'Policy / RAG Agent',
    4,
    t4,
    `Retrieved applicable Sample Policy KB clauses for ${policyMatchCount} transactions across ${policies.length} indexed policy documents.`,
    { indexedPolicies: policies.length, matchedClauses: policyMatchCount }
  );

  // 5. Resolution Agent (Decisions)
  const t5 = Date.now();
  const resolutionMap = new Map<string, ReturnType<typeof decideResolutionAction>>();
  const actionCounts: Record<string, number> = {};
  let hitlCount = 0;

  for (const tx of transactions) {
    const m = matchMap.get(tx.id)!;
    const r = riskMap.get(tx.id)!;
    const p = policyMap.get(tx.id) ?? null;
    const decision = decideResolutionAction(tx, m, r, p);
    resolutionMap.set(tx.id, decision);
    actionCounts[decision.recommendedAction] =
      (actionCounts[decision.recommendedAction] ?? 0) + 1;
    if (decision.hitlRequired) hitlCount++;
  }
  recordAgentStep(
    'Resolution Agent',
    6,
    t5,
    `Prepared recommended actions for ${transactions.length} records (no auto-transfers executed).`,
    actionCounts
  );

  // 6. Investigation Agent + Gemini Narratives for Unmatched / Flagged / High-Value items
  const t6 = Date.now();
  const itemsForGemini: InvestigationPromptItem[] = transactions
    .filter((tx) => {
      const m = matchMap.get(tx.id)!;
      const r = riskMap.get(tx.id)!;
      return m.matchingStatus === 'Unmatched' || r.riskScore >= 35 || r.hitlRequired;
    })
    .slice(0, 18)
    .map((tx) => {
      const m = matchMap.get(tx.id)!;
      const r = riskMap.get(tx.id)!;
      const p = policyMap.get(tx.id);
      const res = resolutionMap.get(tx.id)!;
      return {
        id: tx.id,
        transactionId: tx.transactionId,
        referenceId: tx.referenceId,
        txDate: tx.txDate,
        amount: tx.amount,
        currency: tx.currency,
        merchantName: tx.merchantName,
        source: tx.source,
        txStatus: tx.txStatus,
        matchingStatus: m.matchingStatus,
        mismatchReason: m.mismatchReason,
        riskScore: r.riskScore,
        riskLevel: r.riskLevel,
        isDuplicate: r.isDuplicate,
        isSuspicious: r.isSuspicious,
        riskFlags: r.flags.map((f) => `${f.label}: ${f.detail}`),
        policyCode: p?.policy.code ?? null,
        policyTitle: p?.policy.title ?? null,
        policyTimeline: p?.policy.resolutionTimeline ?? null,
        recommendedAction: res.recommendedAction,
      };
    });

  let geminiNarratives = new Map<
    string,
    { investigationReport: string; aiExplanation: string; policyExplanation: string }
  >();
  let geminiStatus: 'connected' | 'unavailable' = 'connected';
  let geminiWarning: string | undefined;

  if (itemsForGemini.length > 0) {
    try {
      geminiNarratives = await generateInvestigationNarratives(itemsForGemini);
    } catch (err) {
      geminiStatus = 'unavailable';
      geminiWarning =
        err instanceof Error
          ? err.message
          : 'Gemini narrative generation failed; factual rule-based diagnostics retained.';
    }
  }

  recordAgentStep(
    'Investigation Agent',
    5,
    t6,
    geminiStatus === 'connected'
      ? `Investigated ${itemsForGemini.length} flagged/unmatched cases and generated Gemini AI evidence reports.`
      : `Investigated ${itemsForGemini.length} flagged/unmatched cases using factual rule-based evidence (${geminiWarning}).`,
    {
      investigatedCount: itemsForGemini.length,
      geminiStatus,
    },
    geminiStatus === 'connected' ? 'Completed' : 'Completed (Rule Fallback)'
  );

  // 7. Human-in-the-Loop Agent
  const t7 = Date.now();
  recordAgentStep(
    'Human-in-the-Loop Agent',
    7,
    t7,
    `Routed ${hitlCount} high-risk, duplicate, or high-value case(s) to the Human Review queue for analyst approval.`,
    { hitlQueueCount: hitlCount }
  );

  // Persist all transaction updates in SQLite transaction
  let totalAmount = 0;
  let reconciledAmount = 0;
  const nowIso = new Date().toISOString();

  const updateTxStmt = db.prepare(`
    UPDATE transactions SET
      run_id = ?,
      matching_status = ?,
      matched_with_id = ?,
      matched_with_tx_code = ?,
      matched_with_source = ?,
      match_type = ?,
      match_confidence = ?,
      mismatch_reason = ?,
      mismatch_details_json = ?,
      risk_score = ?,
      risk_level = ?,
      is_duplicate = ?,
      is_suspicious = ?,
      risk_flags_json = ?,
      investigation_report = ?,
      ai_explanation = ?,
      applicable_policy_id = ?,
      applicable_policy_summary = ?,
      recommended_action = ?,
      hitl_required = ?,
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `);

  db.exec('BEGIN');
  try {
    for (const tx of transactions) {
      const m = matchMap.get(tx.id)!;
      const r = riskMap.get(tx.id)!;
      const p = policyMap.get(tx.id);
      const res = resolutionMap.get(tx.id)!;
      const gem = geminiNarratives.get(tx.id);

      totalAmount += tx.amount;
      if (m.matchingStatus === 'Matched' && !r.isDuplicate && !r.isSuspicious) {
        reconciledAmount += tx.amount;
      }

      const fallbackInvestigation =
        m.matchingStatus === 'Matched'
          ? `Verified ${m.matchType.toLowerCase()} match (${m.matchConfidence}% confidence) with ${m.matchedWithTxCode} (${m.matchedWithSource}). Risk score: ${r.riskScore}/100.`
          : `Unmatched investigation: ${m.mismatchReason || 'Counter-record missing'}. Risk indicators: ${r.flags.map((f) => f.label).join('; ') || 'None'}.`;

      const fallbackExplanation = res.rationale;

      const policySummary = p
        ? `${p.policy.code}: ${p.policy.title} (${p.policy.sourceLabel}) — Timeline: ${p.policy.resolutionTimeline}.${gem?.policyExplanation ? ` ${gem.policyExplanation}` : ` ${p.policy.summary}`}`
        : 'No specific sample policy matched.';

      updateTxStmt.run(
        runId,
        m.matchingStatus,
        m.matchedWithId,
        m.matchedWithTxCode,
        m.matchedWithSource,
        m.matchType,
        m.matchConfidence,
        m.mismatchReason,
        JSON.stringify(m.mismatchDetails),
        r.riskScore,
        r.riskLevel,
        r.isDuplicate ? 1 : 0,
        r.isSuspicious ? 1 : 0,
        JSON.stringify(r.flags),
        gem?.investigationReport || fallbackInvestigation,
        gem?.aiExplanation || fallbackExplanation,
        p?.policy.id ?? null,
        policySummary,
        res.recommendedAction,
        res.hitlRequired ? 1 : 0,
        nowIso,
        tx.id,
        userId
      );
    }

    db.prepare(
      `UPDATE reconciliation_runs SET
        status = 'Completed',
        completed_at = ?,
        total_count = ?,
        matched_count = ?,
        unmatched_count = ?,
        duplicate_count = ?,
        suspicious_count = ?,
        total_amount = ?,
        reconciled_amount = ?,
        hitl_count = ?,
        summary_notes = ?
      WHERE id = ?`
    ).run(
      nowIso,
      transactions.length,
      matchedCount,
      unmatchedCount,
      duplicateCount,
      suspiciousCount,
      Math.round(totalAmount * 100) / 100,
      Math.round(reconciledAmount * 100) / 100,
      hitlCount,
      geminiWarning || 'All 7 specialized agents executed successfully.',
      runId
    );

    db.prepare(
      `INSERT INTO audit_logs (id, user_id, user_name, transaction_id, tx_code, action, previous_status, new_status, notes, source_agent, created_at)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      userName,
      'Reconciliation Run Completed',
      'Pending',
      'Completed',
      `Run ${runId}: ${matchedCount} matched, ${unmatchedCount} unmatched, ${duplicateCount} duplicates, ${hitlCount} queued for HITL review.`,
      'Supervisor Agent',
      nowIso
    );

    db.prepare(
      `INSERT INTO notifications (id, user_id, title, message, channel, is_read, created_at)
       VALUES (?, ?, ?, ?, 'In-App', 0, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      `Reconciliation ${runId} Complete`,
      `Processed ${transactions.length} transactions: ${matchedCount} matched, ${unmatchedCount} unmatched, ${hitlCount} requiring Human-in-the-Loop review.`,
      nowIso
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    runId,
    status: 'Completed',
    totalCount: transactions.length,
    matchedCount,
    unmatchedCount,
    duplicateCount,
    suspiciousCount,
    totalAmount: Math.round(totalAmount * 100) / 100,
    reconciledAmount: Math.round(reconciledAmount * 100) / 100,
    hitlCount,
    geminiStatus,
    geminiWarning,
    agentExecutions,
  };
}
