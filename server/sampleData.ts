import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { SourceCategory } from './engine/types.ts';

export interface SampleDatasetDescriptor {
  id: string;
  filename: string;
  title: string;
  description: string;
  format: 'CSV' | 'XLSX' | 'PDF';
  sourceCategory: SourceCategory;
  recordCount: number;
}

export const SAMPLE_DATASETS: SampleDatasetDescriptor[] = [
  {
    id: 'bank_statement',
    filename: 'bank_statement_nov2026.csv',
    title: 'Corporate Bank Statement (Nov 2026)',
    description:
      '12 bank ledger entries including settled payments, a duplicate debit, a UPI failed-debit conflict, and a high-value suspicious wire.',
    format: 'CSV',
    sourceCategory: 'bank_statement',
    recordCount: 12,
  },
  {
    id: 'upi_history',
    filename: 'upi_payment_history_nov2026.csv',
    title: 'UPI Payment App History (Nov 2026)',
    description:
      '9 UPI transactions with UTR numbers, abbreviated merchant names (fuzzy match test), and one Failed UPI status conflicting with bank debit.',
    format: 'CSV',
    sourceCategory: 'upi_history',
    recordCount: 9,
  },
  {
    id: 'wallet_ledger',
    filename: 'wallet_transactions_nov2026.xlsx',
    title: 'Digital Wallet Ledger (Excel XLSX)',
    description:
      '5 digital wallet settlements exported as real .xlsx workbook including an amount variance against bank statement.',
    format: 'XLSX',
    sourceCategory: 'wallet',
    recordCount: 5,
  },
  {
    id: 'vendor_invoices',
    filename: 'vendor_invoices_nov2026.pdf',
    title: 'Vendor Invoice Batch (PDF Document)',
    description:
      'Downloadable PDF invoice statement with 4 vendor invoice records for Gemini multimodal PDF extraction testing.',
    format: 'PDF',
    sourceCategory: 'invoice',
    recordCount: 4,
  },
];

const BANK_ROWS = [
  {
    'Transaction ID': 'BNK-2026-1001',
    'Reference ID': 'UTR8849201101',
    'Transaction Date': '2026-11-08',
    Amount: '4599.00',
    'Merchant Name': 'Amazon India Marketplace',
    'Payment Method': 'UPI',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Office monitors and cables purchase',
  },
  {
    'Transaction ID': 'BNK-2026-1002',
    'Reference ID': 'UTR8849201102',
    'Transaction Date': '2026-11-09',
    Amount: '1850.00',
    'Merchant Name': 'Swiggy Corporate Eats',
    'Payment Method': 'UPI',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Team working lunch order',
  },
  {
    'Transaction ID': 'BNK-2026-1003',
    'Reference ID': 'UTR8849201103',
    'Transaction Date': '2026-11-10',
    Amount: '3250.00',
    'Merchant Name': 'Flipkart Wholesale',
    'Payment Method': 'UPI',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'IT peripherals order #FW-902',
  },
  {
    'Transaction ID': 'BNK-2026-1004',
    'Reference ID': 'UTR8849201104',
    'Transaction Date': '2026-11-11',
    Amount: '12400.00',
    'Merchant Name': 'MakeMyTrip Business',
    'Payment Method': 'UPI',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Flight booking BLR-DEL conference',
  },
  {
    'Transaction ID': 'BNK-2026-1005',
    'Reference ID': 'UTR8849201105',
    'Transaction Date': '2026-11-12',
    Amount: '799.00',
    'Merchant Name': 'Zomato Enterprise',
    'Payment Method': 'UPI',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Client refreshment order',
  },
  {
    'Transaction ID': 'BNK-2026-1006',
    'Reference ID': 'UTR8849201105',
    'Transaction Date': '2026-11-12',
    Amount: '799.00',
    'Merchant Name': 'Zomato Enterprise',
    'Payment Method': 'UPI',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Duplicate debit replay for client refreshment',
  },
  {
    'Transaction ID': 'BNK-2026-1007',
    'Reference ID': 'WAL99200101',
    'Transaction Date': '2026-11-13',
    Amount: '6450.00',
    'Merchant Name': 'CloudHost India Pvt Ltd',
    'Payment Method': 'Wallet',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Monthly staging server wallet auto-debit',
  },
  {
    'Transaction ID': 'BNK-2026-1008',
    'Reference ID': 'WAL99200102',
    'Transaction Date': '2026-11-13',
    Amount: '2950.00',
    'Merchant Name': 'Uber for Business',
    'Payment Method': 'Wallet',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Airport shuttle rides batch',
  },
  {
    'Transaction ID': 'BNK-2026-1009',
    'Reference ID': 'INV773001',
    'Transaction Date': '2026-11-14',
    Amount: '18500.00',
    'Merchant Name': 'Apex Office Supplies',
    'Payment Method': 'NEFT',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Ergonomic desks invoice settlement',
  },
  {
    'Transaction ID': 'BNK-2026-1010',
    'Reference ID': 'MISSING-REF',
    'Transaction Date': '2026-11-15',
    Amount: '4120.00',
    'Merchant Name': 'BlueDart Courier Services',
    'Payment Method': 'Card',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Priority parcel dispatch without gateway RRN',
  },
  {
    'Transaction ID': 'BNK-2026-1011',
    'Reference ID': 'UTR8849201199',
    'Transaction Date': '2026-11-16',
    Amount: '78500.00',
    'Merchant Name': 'Unknown Offshore Tech Holdings',
    'Payment Method': 'Wire Transfer',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Unverified cross-border wire hold',
  },
  {
    'Transaction ID': 'BNK-2026-1012',
    'Reference ID': 'INV773002',
    'Transaction Date': '2026-11-16',
    Amount: '9200.00',
    'Merchant Name': 'PrintCraft Packaging',
    'Payment Method': 'NEFT',
    Status: 'Debited',
    Source: 'HDFC Corporate Bank',
    Description: 'Marketing collateral print run',
  },
];

