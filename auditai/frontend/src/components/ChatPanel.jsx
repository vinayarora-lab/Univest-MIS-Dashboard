import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamChat } from '../api/client';

const QUICK_PROMPTS = [
  'Revenue summary this year',
  'Top clients by payments',
  'EBITDA trend last 6 months',
  'Download monthly ledger',
  'M1 retention latest cohort',
  'Channel CAC comparison',
];

// Render download links inside AI messages
function renderContent(content) {
  // Replace [DOWNLOAD: label](url) with a button
  const parts = [];
  const regex = /\[DOWNLOAD:\s*([^\]]+)\]\((http[^)]+)\)/g;
  let last = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: content.slice(last, match.index) });
    parts.push({ type: 'download', label: match[1].trim(), url: match[2] });
    last = match.index + match[0].length;
  }
  if (last < content.length) parts.push({ type: 'text', value: content.slice(last) });

  return parts.map((p, i) => {
    if (p.type === 'download') {
      return (
        <a
          key={i}
          href={p.url}
          download
          className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-[#185FA5] text-white text-xs font-semibold rounded-lg hover:bg-[#1a6bbf] transition-colors no-underline"
          onClick={e => e.stopPropagation()}
        >
          ⬇ {p.label}
        </a>
      );
    }
    return <ReactMarkdown key={i}>{p.value}</ReactMarkdown>;
  });
}

function Message({ role, content, streaming }) {
  return (
    <div className={`flex gap-2 mb-3 ${role === 'user' ? 'flex-row-reverse' : ''}`}>
      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
        role === 'user' ? 'bg-[#185FA5] text-white' : 'bg-[#0f1f3d] text-white'
      }`}>
        {role === 'user' ? 'U' : 'AI'}
      </div>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
        role === 'user'
          ? 'bg-[#185FA5] text-white'
          : 'bg-gray-100 text-gray-800'
      }`}>
        {role === 'assistant' ? (
          <div className="prose-chat">
            {streaming && !content ? '▋' : renderContent(content || '')}
          </div>
        ) : content}
      </div>
    </div>
  );
}

export default function ChatPanel({ context }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I'm **Univest AI** — I have full access to your Zoho Books data, MIS datapack, and can answer questions about revenues, cohorts, cash flows, ledgers, and more.\n\nYou can also ask me to **download ledgers** — e.g. *"Download monthly cashflow for Univest FY25"*`,
    },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const prevContext = useRef(context);

  useEffect(() => {
    if (prevContext.current !== context) {
      prevContext.current = context;
      setMessages([{
        role: 'assistant',
        content: `Switched context. I now have the **${context.replace('_', ' ')}** data loaded. What would you like to know?`,
      }]);
    }
  }, [context]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim() || streaming) return;

    const userMsg = { role: 'user', content: text };
    const apiMessages = [
      ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];

    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '', _streaming: true }]);
    setInput('');
    setStreaming(true);

    let accum = '';
    try {
      await streamChat(
        apiMessages, context,
        (chunk) => {
          accum += chunk;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: accum, _streaming: true };
            return next;
          });
        },
        () => {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: accum };
            return next;
          });
          setStreaming(false);
        },
        (err) => {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: `Error: ${err.message}` };
            return next;
          });
          setStreaming(false);
        }
      );
    } catch (err) {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-[#0f1f3d] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm font-semibold text-white">Univest AI</span>
          <span className="ml-auto text-xs text-gray-400 bg-white/10 px-2 py-0.5 rounded capitalize">
            {context.replace('_', ' ')}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">Ask anything · Download ledgers</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.map((msg, i) => (
          <Message key={i} role={msg.role} content={msg.content} streaming={msg._streaming && streaming} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick Prompts */}
      <div className="px-3 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
        {QUICK_PROMPTS.map(prompt => (
          <button
            key={prompt}
            onClick={() => sendMessage(prompt)}
            disabled={streaming}
            className="text-xs px-2.5 py-1 rounded-full border border-[#185FA5]/40 text-[#185FA5] hover:bg-[#185FA5]/10 transition-colors disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="px-3 pb-3 flex-shrink-0">
        <div className="flex gap-2 border border-gray-300 rounded-lg overflow-hidden focus-within:border-[#185FA5] focus-within:ring-1 focus-within:ring-[#185FA5]/30">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything or request a ledger download..."
            disabled={streaming}
            className="flex-1 px-3 py-2 text-sm outline-none bg-white placeholder-gray-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="px-3 py-2 bg-[#185FA5] text-white text-sm font-medium hover:bg-[#1a6bbf] disabled:bg-gray-300 transition-colors"
          >
            {streaming ? '...' : '→'}
          </button>
        </div>
      </form>
    </div>
  );
}
