export type SourceCategory =
  | 'bank_statement'
  | 'upi_history'
  | 'wallet'
  | 'receipt'
  | 'invoice';

export type MatchingStatus = 'Matched' | 'Unmatched' | 'Pending';
export type MatchType = 'Exact' | 'Fuzzy' | 'None';
export type RiskLevel = 'Low Risk' | 'Medium Risk' | 'High Risk';

export type RecommendedAction =
  | 'Mark as Resolved'
  | 'Request Additional Information'
  | 'Raise a Dispute'
  | 'Escalate for Manual Review';

export type ResolutionStatus =
  | 'Open'
  | 'Resolved'
  | 'Disputed'
  | 'Escalated'
  | 'Info Requested'
  | 'Approved'
  | 'Rejected';

export interface StandardTransactionInput {
  transactionId?: string;
  referenceId?: string;
  txDate?: string;
  amount: number | string;
  currency?: string;
  merchantName?: string;
  paymentMethod?: string;
  txStatus?: string;
  source?: string;
  description?: string;
}

export interface StandardTransaction {
  id: string;
  fileId: string;
  transactionId: string;
  referenceId: string;
  txDate: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  merchantName: string;
  paymentMethod: string;
  txStatus: string;
  source: string;
  sourceCategory: SourceCategory;
  description: string;
}

export interface NormalizationReport {
  validTransactions: StandardTransaction[];
  rejectedRows: Array<{ rowIndex: number; reason: string; raw: Record<string, unknown> }>;
  totalRawRows: number;
  cleanedCount: number;
}

export interface MatchCandidateResult {
  transactionId: string; // internal id
  matchingStatus: MatchingStatus;
  matchedWithId: string | null;
  matchedWithTxCode: string | null;
  matchedWithSource: string | null;
  matchType: MatchType;
  matchConfidence: number; // 0 to 100
  mismatchReason: string | null;
  mismatchDetails: {
    amountDiff?: number;
    dateDiffDays?: number;
    merchantSimilarity?: number;
    referenceMatch?: boolean;
    counterpartIds?: string[];
    explanation?: string;
  };
}

export interface RiskAssessment {
  transactionId: string;
  riskScore: number; // 0 to 100
  riskLevel: RiskLevel;
  isDuplicate: boolean;
  isSuspicious: boolean;
  hitlRequired: boolean;
  flags: Array<{
    code: string;
    label: string;
    severity: 'low' | 'medium' | 'high';
    points: number;
    detail: string;
  }>;
}

export interface PolicyDocument {
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
}

export interface PolicyRetrievalResult {
  policy: PolicyDocument;
  relevanceScore: number;
  matchedTerms: string[];
}

export interface ResolutionDecision {
  recommendedAction: RecommendedAction;
  rationale: string;
  hitlRequired: boolean;
  priority: 'Standard' | 'High' | 'Critical';
}
