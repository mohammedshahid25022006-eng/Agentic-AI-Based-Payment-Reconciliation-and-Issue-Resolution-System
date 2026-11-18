import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecords, parseAmountValue, normalizeDateValue } from './normalizer.ts';
import { matchTransactions, merchantSimilarity } from './matcher.ts';
import { assessRiskAndAnomalies } from './risk.ts';
import { retrieveApplicablePolicyForTransaction } from './policyRag.ts';
import { decideResolutionAction } from './resolution.ts';
import type { PolicyDocument } from './types.ts';

const SAMPLE_POLICIES: PolicyDocument[] = [
  {
    id: 'pol-1',
    code: 'POL-UPI-01',
    title: 'UPI Failed Debit & Reversal Policy',
    category: 'UPI',
    sourceLabel: 'Sample Policy Knowledge Base (Demo)',
    summary: 'Covers failed UPI transactions where bank account was debited.',
    fullText: 'Auto-reversal within T+1 to T+5 days per NPCI turnaround norms.',
    resolutionTimeline: 'T+5 Business Days',
    refundRules: 'Automatic reversal or bank dispute raise.',
    disputeSteps: 'Submit UTR and bank statement proof.',
    keywords: 'upi failed debited reversal utr conflict',
  },
  {
    id: 'pol-2',
    code: 'POL-DUP-02',
    title: 'Duplicate Debit & Double Chargeback Policy',
    category: 'Disputes',
    sourceLabel: 'Sample Policy Knowledge Base (Demo)',
    summary: 'Covers duplicate debits within same payment source.',
    fullText: 'File chargeback / duplicate reversal request with reference IDs.',
    resolutionTimeline: '7 Business Days',
    refundRules: 'Full refund of duplicate leg after verification.',
    disputeSteps: 'Flag both transaction IDs and raise dispute.',
    keywords: 'duplicate double debit chargeback reversal',
  },
];

test('normalizer parses currency strings, dates, and filters invalid rows', () => {
  assert.equal(parseAmountValue('₹1,250.50'), 1250.5);
  assert.equal(parseAmountValue('INR 4500'), 4500);
  assert.equal(normalizeDateValue('18/11/2026'), '2026-11-18');
  assert.equal(normalizeDateValue('2026-11-18'), '2026-11-18');

  const report = normalizeRecords(
    [
      {
        'Txn ID': 'B-101',
        UTR: 'UTR99887766',
        Date: '2026-11-10',
        Amount: '₹2,400.00',
        Merchant: 'Amazon India',
        Status: 'Completed',
      },
      {
        'Txn ID': 'B-BAD',
        Date: '2026-11-10',
        Amount: 'invalid',
        Merchant: 'Bad Row',
      },
    ],
    'file-1',
    'bank_statement'
  );

  assert.equal(report.totalRawRows, 2);
  assert.equal(report.cleanedCount, 1);
  assert.equal(report.rejectedRows.length, 1);
  assert.equal(report.validTransactions[0].amount, 2400);
  assert.equal(report.validTransactions[0].referenceId, 'UTR99887766');
});

test('matcher performs exact and fuzzy cross-source matching and flags conflicts', () => {
  const bankReport = normalizeRecords(
    [
      {
        transaction_id: 'BNK-1',
        reference_id: 'UTR10001',
        tx_date: '2026-11-10',
        amount: 1500,
        merchant_name: 'Amazon India',
        tx_status: 'Debited',
      },
      {
        transaction_id: 'BNK-2',
        reference_id: 'UTR10002',
        tx_date: '2026-11-11',
        amount: 3200,
        merchant_name: 'Swiggy Instamart',
        tx_status: 'Debited',
      },
      {
        transaction_id: 'BNK-3',
        reference_id: 'MISSING-REF',
        tx_date: '2026-11-12',
        amount: 890,
        merchant_name: 'Uber India',
        tx_status: 'Debited',
      },
    ],
    'f1',
    'bank_statement'
  );

  const upiReport = normalizeRecords(
    [
      {
        transaction_id: 'UPI-1',
        reference_id: 'UTR10001',
        tx_date: '2026-11-10',
        amount: 1500,
        merchant_name: 'AMZN MKTP IN',
        tx_status: 'Success',
      },
      {
        transaction_id: 'UPI-2',
        reference_id: 'UTR10002',
        tx_date: '2026-11-11',
        amount: 3200,
        merchant_name: 'Swiggy',
        tx_status: 'Failed',
      },
      {
        transaction_id: 'UPI-3',
        reference_id: 'UTR99999',
        tx_date: '2026-11-12',
        amount: 890,
        merchant_name: 'Uber',
        tx_status: 'Success',
      },
    ],
    'f2',
    'upi_history'
  );

  const all = [...bankReport.validTransactions, ...upiReport.validTransactions];
  const matches = matchTransactions(all);

  assert.equal(matches.get(bankReport.validTransactions[0].id)?.matchingStatus, 'Matched');
  assert.equal(matches.get(bankReport.validTransactions[0].id)?.matchType, 'Exact');

  // Status conflict on UTR10002 (Debited vs Failed)
  const conflictMatch = matches.get(bankReport.validTransactions[1].id);
  assert.equal(conflictMatch?.matchingStatus, 'Unmatched');
  assert.ok(conflictMatch?.mismatchReason?.includes('Status conflict'));

  // Fuzzy match for Uber (MISSING-REF vs UTR99999)
  assert.ok(merchantSimilarity('Uber India', 'Uber') >= 0.65);
  assert.equal(matches.get(bankReport.validTransactions[2].id)?.matchingStatus, 'Matched');
  assert.equal(matches.get(bankReport.validTransactions[2].id)?.matchType, 'Fuzzy');
});

