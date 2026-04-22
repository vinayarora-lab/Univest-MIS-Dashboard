import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useDateRange, normMonth, ALL_MONTHS } from '../context/DateRangeContext';

function heatColor(pct) {
  if (pct === null || pct === undefined) return 'bg-gray-100 text-gray-300';
  if (pct >= 60) return 'bg-blue-700 text-white';
  if (pct >= 40) return 'bg-blue-500 text-white';
  if (pct >= 25) return 'bg-blue-400 text-white';
  if (pct >= 15) return 'bg-blue-300 text-blue-900';
  if (pct > 0)   return 'bg-blue-100 text-blue-800';
  return 'bg-gray-50 text-gray-400';
}

export default function RetentionImprovements() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/retention')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { fromMonth, toMonth } = useDateRange();
  const fromIdx = ALL_MONTHS.indexOf(normMonth(fromMonth));
  const toIdx   = ALL_MONTHS.indexOf(normMonth(toMonth));
  const { headers } = data;
  const rows = data.data.filter(r => {
    const i = ALL_MONTHS.indexOf(normMonth(r.month));
    return i >= fromIdx && i <= toIdx;
  });
  const latest = rows[0] || {};
  const mCols = headers.filter(h => h.startsWith('M'));

  // Summary stats
  const m1Pct = latest.M0 > 0 ? ((latest.M1 / latest.M0) * 100).toFixed(1) : '—';
  const m3Pct = latest.M0 > 0 ? ((latest.M3 / latest.M0) * 100).toFixed(1) : '—';

  // Trend chart — last 12 months M0, M1, M3 retention %
  const trendData = [...rows].reverse().slice(-12).map(r => ({
    month: r.month.replace(' 20', " '"),
    'M0 (New)': r.M0 || 0,
    'M1 Ret %': r.M0 > 0 ? Number(((r.M1 / r.M0) * 100).toFixed(1)) : 0,
    'M3 Ret %': r.M0 > 0 ? Number(((r.M3 / r.M0) * 100).toFixed(1)) : 0,
  }));

  return (
    <div className="max-w-6xl space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Latest Cohort</div>
          <div className="text-lg font-bold text-gray-900">{latest.month}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">New Activations (M0)</div>
          <div className="text-2xl font-bold text-[#185FA5]">{latest.M0?.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">M1 Retention</div>
          <div className="text-2xl font-bold text-green-600">{m1Pct !== '—' ? `${m1Pct}%` : '—'}</div>
          <div className="text-xs text-gray-400 mt-0.5">{latest.M1?.toLocaleString()} users</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">M3 Retention</div>
          <div className="text-2xl font-bold text-orange-500">{m3Pct !== '—' ? `${m3Pct}%` : '—'}</div>
          <div className="text-xs text-gray-400 mt-0.5">{latest.M3?.toLocaleString()} users</div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">New Activations & Retention % Trend</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-2">M0 New Activations</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v.toLocaleString()} width={55} />
                <Tooltip formatter={v => v.toLocaleString()} />
                <Line type="monotone" dataKey="M0 (New)" stroke="#185FA5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">M1 & M3 Retention %</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} unit="%" width={40} />
                <Tooltip formatter={v => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="M1 Ret %" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="M3 Ret %" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Retention Heatmap — New User Cohorts</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            M0 = new activations · M1–M18 = retained users · Cell % = retained ÷ M0 · Darker blue = higher retention
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50">Month</th>
                {mCols.map(h => (
                  <th key={h} className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[54px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap sticky left-0 bg-white">{row.month}</td>
                  {mCols.map(h => {
                    const val = row[h] || 0;
                    const pct = h === 'M0' ? null : (row.M0 > 0 ? (val / row.M0) * 100 : null);
                    const cls = h === 'M0'
                      ? 'bg-[#185FA5] text-white font-bold'
                      : heatColor(pct);
                    return (
                      <td key={h} className={`px-2 py-2 text-center tabular-nums ${cls}`}>
                        {val ? (
                          <div>{val.toLocaleString()}</div>
                        ) : <span className="text-gray-300">—</span>}
                        {pct != null && val > 0 && (
                          <div className="text-[10px] opacity-75">{pct.toFixed(0)}%</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
