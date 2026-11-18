import type { MatchCandidateResult, StandardTransaction } from './types.ts';

function normalizeRef(ref: string): string {
  return ref
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeMerchantTokens(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt|ltd|limited|inc|llc|india|in|mktp|marketplace|payments|pay|online|services|store|tech)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function merchantSimilarity(nameA: string, nameB: string): number {
  const aRaw = nameA.trim().toLowerCase();
  const bRaw = nameB.trim().toLowerCase();
  if (!aRaw || !bRaw) return 0;
  if (aRaw === bRaw) return 1;

  const aNorm = normalizeMerchantTokens(aRaw) || aRaw;
  const bNorm = normalizeMerchantTokens(bRaw) || bRaw;
  if (aNorm === bNorm) return 0.96;

  // Token overlap + containment bonus for abbreviations like "AMZN MKTP IN" vs "Amazon India"
  const tokensA = new Set(aNorm.split(' ').filter(Boolean));
  const tokensB = new Set(bNorm.split(' ').filter(Boolean));
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  const jaccard = overlap / Math.max(1, new Set([...tokensA, ...tokensB]).size);

  // Consonant skeleton / substring heuristic for abbreviations (AMZN vs AMAZON)
  const consA = aNorm.replace(/[aeiou\s]/g, '');
  const consB = bNorm.replace(/[aeiou\s]/g, '');
  let abbrevScore = 0;
  if (consA.length >= 3 && consB.length >= 3) {
    if (consB.includes(consA) || consA.includes(consB)) {
      abbrevScore = 0.84;
    }
  }

  const maxLen = Math.max(aNorm.length, bNorm.length);
  const editSim = 1 - levenshteinDistance(aNorm, bNorm) / Math.max(1, maxLen);

  return Math.max(editSim, jaccard, abbrevScore);
}

export function dateDiffInDays(dateA: string, dateB: string): number {
  const tA = Date.parse(`${dateA}T00:00:00Z`);
  const tB = Date.parse(`${dateB}T00:00:00Z`);
  if (Number.isNaN(tA) || Number.isNaN(tB)) return 999;
  return Math.abs(Math.round((tA - tB) / (1000 * 60 * 60 * 24)));
}

function isFailedStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes('fail') || s.includes('declin') || s.includes('revers') || s.includes('cancel');
}

