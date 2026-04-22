import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

const TAGS = [
  { label: 'Retention', color: 'bg-blue-100 text-blue-700' },
  { label: 'CAC', color: 'bg-orange-100 text-orange-700' },
  { label: 'Distribution', color: 'bg-green-100 text-green-700' },
  { label: 'Revenue', color: 'bg-purple-100 text-purple-700' },
  { label: 'Monetisation', color: 'bg-pink-100 text-pink-700' },
];

function getTag(item) {
  const text = (item.problem + item.hypothesis + item.actions).toLowerCase();
  if (text.includes('retention') || text.includes('renewal') || text.includes('auto-pay') || text.includes('autopay')) return TAGS[0];
  if (text.includes('cac') || text.includes('acquisition cost') || text.includes('trial')) return TAGS[1];
  if (text.includes('partner') || text.includes('channel') || text.includes('1% club') || text.includes('b2b')) return TAGS[2];
  if (text.includes('basket') || text.includes('wealth') || text.includes('aov')) return TAGS[3];
  if (text.includes('unpaid') || text.includes('monetiz') || text.includes('dormant')) return TAGS[4];
  return TAGS[1];
}

// Extract bold metric lines from impact text (lines with numbers/₹/%)
function MetricLine({ text }) {
  const lines = text.split('\n').map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const hasMetric = /[₹%\d]/.test(line);
        return (
          <div key={i} className={`flex items-start gap-2 text-sm leading-snug ${hasMetric ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
            <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: hasMetric ? '#185FA5' : '#d1d5db', marginTop: '6px' }} />
            <span>{line}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function KeyInitiatives() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(0);

  useEffect(() => {
    api.get('/api/datapack/key-initiatives')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading initiatives...</div>;

  const { initiatives } = data;

  return (
    <div className="max-w-5xl space-y-3">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#0f1f3d] rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-white">{initiatives.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">Active Initiatives</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-green-600">{initiatives.filter(i => i.presentImpact).length}</div>
          <div className="text-xs text-gray-500 mt-0.5">With Measured Impact</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{initiatives.filter(i => i.longTermImpact).length}</div>
          <div className="text-xs text-gray-500 mt-0.5">With Long-term Plan</div>
        </div>
      </div>

      {/* Initiative cards */}
      {initiatives.map((item, idx) => {
        const tag = getTag(item);
        const isOpen = expanded === idx;
        const title = item.problem || item.hypothesis;
        const subtitle = item.problem ? item.hypothesis : null;

        return (
          <div key={idx} className={`bg-white rounded-xl border transition-all ${isOpen ? 'border-[#185FA5] shadow-md' : 'border-gray-200 shadow-sm'}`}>
            {/* Header */}
            <button
              className="w-full text-left px-5 py-4 flex items-start gap-4"
              onClick={() => setExpanded(isOpen ? null : idx)}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${isOpen ? 'bg-[#185FA5] text-white' : 'bg-gray-100 text-gray-500'}`}>
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tag.color}`}>{tag.label}</span>
                  {item.presentImpact && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Impact Measured</span>}
                </div>
                <div className="text-sm font-semibold text-gray-900 leading-snug">{title}</div>
                {subtitle && <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{subtitle}</div>}
              </div>
              <span className={`text-lg flex-shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
            </button>

            {/* Expanded */}
            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-2 gap-5">
                {/* Left col */}
                <div className="space-y-4">
                  {item.hypothesis && item.problem && (
                    <div>
                      <div className="text-[10px] font-bold text-[#185FA5] uppercase tracking-widest mb-1.5">Hypothesis</div>
                      <p className="text-xs text-gray-600 leading-relaxed">{item.hypothesis}</p>
                    </div>
                  )}
                  {item.actions && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Action Taken</div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <MetricLine text={item.actions} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Right col */}
                <div className="space-y-4">
                  {item.presentImpact && (
                    <div>
                      <div className="text-[10px] font-bold text-green-700 uppercase tracking-widest mb-1.5">Present Impact</div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <MetricLine text={item.presentImpact} />
                      </div>
                    </div>
                  )}
                  {item.longTermImpact && (
                    <div>
                      <div className="text-[10px] font-bold text-purple-700 uppercase tracking-widest mb-1.5">Long-term Impact</div>
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <MetricLine text={item.longTermImpact} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
