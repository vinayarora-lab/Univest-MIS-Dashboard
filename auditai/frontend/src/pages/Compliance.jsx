import React, { useEffect, useState } from 'react';
import api from '../api/client';

const STATUS_CONFIG = {
  pass: {
    label: 'PASS',
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-200',
    dot: 'bg-green-500',
  },
  fail: {
    label: 'FAIL',
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
  warning: {
    label: 'WARNING',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-400',
  },
  pending: {
    label: 'PENDING',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-400',
  },
};

const SEVERITY_BADGE = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-400 text-white',
  low: 'bg-gray-400 text-white',
};

function ComplianceItem({ item }) {
  const s = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  return (
    <div className={`rounded-lg border ${s.border} ${s.bg} p-4 mb-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${s.dot}`} />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-gray-800">{item.title}</span>
              <span className="text-xs text-gray-500 font-mono">{item.id}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-bold uppercase ${SEVERITY_BADGE[item.severity] || 'bg-gray-300 text-white'}`}>
                {item.severity}
              </span>
            </div>
            <p className="text-xs text-gray-600 mb-2">{item.description}</p>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {item.current_value && (
                <span>Current: <span className="font-medium text-gray-700">{item.current_value}</span></span>
              )}
              {item.threshold && (
                <span>Threshold: <span className="font-medium text-gray-700">{item.threshold}</span></span>
              )}
              <span>
                Checked: <span className="font-medium text-gray-700">
                  {new Date(item.last_checked).toLocaleDateString('en-IN')}
                </span>
              </span>
            </div>
            {item.notes && (
              <p className={`text-xs mt-2 ${s.text} font-medium`}>→ {item.notes}</p>
            )}
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-bold flex-shrink-0 ${s.bg} ${s.text} border ${s.border}`}>
          {s.label}
        </span>
      </div>
    </div>
  );
}

export default function Compliance() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/compliance')
      .then(r => {
        setItems(r.data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const categories = ['RBI', 'SEBI', 'Internal'];
  const grouped = categories.reduce((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat);
    return acc;
  }, {});

  const passCount = items.filter(i => i.status === 'pass').length;
  const failCount = items.filter(i => i.status === 'fail').length;
  const warnCount = items.filter(i => i.status === 'warning').length;
  const pendingCount = items.filter(i => i.status === 'pending').length;
  const score = items.length ? Math.round((passCount / items.length) * 100) : 0;

  const scoreColor = score >= 80
    ? 'text-green-700'
    : score >= 60
      ? 'text-amber-600'
      : 'text-red-600';

  return (
    <div className="max-w-4xl space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm lg:col-span-1">
          <div className="text-xs text-gray-500 mb-1">Compliance Score</div>
          <div className={`text-2xl font-bold ${scoreColor}`}>{score}%</div>
        </div>
        {[
          { label: 'Passed', value: passCount, color: 'text-green-700' },
          { label: 'Failed', value: failCount, color: 'text-red-600' },
          { label: 'Warnings', value: warnCount, color: 'text-amber-600' },
          { label: 'Pending', value: pendingCount, color: 'text-amber-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Items by category */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm animate-pulse">
          Loading compliance data...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">
          No compliance data available.
        </div>
      ) : (
        categories.map(cat => (
          grouped[cat].length > 0 ? (
            <div key={cat}>
              <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-[#185FA5] rounded-full inline-block" />
                {cat === 'RBI'
                  ? 'RBI Compliance'
                  : cat === 'SEBI'
                    ? 'SEBI Compliance'
                    : 'Internal Controls'}
              </h2>
              {grouped[cat].map(item => (
                <ComplianceItem key={item.id} item={item} />
              ))}
            </div>
          ) : null
        ))
      )}
    </div>
  );
}