const UPI_ROWS = [
  {
    'Txn ID': 'UPI-APP-301',
    UTR: 'UTR8849201101',
    Date: '2026-11-08',
    Amount: '4599.00',
    Merchant: 'AMZN MKTP IN',
    Mode: 'UPI',
    Status: 'Success',
    Source: 'PhonePe Business UPI',
    Narration: 'Amazon order payment',
  },
  {
    'Txn ID': 'UPI-APP-302',
    UTR: 'UTR8849201102',
    Date: '2026-11-09',
    Amount: '1850.00',
    Merchant: 'Swiggy',
    Mode: 'UPI',
    Status: 'Success',
    Source: 'PhonePe Business UPI',
    Narration: 'Swiggy lunch order',
  },
  {
    'Txn ID': 'UPI-APP-303',
    UTR: 'UTR8849201103',
    Date: '2026-11-10',
    Amount: '3250.00',
    Merchant: 'Flipkart',
    Mode: 'UPI',
    Status: 'Failed',
    Source: 'PhonePe Business UPI',
    Narration: 'UPI collect timed out at merchant gateway',
  },
  {
    'Txn ID': 'UPI-APP-304',
    UTR: 'UTR8849201104',
    Date: '2026-11-11',
    Amount: '12400.00',
    Merchant: 'MakeMyTrip',
    Mode: 'UPI',
    Status: 'Success',
    Source: 'PhonePe Business UPI',
    Narration: 'Flight ticket UPI intent',
  },
  {
    'Txn ID': 'UPI-APP-305',
    UTR: 'UTR8849201105',
    Date: '2026-11-12',
    Amount: '799.00',
    Merchant: 'Zomato',
    Mode: 'UPI',
    Status: 'Success',
    Source: 'PhonePe Business UPI',
    Narration: 'Single Zomato order confirmed',
  },
  {
    'Txn ID': 'UPI-APP-306',
    UTR: 'UTR8849201140',
    Date: '2026-11-14',
    Amount: '1450.00',
    Merchant: 'Airtel Fiber Broadband',
    Mode: 'UPI',
    Status: 'Success',
    Source: 'PhonePe Business UPI',
    Narration: 'Office internet bill (not yet in bank export)',
  },
  {
    'Txn ID': 'UPI-APP-307',
    UTR: 'UTR8849201141',
    Date: '2026-11-15',
    Amount: '540.00',
    Merchant: 'Metro Transit Card',
    Mode: 'UPI',
    Status: 'Success',
    Source: 'PhonePe Business UPI',
    Narration: 'Staff transit recharge',
  },
  {
    'Txn ID': 'UPI-APP-308',
    UTR: 'UTR8849201142',
    Date: '2026-11-15',
    Amount: '540.00',
    Merchant: 'Metro Transit Card',
    Mode: 'UPI',
    Status: 'Success',
    Source: 'PhonePe Business UPI',
    Narration: 'Staff transit recharge #2',
  },
  {
    'Txn ID': 'UPI-APP-309',
    UTR: 'UTR8849201143',
    Date: '2026-11-15',
    Amount: '540.00',
    Merchant: 'Metro Transit Card',
    Mode: 'UPI',
    Status: 'Success',
    Source: 'PhonePe Business UPI',
    Narration: 'Staff transit recharge #3 (velocity burst)',
  },
];

