import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamCFO } from '../api/client';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const QUICK_PROMPTS = [
  { label: 'KPI Snapshot', prompt: 'Give me a full KPI snapshot for this fiscal year.' },
  { label: 'P&L Summary', prompt: 'Summarize the P&L for this fiscal year with key insights.' },
  { label: 'Cash Position', prompt: 'What is our current cash and FD position?' },
  { label: 'Top Clients', prompt: 'Who are our top 10 clients by revenue this fiscal year?' },
  { label: 'Burn Rate', prompt: 'What is our current burn rate and runway?' },
  { label: 'Entity Breakdown', prompt: 'Break down revenue and expenses by entity (Uniresearch, Univest, Uniapps, Broking).' },
  { label: 'Board Pack PDF', prompt: 'Generate a board pack PDF report for this fiscal year.' },
  { label: 'MoM Growth', prompt: 'Show month-over-month revenue growth trend for this fiscal year.' },
];

const TOOL_LABELS = {
  get_pl_statement: 'Fetching P&L · Zoho Books',
  get_balance_sheet: 'Fetching Balance Sheet · Zoho Books',
  get_cash_flow: 'Fetching Cash Flow · Zoho Books',
  get_aging_report: 'Fetching Aging Report · Zoho Books',
  get_kpi_summary: 'Fetching KPI Summary · Zoho Books',
  get_cohort_breakdown: 'Fetching Cohort Breakdown · Zoho Books',
  get_mis_data: 'Fetching MIS Google Sheet',
  get_cash_mis: 'Fetching Cash MIS · Matrix Cash Sheet',
  get_mis_data_broking: 'Fetching IS- Broking Accrued · MIS Sheet',
  generate_report_pdf: 'Generating PDF Report',
};

function ToolCallBadge({ name }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 my-2 w-fit">
      <span className="animate-spin">⚙</span>
      {TOOL_LABELS[name] || name}
    </div>
  );
}

function Message({ role, content, toolCalls, streaming }) {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 mb-5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm ${
        isUser ? 'bg-[#185FA5] text-white' : 'bg-[#0f1f3d] text-white'
      }`}>
        {isUser ? 'U' : 'CFO'}
      </div>

      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Tool calls (only for assistant) */}
        {!isUser && toolCalls?.map((tc, i) => <ToolCallBadge key={i} name={tc.name} />)}

        {/* Message bubble */}
        {(content || (streaming && !toolCalls?.length)) && (
          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isUser
              ? 'bg-[#185FA5] text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
          }`}>
            {isUser ? (
              content
            ) : (
              <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-strong:text-gray-900 prose-table:text-xs prose-th:bg-gray-50 prose-th:font-semibold prose-td:py-1.5">
                {streaming && !content
                  ? <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse rounded-sm" />
                  : <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PDFDownloadButton({ reportType, startDate, endDate }) {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/cfo/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType, start_date: startDate, end_date: endDate }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `univest_${reportType}_${startDate}_${endDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={download}
      disabled={loading}
      className="mt-2 flex items-center gap-2 px-4 py-2 bg-[#0f1f3d] text-white text-xs font-semibold rounded-lg hover:bg-[#185FA5] transition-colors disabled:opacity-60"
    >
      {loading ? <span className="animate-spin">⏳</span> : '⬇'}
      {loading ? 'Generating…' : `Download ${reportType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} PDF`}
    </button>
  );
}

export default function CFOAssistant() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `**Good day!** I'm your AI CFO Assistant for Univest Group.\n\nI have live access to your Zoho Books data across all four entities — **Uniresearch, Univest, Uniapps, and Stock Broking**.\n\nAsk me anything: P&L analysis, cash position, burn rate, cohort performance, or generate a board pack PDF.\n\nWhat would you like to explore?`,
      toolCalls: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pendingToolCalls, setPendingToolCalls] = useState([]);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingToolCalls]);

  const sendMessage = async (text) => {
    if (!text.trim() || streaming) return;

    const userMsg = { role: 'user', content: text, toolCalls: [] };
    const apiMessages = [
      ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setPendingToolCalls([]);

    // Placeholder assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '', toolCalls: [], _streaming: true }]);

    let accum = '';
    const activeToolCalls = [];

    try {
      await streamCFO(
        apiMessages,
        // onChunk
        (chunk) => {
          accum += chunk;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: accum, toolCalls: [...activeToolCalls], _streaming: true };
            return next;
          });
        },
        // onToolCall
        (tc) => {
          activeToolCalls.push(tc);
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: accum, toolCalls: [...activeToolCalls], _streaming: true };
            return next;
          });
        },
        // onDone
        () => {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: accum, toolCalls: [...activeToolCalls] };
            return next;
          });
          setStreaming(false);
          setPendingToolCalls([]);
          inputRef.current?.focus();
        },
        // onError
        (err) => {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = {
              role: 'assistant',
              content: `Sorry, I encountered an error: ${err.message}. Please check that your ANTHROPIC_API_KEY is set in the backend .env file.`,
              toolCalls: [],
            };
            return next;
          });
          setStreaming(false);
        }
      );
    } catch (err) {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: `Chat cleared. How can I help you with Univest's financials?`,
      toolCalls: [],
    }]);
  };

  return (
    <div className="flex flex-col h-full -m-6 bg-gray-50">
      {/* Header */}
      <div className="bg-[#0f1f3d] px-6 py-4 flex-shrink-0 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#185FA5] flex items-center justify-center text-white font-bold text-lg shadow">
            CFO
          </div>
          <div>
            <h1 className="text-white font-semibold text-base">AI CFO Assistant</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-gray-400 text-xs">Live Zoho Books data · All 4 entities</span>
            </div>
          </div>
        </div>
        <button
          onClick={clearChat}
          disabled={streaming}
          className="text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 transition-colors disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {messages.map((msg, i) => (
          <Message
            key={i}
            role={msg.role}
            content={msg.content}
            toolCalls={msg.toolCalls}
            streaming={msg._streaming && streaming}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="px-6 pb-3 flex flex-wrap gap-2 flex-shrink-0">
        {QUICK_PROMPTS.map(({ label, prompt }) => (
          <button
            key={label}
            onClick={() => sendMessage(prompt)}
            disabled={streaming}
            className="text-xs px-3 py-1.5 rounded-full border border-[#185FA5]/40 text-[#185FA5] bg-white hover:bg-[#185FA5]/10 transition-colors disabled:opacity-40 font-medium"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-6 pb-5 flex-shrink-0">
        <div className="flex gap-3 bg-white border border-gray-300 rounded-2xl overflow-hidden shadow-sm focus-within:border-[#185FA5] focus-within:ring-2 focus-within:ring-[#185FA5]/20 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about P&L, cash flow, cohorts, burn rate… or request a PDF report"
            disabled={streaming}
            rows={1}
            className="flex-1 px-4 py-3 text-sm outline-none bg-transparent placeholder-gray-400 resize-none leading-relaxed"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming}
            className="self-end mb-2 mr-2 px-4 py-2 bg-[#185FA5] text-white text-sm font-semibold rounded-xl hover:bg-[#1a6bbf] disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
          >
            {streaming ? (
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            ) : '→'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5 text-center">
          Powered by GPT-4o · Live Zoho Books data · Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
