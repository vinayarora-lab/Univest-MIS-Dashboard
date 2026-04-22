import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useDateRange, normMonth, ALL_MONTHS } from '../context/DateRangeContext';

function heatColor(pct) {
  if (pct === null || pct === undefined) return 'bg-gray-100 text-gray-300';
  if (pct >= 120) return 'bg-green-700 text-white';
  if (pct >= 90)  return 'bg-green-500 text-white';
  if (pct >= 60)  return 'bg-blue-500 text-white';
  if (pct >= 40)  return 'bg-blue-300 text-blue-900';
  if (pct >= 20)  return 'bg-blue-100 text-blue-800';
  if (pct > 0)    return 'bg-gray-100 text-gray-600';
  return 'bg-gray-50 text-gray-300';
}

export default function OverallCohorts() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/overall-cohorts')
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
    const i = ALL_MONTHS.indexOf(normMonth(r.cohort));
    return i >= fromIdx && i <= toIdx;
  });
  const latest = rows[rows.length - 1] || {};
  const prev = rows[rows.length - 2] || {};

  const avgM1 = rows.filter(r => r.M1 != null).length
    ? (rows.reduce((s, r) => s + (r.M1 || 0), 0) / rows.filter(r => r.M1 != null).length).toFixed(1)
    : '—';

  // Trend chart
  const trendData = [...rows].map(r => ({
    cohort: r.cohort,
    'M0 Rev (Mn)': r.m0Revenue ? Number(r.m0Revenue.toFixed(2)) : 0,
    'M1 Ret %': r.M1 != null ? Number(r.M1.toFixed(1)) : null,
    'M3 Ret %': r.M3 != null ? Number(r.M3.toFixed(1)) : null,
  }));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3 text-sm text-blue-800">
        <strong>Note:</strong> M0 = new subscriber revenue (INR Mn). M1+ = retention as % of M0 revenue.
        &gt;100% in M1 is possible due to higher-value renewals (Pro Plus plans launched OND'23). Drops at M3/M6 = plan expiry.
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Latest Cohort</div>
          <div className="text-lg font-bold text-gray-900">{latest.cohort}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">M0 Revenue</div>
          <div className="text-2xl font-bold text-[#185FA5]">₹{latest.m0Revenue} Mn</div>
          <div className="text-xs text-gray-400 mt-0.5">vs prev: ₹{prev.m0Revenue} Mn</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">M1 Retention (Latest)</div>
          <div className={`text-2xl font-bold ${latest.M1 >= 100 ? 'text-green-600' : 'text-orange-500'}`}>
            {latest.M1 != null ? `${latest.M1}%` : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{latest.M1 >= 100 ? 'Above 100% = upsell/renewal' : 'Below M0'}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Avg M1 Retention</div>
          <div className="text-2xl font-bold text-gray-800">{avgM1 !== '—' ? `${avgM1}%` : '—'}</div>
          <div className="text-xs text-gray-400 mt-0.5">Across {rows.length} cohorts</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-3">M0 Revenue Trend (INR Mn)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="cohort" tick={{ fontSize: 9 }} interval={1} />
              <YAxis tick={{ fontSize: 9 }} width={40} />
              <Tooltip formatter={v => `₹${v} Mn`} />
              <Bar dataKey="M0 Rev (Mn)" fill="#185FA5" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-3">M1 & M3 Revenue Retention %</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="cohort" tick={{ fontSize: 9 }} interval={1} />
              <YAxis tick={{ fontSize: 9 }} unit="%" width={40} />
              <Tooltip formatter={v => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="M1 Ret %" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              <Line type="monotone" dataKey="M3 Ret %" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Subscription Revenue Cohort Heatmap</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            M0 Rev = new sub revenue (INR Mn) · M1–M12 = % of M0 retained ·
            <span className="inline-block ml-1 px-1 bg-green-700 text-white rounded text-[10px]">≥120%</span>
            <span className="inline-block ml-1 px-1 bg-green-500 text-white rounded text-[10px]">≥90%</span>
            <span className="inline-block ml-1 px-1 bg-blue-500 text-white rounded text-[10px]">≥60%</span>
            <span className="inline-block ml-1 px-1 bg-blue-300 text-blue-900 rounded text-[10px]">≥40%</span>
            <span className="inline-block ml-1 px-1 bg-blue-100 text-blue-800 rounded text-[10px]">≥20%</span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50">Cohort</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">M0 Rev (Mn)</th>
                {headers.map(h => (
                  <th key={h} className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[52px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap sticky left-0 bg-white">{row.cohort}</td>
                  <td className="px-3 py-2 text-right font-bold text-[#185FA5] tabular-nums">
                    {row.m0Revenue != null ? `₹${row.m0Revenue}` : '—'}
                  </td>
                  {headers.map(h => {
                    const val = row[h];
                    const cls = heatColor(val);
                    return (
                      <td key={h} className={`px-2 py-2 text-center tabular-nums font-medium ${cls}`}>
                        {val != null ? `${val}%` : '—'}
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
