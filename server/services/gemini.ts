import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { PolicyDocument, SourceCategory } from '../engine/types.ts';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add a valid key in Settings > Secrets to enable Gemini AI investigation and document OCR.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string } };
    if (parsed?.error?.message) {
      return `Gemini API (${parsed.error.code ?? 'error'}): ${parsed.error.message}`;
    }
  } catch {
    // not raw JSON
  }
  return raw;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1, timeoutMs = 9000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API request timed out (9s).')), timeoutMs)
        ),
      ]);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE');
      if (!isTransient || attempt === retries) {
        throw new Error(formatGeminiError(err));
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(formatGeminiError(lastErr));
}

export interface ExtractedRawRow {
  transactionId: string;
  referenceId: string;
  txDate: string;
  amount: number;
  currency: string;
  merchantName: string;
  paymentMethod: string;
  txStatus: string;
  description: string;
}

export async function extractTransactionsFromMultimodalDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  sourceCategory: SourceCategory
): Promise<ExtractedRawRow[]> {
  const ai = getClient();

  const filePart = {
    inlineData: {
      mimeType,
      data: buffer.toString('base64'),
    },
  };

  const promptPart = {
    text: `Extract every financial transaction, receipt line-item payment, or invoice payment record from this ${sourceCategory.replace('_', ' ')} document (${filename}).
Return strictly factual values visible in the document. Use YYYY-MM-DD for dates. If a Reference ID / UTR / Invoice Reference is not present, return "MISSING-REF". If currency symbol is ₹ or INR use "INR", $ use "USD".`,
  };

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts: [filePart, promptPart] },
      config: {
        systemInstruction:
          'You are a precision financial OCR and document extraction agent. Extract only verifiable transaction fields present in the document without fabricating numbers or references.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              transactionId: { type: Type.STRING },
              referenceId: { type: Type.STRING },
              txDate: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              currency: { type: Type.STRING },
              merchantName: { type: Type.STRING },
              paymentMethod: { type: Type.STRING },
              txStatus: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: [
              'transactionId',
              'referenceId',
              'txDate',
              'amount',
              'merchantName',
              'paymentMethod',
              'txStatus',
              'description',
            ],
          },
        },
      },
    })
  );

  const rawText = (response.text ?? '[]').trim();
  const parsed = JSON.parse(rawText);
  if (!Array.isArray(parsed)) {
    throw new Error('Gemini returned unexpected extraction structure.');
  }
  return parsed as ExtractedRawRow[];
}

export interface InvestigationPromptItem {
  id: string;
  transactionId: string;
  referenceId: string;
  txDate: string;
  amount: number;
  currency: string;
  merchantName: string;
  source: string;
  txStatus: string;
  matchingStatus: string;
  mismatchReason: string | null;
  riskScore: number;
  riskLevel: string;
  isDuplicate: boolean;
  isSuspicious: boolean;
  riskFlags: string[];
  policyCode: string | null;
  policyTitle: string | null;
  policyTimeline: string | null;
  recommendedAction: string;
}

export interface GeminiInvestigationItem {
  id: string;
  investigationReport: string;
  aiExplanation: string;
  policyExplanation: string;
}

export async function generateInvestigationNarratives(
  items: InvestigationPromptItem[]
): Promise<Map<string, GeminiInvestigationItem>> {
  const resultMap = new Map<string, GeminiInvestigationItem>();
  if (items.length === 0) return resultMap;

  const ai = getClient();

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Analyze these flagged/unmatched financial reconciliation cases and produce concise, factual investigation findings grounded strictly in the provided evidence.
Cases:
${JSON.stringify(items, null, 2)}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: `You are the Investigation & Policy Explanation Agent in an Agentic Payment Reconciliation System.
Rules:
1. Never invent transaction IDs, UTRs, dates, amounts, or evidence not present in the input JSON.
2. Explain clearly WHY the transaction is unmatched, duplicate, or risky based on the factual mismatchReason and riskFlags.
3. When explaining the policy, explicitly state that it comes from the "Sample Policy Knowledge Base (for demonstration)" and cite its resolution timeline.
4. Keep each field crisp (2-3 sentences).`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              investigationReport: { type: Type.STRING },
              aiExplanation: { type: Type.STRING },
              policyExplanation: { type: Type.STRING },
            },
            required: ['id', 'investigationReport', 'aiExplanation', 'policyExplanation'],
          },
        },
      },
    })
  );

  const rawText = (response.text ?? '[]').trim();
  const parsed = JSON.parse(rawText) as GeminiInvestigationItem[];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item.id) {
        resultMap.set(item.id, item);
      }
    }
  }
  return resultMap;
}

export async function answerInvestigationQuestion(params: {
  question: string;
  transactions: Array<Record<string, unknown>>;
  policies: PolicyDocument[];
  auditLogs: Array<Record<string, unknown>>;
  history: Array<{ role: string; content: string }>;
}): Promise<{ answer: string; referencedTxIds: string[] }> {
  const ai = getClient();

  const compactTxs = params.transactions.slice(0, 60).map((t) => ({
    id: t.transaction_id,
    ref: t.reference_id,
    date: t.tx_date,
    amount: t.amount,
    currency: t.currency,
    merchant: t.merchant_name,
    source: t.source,
    method: t.payment_method,
    status: t.tx_status,
    matchingStatus: t.matching_status,
    matchedWith: t.matched_with_tx_code,
    mismatchReason: t.mismatch_reason,
    riskScore: t.risk_score,
    riskLevel: t.risk_level,
    isDuplicate: Boolean(t.is_duplicate),
    isSuspicious: Boolean(t.is_suspicious),
    recommendedAction: t.recommended_action,
    resolutionStatus: t.resolution_status,
    policy: t.applicable_policy_summary,
  }));

  const compactPolicies = params.policies.map((p) => ({
    code: p.code,
    title: p.title,
    sourceLabel: p.sourceLabel,
    timeline: p.resolutionTimeline,
    summary: p.summary,
  }));

  const recentHistory = params.history.slice(-6);

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `User Question: ${params.question}

Conversation History:
${JSON.stringify(recentHistory)}

Actual Processed Transaction Records (${compactTxs.length} shown):
${JSON.stringify(compactTxs)}

Sample Policy Knowledge Base:
${JSON.stringify(compactPolicies)}

Recent Audit Actions:
${JSON.stringify(params.auditLogs.slice(0, 15))}`,
      config: {
        systemInstruction: `You are the ReconAI Investigation Assistant. Answer the user's question accurately using ONLY the actual transaction records, risk scores, mismatch details, audit logs, and sample policies provided in the context.
- Always cite exact Transaction IDs (e.g., BNK-2026-1003), Reference IDs, amounts, and risk scores when discussing specific cases.
- Clearly note when citing policies that they are from the Sample Policy Knowledge Base for demonstration.
- If no matching transactions exist in the workspace yet, tell the user clearly to upload financial statements or load sample datasets and run reconciliation first.
- Also return referencedTxIds as an array of Transaction IDs mentioned in your answer.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            referencedTxIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['answer', 'referencedTxIds'],
        },
      },
    })
  );

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as {
    answer?: string;
    referencedTxIds?: string[];
  };
  return {
    answer: parsed.answer || 'No investigation response was generated.',
    referencedTxIds: Array.isArray(parsed.referencedTxIds)
      ? parsed.referencedTxIds
      : [],
  };
}
