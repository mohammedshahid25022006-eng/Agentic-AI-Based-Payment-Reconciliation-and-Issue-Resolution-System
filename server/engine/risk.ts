import { dateDiffInDays, levenshteinDistance, merchantSimilarity } from './matcher.ts';
import type {
  MatchCandidateResult,
  RiskAssessment,
  RiskLevel,
  StandardTransaction,
} from './types.ts';

function normalizeRef(ref: string): string {
  return ref
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function assessRiskAndAnomalies(
  transactions: StandardTransaction[],
  matchResults: Map<string, MatchCandidateResult>
): Map<string, RiskAssessment> {
  const assessments = new Map<string, RiskAssessment>();
  const amounts = transactions.map((t) => t.amount);
  const meanAmt =
    amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const sdAmt = stdDev(amounts, meanAmt);
  const medAmt = median(amounts);

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const match = matchResults.get(tx.id);
    const flags: RiskAssessment['flags'] = [];
    let score = 0;
    let isDuplicate = false;
    let isSuspicious = false;

    const refA = normalizeRef(tx.referenceId);

    // 1. Duplicate detection within the SAME source (double debit / identical UTR replay)
    const sameSourceDupes = transactions.filter((other, j) => {
      if (i === j) return false;
      if (other.sourceCategory !== tx.sourceCategory) return false;
      const sameAmount = Math.abs(other.amount - tx.amount) <= 0.01;
      const dayGap = dateDiffInDays(other.txDate, tx.txDate);
      const mSim = merchantSimilarity(other.merchantName, tx.merchantName);
      const refB = normalizeRef(other.referenceId);
      const sameRef = Boolean(
        refA && refB && refA !== 'MISSINGREF' && refA === refB
      );
      const missingOrSameRef =
        sameRef || refA === 'MISSINGREF' || refB === 'MISSINGREF';
      return sameRef || (sameAmount && mSim >= 0.8 && dayGap <= 1 && missingOrSameRef);
    });

    if (sameSourceDupes.length > 0) {
      isDuplicate = true;
      score += 45;
      flags.push({
        code: 'DUPLICATE_TX',
        label: 'Duplicate Transaction Detected',
        severity: 'high',
        points: 45,
        detail: `Matches ${sameSourceDupes.length} other entry in ${tx.source} (${sameSourceDupes.map((d) => d.transactionId).join(', ')}) with identical amount ${tx.currency} ${tx.amount.toFixed(2)}.`,
      });
    }

    // 2. Near-identical Reference IDs for the SAME merchant with conflicting amounts
    if (refA && refA !== 'MISSINGREF' && refA.length >= 6) {
      const collisions = transactions.filter((other, j) => {
        if (i === j) return false;
        const refB = normalizeRef(other.referenceId);
        if (!refB || refB === 'MISSINGREF' || refA === refB) return false;
        if (Math.abs(other.amount - tx.amount) <= 0.01) return false;
        if (merchantSimilarity(other.merchantName, tx.merchantName) < 0.75) return false;
        return levenshteinDistance(refA, refB) <= 1;
      });
      if (collisions.length > 0) {
        isSuspicious = true;
        score += 25;
        flags.push({
          code: 'SIMILAR_REF_ANOMALY',
          label: 'Near-Identical Reference ID Pattern',
          severity: 'medium',
          points: 25,
          detail: `Reference ${tx.referenceId} differs by 1 character from ${collisions.map((s) => `${s.referenceId} (${s.currency} ${s.amount})`).join(', ')} for the same merchant.`,
        });
      }
    }

    // 3. Unusual / Outlier Amount
    const zScore = sdAmt > 0 ? (tx.amount - meanAmt) / sdAmt : 0;
    const isHighValue = tx.amount >= 25000;
    const isStatisticalOutlier =
      amounts.length >= 4 && (zScore >= 2.0 || (medAmt > 0 && tx.amount >= medAmt * 4));

    if (isStatisticalOutlier || isHighValue) {
      const pts = isStatisticalOutlier && isHighValue ? 32 : tx.amount >= 50000 ? 30 : 22;
      score += pts;
      if (isStatisticalOutlier) isSuspicious = true;
      flags.push({
        code: 'UNUSUAL_AMOUNT',
        label: isStatisticalOutlier ? 'Statistical Amount Outlier' : 'High-Value Threshold',
        severity: isHighValue ? 'high' : 'medium',
        points: pts,
        detail: `Amount ${tx.currency} ${tx.amount.toFixed(2)} exceeds ${isStatisticalOutlier ? `statistical baseline (median ${medAmt.toFixed(0)}, z=${zScore.toFixed(1)})` : 'high-value review threshold (25,000)'}.`,
      });
    }

    // 4. Unmatched / Mismatch / Missing Reference Penalties
    if (match && match.matchingStatus === 'Unmatched') {
      const hasAmountOrStatusConflict =
        match.mismatchReason?.includes('Amount') ||
        match.mismatchReason?.includes('Status conflict');
      const pts = hasAmountOrStatusConflict ? 30 : 20;
      score += pts;
      if (hasAmountOrStatusConflict && tx.amount >= 10000) {
        isSuspicious = true;
      }
      flags.push({
        code: hasAmountOrStatusConflict ? 'CONFLICT_DETECTED' : 'UNMATCHED_RECORD',
        label: hasAmountOrStatusConflict ? 'Cross-Source Discrepancy' : 'Unmatched Transaction',
        severity: hasAmountOrStatusConflict ? 'high' : 'medium',
        points: pts,
        detail: match.mismatchReason || 'No matching counterpart located in cross-source records.',
      });
    }

    if (!tx.referenceId || tx.referenceId === 'MISSING-REF') {
      score += 15;
      flags.push({
        code: 'MISSING_REFERENCE',
        label: 'Missing Payment Reference ID',
        severity: 'medium',
        points: 15,
        detail: 'Transaction lacks a UTR/RRN or gateway reference ID for automated settlement tracing.',
      });
    }

    // 5. Same-day velocity burst to same merchant across same source
    const velocityMatches = transactions.filter(
      (other, j) =>
        i !== j &&
        other.sourceCategory === tx.sourceCategory &&
        other.txDate === tx.txDate &&
        merchantSimilarity(other.merchantName, tx.merchantName) >= 0.85
    );
    if (velocityMatches.length >= 2) {
      isSuspicious = true;
      score += 20;
      flags.push({
        code: 'VELOCITY_BURST',
        label: 'Rapid Merchant Velocity Burst',
        severity: 'medium',
        points: 20,
        detail: `${velocityMatches.length + 1} transactions recorded for "${tx.merchantName}" on ${tx.txDate} in ${tx.source}.`,
      });
    }

    // 6. Suspicious keywords in narration/merchant
    const combinedText = `${tx.merchantName} ${tx.description}`.toLowerCase();
    if (
      /\b(unknown|unverified|suspicious|offshore|crypto|wire-hold|chargeback|unauthorized)\b/.test(
        combinedText
      )
    ) {
      isSuspicious = true;
      score += 30;
      flags.push({
        code: 'SUSPICIOUS_DESCRIPTOR',
        label: 'Flagged Counterparty Descriptor',
        severity: 'high',
        points: 30,
        detail: 'Transaction description or merchant descriptor matches high-risk audit terminology.',
      });
    }

    const clampedScore = Math.min(100, Math.max(0, Math.round(score)));
    let riskLevel: RiskLevel = 'Low Risk';
    if (clampedScore >= 70) riskLevel = 'High Risk';
    else if (clampedScore >= 35) riskLevel = 'Medium Risk';

    if (clampedScore >= 70) {
      isSuspicious = true;
    }

    const hitlRequired = riskLevel === 'High Risk' || tx.amount >= 25000 || isDuplicate;

    assessments.set(tx.id, {
      transactionId: tx.id,
      riskScore: clampedScore,
      riskLevel,
      isDuplicate,
      isSuspicious,
      hitlRequired,
      flags,
    });
  }

  return assessments;
}
