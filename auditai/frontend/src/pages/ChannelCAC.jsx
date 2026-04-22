import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Legend, ResponsiveContainer
} from 'recharts';
import { api } from '../api/client';
import { useDateRange, normMonth, ALL_MONTHS } from '../context/DateRangeContext';

const COLORS = ['#185FA5', '#2563eb', '#60a5fa', '#1e40af', '#3b82f6', '#93c5fd', '#bfdbfe', '#dbeafe'];

function mom(curr, prev) {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function MoMBadge({ curr, prev, lowerIsBetter = false }) {
  const pct = mom(curr, prev);
  if (pct === null) return null;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  return (
    <span className={`text-xs font-medium ml-1 ${good ? 'text-green-600' : 'text-red-500'}`}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function ChannelCAC() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    api.get('/api/datapack/channel-cac')
      .then(r => { setData(r.data); setSelectedIdx(0); })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { fromMonth, toMonth } = useDateRange();
  const fromIdx = ALL_MONTHS.indexOf(normMonth(fromMonth));
  const toIdx   = ALL_MONTHS.indexOf(normMonth(toMonth));
  const months = data.months.filter(m => {
    const i = ALL_MONTHS.indexOf(normMonth(m.month));
    return i >= fromIdx && i <= toIdx;
  });
  if (!months?.length) return <div className="text-gray-500 text-sm p-4">No data available.</div>;

  const selected = months[selectedIdx];
  const prevMonth = months[selectedIdx + 1]; // next index = previous month

  // Build per-platform MoM lookup from previous month
  const prevMap = {};
  if (prevMonth) {
    (prevMonth.rows || []).forEach(r => { prevMap[r.platform] = r; });
    if (prevMonth.grandTotal) prevMap['Grand Total'] = prevMonth.grandTotal;
  }

  const allRows = selected ? [
    ...(selected.rows || []),
    ...(selected.grandTotal ? [{ ...selected.grandTotal, isTotal: true }] : []),
  ] : [];

  // Trend chart data — blended CAC and conversions across all months (reversed = oldest first)
  const trendData = [...months].reverse().map(m => ({
    month: m.month,
    CAC: m.grandTotal?.cac ? Number(m.grandTotal.cac.toFixed(0)) : 0,
    Conversions: m.grandTotal?.conversions || 0,
    Spends: m.grandTotal?.spends ? Number((m.grandTotal.spends / 100000).toFixed(1)) : 0,
  }));

  const chartData = (selected?.rows || [])
    .filter(r => r.cac > 0)
    .map(r => ({ name: r.platform, CAC: Number(r.cac.toFixed(0)) }))
    .sort((a, b) => b.CAC - a.CAC);

  const gt = selected?.grandTotal;
  const prevGt = prevMonth?.grandTotal;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Month tabs */}
      <div className="flex gap-2 flex-wrap">
        {months.map((m, i) => (
          <button key={i} onClick={() => setSelectedIdx(i)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              i === selectedIdx
                ? 'bg-[#185FA5] text-white border-[#185FA5]'
                : 'bg-white text-gray-600 border-gray-300 hover:border-[#185FA5] hover:text-[#185FA5]'
            }`}>
            {m.month}
          </button>
        ))}
      </div>

      {/* Summary cards with MoM */}
      {gt && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Total Conversions</div>
            <div className="text-2xl font-bold text-gray-900">
              {gt.conversions?.toLocaleString() || '—'}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              vs {prevMonth?.month || 'prev'}:
              <MoMBadge curr={gt.conversions} prev={prevGt?.conversions} />
              {prevGt && <span className="ml-1 text-gray-400">({prevGt.conversions?.toLocaleString()})</span>}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Total Spends</div>
            <div className="text-2xl font-bold text-gray-900">
              ₹{Number((gt.spends / 100000).toFixed(1))}L
            </div>
            <div className="text-xs text-gray-400 mt-1">
              vs {prevMonth?.month || 'prev'}:
              <MoMBadge curr={gt.spends} prev={prevGt?.spends} lowerIsBetter />
              {prevGt && <span className="ml-1 text-gray-400">(₹{Number((prevGt.spends / 100000).toFixed(1))}L)</span>}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Blended CAC</div>
            <div className="text-2xl font-bold text-[#185FA5]">
              ₹{Number(gt.cac?.toFixed(0)).toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              vs {prevMonth?.month || 'prev'}:
              <MoMBadge curr={gt.cac} prev={prevGt?.cac} lowerIsBetter />
              {prevGt && <span className="ml-1 text-gray-400">(₹{Number(prevGt.cac?.toFixed(0)).toLocaleString()})</span>}
            </div>
          </div>
        </div>
      )}

      {/* Trend chart — blended CAC over months */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">Blended CAC & Conversions Trend (MoM)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="cac" tick={{ fontSize: 10 }} tickFormatter={v => `₹${v}`} width={65} />
            <YAxis yAxisId="conv" orientation="right" tick={{ fontSize: 10 }} width={55} />
            <Tooltip
              formatter={(v, name) => name === 'CAC' ? [`₹${v}`, 'Blended CAC'] : [v.toLocaleString(), 'Conversions']}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="cac" type="monotone" dataKey="CAC" stroke="#185FA5" strokeWidth={2} dot={{ r: 4 }} name="CAC" />
            <Line yAxisId="conv" type="monotone" dataKey="Conversions" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} name="Conversions" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* CAC by channel bar chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-4">CAC by Channel — {selected?.month}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 100, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${v.toLocaleString()}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={v => [`₹${v.toLocaleString()}`, 'CAC']} />
              <Bar dataKey="CAC" radius={[0, 3, 3, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail table with MoM columns */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">Channel Detail — {selected?.month}</h2>
          {prevMonth && <span className="text-xs text-gray-400">MoM vs {prevMonth.month}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Platform</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Conversions</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">MoM Conv</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Spends (₹)</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">CAC (₹)</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">MoM CAC</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, i) => {
                const prev = prevMap[row.platform];
                const convMoM = prev ? mom(row.conversions, prev.conversions) : null;
                const cacMoM = prev ? mom(row.cac, prev.cac) : null;
                return (
                  <tr key={i} className={`border-b border-gray-100 ${row.isTotal ? 'bg-[#185FA5] font-bold' : 'hover:bg-gray-50'}`}>
                    <td className={`px-3 py-2 font-medium ${row.isTotal ? 'text-white' : 'text-gray-700'}`}>
                      {row.platform}
                      {!row.isTotal && row.os && <span className="text-gray-400 ml-1">({row.os})</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${row.isTotal ? 'text-white' : 'text-gray-700'}`}>
                      {row.conversions != null ? row.conversions.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {convMoM !== null ? (
                        <span className={`font-medium ${convMoM >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {convMoM > 0 ? '▲' : '▼'} {Math.abs(convMoM).toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${row.isTotal ? 'text-white' : 'text-gray-700'}`}>
                      {row.spends ? `₹${Number(row.spends).toLocaleString()}` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${row.isTotal ? 'text-white' : 'text-[#185FA5]'}`}>
                      {row.cac ? `₹${Number(row.cac.toFixed(0)).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {cacMoM !== null ? (
                        <span className={`font-medium ${cacMoM <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {cacMoM > 0 ? '▲' : '▼'} {Math.abs(cacMoM).toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
