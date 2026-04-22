import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';

const CATEGORY_COLORS = {
  'Cash Optimization': 'badge-cyan',
  'Investment Strategy': 'badge-blue',
  'Risk Management': 'badge-amber',
  'Cost Reduction': 'badge-red',
  'Revenue Growth': 'badge-green',
};

const IMPACT_COLORS = {
  High: 'badge-green',
  Medium: 'badge-amber',
  Low: 'badge-blue',
};

function SuggestionCard({ suggestion, isExpanded, onToggle }) {
  const catClass = CATEGORY_COLORS[suggestion.category] || 'badge-blue';
  const impactClass = IMPACT_COLORS[suggestion.impact] || 'badge-amber';

  return (
    <div
      className={`card transition-all duration-200 cursor-pointer hover:border-bloomberg-accent/30 ${
        isExpanded ? 'border-bloomberg-accent/40' : ''
      }`}
      onClick={onToggle}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Priority badge */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bloomberg-accent/10 border border-bloomberg-accent/30 flex items-center justify-center">
              <span className="text-bloomberg-accent font-bold text-sm">{suggestion.priority}</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-bloomberg-text leading-tight">{suggestion.title}</h3>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className={`badge ${catClass}`}>{suggestion.category}</span>
                <span className={`badge ${impactClass}`}>{suggestion.impact} Impact</span>
                <span className="badge badge-blue opacity-70">{suggestion.timeframe}</span>
              </div>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-bloomberg-muted flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3 border-t border-bloomberg-border pt-3 animate-fade-in">
            <div>
              <div className="text-[10px] text-bloomberg-muted uppercase tracking-wider mb-1">Recommendation</div>
              <p className="text-sm text-bloomberg-subtle leading-relaxed">{suggestion.recommendation}</p>
            </div>
            {suggestion.rationale && (
              <div>
                <div className="text-[10px] text-bloomberg-muted uppercase tracking-wider mb-1">Rationale</div>
                <p className="text-xs text-bloomberg-muted leading-relaxed italic">{suggestion.rationale}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingText({ text }) {
  if (!text) return null;
  // Parse and display raw streaming text
  const lines = text.split('\n');
  return (
    <div className="card p-4 font-mono text-xs leading-relaxed overflow-auto max-h-[60vh]">
      {lines.map((line, i) => {
        if (line.startsWith('PRIORITY')) {
          return <div key={i} className="text-bloomberg-accent font-bold mt-4 mb-1">{line}</div>;
        }
        if (line.startsWith('CATEGORY:') || line.startsWith('IMPACT:') || line.startsWith('TIMEFRAME:')) {
          return <div key={i} className="text-bloomberg-blue text-[10px]">{line}</div>;
        }
        if (line.startsWith('RECOMMENDATION:')) {
          return <div key={i} className="text-bloomberg-text mt-1">{line}</div>;
        }
        if (line.startsWith('RATIONALE:')) {
          return <div key={i} className="text-bloomberg-muted italic">{line}</div>;
        }
        if (line === '---') {
          return <hr key={i} className="border-bloomberg-border my-3" />;
        }
        return <div key={i} className="text-bloomberg-subtle">{line || <br />}</div>;
      })}
    </div>
  );
}

export default function AISuggestions() {
  const { dashboardData, aiSuggestions, aiLoading, aiError, fetchAISuggestions, fromDate, toDate } = useStore();
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'stream'
  const [streamText, setStreamText] = useState('');
  const [streaming, setStreaming] = useState(false);

  const handleFetch = () => {
    setViewMode('cards');
    fetchAISuggestions();
  };

  const handleStream = async () => {
    setViewMode('stream');
    setStreamText('');
    setStreaming(true);
    try {
      const url = `/api/ai/suggestions/stream?fromDate=${fromDate}&toDate=${toDate}`;
      const evtSource = new EventSource(url);
      evtSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'text') {
          setStreamText((prev) => prev + data.text);
        } else if (data.type === 'done' || data.type === 'error') {
          evtSource.close();
          setStreaming(false);
        }
      };
      evtSource.onerror = () => {
        evtSource.close();
        setStreaming(false);
      };
    } catch {
      setStreaming(false);
    }
  };

  if (!dashboardData) {
    return <div className="text-bloomberg-muted p-8 text-center text-sm">No data loaded.</div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-bloomberg-accent">AI Treasury Advisor</h2>
            <p className="text-xs text-bloomberg-muted mt-0.5">
              Powered by Claude Opus 4.6 — Analyzes your group financials and provides prioritized treasury recommendations
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleStream}
              disabled={streaming}
              className="btn-primary flex items-center gap-1.5"
            >
              {streaming ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-bloomberg-accent animate-pulse" />
                  Streaming...
                </>
              ) : (
                <>⚡ Stream Live</>
              )}
            </button>
            <button
              onClick={handleFetch}
              disabled={aiLoading}
              className="btn-primary flex items-center gap-1.5"
            >
              {aiLoading ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>🤖 Get Suggestions</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {aiError && (
        <div className="card p-4 border-bloomberg-red/30 bg-bloomberg-red/5">
          <div className="text-bloomberg-red text-sm">⚠ {aiError}</div>
          <div className="text-bloomberg-muted text-xs mt-1">
            Make sure ANTHROPIC_API_KEY is set in your .env file. Showing mock suggestions in its absence.
          </div>
        </div>
      )}

      {/* Loading */}
      {aiLoading && (
        <div className="card p-8 text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-bloomberg-accent/30 border-t-bloomberg-accent rounded-full animate-spin" />
            <div className="text-bloomberg-muted text-sm">Claude is analyzing your financial data...</div>
            <div className="text-bloomberg-muted text-xs">This may take 15-30 seconds</div>
          </div>
        </div>
      )}

      {/* Stream view */}
      {viewMode === 'stream' && (streaming || streamText) && (
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs text-bloomberg-muted">
            {streaming && <span className="live-dot" />}
            <span>{streaming ? 'Streaming response...' : 'Complete'}</span>
          </div>
          <StreamingText text={streamText} />
        </div>
      )}

      {/* Cards view */}
      {viewMode === 'cards' && aiSuggestions && !aiLoading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-bloomberg-muted">
            <span>{aiSuggestions.length} prioritized recommendations</span>
            <button onClick={() => setExpandedIdx(expandedIdx === 'all' ? null : 'all')} className="btn-ghost">
              {expandedIdx === 'all' ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          {aiSuggestions.map((s, i) => (
            <SuggestionCard
              key={i}
              suggestion={s}
              isExpanded={expandedIdx === i || expandedIdx === 'all'}
              onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!aiLoading && !aiSuggestions && viewMode === 'cards' && !streaming && !streamText && (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-4">🤖</div>
          <div className="text-bloomberg-subtle text-sm mb-2">No suggestions generated yet</div>
          <div className="text-bloomberg-muted text-xs mb-6">
            Click "Get Suggestions" to have Claude analyze your group's financial data and generate actionable treasury recommendations.
          </div>
          <button onClick={handleFetch} className="btn-primary">
            Generate AI Suggestions
          </button>
        </div>
      )}
    </div>
  );
}
