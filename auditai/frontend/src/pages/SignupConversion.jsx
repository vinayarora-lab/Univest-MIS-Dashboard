import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useDateRange, normMonth, ALL_MONTHS } from '../context/DateRangeContext';

function heatColor(pct) {
  if (pct === null || pct === undefined) return 'bg-gray-100 text-gray-300';
  if (pct >= 8)  return 'bg-blue-700 text-white';
  if (pct >= 5)  return 'bg-blue-500 text-white';
  if (pct >= 3)  return 'bg-blue-400 text-white';
  if (pct >= 1)  return 'bg-blue-200 text-blue-900';
  if (pct > 0)   return 'bg-blue-100 text-blue-800';
  return 'bg-gray-50 text-gray-400';
}

export default function SignupConversion() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/signup-conversion')
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
  const latestM0 = latest.M0;
  const avgM0 = rows.length
    ? (rows.reduce((s, r) => s + (r.M0 || 0), 0) / rows.length).toFixed(2)
    : '—';

  // Trend: M0 conversion % over time
  const trendData = [...rows].map(r => ({
    cohort: r.cohort,
    'M0 %': r.M0 != null ? Number(r.M0.toFixed(2)) : 0,
    'M1 %': r.M1 != null ? Number(r.M1.toFixed(2)) : 0,
    'Signups (K)': r.totalSignups ? Number((r.totalSignups / 1000).toFixed(1)) : 0,
  }));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3 text-sm text-blue-800">
        <strong>Note:</strong> M0 = same-month conversion (signups → subscriptions). ~2–4% typical. M1+ = delayed conversions from prior cohorts.
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Latest Cohort</div>
          <div className="text-lg font-bold text-gray-900">{latest.cohort}</div>
          <div className="text-xs text-gray-400">{latest.totalSignups?.toLocaleString()} signups</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">M0 Conversion (Latest)</div>
          <div className="text-2xl font-bold text-[#185FA5]">{latestM0 != null ? `${latestM0.toFixed(2)}%` : '—'}</div>
          <div className="text-xs text-gray-400 mt-0.5">Same-month</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Avg M0 Conversion</div>
          <div className="text-2xl font-bold text-green-600">{avgM0 !== '—' ? `${avgM0}%` : '—'}</div>
          <div className="text-xs text-gray-400 mt-0.5">Last {rows.length} cohorts</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Latest M1 Conversion</div>
          <div className="text-2xl font-bold text-orange-500">
            {rows[rows.length - 2]?.M1 != null ? `${rows[rows.length - 2].M1.toFixed(2)}%` : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">Month-1 delayed</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-3">M0 & M1 Conversion % Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="cohort" tick={{ fontSize: 9 }} interval={2} />
              <YAxis tick={{ fontSize: 9 }} unit="%" width={36} />
              <Tooltip formatter={v => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="M0 %" stroke="#185FA5" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="M1 %" stroke="#22c55e" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-3">Monthly Signups (000s)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="cohort" tick={{ fontSize: 9 }} interval={2} />
              <YAxis tick={{ fontSize: 9 }} width={36} />
              <Tooltip formatter={v => `${v}K signups`} />
              <Bar dataKey="Signups (K)" fill="#185FA5" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heatmap table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Signup → Subscription Conversion Heatmap</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Each row = signup cohort month · Columns = cumulative conversion % at M0, M1… · Darker = higher conversion
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50">Cohort</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">Signups</th>
                {headers.map(h => (
                  <th key={h} className="px-2 py-2 text-center font-semibold text-gray-600 min-w-[52px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap sticky left-0 bg-white">{row.cohort}</td>
                  <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{row.totalSignups?.toLocaleString()}</td>
                  {headers.map(h => {
                    const val = row[h];
                    const cls = heatColor(val);
                    return (
                      <td key={h} className={`px-2 py-2 text-center tabular-nums font-medium ${cls}`}>
                        {val != null ? `${val.toFixed(2)}%` : '—'}
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