export function matchTransactions(
  transactions: StandardTransaction[]
): Map<string, MatchCandidateResult> {
  const results = new Map<string, MatchCandidateResult>();
  const pairedIds = new Set<string>();

  // Helper to record a match pair
  const recordMatch = (
    a: StandardTransaction,
    b: StandardTransaction,
    matchType: 'Exact' | 'Fuzzy',
    confidence: number,
    mismatchReason: string | null,
    matchingStatus: 'Matched' | 'Unmatched',
    explanation: string
  ) => {
    const amountDiff = Math.round((a.amount - b.amount) * 100) / 100;
    const dateDiffDays = dateDiffInDays(a.txDate, b.txDate);
    const mSim = Math.round(merchantSimilarity(a.merchantName, b.merchantName) * 100) / 100;
    const refA = normalizeRef(a.referenceId);
    const refB = normalizeRef(b.referenceId);
    const referenceMatch = Boolean(refA && refB && refA !== 'MISSINGREF' && refA === refB);

    results.set(a.id, {
      transactionId: a.id,
      matchingStatus,
      matchedWithId: b.id,
      matchedWithTxCode: b.transactionId,
      matchedWithSource: b.source,
      matchType,
      matchConfidence: Math.round(confidence),
      mismatchReason,
      mismatchDetails: {
        amountDiff,
        dateDiffDays,
        merchantSimilarity: mSim,
        referenceMatch,
        counterpartIds: [b.transactionId],
        explanation,
      },
    });

    results.set(b.id, {
      transactionId: b.id,
      matchingStatus,
      matchedWithId: a.id,
      matchedWithTxCode: a.transactionId,
      matchedWithSource: a.source,
      matchType,
      matchConfidence: Math.round(confidence),
      mismatchReason,
      mismatchDetails: {
        amountDiff: -amountDiff,
        dateDiffDays,
        merchantSimilarity: mSim,
        referenceMatch,
        counterpartIds: [a.transactionId],
        explanation,
      },
    });
  };

  // Pass 1: Exact matching across different sources
  // Same valid Reference ID + identical amount + date within 1 day + both non-failed
  for (let i = 0; i < transactions.length; i++) {
    const a = transactions[i];
    if (pairedIds.has(a.id)) continue;
    const refA = normalizeRef(a.referenceId);
    if (!refA || refA === 'MISSINGREF') continue;

    for (let j = i + 1; j < transactions.length; j++) {
      const b = transactions[j];
      if (pairedIds.has(b.id)) continue;
      if (a.sourceCategory === b.sourceCategory) continue;

      const refB = normalizeRef(b.referenceId);
      if (refA !== refB) continue;

      const amountDiff = Math.abs(a.amount - b.amount);
      const dayDiff = dateDiffInDays(a.txDate, b.txDate);

      if (amountDiff <= 0.01 && dayDiff <= 1) {
        if (isFailedStatus(a.txStatus) !== isFailedStatus(b.txStatus)) {
          // Status conflict despite matching reference ID (e.g. Debited in Bank vs Failed in UPI)
          pairedIds.add(a.id);
          pairedIds.add(b.id);
          recordMatch(
            a,
            b,
            'Exact',
            78,
            `Status conflict: ${a.source} shows "${a.txStatus}" while ${b.source} shows "${b.txStatus}"`,
            'Unmatched',
            `Reference ${a.referenceId} matches across ${a.source} and ${b.source}, but status diverges (${a.txStatus} vs ${b.txStatus}).`
          );
          break;
        }

        pairedIds.add(a.id);
        pairedIds.add(b.id);
        recordMatch(
          a,
          b,
          'Exact',
          99,
          null,
          'Matched',
          `Exact match verified on Reference ID ${a.referenceId}, amount ${a.currency} ${a.amount.toFixed(2)}, and settlement date.`
        );
        break;
      } else if (amountDiff > 0.01) {
        // Same Reference ID, different amount -> Mismatch!
        pairedIds.add(a.id);
        pairedIds.add(b.id);
        recordMatch(
          a,
          b,
          'Exact',
          74,
          `Amount discrepancy on shared reference ${a.referenceId}: ${a.source} ${a.currency} ${a.amount.toFixed(2)} vs ${b.source} ${b.currency} ${b.amount.toFixed(2)}`,
          'Unmatched',
          `Reference ${a.referenceId} links ${a.transactionId} and ${b.transactionId}, but amounts differ by ${a.currency} ${amountDiff.toFixed(2)}.`
        );
        break;
      }
    }
  }

  // Pass 2: Fuzzy cross-source matching for remaining transactions
  // Score based on amount proximity, date window (<=3 days), merchant similarity (>=0.68), or partial ref overlap
  for (let i = 0; i < transactions.length; i++) {
    const a = transactions[i];
    if (pairedIds.has(a.id)) continue;

    let bestPartner: StandardTransaction | null = null;
    let bestScore = 0;
    let bestReason: string | null = null;
    let bestIsVerified = false;

    for (let j = 0; j < transactions.length; j++) {
      if (i === j) continue;
      const b = transactions[j];
      if (pairedIds.has(b.id)) continue;
      if (a.sourceCategory === b.sourceCategory) continue;

      const dayDiff = dateDiffInDays(a.txDate, b.txDate);
      if (dayDiff > 3) continue;

      const amountDiff = Math.abs(a.amount - b.amount);
      const maxAmt = Math.max(a.amount, b.amount, 1);
      const amountPctDiff = amountDiff / maxAmt;
      if (amountPctDiff > 0.1) continue; // >10% difference is not a fuzzy match

      const mSim = merchantSimilarity(a.merchantName, b.merchantName);
      if (mSim < 0.65) continue;

      const refA = normalizeRef(a.referenceId);
      const refB = normalizeRef(b.referenceId);
      const partialRef =
        refA.length >= 6 &&
        refB.length >= 6 &&
        refA !== 'MISSINGREF' &&
        refB !== 'MISSINGREF' &&
        (refA.slice(-6) === refB.slice(-6) || refA.includes(refB) || refB.includes(refA));

      let score = mSim * 45 + (1 - amountPctDiff * 5) * 35 + (1 - dayDiff / 4) * 20;
      if (partialRef) score += 10;
      score = Math.min(96, Math.max(0, score));

      if (score > bestScore && score >= 70) {
        bestScore = score;
        bestPartner = b;
        if (amountDiff > 0.01) {
          bestIsVerified = false;
          bestReason = `Fuzzy merchant match (${Math.round(mSim * 100)}%) with amount mismatch: ${a.currency} ${a.amount.toFixed(2)} vs ${b.currency} ${b.amount.toFixed(2)}`;
        } else if (isFailedStatus(a.txStatus) !== isFailedStatus(b.txStatus)) {
          bestIsVerified = false;
          bestReason = `Fuzzy match with status conflict (${a.txStatus} vs ${b.txStatus})`;
        } else if (refA === 'MISSINGREF' || refB === 'MISSINGREF') {
          bestIsVerified = true;
          bestReason = null;
        } else if (refA !== refB) {
          bestIsVerified = false;
          bestReason = `Amount & merchant match, but reference IDs differ (${a.referenceId} vs ${b.referenceId})`;
        } else {
          bestIsVerified = true;
          bestReason = null;
        }
      }
    }

    if (bestPartner) {
      pairedIds.add(a.id);
      pairedIds.add(bestPartner.id);
      recordMatch(
        a,
        bestPartner,
        'Fuzzy',
        bestScore,
        bestReason,
        bestIsVerified ? 'Matched' : 'Unmatched',
        bestIsVerified
          ? `Fuzzy match verified across ${a.source} and ${bestPartner.source} on merchant similarity and exact amount ${a.currency} ${a.amount.toFixed(2)}.`
          : bestReason || 'Fuzzy match flagged potential discrepancy requiring review.'
      );
    }
  }

  // Pass 3: Remaining unmatched transactions
  for (const tx of transactions) {
    if (results.has(tx.id)) continue;

    const missingRef = !tx.referenceId || tx.referenceId === 'MISSING-REF';
    const mismatchReason = missingRef
      ? `Missing payment reference ID and no matching counterpart found in other uploaded sources`
      : `No matching counterpart found in cross-source statements for reference ${tx.referenceId}`;

    results.set(tx.id, {
      transactionId: tx.id,
      matchingStatus: 'Unmatched',
      matchedWithId: null,
      matchedWithTxCode: null,
      matchedWithSource: null,
      matchType: 'None',
      matchConfidence: 0,
      mismatchReason,
      mismatchDetails: {
        referenceMatch: false,
        counterpartIds: [],
        explanation: mismatchReason,
      },
    });
  }

  return results;
}
