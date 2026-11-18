import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword, verifyPassword } from './server/db.ts';
import { retrievePoliciesForQuery } from './server/engine/policyRag.ts';
import type { PolicyDocument, SourceCategory } from './server/engine/types.ts';
import { generateSampleFileBuffer, SAMPLE_DATASETS } from './server/sampleData.ts';
import { parseUploadedFinancialFile } from './server/services/fileParser.ts';
import { answerInvestigationQuestion } from './server/services/gemini.ts';
import {
  buildReportPayload,
  generateCsvReport,
  generateExcelReport,
  generatePdfReport,
} from './server/services/reportGenerator.ts';
import { runSupervisorReconciliation } from './server/services/supervisorAgent.ts';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (req.query.token as string | undefined);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.organization, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as
    | (AuthUser & { expires_at: string })
    | undefined;

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  req.user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    organization: row.organization,
  };
  next();
}

function createSessionForUser(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  db.prepare(
    `INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
  ).run(token, userId, expires.toISOString(), now.toISOString());
  return token;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // --- AUTH ENDPOINTS ---
  app.post('/api/auth/register', (req: Request, res: Response) => {
    try {
      const { name, email, password, organization } = req.body ?? {};
      if (!name || !email || !password) {
        res.status(400).json({ error: 'Name, email, and password are required.' });
        return;
      }
      if (String(password).length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      const normEmail = String(email).trim().toLowerCase();
      const existing = db
        .prepare('SELECT id FROM users WHERE email = ?')
        .get(normEmail);
      if (existing) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const id = `user-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, role, organization, created_at)
         VALUES (?, ?, ?, ?, 'Reconciliation Analyst', ?, ?)`
      ).run(
        id,
        String(name).trim(),
        normEmail,
        hashPassword(String(password)),
        String(organization || 'Enterprise Finance').trim(),
        now
      );

      const token = createSessionForUser(id);
      const user = db
        .prepare('SELECT id, name, email, role, organization FROM users WHERE id = ?')
        .get(id);
      res.status(201).json({ token, user });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Registration failed.',
      });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }
      const normEmail = String(email).trim().toLowerCase();
      const userRow = db
        .prepare('SELECT * FROM users WHERE email = ?')
        .get(normEmail) as
        | (AuthUser & { password_hash: string })
        | undefined;

      if (!userRow || !verifyPassword(String(password), userRow.password_hash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = createSessionForUser(userRow.id);
      res.json({
        token,
        user: {
          id: userRow.id,
          name: userRow.name,
          email: userRow.email,
          role: userRow.role,
          organization: userRow.organization,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Login failed.',
      });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/me', authMiddleware, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  // --- SAMPLE DATASETS ---
  app.get('/api/samples', (_req: Request, res: Response) => {
    res.json({ datasets: SAMPLE_DATASETS });
  });

  app.get('/api/samples/:datasetId/download', (req: Request, res: Response) => {
    const datasetId = String(req.params.datasetId);
    const sample = generateSampleFileBuffer(datasetId);
    if (!sample) {
      res.status(404).json({ error: 'Sample dataset not found.' });
      return;
    }
    res.setHeader('Content-Type', sample.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sample.filename}"`
    );
    res.send(sample.buffer);
  });

  // --- FILE UPLOAD & PROCESSING ---
  app.get('/api/files', authMiddleware, (req: AuthedRequest, res: Response) => {
    const files = db
      .prepare(
        `SELECT id, filename, file_type, source_category, file_size, record_count,
                rejected_count, status, raw_preview, uploaded_at
         FROM uploaded_files WHERE user_id = ? ORDER BY uploaded_at DESC`
      )
      .all(req.user!.id);
    res.json({ files });
  });

  app.post(
    '/api/files/upload',
    authMiddleware,
    upload.single('file'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const file = req.file;
        const sourceCategory = (req.body?.sourceCategory ||
          'bank_statement') as SourceCategory;

        if (!file) {
          res.status(400).json({ error: 'No file attached in upload request.' });
          return;
        }

        const fileId = `FILE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const parsed = await parseUploadedFinancialFile({
          buffer: file.buffer,
          filename: file.originalname,
          mimeType: file.mimetype,
          fileId,
          sourceCategory,
        });

        const now = new Date().toISOString();
        const ext = file.originalname.split('.').pop()?.toUpperCase() || 'FILE';

        db.exec('BEGIN');
        try {
          db.prepare(
            `INSERT INTO uploaded_files (
              id, user_id, filename, file_type, source_category, file_size,
              record_count, rejected_count, status, raw_preview, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            fileId,
            req.user!.id,
            file.originalname,
            ext,
            sourceCategory,
            file.size,
            parsed.report.cleanedCount,
            parsed.report.rejectedRows.length,
            'Processed',
            JSON.stringify(parsed.rawPreview),
            now
          );

          const insertTx = db.prepare(`
            INSERT INTO transactions (
              id, user_id, file_id, transaction_id, reference_id, tx_date, amount,
              currency, merchant_name, payment_method, tx_status, source,
              source_category, description, matching_status, updated_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
          `);

          for (const tx of parsed.report.validTransactions) {
            insertTx.run(
              tx.id,
              req.user!.id,
              fileId,
              tx.transactionId,
              tx.referenceId,
              tx.txDate,
              tx.amount,
              tx.currency,
              tx.merchantName,
              tx.paymentMethod,
              tx.txStatus,
              tx.source,
              tx.sourceCategory,
              tx.description,
              now,
              now
            );
          }

          db.prepare(
            `INSERT INTO audit_logs (id, user_id, user_name, action, notes, source_agent, created_at)
             VALUES (?, ?, ?, 'File Uploaded & Extracted', ?, 'Document Processing Agent', ?)`
          ).run(
            crypto.randomUUID(),
            req.user!.id,
            req.user!.name,
            `Ingested ${file.originalname} (${parsed.extractionMethod}): ${parsed.report.cleanedCount} valid records, ${parsed.report.rejectedRows.length} rejected.`,
            now
          );

          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }

        res.status(201).json({
          fileId,
          filename: file.originalname,
          extractionMethod: parsed.extractionMethod,
          cleanedCount: parsed.report.cleanedCount,
          rejectedCount: parsed.report.rejectedRows.length,
          rejectedRows: parsed.report.rejectedRows,
          preview: parsed.rawPreview,
        });
      } catch (err) {
        res.status(400).json({
          error:
            err instanceof Error ? err.message : 'Failed to process uploaded file.',
        });
      }
    }
  );

  app.post('/api/files/load-sample', authMiddleware, async (req: AuthedRequest, res: Response) => {
    try {
      const requestedIds: string[] = Array.isArray(req.body?.datasetIds)
        ? req.body.datasetIds
        : ['bank_statement', 'upi_history', 'wallet_ledger', 'vendor_invoices'];

      const loaded: Array<{ filename: string; count: number }> = [];
      const now = new Date().toISOString();

      for (const datasetId of requestedIds) {
        const sample = generateSampleFileBuffer(datasetId);
        if (!sample) continue;

        // Avoid duplicating identical sample filename if already loaded
        const existing = db
          .prepare('SELECT id FROM uploaded_files WHERE user_id = ? AND filename = ?')
          .get(req.user!.id, sample.filename);
        if (existing) continue;

        const fileId = `FILE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        let validTransactions;
        let rejectedCount = 0;
        let preview: Array<Record<string, unknown>> = [];

        if (sample.mimeType === 'application/pdf' && sample.rowsForDirectLoad) {
          // For bundled demo PDF batch, use normalizer on structured rows directly if Gemini key isn't configured,
          // or parse real CSV/XLSX buffers for CSV/XLSX samples
          const { normalizeRecords } = await import('./server/engine/normalizer.ts');
          const norm = normalizeRecords(
            sample.rowsForDirectLoad,
            fileId,
            sample.sourceCategory
          );
          validTransactions = norm.validTransactions;
          rejectedCount = norm.rejectedRows.length;
          preview = sample.rowsForDirectLoad.slice(0, 6);
        } else {
          const parsed = await parseUploadedFinancialFile({
            buffer: sample.buffer,
            filename: sample.filename,
            mimeType: sample.mimeType,
            fileId,
            sourceCategory: sample.sourceCategory,
          });
          validTransactions = parsed.report.validTransactions;
          rejectedCount = parsed.report.rejectedRows.length;
          preview = parsed.rawPreview;
        }

        db.exec('BEGIN');
        try {
          db.prepare(
            `INSERT INTO uploaded_files (
              id, user_id, filename, file_type, source_category, file_size,
              record_count, rejected_count, status, raw_preview, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Processed', ?, ?)`
          ).run(
            fileId,
            req.user!.id,
            sample.filename,
            sample.filename.split('.').pop()?.toUpperCase() || 'CSV',
            sample.sourceCategory,
            sample.buffer.length,
            validTransactions.length,
            rejectedCount,
            JSON.stringify(preview),
            now
          );

          const insertTx = db.prepare(`
            INSERT INTO transactions (
              id, user_id, file_id, transaction_id, reference_id, tx_date, amount,
              currency, merchant_name, payment_method, tx_status, source,
              source_category, description, matching_status, updated_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
          `);

          for (const tx of validTransactions) {
            insertTx.run(
              tx.id,
              req.user!.id,
              fileId,
              tx.transactionId,
              tx.referenceId,
              tx.txDate,
              tx.amount,
              tx.currency,
              tx.merchantName,
              tx.paymentMethod,
              tx.txStatus,
              tx.source,
              tx.sourceCategory,
              tx.description,
              now,
              now
            );
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }

        loaded.push({ filename: sample.filename, count: validTransactions.length });
      }

      if (loaded.length > 0) {
        db.prepare(
          `INSERT INTO audit_logs (id, user_id, user_name, action, notes, source_agent, created_at)
           VALUES (?, ?, ?, 'Sample Financial Datasets Loaded', ?, 'Document Processing Agent', ?)`
        ).run(
          crypto.randomUUID(),
          req.user!.id,
          req.user!.name,
          `Loaded ${loaded.map((l) => `${l.filename} (${l.count})`).join(', ')}`,
          now
        );
      }

      res.json({ loaded });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load sample datasets.',
      });
    }
  });

  app.delete('/api/files/:id', authMiddleware, (req: AuthedRequest, res: Response) => {
    const fileId = String(req.params.id);
    const result = db
      .prepare('DELETE FROM uploaded_files WHERE id = ? AND user_id = ?')
      .run(fileId, req.user!.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // --- RECONCILIATION & SUPERVISOR AGENT ---
  app.post('/api/reconcile/start', authMiddleware, async (req: AuthedRequest, res: Response) => {
    try {
      const result = await runSupervisorReconciliation(req.user!.id, req.user!.name);
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Reconciliation failed.',
      });
    }
  });

  app.get('/api/reconcile/latest', authMiddleware, (req: AuthedRequest, res: Response) => {
    const run = db
      .prepare(
        `SELECT * FROM reconciliation_runs WHERE user_id = ? ORDER BY started_at DESC LIMIT 1`
      )
      .get(req.user!.id) as Record<string, unknown> | undefined;

    if (!run) {
      res.json({ run: null, agents: [] });
      return;
    }

    const agents = db
      .prepare(
        `SELECT * FROM agent_executions WHERE run_id = ? ORDER BY step_order ASC`
      )
      .all(String(run.id));

    res.json({ run, agents });
  });

  app.get('/api/reconcile/runs', authMiddleware, (req: AuthedRequest, res: Response) => {
    const runs = db
      .prepare(
        `SELECT * FROM reconciliation_runs WHERE user_id = ? ORDER BY started_at DESC LIMIT 20`
      )
      .all(req.user!.id);
    res.json({ runs });
  });

  // --- DASHBOARD ANALYTICS ---
  app.get('/api/dashboard/summary', authMiddleware, (req: AuthedRequest, res: Response) => {
    const txs = db
      .prepare(`SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date ASC`)
      .all(req.user!.id) as Array<Record<string, unknown>>;

    let matched = 0;
    let unmatched = 0;
    let pending = 0;
    let duplicate = 0;
    let suspicious = 0;
    let totalAmount = 0;
    let reconciledAmount = 0;
    let pendingIssues = 0;
    let hitlPending = 0;

    const riskBuckets = { 'Low Risk': 0, 'Medium Risk': 0, 'High Risk': 0 };
    const bySource = new Map<string, { source: string; count: number; amount: number; unmatched: number }>();
    const byDate = new Map<string, { date: string; matched: number; unmatched: number; volume: number }>();

    for (const tx of txs) {
      const amt = Number(tx.amount) || 0;
      totalAmount += amt;

      if (tx.matching_status === 'Matched') {
        matched++;
        if (!tx.is_duplicate && !tx.is_suspicious) reconciledAmount += amt;
      } else if (tx.matching_status === 'Unmatched') {
        unmatched++;
      } else {
        pending++;
      }

      if (tx.is_duplicate) duplicate++;
      if (tx.is_suspicious) suspicious++;

      const rl = String(tx.risk_level || 'Low Risk') as keyof typeof riskBuckets;
      if (rl in riskBuckets) riskBuckets[rl]++;

      const resStatus = String(tx.resolution_status || 'Open');
      if (
        (tx.matching_status === 'Unmatched' ||
          tx.is_duplicate ||
          tx.is_suspicious ||
          tx.hitl_required) &&
        resStatus !== 'Resolved' &&
        resStatus !== 'Approved'
      ) {
        pendingIssues++;
      }
      if (tx.hitl_required && resStatus === 'Open') {
        hitlPending++;
      }

      const src = String(tx.source || 'Unknown');
      const sEntry = bySource.get(src) ?? { source: src, count: 0, amount: 0, unmatched: 0 };
      sEntry.count++;
      sEntry.amount += amt;
      if (tx.matching_status === 'Unmatched') sEntry.unmatched++;
      bySource.set(src, sEntry);

      const dt = String(tx.tx_date);
      const dEntry = byDate.get(dt) ?? { date: dt, matched: 0, unmatched: 0, volume: 0 };
      if (tx.matching_status === 'Matched') dEntry.matched++;
      else dEntry.unmatched++;
      dEntry.volume += amt;
      byDate.set(dt, dEntry);
    }

    const latestRun = db
      .prepare(
        `SELECT * FROM reconciliation_runs WHERE user_id = ? ORDER BY started_at DESC LIMIT 1`
      )
      .get(req.user!.id);

    const fileCount = (
      db
        .prepare('SELECT COUNT(*) as c FROM uploaded_files WHERE user_id = ?')
        .get(req.user!.id) as { c: number }
    ).c;

    res.json({
      kpis: {
        totalTransactions: txs.length,
        matchedTransactions: matched,
        unmatchedTransactions: unmatched,
        pendingTransactions: pending,
        duplicateTransactions: duplicate,
        suspiciousTransactions: suspicious,
        totalAmount: Math.round(totalAmount * 100) / 100,
        reconciledAmount: Math.round(reconciledAmount * 100) / 100,
        pendingIssues,
        hitlPending,
        uploadedFiles: fileCount,
      },
      charts: {
        statusBreakdown: [
          { name: 'Matched', value: matched, color: '#0d9488' },
          { name: 'Unmatched', value: unmatched, color: '#d97706' },
          { name: 'Duplicate', value: duplicate, color: '#dc2626' },
          { name: 'Suspicious', value: suspicious, color: '#6366f1' },
        ],
        riskDistribution: [
          { name: 'Low Risk', count: riskBuckets['Low Risk'], fill: '#0d9488' },
          { name: 'Medium Risk', count: riskBuckets['Medium Risk'], fill: '#d97706' },
          { name: 'High Risk', count: riskBuckets['High Risk'], fill: '#dc2626' },
        ],
        bySource: Array.from(bySource.values()),
        dailyTrend: Array.from(byDate.values()),
      },
      latestRun: latestRun || null,
    });
  });

  // --- TRANSACTIONS & HITL ACTIONS ---
  app.get('/api/transactions', authMiddleware, (req: AuthedRequest, res: Response) => {
    const transactions = db
      .prepare(
        `SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date DESC, risk_score DESC`
      )
      .all(req.user!.id);
    res.json({ transactions });
  });

  app.get('/api/transactions/:id', authMiddleware, (req: AuthedRequest, res: Response) => {
    const txId = String(req.params.id);
    const tx = db
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(txId, req.user!.id) as Record<string, unknown> | undefined;

    if (!tx) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }

    const matchedPartner = tx.matched_with_id
      ? db
          .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
          .get(String(tx.matched_with_id), req.user!.id)
      : null;

    const policy = tx.applicable_policy_id
      ? db
          .prepare('SELECT * FROM policies WHERE id = ?')
          .get(String(tx.applicable_policy_id))
      : null;

    const logs = db
      .prepare(
        `SELECT * FROM audit_logs WHERE user_id = ? AND transaction_id = ? ORDER BY created_at DESC`
      )
      .all(req.user!.id, txId);

    res.json({ transaction: tx, matchedPartner, policy, auditLogs: logs });
  });

  app.post('/api/transactions/:id/action', authMiddleware, (req: AuthedRequest, res: Response) => {
    try {
      const txId = String(req.params.id);
      const { actionType, notes, referenceIdUpdate } = req.body ?? {};

      const tx = db
        .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
        .get(txId, req.user!.id) as Record<string, unknown> | undefined;

      if (!tx) {
        res.status(404).json({ error: 'Transaction not found.' });
        return;
      }

      const statusMap: Record<string, { status: string; label: string }> = {
        resolve: { status: 'Resolved', label: 'Marked as Resolved' },
        dispute: { status: 'Disputed', label: 'Raised Dispute' },
        add_info: { status: 'Info Requested', label: 'Added Missing Information' },
        approve: { status: 'Approved', label: 'Approved AI Recommendation' },
        reject: { status: 'Rejected', label: 'Rejected AI Recommendation' },
        escalate: { status: 'Escalated', label: 'Escalated to Support' },
      };

      const mapped = statusMap[String(actionType)];
      if (!mapped) {
        res.status(400).json({ error: 'Unsupported action type.' });
        return;
      }

      const prevStatus = String(tx.resolution_status || 'Open');
      const now = new Date().toISOString();
      const updatedRef =
        referenceIdUpdate && String(referenceIdUpdate).trim()
          ? String(referenceIdUpdate).trim()
          : String(tx.reference_id);
      const mergedNotes = [tx.user_notes, notes].filter(Boolean).join(' | ');

      db.exec('BEGIN');
      try {
        db.prepare(
          `UPDATE transactions
           SET resolution_status = ?, reference_id = ?, user_notes = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`
        ).run(mapped.status, updatedRef, mergedNotes, now, txId, req.user!.id);

        db.prepare(
          `INSERT INTO audit_logs (
            id, user_id, user_name, transaction_id, tx_code, action,
            previous_status, new_status, notes, source_agent, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Human-in-the-Loop Analyst', ?)`
        ).run(
          crypto.randomUUID(),
          req.user!.id,
          req.user!.name,
          txId,
          String(tx.transaction_id),
          mapped.label,
          prevStatus,
          mapped.status,
          notes
            ? String(notes)
            : referenceIdUpdate
              ? `Updated reference ID to ${updatedRef}`
              : `Status updated from ${prevStatus} to ${mapped.status}.`,
          now
        );

        db.prepare(
          `INSERT INTO notifications (id, user_id, title, message, channel, is_read, created_at)
           VALUES (?, ?, ?, ?, 'In-App', 0, ?)`
        ).run(
          crypto.randomUUID(),
          req.user!.id,
          `${mapped.label}: ${tx.transaction_id}`,
          `${tx.merchant_name} (${tx.currency} ${Number(tx.amount).toFixed(2)}) updated to ${mapped.status}.`,
          now
        );

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      const updated = db
        .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
        .get(txId, req.user!.id);
      res.json({ transaction: updated });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to apply action.',
      });
    }
  });

  // --- AI INVESTIGATION CHATBOT ---
  app.get('/api/ai/chat/history', authMiddleware, (req: AuthedRequest, res: Response) => {
    const messages = db
      .prepare(
        `SELECT id, role, content, referenced_tx_ids, created_at
         FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC`
      )
      .all(req.user!.id);
    res.json({ messages });
  });

  app.delete('/api/ai/chat/clear', authMiddleware, (req: AuthedRequest, res: Response) => {
    db.prepare('DELETE FROM chat_messages WHERE user_id = ?').run(req.user!.id);
    res.json({ ok: true });
  });

  app.post('/api/ai/chat', authMiddleware, async (req: AuthedRequest, res: Response) => {
    try {
      const { question } = req.body ?? {};
      if (!question || !String(question).trim()) {
        res.status(400).json({ error: 'Question cannot be empty.' });
        return;
      }

      const qText = String(question).trim();
      const now = new Date().toISOString();
      const userMsgId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO chat_messages (id, user_id, role, content, referenced_tx_ids, created_at)
         VALUES (?, ?, 'user', ?, '[]', ?)`
      ).run(userMsgId, req.user!.id, qText, now);

      const transactions = db
        .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY risk_score DESC')
        .all(req.user!.id) as Array<Record<string, unknown>>;

      const policyRows = db.prepare('SELECT * FROM policies').all() as Array<Record<string, unknown>>;
      const policies: PolicyDocument[] = policyRows.map((p) => ({
        id: String(p.id),
        code: String(p.code),
        title: String(p.title),
        category: String(p.category),
        sourceLabel: String(p.source_label),
        summary: String(p.summary),
        fullText: String(p.full_text),
        resolutionTimeline: String(p.resolution_timeline),
        refundRules: String(p.refund_rules),
        disputeSteps: String(p.dispute_steps),
        keywords: String(p.keywords),
      }));

      const auditLogs = db
        .prepare(
          'SELECT tx_code, action, new_status, notes, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
        )
        .all(req.user!.id) as Array<Record<string, unknown>>;

      const history = db
        .prepare(
          'SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 8'
        )
        .all(req.user!.id) as Array<{ role: string; content: string }>;

      const aiReply = await answerInvestigationQuestion({
        question: qText,
        transactions,
        policies,
        auditLogs,
        history: history.reverse(),
      });

      const assistantMsgId = crypto.randomUUID();
      const replyNow = new Date().toISOString();
      db.prepare(
        `INSERT INTO chat_messages (id, user_id, role, content, referenced_tx_ids, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?)`
      ).run(
        assistantMsgId,
        req.user!.id,
        aiReply.answer,
        JSON.stringify(aiReply.referencedTxIds),
        replyNow
      );

      res.json({
        message: {
          id: assistantMsgId,
          role: 'assistant',
          content: aiReply.answer,
          referenced_tx_ids: JSON.stringify(aiReply.referencedTxIds),
          created_at: replyNow,
        },
      });
    } catch (err) {
      res.status(503).json({
        error:
          err instanceof Error
            ? err.message
            : 'Gemini Investigation Assistant could not respond.',
      });
    }
  });

  // --- POLICIES (RAG KNOWLEDGE BASE) ---
  app.get('/api/policies', authMiddleware, (req: AuthedRequest, res: Response) => {
    const query = String(req.query.q || '').trim();
    const rows = db.prepare('SELECT * FROM policies ORDER BY code ASC').all() as Array<
      Record<string, unknown>
    >;
    const policies: PolicyDocument[] = rows.map((p) => ({
      id: String(p.id),
      code: String(p.code),
      title: String(p.title),
      category: String(p.category),
      sourceLabel: String(p.source_label),
      summary: String(p.summary),
      fullText: String(p.full_text),
      resolutionTimeline: String(p.resolution_timeline),
      refundRules: String(p.refund_rules),
      disputeSteps: String(p.dispute_steps),
      keywords: String(p.keywords),
    }));

    if (!query) {
      res.json({ policies });
      return;
    }

    const ranked = retrievePoliciesForQuery(query, policies, policies.length);
    res.json({
      policies: ranked.filter((r) => r.relevanceScore > 0).map((r) => ({
        ...r.policy,
        relevanceScore: r.relevanceScore,
        matchedTerms: r.matchedTerms,
      })),
    });
  });

  app.post('/api/policies', authMiddleware, (req: AuthedRequest, res: Response) => {
    try {
      const { title, category, summary, fullText, resolutionTimeline, refundRules, disputeSteps } =
        req.body ?? {};
      if (!title || !summary || !fullText) {
        res.status(400).json({ error: 'Title, summary, and policy text are required.' });
        return;
      }
      const id = `pol-${crypto.randomUUID().slice(0, 8)}`;
      const code = `CUSTOM-POL-${Math.floor(100 + Math.random() * 900)}`;
      db.prepare(
        `INSERT INTO policies (
          id, code, title, category, source_label, summary, full_text,
          resolution_timeline, refund_rules, dispute_steps, keywords
        ) VALUES (?, ?, ?, ?, 'User Uploaded Organization Policy', ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        code,
        String(title).trim(),
        String(category || 'Custom Policy').trim(),
        String(summary).trim(),
        String(fullText).trim(),
        String(resolutionTimeline || '3-5 business days').trim(),
        String(refundRules || 'As specified by organization policy.').trim(),
        String(disputeSteps || 'Review and escalate per internal SOP.').trim(),
        `${title} ${category} ${summary}`.toLowerCase()
      );
      res.status(201).json({ ok: true, id, code });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to add policy.',
      });
    }
  });

  // --- REPORTS ---
  app.get('/api/reports/summary', authMiddleware, (req: AuthedRequest, res: Response) => {
    const payload = buildReportPayload(
      req.user!.id,
      req.user!.name,
      req.user!.organization
    );
    res.json(payload);
  });

  app.get('/api/reports/export', authMiddleware, (req: AuthedRequest, res: Response) => {
    const format = String(req.query.format || 'csv').toLowerCase();
    const payload = buildReportPayload(
      req.user!.id,
      req.user!.name,
      req.user!.organization
    );
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx' || format === 'excel') {
      const buf = generateExcelReport(payload);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reconai-report-${stamp}.xlsx"`
      );
      res.send(buf);
      return;
    }

    if (format === 'pdf') {
      const buf = generatePdfReport(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reconai-report-${stamp}.pdf"`
      );
      res.send(buf);
      return;
    }

    const buf = generateCsvReport(payload);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reconai-report-${stamp}.csv"`
    );
    res.send(buf);
  });

  // --- AUDIT LOGS & NOTIFICATIONS ---
  app.get('/api/audit-logs', authMiddleware, (req: AuthedRequest, res: Response) => {
    const logs = db
      .prepare(
        `SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 300`
      )
      .all(req.user!.id);
    res.json({ logs });
  });

  app.get('/api/notifications', authMiddleware, (req: AuthedRequest, res: Response) => {
    const notifications = db
      .prepare(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
      )
      .all(req.user!.id);
    res.json({ notifications });
  });

  app.post('/api/notifications/read', authMiddleware, (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
    res.json({ ok: true });
  });

  // --- SETTINGS ---
  app.put('/api/settings/profile', authMiddleware, (req: AuthedRequest, res: Response) => {
    const { name, organization, role } = req.body ?? {};
    if (!name) {
      res.status(400).json({ error: 'Name is required.' });
      return;
    }
    db.prepare(
      `UPDATE users SET name = ?, organization = ?, role = ? WHERE id = ?`
    ).run(
      String(name).trim(),
      String(organization || req.user!.organization).trim(),
      String(role || req.user!.role).trim(),
      req.user!.id
    );
    const updated = db
      .prepare('SELECT id, name, email, role, organization FROM users WHERE id = ?')
      .get(req.user!.id);
    res.json({ user: updated });
  });

  app.post('/api/settings/reset-workspace', authMiddleware, (req: AuthedRequest, res: Response) => {
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM transactions WHERE user_id = ?').run(req.user!.id);
      db.prepare('DELETE FROM uploaded_files WHERE user_id = ?').run(req.user!.id);
      db.prepare('DELETE FROM reconciliation_runs WHERE user_id = ?').run(req.user!.id);
      db.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(req.user!.id);
      db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user!.id);
      db.prepare('DELETE FROM chat_messages WHERE user_id = ?').run(req.user!.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json({ ok: true });
  });

  // --- VITE / STATIC FRONTEND ---
  const distPath = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`ReconAI Server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
