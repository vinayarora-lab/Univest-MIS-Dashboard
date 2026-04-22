import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';

// ── Markdown renderer ────────────────────────────────────────────────────────
function MarkdownTable({ text }) {
  const lines = text.split('\n').filter(Boolean);
  const tableLines = lines.filter((l) => l.includes('|'));
  if (tableLines.length < 2) return <span>{text}</span>;
  const rows = tableLines.map((l) =>
    l.split('|').map((c) => c.trim()).filter((c) => c !== '')
  );
  const [header, , ...body] = rows;
  return (
    <div className="overflow-auto my-2">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr>
            {(header || []).map((h, i) => (
              <th key={i} className="border border-bloomberg-border px-2 py-1 text-bloomberg-accent bg-bloomberg-card text-left whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-bloomberg-bg' : 'bg-bloomberg-card'}>
              {row.map((cell, j) => (
                <td key={j} className="border border-bloomberg-border px-2 py-1 text-bloomberg-subtle whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessageContent({ content }) {
  const parts = content.split(/((?:\|[^\n]+\|\n?)+)/g);
  return (
    <div className="space-y-1">
      {parts.map((part, i) => {
        if (part.includes('|') && part.split('\n').filter(l => l.includes('|')).length >= 2) {
          return <MarkdownTable key={i} text={part} />;
        }
        return (
          <div key={i} className="whitespace-pre-wrap text-xs leading-relaxed text-bloomberg-subtle">
            {part.split('**').map((seg, j) =>
              j % 2 === 1
                ? <strong key={j} className="text-bloomberg-text font-semibold">{seg}</strong>
                : seg
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Quick query categories ───────────────────────────────────────────────────
const QUICK_CATEGORIES = [
  {
    label: 'Balance Sheet',
    queries: [
      'Combined balance sheet all companies',
      'Company wise balance sheet summary',
      'Total cash and FD consolidated',
      'Net GST receivable all companies',
      'TDS receivable company wise',
      'Security deposits list',
    ],
  },
  {
    label: 'Cash Flow',
    queries: [
      'Consolidated cash flow statement',
      'Company wise cash flow summary',
      'Operating vs investing vs financing cash flow',
      'Monthly cash flow trend',
      'Net cash flow by company',
    ],
  },
  {
    label: 'Payments & Receipts',
    queries: [
      'Vendor wise total payment all companies',
      'Company wise total sales / receipts',
      'Top 10 vendors by payment amount',
      'Top 10 customers by receipt amount',
      'Top 10 expenses',
    ],
  },
  {
    label: 'Ledger / Account',
    queries: [
      'Bank wise transaction summary',
      'Statement of account for HDFC Bank',
      'All bank entries this period',
      'Journal entries summary',
      'All inflow transactions',
    ],
  },
];

// ── Download helpers ─────────────────────────────────────────────────────────
function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function chatToText(messages) {
  return messages.map((m) =>
    (m.role === 'user' ? '👤 YOU:\n' : '🤖 ASSISTANT:\n') + m.content
  ).join('\n\n' + '─'.repeat(60) + '\n\n');
}

// ── Icons ────────────────────────────────────────────────────────────────────
const SendIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);
const SpinIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const DownloadIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);
const CopyIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

// ── Main Component ───────────────────────────────────────────────────────────
export default function SearchChat() {
  const { fromDate, toDate, dashboardData } = useStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [exporting, setExporting] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const companies = dashboardData?.companies?.map(c => c.companyName) || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async (query) => {
    const q = (query || input).trim();
    if (!q || loading) return;
    setInput('');
    setLoading(true);

    const userMsg = { role: 'user', content: q };
    const assistantMsg = { role: 'assistant', content: '', streaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, fromDate, toDate }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const { text } = JSON.parse(payload);
            if (text) {
              setMessages((prev) => {
                const msgs = [...prev];
                msgs[msgs.length - 1] = {
                  ...msgs[msgs.length - 1],
                  content: msgs[msgs.length - 1].content + text,
                };
                return msgs;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { role: 'assistant', content: `Error: ${err.message}` };
        return msgs;
      });
    } finally {
      setMessages((prev) => {
        const msgs = [...prev];
        if (msgs[msgs.length - 1]?.streaming) {
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], streaming: false };
        }
        return msgs;
      });
      setLoading(false);
    }
  };

  const copyMessage = (content, idx) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  const downloadChat = () => {
    if (!messages.length) return;
    const text = `UNIVEST GROUP — FINANCIAL ASSISTANT CHAT\nPeriod: ${fromDate} → ${toDate}\nDate: ${new Date().toLocaleDateString('en-IN')}\n\n${'═'.repeat(60)}\n\n` + chatToText(messages);
    downloadText(text, `Univest_Chat_${new Date().toISOString().slice(0, 10)}.txt`);
  };

  const downloadExcel = async (company = 'all') => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ fromDate, toDate, company });
      const res = await fetch(`/api/export?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="(.+?)"/);
      a.download = match ? match[1] : `Univest_Financial_${fromDate}_${toDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {/* ── Floating Button ────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110"
        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
        title="Financial Assistant"
      >
        {open
          ? <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          : <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
        }
      </button>

      {/* ── Chat Panel ─────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex flex-col shadow-2xl rounded-xl overflow-hidden border border-bloomberg-border"
          style={{ width: 'min(560px, calc(100vw - 2rem))', height: '80vh', maxHeight: '700px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-bloomberg-border flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #f59e0b22, #0a0a0f)' }}>
            <div className="flex items-center gap-2">
              <span className="text-bloomberg-accent text-base">🤖</span>
              <div>
                <div className="text-xs font-bold text-bloomberg-text">Financial Assistant</div>
                <div className="text-[9px] text-bloomberg-muted">Balance sheet • Cash flow • Ledger • Any question</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Download chat */}
              {messages.length > 0 && (
                <button
                  onClick={downloadChat}
                  title="Download conversation"
                  className="flex items-center gap-1 text-[10px] text-bloomberg-muted hover:text-bloomberg-subtle px-2 py-1 rounded border border-bloomberg-border transition-all"
                >
                  <DownloadIcon /> Chat
                </button>
              )}
              {/* Clear */}
              <button
                onClick={() => setMessages([])}
                className="text-[10px] text-bloomberg-muted hover:text-bloomberg-red px-2 py-1 rounded border border-bloomberg-border transition-all"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Export Data Bar */}
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-bloomberg-border/50 overflow-x-auto"
            style={{ background: '#0d0d14' }}>
            <span className="text-[9px] text-bloomberg-muted uppercase tracking-wider whitespace-nowrap flex-shrink-0">
              <DownloadIcon /> Export Excel:
            </span>
            <button
              onClick={() => downloadExcel('all')}
              disabled={exporting}
              className="text-[10px] px-2 py-0.5 rounded border border-bloomberg-accent/30 text-bloomberg-accent hover:bg-bloomberg-accent/10 transition-all whitespace-nowrap disabled:opacity-40"
            >
              {exporting ? 'Exporting...' : 'All Companies'}
            </button>
            {companies.map((co) => (
              <button
                key={co}
                onClick={() => downloadExcel(co)}
                disabled={exporting}
                className="text-[10px] px-2 py-0.5 rounded border border-bloomberg-border text-bloomberg-muted hover:border-bloomberg-accent/30 hover:text-bloomberg-subtle transition-all whitespace-nowrap disabled:opacity-40"
              >
                {co}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ background: '#0a0a0f' }}>
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="text-center text-bloomberg-muted text-[10px] pt-2 uppercase tracking-wider">
                  Ask anything — balance sheet, cash flow, ledger, payments, any data
                </div>

                {/* Category tabs */}
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {QUICK_CATEGORIES.map((cat, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveCategory(i)}
                      className={`text-[10px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-all flex-shrink-0 ${
                        activeCategory === i
                          ? 'border-bloomberg-accent text-bloomberg-accent bg-bloomberg-accent/10'
                          : 'border-bloomberg-border text-bloomberg-muted hover:border-bloomberg-accent/40'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Quick queries for active category */}
                <div className="grid grid-cols-1 gap-1.5">
                  {QUICK_CATEGORIES[activeCategory].queries.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="text-left text-[11px] text-bloomberg-muted border border-bloomberg-border rounded-lg px-3 py-2 hover:border-bloomberg-accent/50 hover:text-bloomberg-subtle transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] rounded-xl px-3 py-2 relative group ${
                  msg.role === 'user'
                    ? 'bg-bloomberg-accent/20 border border-bloomberg-accent/30 text-bloomberg-accent text-xs'
                    : 'bg-bloomberg-card border border-bloomberg-border'
                }`}>
                  {msg.role === 'user'
                    ? <span className="text-xs">{msg.content}</span>
                    : <MessageContent content={msg.content} />
                  }
                  {msg.streaming && (
                    <span className="inline-block w-1.5 h-3 bg-bloomberg-accent animate-pulse ml-0.5 align-middle" />
                  )}
                  {/* Copy button */}
                  {!msg.streaming && msg.content && (
                    <button
                      onClick={() => copyMessage(msg.content, i)}
                      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-bloomberg-muted hover:text-bloomberg-subtle"
                      title="Copy"
                    >
                      {copiedIdx === i ? <span className="text-[9px] text-bloomberg-green">✓</span> : <CopyIcon />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-bloomberg-border p-2" style={{ background: '#111118' }}>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Balance sheet, cash flow, ledger, vendor payments, any question..."
                disabled={loading}
                className="flex-1 bg-bloomberg-bg border border-bloomberg-border text-bloomberg-subtle text-xs px-3 py-2 rounded-lg outline-none focus:border-bloomberg-accent/60 placeholder:text-bloomberg-muted disabled:opacity-50"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                style={{ background: '#f59e0b', color: '#000' }}
              >
                {loading ? <SpinIcon /> : <SendIcon />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
