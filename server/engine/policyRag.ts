import type {
  MatchCandidateResult,
  PolicyDocument,
  PolicyRetrievalResult,
  RiskAssessment,
  StandardTransaction,
} from './types.ts';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

export function retrievePoliciesForQuery(
  query: string,
  policies: PolicyDocument[],
  topK = 3
): PolicyRetrievalResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return policies.slice(0, topK).map((policy) => ({
      policy,
      relevanceScore: 10,
      matchedTerms: [],
    }));
  }

  const scored: PolicyRetrievalResult[] = policies.map((policy) => {
    const keywordTokens = new Set(tokenize(policy.keywords));
    const titleTokens = new Set(tokenize(`${policy.title} ${policy.category}`));
    const bodyTokens = new Set(
      tokenize(`${policy.summary} ${policy.fullText} ${policy.refundRules} ${policy.disputeSteps}`)
    );

    let score = 0;
    const matchedTerms = new Set<string>();

    for (const qt of queryTokens) {
      if (keywordTokens.has(qt)) {
        score += 12;
        matchedTerms.add(qt);
      }
      if (titleTokens.has(qt)) {
        score += 8;
        matchedTerms.add(qt);
      }
      if (bodyTokens.has(qt)) {
        score += 3;
        matchedTerms.add(qt);
      }
    }

    return {
      policy,
      relevanceScore: score,
      matchedTerms: Array.from(matchedTerms),
    };
  });

  return scored
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK);
}

export function retrieveApplicablePolicyForTransaction(
  tx: StandardTransaction,
  match: MatchCandidateResult,
  risk: RiskAssessment,
  policies: PolicyDocument[]
): PolicyRetrievalResult | null {
  if (policies.length === 0) return null;

  const queryParts = [
    tx.paymentMethod,
    tx.source,
    tx.txStatus,
    tx.merchantName,
    tx.description,
    match.matchingStatus,
    match.mismatchReason ?? '',
    risk.isDuplicate ? 'duplicate double debit chargeback reversal' : '',
    risk.isSuspicious ? 'suspicious unauthorized anomaly high risk freeze' : '',
    tx.referenceId === 'MISSING-REF' ? 'missing reference utr tracing' : '',
    match.mismatchReason?.toLowerCase().includes('amount')
      ? 'amount discrepancy partial settlement fee mismatch'
      : '',
    match.mismatchReason?.toLowerCase().includes('status')
      ? 'upi failed debited reversal tat'
      : '',
  ];

  const ranked = retrievePoliciesForQuery(queryParts.join(' '), policies, 1);
  return ranked[0] ?? null;
}