const WALLET_ROWS = [
  {
    'Transaction ID': 'WLT-501',
    'Reference ID': 'WAL99200101',
    Date: '2026-11-13',
    Amount: 6200.0,
    Merchant: 'CloudHost India',
    'Payment Method': 'Wallet',
    Status: 'Settled',
    Source: 'Corporate PayWallet',
    Description: 'Cloud hosting charge (250 variance vs bank debit)',
  },
  {
    'Transaction ID': 'WLT-502',
    'Reference ID': 'WAL99200102',
    Date: '2026-11-13',
    Amount: 2950.0,
    Merchant: 'Uber Business',
    'Payment Method': 'Wallet',
    Status: 'Settled',
    Source: 'Corporate PayWallet',
    Description: 'Airport rides batch settled',
  },
  {
    'Transaction ID': 'WLT-503',
    'Reference ID': 'WAL99200109',
    Date: '2026-11-14',
    Amount: 1120.0,
    Merchant: 'FreshMenu Corporate',
    'Payment Method': 'Wallet',
    Status: 'Settled',
    Source: 'Corporate PayWallet',
    Description: 'Snack pantry refill',
  },
  {
    'Transaction ID': 'WLT-504',
    'Reference ID': 'WAL99200110',
    Date: '2026-11-15',
    Amount: 4120.0,
    Merchant: 'BlueDart Express',
    'Payment Method': 'Wallet',
    Status: 'Settled',
    Source: 'Corporate PayWallet',
    Description: 'Courier dispatch matching bank card row',
  },
  {
    'Transaction ID': 'WLT-505',
    'Reference ID': 'WAL99200111',
    Date: '2026-11-16',
    Amount: 31000.0,
    Merchant: 'SaaS Enterprise License',
    'Payment Method': 'Wallet',
    Status: 'Pending',
    Source: 'Corporate PayWallet',
    Description: 'High-value annual SaaS seat renewal',
  },
];

const INVOICE_ROWS = [
  {
    transactionId: 'INV-9001',
    referenceId: 'INV773001',
    txDate: '2026-11-14',
    amount: 18500.0,
    merchantName: 'Apex Office Supplies',
    paymentMethod: 'NEFT',
    txStatus: 'Paid',
    source: 'Vendor Invoice PDF',
    description: 'Invoice #773001 - 4x Standing Desks',
  },
  {
    transactionId: 'INV-9002',
    referenceId: 'INV773002',
    txDate: '2026-11-16',
    amount: 8800.0,
    merchantName: 'PrintCraft Packaging',
    paymentMethod: 'NEFT',
    txStatus: 'Paid',
    source: 'Vendor Invoice PDF',
    description: 'Invoice #773002 - Print collateral (400 less than bank NEFT)',
  },
  {
    transactionId: 'INV-9003',
    referenceId: 'INV773003',
    txDate: '2026-11-16',
    amount: 2499.0,
    merchantName: 'Notion Enterprise',
    paymentMethod: 'Card',
    txStatus: 'Due',
    source: 'Vendor Invoice PDF',
    description: 'Monthly workspace seats invoice',
  },
  {
    transactionId: 'INV-9004',
    referenceId: 'UTR8849201101',
    txDate: '2026-11-08',
    amount: 4599.0,
    merchantName: 'Amazon India Marketplace',
    paymentMethod: 'UPI',
    txStatus: 'Paid',
    source: 'Vendor Invoice PDF',
    description: 'Tax invoice for monitor accessories',
  },
];

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

export function generateSampleFileBuffer(datasetId: string): {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  sourceCategory: SourceCategory;
  rowsForDirectLoad?: Array<Record<string, unknown>>;
} | null {
  if (datasetId === 'bank_statement') {
    const csv = rowsToCsv(BANK_ROWS);
    return {
      filename: 'bank_statement_nov2026.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
      sourceCategory: 'bank_statement',
      rowsForDirectLoad: BANK_ROWS,
    };
  }

  if (datasetId === 'upi_history') {
    const csv = rowsToCsv(UPI_ROWS);
    return {
      filename: 'upi_payment_history_nov2026.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
      sourceCategory: 'upi_history',
      rowsForDirectLoad: UPI_ROWS,
    };
  }

  if (datasetId === 'wallet_ledger') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(WALLET_ROWS);
    XLSX.utils.book_append_sheet(wb, ws, 'WalletTransactions');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      filename: 'wallet_transactions_nov2026.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: buf,
      sourceCategory: 'wallet',
      rowsForDirectLoad: WALLET_ROWS,
    };
  }

  if (datasetId === 'vendor_invoices') {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('VENDOR INVOICE BATCH STATEMENT — NOVEMBER 2026', 14, 18);
    doc.setFontSize(10);
    doc.text('Issued to: Meridian FinOps (Demo Evaluation Dataset)', 14, 25);

    autoTable(doc, {
      startY: 32,
      head: [['Invoice ID', 'Reference ID', 'Date', 'Merchant', 'Method', 'Amount (INR)', 'Status']],
      body: INVOICE_ROWS.map((r) => [
        r.transactionId,
        r.referenceId,
        r.txDate,
        r.merchantName,
        r.paymentMethod,
        r.amount.toFixed(2),
        r.txStatus,
      ]),
    });

    const arrayBuf = doc.output('arraybuffer');
    return {
      filename: 'vendor_invoices_nov2026.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(arrayBuf),
      sourceCategory: 'invoice',
      rowsForDirectLoad: INVOICE_ROWS as unknown as Array<Record<string, unknown>>,
    };
  }

  return null;
}
