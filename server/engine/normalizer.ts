import crypto from 'node:crypto';
import type {
  NormalizationReport,
  SourceCategory,
  StandardTransaction,
} from './types.ts';

const SOURCE_LABELS: Record<SourceCategory, string> = {
  bank_statement: 'Bank Statement',
  upi_history: 'UPI History',
  wallet: 'Wallet Ledger',
  receipt: 'Receipt',
  invoice: 'Invoice',
};

const HEADER_ALIASES: Record<string, string> = {
  transaction_id: 'transactionId',
  transactionid: 'transactionId',
  txn_id: 'transactionId',
  txnid: 'transactionId',
  tx_id: 'transactionId',
  id: 'transactionId',
  payment_id: 'transactionId',
  invoice_no: 'transactionId',
  receipt_no: 'transactionId',

  reference_id: 'referenceId',
  referenceid: 'referenceId',
  ref_id: 'referenceId',
  refid: 'referenceId',
  ref_no: 'referenceId',
  utr: 'referenceId',
  utr_number: 'referenceId',
  rrn: 'referenceId',
  transaction_reference_id: 'referenceId',

  transaction_date: 'txDate',
  tx_date: 'txDate',
  date: 'txDate',
  txn_date: 'txDate',
  value_date: 'txDate',
  posted_at: 'txDate',
  timestamp: 'txDate',

  amount: 'amount',
  txn_amount: 'amount',
  debit: 'amount',
  value: 'amount',
  total: 'amount',
  total_amount: 'amount',
  paid_amount: 'amount',

  currency: 'currency',
  curr: 'currency',

  merchant_name: 'merchantName',
  merchant: 'merchantName',
  vendor: 'merchantName',
  payee: 'merchantName',
  beneficiary: 'merchantName',
  counterparty: 'merchantName',
  store: 'merchantName',

  payment_method: 'paymentMethod',
  method: 'paymentMethod',
  mode: 'paymentMethod',
  channel: 'paymentMethod',
  payment_mode: 'paymentMethod',

  transaction_status: 'txStatus',
  tx_status: 'txStatus',
  status: 'txStatus',
  state: 'txStatus',

  source: 'source',
  account: 'source',

  description: 'description',
  narration: 'description',
  remarks: 'description',
  memo: 'description',
  notes: 'description',
};

function normalizeHeaderKey(rawKey: string): string {
  const cleaned = rawKey
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return HEADER_ALIASES[cleaned] ?? cleaned;
}

export function parseAmountValue(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : null;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Handle negative formats like (1,250.00) or ₹1,250.00 or INR 1250.00
  const isParenNegative = /^\(.*\)$/.test(trimmed);
  const numericStr = trimmed
    .replace(/[₹$€£,\s]/g, '')
    .replace(/^(INR|USD|EUR|GBP)/i, '')
    .replace(/[()]/g, '')
    .replace(/(DR|CR)$/i, '');
  if (!numericStr || !/^[-+]?\d*\.?\d+$/.test(numericStr)) return null;
  const val = Number.parseFloat(numericStr);
  if (!Number.isFinite(val)) return null;
  const signed = isParenNegative ? -Math.abs(val) : val;
  return Math.round(Math.abs(signed) * 100) / 100;
}

export function normalizeDateValue(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'number' && raw > 25000 && raw < 80000) {
    // Excel serial date
    const utcDays = Math.floor(raw - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    // If first > 12, definitely DD/MM/YYYY; default DD/MM/YYYY for Indian/global statements
    const day = first > 12 || second <= 12 ? first : second;
    const month = first > 12 || second <= 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function cleanText(raw: unknown, fallback = ''): string {
  if (raw === null || raw === undefined) return fallback;
  return String(raw).replace(/\s+/g, ' ').trim() || fallback;
}

function inferPaymentMethod(
  rawMethod: string,
  sourceCategory: SourceCategory,
  description: string
): string {
  const explicit = rawMethod.trim();
  if (explicit) return explicit;
  const desc = description.toLowerCase();
  if (sourceCategory === 'upi_history' || desc.includes('upi')) return 'UPI';
  if (sourceCategory === 'wallet' || desc.includes('wallet')) return 'Wallet';
  if (desc.includes('neft') || desc.includes('rtgs') || desc.includes('imps')) {
    return 'Bank Transfer';
  }
  if (desc.includes('card') || desc.includes('visa') || desc.includes('mastercard')) {
    return 'Card';
  }
  return sourceCategory === 'bank_statement' ? 'Bank Transfer' : 'Digital Payment';
}

export function normalizeRecords(
  rawRows: Array<Record<string, unknown>>,
  fileId: string,
  sourceCategory: SourceCategory,
  defaultCurrency = 'INR'
): NormalizationReport {
  const validTransactions: StandardTransaction[] = [];
  const rejectedRows: NormalizationReport['rejectedRows'] = [];

  rawRows.forEach((rawRow, idx) => {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawRow)) {
      mapped[normalizeHeaderKey(key)] = value;
    }

    const amount = parseAmountValue(mapped.amount);
    if (amount === null || amount <= 0) {
      rejectedRows.push({
        rowIndex: idx + 1,
        reason: 'Invalid or non-positive transaction amount',
        raw: rawRow,
      });
      return;
    }

    const txDate = normalizeDateValue(mapped.txDate);
    if (!txDate) {
      rejectedRows.push({
        rowIndex: idx + 1,
        reason: 'Missing or unparseable transaction date',
        raw: rawRow,
      });
      return;
    }

    const merchantName = cleanText(mapped.merchantName, '');
    const description = cleanText(mapped.description, '');
    if (!merchantName && !description) {
      rejectedRows.push({
        rowIndex: idx + 1,
        reason: 'Missing both merchant name and transaction description',
        raw: rawRow,
      });
      return;
    }

    const txIdRaw = cleanText(mapped.transactionId, '');
    const refIdRaw = cleanText(mapped.referenceId, '');
    const resolvedMerchant = merchantName || description.slice(0, 40);
    const resolvedStatus = cleanText(mapped.txStatus, 'Completed');
    const resolvedSource = cleanText(mapped.source, SOURCE_LABELS[sourceCategory]);
    const resolvedCurrency = cleanText(mapped.currency, defaultCurrency).toUpperCase();

    validTransactions.push({
      id: crypto.randomUUID(),
      fileId,
      transactionId: txIdRaw || `TXN-${sourceCategory.slice(0, 3).toUpperCase()}-${String(idx + 1).padStart(4, '0')}`,
      referenceId: refIdRaw || 'MISSING-REF',
      txDate,
      amount,
      currency: resolvedCurrency,
      merchantName: resolvedMerchant,
      paymentMethod: inferPaymentMethod(
        cleanText(mapped.paymentMethod, ''),
        sourceCategory,
        description
      ),
      txStatus: resolvedStatus,
      source: resolvedSource,
      sourceCategory,
      description: description || `${resolvedMerchant} (${SOURCE_LABELS[sourceCategory]})`,
    });
  });

  return {
    validTransactions,
    rejectedRows,
    totalRawRows: rawRows.length,
    cleanedCount: validTransactions.length,
  };
}
