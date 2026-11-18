import type {
  MatchCandidateResult,
  PolicyRetrievalResult,
  ResolutionDecision,
  RiskAssessment,
  StandardTransaction,
} from './types.ts';

export function decideResolutionAction(
  tx: StandardTransaction,
  match: MatchCandidateResult,
  risk: RiskAssessment,
  policyMatch: PolicyRetrievalResult | null
): ResolutionDecision {
  const policyNote = policyMatch
    ? ` Referenced ${policyMatch.policy.code} (${policyMatch.policy.title}, timeline: ${policyMatch.policy.resolutionTimeline}).`
    : '';

  // 1. High risk, duplicate debit, or suspicious anomaly -> Escalate or Dispute
  if (risk.isDuplicate) {
    return {
      recommendedAction: 'Raise a Dispute',
      rationale: `Duplicate debit identified in ${tx.source} for ${tx.currency} ${tx.amount.toFixed(2)}. Recommend filing a duplicate charge reversal dispute rather than auto-settling.${policyNote}`,
      hitlRequired: true,
      priority: 'Critical',
    };
  }

  if (risk.riskLevel === 'High Risk' || risk.isSuspicious) {
    return {
      recommendedAction: 'Escalate for Manual Review',
      rationale: `Risk score ${risk.riskScore}/100 (${risk.riskLevel}) triggered by ${risk.flags.map((f) => f.label).join(', ')}. Human-in-the-loop audit required before any settlement.${policyNote}`,
      hitlRequired: true,
      priority: 'Critical',
    };
  }

  // 2. Unmatched cases
  if (match.matchingStatus === 'Unmatched') {
    const reasonLower = (match.mismatchReason ?? '').toLowerCase();
    if (reasonLower.includes('status conflict') || reasonLower.includes('amount')) {
      return {
        recommendedAction: 'Raise a Dispute',
        rationale: `${match.mismatchReason}. Recommend raising a settlement dispute with supporting statement evidence.${policyNote}`,
        hitlRequired: tx.amount >= 25000 || risk.riskScore >= 50,
        priority: 'High',
      };
    }

    if (!tx.referenceId || tx.referenceId === 'MISSING-REF') {
      return {
        recommendedAction: 'Request Additional Information',
        rationale: `Transaction lacks a verifiable UTR/Reference ID and has no cross-source match. Request receipt or gateway settlement ID from counterparty.${policyNote}`,
        hitlRequired: tx.amount >= 25000,
        priority: 'High',
      };
    }

    return {
      recommendedAction: 'Request Additional Information',
      rationale: `${match.mismatchReason}. Counter-statement may be pending T+1 settlement or missing from uploaded batch.${policyNote}`,
      hitlRequired: tx.amount >= 25000,
      priority: 'High',
    };
  }

  // 3. Matched transactions
  if (risk.hitlRequired) {
    return {
      recommendedAction: 'Escalate for Manual Review',
      rationale: `Transaction matched (${match.matchType}, ${match.matchConfidence}% confidence) but flagged for human sign-off due to high value (${tx.currency} ${tx.amount.toFixed(2)}).${policyNote}`,
      hitlRequired: true,
      priority: 'High',
    };
  }

  return {
    recommendedAction: 'Mark as Resolved',
    rationale: `Verified ${match.matchType.toLowerCase()} match (${match.matchConfidence}% confidence) with ${match.matchedWithSource ?? 'counter-source'} and low risk (${risk.riskScore}/100). Safe to mark resolved.${policyNote}`,
    hitlRequired: false,
    priority: 'Standard',
  };
}
