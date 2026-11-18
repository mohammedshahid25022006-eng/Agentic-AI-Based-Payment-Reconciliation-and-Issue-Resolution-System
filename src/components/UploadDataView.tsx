import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileText,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { apiDownload, apiFetch } from '../api';
import type { SampleDataset, UploadedFileRecord } from '../types';

interface UploadDataViewProps {
  files: UploadedFileRecord[];
  samples: SampleDataset[];
  onRefresh: () => Promise<void>;
  onStartReconciliation: () => Promise<void>;
  reconciling: boolean;
}

const SOURCE_OPTIONS = [
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'upi_history', label: 'UPI / Payment History' },
  { value: 'wallet', label: 'Wallet Transactions' },
  { value: 'receipt', label: 'Receipt (Image / PDF)' },
  { value: 'invoice', label: 'Invoice (PDF / CSV / XLSX)' },
];

export function UploadDataView({
  files,
  samples,
  onRefresh,
  onStartReconciliation,
  reconciling,
}: UploadDataViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceCategory, setSourceCategory] = useState('bank_statement');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<UploadedFileRecord | null>(null);

  const handleFileUpload = async (file: File) => {
    setError(null);
    setUploadStatus(null);

    const ext = file.name.toLowerCase().split('.').pop() || '';
    if (!['csv', 'xlsx', 'xls', 'pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
      setError(`Unsupported format ".${ext}". Please upload CSV, XLSX, PDF, JPG, or PNG.`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('sourceCategory', sourceCategory);
      formData.append('file', file);

      const res = await apiFetch<{
        filename: string;
        cleanedCount: number;
        rejectedCount: number;
        extractionMethod: string;
      }>('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      setUploadStatus(
        `Processed "${res.filename}" via ${res.extractionMethod}: ${res.cleanedCount} valid transactions extracted (${res.rejectedCount} invalid rows filtered).`
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File processing failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileUpload(dropped);
  };

  const handleLoadSamples = async () => {
    setError(null);
    setUploadStatus(null);
    setLoadingSample(true);
    try {
      const res = await apiFetch<{ loaded: Array<{ filename: string; count: number }> }>(
        '/api/files/load-sample',
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      if (res.loaded.length === 0) {
        setUploadStatus('All sample datasets are already loaded in your workspace.');
      } else {
        setUploadStatus(
          `Loaded ${res.loaded.length} sample dataset(s): ${res.loaded.map((l) => `${l.filename} (${l.count} rows)`).join(', ')}.`
        );
      }
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load samples.');
    } finally {
      setLoadingSample(false);
    }
  };

  const handleDeleteFile = async (id: string, filename: string) => {
    setError(null);
    try {
      await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
      if (previewFile?.id === id) setPreviewFile(null);
      setUploadStatus(`Removed "${filename}" and its associated transaction records.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const parsedPreviewRows = (() => {
    if (!previewFile) return [];
    try {
      const parsed = JSON.parse(previewFile.raw_preview);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  return (
    <div className="space-y-6">
      {/* Upload Dropzone & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Connect &amp; Upload Financial Data
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Supported formats: CSV, XLSX, PDF, JPG, PNG. Document Processing Agent standardizes records automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="source-cat-select" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              Data Source:
            </label>
            <select
              id="source-cat-select"
              value={sourceCategory}
              onChange={(e) => setSourceCategory(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`mt-5 border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragging
              ? 'border-teal-500 bg-teal-50'
              : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
          }`}
        >
          <UploadCloud className="w-9 h-9 text-teal-600 mx-auto" />
          <p className="mt-3 text-sm font-semibold text-slate-900">
            Drag and drop a financial statement, receipt, or invoice here
          </p>
          <p className="mt-1 text-xs text-slate-500">
            CSV and Excel files are parsed deterministically; PDF, JPG, and PNG files use Gemini Multimodal OCR extraction.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) handleFileUpload(selected);
              e.target.value = '';
            }}
          />
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              {uploading ? 'Extracting Transactions...' : 'Browse File to Upload'}
            </button>
            {files.length > 0 && (
              <button
                type="button"
                disabled={reconciling}
                onClick={onStartReconciliation}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                {reconciling ? 'Running Agents...' : 'Start Reconciliation'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}
        {uploadStatus && (
          <div className="mt-4 p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{uploadStatus}</span>
          </div>
        )}
      </div>

      {/* Downloadable Sample Datasets */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-display">
              Sample Evaluation Datasets (Simulated Data)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Download individual files to test drag-and-drop upload, or load the full multi-source batch immediately.
            </p>
          </div>
          <button
            type="button"
            disabled={loadingSample}
            onClick={handleLoadSamples}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Database className="w-3.5 h-3.5" />
            {loadingSample ? 'Loading Samples...' : 'Load All Sample Datasets'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {samples.map((s) => (
            <div
              key={s.id}
              className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 flex items-start justify-between gap-4"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 font-mono">
                  <span>{s.format}</span>
                  <span aria-hidden="true">·</span>
                  <span>{s.recordCount} records</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{s.description}</p>
              </div>
              <button
                type="button"
                onClick={() => apiDownload(`/api/samples/${s.id}/download`, s.filename)}
                aria-label={`Download ${s.filename}`}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Uploaded Files Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 font-display">
            Ingested Financial Files ({files.length})
          </h3>
        </div>
        {files.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No files uploaded yet. Use the dropzone above or load the sample evaluation datasets.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Filename</th>
                  <th className="py-3 px-4">Source Category</th>
                  <th className="py-3 px-4">Format</th>
                  <th className="py-3 px-4 text-right">Valid Records</th>
                  <th className="py-3 px-4 text-right">Rejected</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {files.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-medium text-slate-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>{f.filename}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 capitalize">
                      {f.source_category.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">{f.file_type}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-teal-700 font-semibold">
                      {f.record_count}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                      {f.rejected_count}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {new Date(f.uploaded_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setPreviewFile(f)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(f.id, f.filename)}
                        aria-label={`Delete ${f.filename}`}
                        className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded font-medium inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* File Preview Panel */}
      {previewFile && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h4 className="text-sm font-bold text-slate-900 font-display">
                File Preview: {previewFile.filename}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing up to first {parsedPreviewRows.length} extracted source rows
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewFile(null)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Close Preview
            </button>
          </div>
          {parsedPreviewRows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {Object.keys(parsedPreviewRows[0]).map((col) => (
                      <th key={col} className="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedPreviewRows.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((val, cIdx) => (
                        <td key={cIdx} className="py-2 px-3 text-slate-700 font-mono whitespace-nowrap">
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">No preview rows available.</p>
          )}
        </div>
      )}
    </div>
  );
}