test('risk, policy RAG, and resolution detect duplicates and trigger HITL', () => {
  const bankReport = normalizeRecords(
    [
      {
        transaction_id: 'BNK-D1',
        reference_id: 'UTR555111',
        tx_date: '2026-11-14',
        amount: 4200,
        merchant_name: 'Flipkart',
        tx_status: 'Debited',
      },
      {
        transaction_id: 'BNK-D2',
        reference_id: 'UTR555111',
        tx_date: '2026-11-14',
        amount: 4200,
        merchant_name: 'Flipkart',
        tx_status: 'Debited',
      },
      {
        transaction_id: 'BNK-HV',
        reference_id: 'UTR888222',
        tx_date: '2026-11-14',
        amount: 55000,
        merchant_name: 'Unknown Offshore Tech',
        tx_status: 'Debited',
      },
    ],
    'f1',
    'bank_statement'
  );

  const txs = bankReport.validTransactions;
  const matches = matchTransactions(txs);
  const risks = assessRiskAndAnomalies(txs, matches);

  const d1Risk = risks.get(txs[0].id)!;
  assert.equal(d1Risk.isDuplicate, true);
  assert.equal(d1Risk.hitlRequired, true);
  assert.ok(d1Risk.riskScore >= 45);

  const hvRisk = risks.get(txs[2].id)!;
  assert.equal(hvRisk.riskLevel, 'High Risk');
  assert.equal(hvRisk.isSuspicious, true);
  assert.equal(hvRisk.hitlRequired, true);

  const pol = retrieveApplicablePolicyForTransaction(
    txs[0],
    matches.get(txs[0].id)!,
    d1Risk,
    SAMPLE_POLICIES
  );
  assert.equal(pol?.policy.code, 'POL-DUP-02');

  const decision = decideResolutionAction(
    txs[0],
    matches.get(txs[0].id)!,
    d1Risk,
    pol
  );
  assert.equal(decision.recommendedAction, 'Raise a Dispute');
  assert.equal(decision.hitlRequired, true);
});

test('camelCase keys normalize cleanly and sequential bank UTRs across different merchants are Low Risk', () => {
  const bank = normalizeRecords(
    [
      {
        transactionId: 'INV-1',
        referenceId: 'UTR8849201101',
        txDate: '2026-11-08',
        amount: 4599,
        merchantName: 'Amazon India',
      },
      {
        transactionId: 'INV-2',
        referenceId: 'UTR8849201102',
        txDate: '2026-11-09',
        amount: 1850,
        merchantName: 'Swiggy',
      },
    ],
    'f-bank',
    'bank_statement'
  );
  const upi = normalizeRecords(
    [
      {
        transactionId: 'UPI-1',
        referenceId: 'UTR8849201101',
        txDate: '2026-11-08',
        amount: 4599,
        merchantName: 'AMZN MKTP IN',
      },
      {
        transactionId: 'UPI-2',
        referenceId: 'UTR8849201102',
        txDate: '2026-11-09',
        amount: 1850,
        merchantName: 'Swiggy',
      },
    ],
    'f-upi',
    'upi_history'
  );

  assert.equal(bank.cleanedCount, 2);
  const all = [...bank.validTransactions, ...upi.validTransactions];
  const matches = matchTransactions(all);
  const risks = assessRiskAndAnomalies(all, matches);

  for (const tx of all) {
    assert.equal(matches.get(tx.id)?.matchingStatus, 'Matched');
    assert.equal(risks.get(tx.id)?.riskScore, 0);
    assert.equal(risks.get(tx.id)?.riskLevel, 'Low Risk');
    assert.equal(risks.get(tx.id)?.isSuspicious, false);
  }
});
