import * as XLSX from 'xlsx';
import { normalizeRecords } from '../engine/normalizer.ts';
import type { NormalizationReport, SourceCategory } from '../engine/types.ts';
import { extractTransactionsFromMultimodalDocument } from './gemini.ts';

export interface ParsedFileOutput {
  report: NormalizationReport;
  rawPreview: Array<Record<string, unknown>>;
  extractionMethod: 'spreadsheet-parser' | 'gemini-multimodal-ocr';
}

export async function parseUploadedFinancialFile(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  fileId: string;
  sourceCategory: SourceCategory;
}): Promise<ParsedFileOutput> {
  const { buffer, filename, mimeType, fileId, sourceCategory } = params;
  const ext = filename.toLowerCase().split('.').pop() || '';

  // CSV / XLSX / XLS deterministic spreadsheet parser
  if (
    ext === 'csv' ||
    ext === 'xlsx' ||
    ext === 'xls' ||
    mimeType.includes('csv') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel')
  ) {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error(`Uploaded file "${filename}" contains no readable sheets.`);
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
    });

    if (rows.length === 0) {
      throw new Error(`Uploaded file "${filename}" has no transaction rows.`);
    }

    const report = normalizeRecords(rows, fileId, sourceCategory);
    return {
      report,
      rawPreview: rows.slice(0, 8),
      extractionMethod: 'spreadsheet-parser',
    };
  }

  // PDF / JPG / PNG -> Gemini Multimodal Extraction
  if (
    ext === 'pdf' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'png' ||
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/')
  ) {
    const resolvedMime =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'png'
          ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : mimeType;

    const extractedRows = await extractTransactionsFromMultimodalDocument(
      buffer,
      resolvedMime,
      filename,
      sourceCategory
    );

    if (extractedRows.length === 0) {
      throw new Error(
        `No structured transactions could be extracted from "${filename}". Verify the document is legible.`
      );
    }

    const rawRows = extractedRows as unknown as Array<Record<string, unknown>>;
    const report = normalizeRecords(rawRows, fileId, sourceCategory);
    return {
      report,
      rawPreview: rawRows.slice(0, 8),
      extractionMethod: 'gemini-multimodal-ocr',
    };
  }

  throw new Error(
    `Unsupported file format "${ext}". Supported formats: CSV, XLSX, PDF, JPG, PNG.`
  );
}
