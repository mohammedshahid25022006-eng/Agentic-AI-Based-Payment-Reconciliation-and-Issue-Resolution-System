import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Trash2, User } from 'lucide-react';
import { apiFetch } from '../api';
import type { ChatMessageRecord, TransactionRecord } from '../types';

interface AiInvestigationViewProps {
  transactions: TransactionRecord[];
  onInspectTransaction: (txId: string) => void;
}

const STARTER_PROMPTS = [
  'Why are there unmatched transactions in this batch?',
  'Which transactions are classified as duplicate or suspicious?',
  'What is the reason for the amount mismatch?',
  'Which high-risk cases require Human-in-the-Loop action?',
  'Explain the highest risk transaction in simple language.',
];

export function AiInvestigationView({
  transactions,
  onInspectTransaction,
}: AiInvestigationViewProps) {
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiFetch<{ messages: ChatMessageRecord[] }>('/api/ai/chat/history')
      .then((res) => setMessages(res.messages))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || sending) return;
    setError(null);
    setSending(true);

    const optimisticUser: ChatMessageRecord = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: trimmed,
      referenced_tx_ids: '[]',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput('');

    try {
      const res = await apiFetch<{ message: ChatMessageRecord }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ question: trimmed }),
      });
      setMessages((prev) => [...prev, res.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query Gemini Assistant');
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    await apiFetch('/api/ai/chat/clear', { method: 'DELETE' });
    setMessages([]);
  };

  const txCodeToId = new Map(transactions.map((t) => [t.transaction_id, t.id]));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Prompt Starters & Context Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 h-fit">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">
            Gemini AI Investigation Assistant
          </h2>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Grounded strictly in your {transactions.length} processed transaction record(s), anomaly risk scores, mismatch flags, and Sample Policy Knowledge Base.
          </p>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-700 mb-2">
            Investigation Prompt Starters
          </div>
          <div className="space-y-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={sending}
                onClick={() => sendQuestion(prompt)}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-lg transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Chat Thread */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl flex flex-col h-[620px]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-900 font-display">
            Interactive Investigation Console
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 bg-slate-100 rounded-lg inline-flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Chat
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <Bot className="w-9 h-9 text-indigo-600 mb-3" />
              <div className="text-sm font-bold text-slate-900">
                Ask about any mismatch, duplicate, or risk score
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Select a starter question on the left or ask your own question below. Responses cite real Transaction IDs from your ledger.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              let refs: string[] = [];
              try {
                const parsed = JSON.parse(msg.referenced_tx_ids);
                if (Array.isArray(parsed)) refs = parsed;
              } catch {
                // ignore
              }
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0 text-indigo-700">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {refs.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500">
                          Referenced Cases:
                        </span>
                        {refs.map((code) => {
                          const internalId = txCodeToId.get(code);
                          return internalId ? (
                            <button
                              key={code}
                              type="button"
                              onClick={() => onInspectTransaction(internalId)}
                              className="px-2 py-0.5 bg-white border border-slate-300 hover:border-teal-500 text-teal-700 font-mono rounded text-[11px] font-semibold"
                            >
                              {code}
                            </button>
                          ) : (
                            <span key={code} className="font-mono text-[11px] text-slate-600">
                              {code}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0 text-slate-700">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}
          {sending && (
            <div className="text-xs text-slate-500 font-mono">
              Gemini Investigation Agent analyzing ledger context...
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div role="alert" className="mx-6 mb-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="p-4 border-t border-slate-200 flex items-center gap-2"
        >
          <label htmlFor="ai-chat-input" className="sr-only">
            Ask Gemini Investigation Assistant
          </label>
          <input
            id="ai-chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask why a transaction is unmatched, suspicious, or what action to take..."
            className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            Ask Gemini
          </button>
        </form>
      </div>
    </div>
  );
}
