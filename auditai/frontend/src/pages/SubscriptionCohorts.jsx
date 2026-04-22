import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useDateRange, normMonth, ALL_MONTHS } from '../context/DateRangeContext';

function heatColor(value, max = 100) {
  if (value === null || value === undefined) return { bg: 'bg-gray-100', text: 'text-gray-300' };
  const pct = Math.min(value / max, 1);
  if (pct >= 0.8) return { bg: 'bg-blue-700', text: 'text-white' };
  if (pct >= 0.6) return { bg: 'bg-blue-500', text: 'text-white' };
  if (pct >= 0.4) return { bg: 'bg-blue-400', text: 'text-white' };
  if (pct >= 0.2) return { bg: 'bg-blue-300', text: 'text-blue-900' };
  if (pct > 0) return { bg: 'bg-blue-100', text: 'text-blue-800' };
  return { bg: 'bg-gray-50', text: 'text-gray-400' };
}

const retentionCols = ['Repeat M0', 'M1', 'M2', 'M3', 'M4', 'M5'];

export default function SubscriptionCohorts() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/subscription-cohorts')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { fromMonth, toMonth } = useDateRange();
  const fromIdx = ALL_MONTHS.indexOf(normMonth(fromMonth));
  const toIdx   = ALL_MONTHS.indexOf(normMonth(toMonth));
  const rows = data.data.filter(r => {
    const i = ALL_MONTHS.indexOf(normMonth(r.cohort));
    return i >= fromIdx && i <= toIdx;
  });
  const chartData = rows.slice(-12).map(r => ({
    cohort: r.cohort,
    New: Number((r.newRevenue || 0).toFixed(2)),
    Repeat: Number((r.repeatRevenue || 0).toFixed(2)),
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3 text-sm text-blue-800">
        <strong>Note:</strong> New Revenue = first-time subscriptions (INR Mn). Repeat Revenue = renewals. M0–M5 columns show retention % relative to new revenue cohort.
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">New vs Repeat Revenue by Cohort (INR Mn)</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="cohort" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => `₹${v} Mn`} />
            <Legend />
            <Bar dataKey="New" fill="#185FA5" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Repeat" fill="#60a5fa" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cohort table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Subscription Booking Cohorts</h2>
          <p className="text-xs text-gray-500 mt-0.5">New Rev + Repeat Rev in INR Mn · M0–M5 = retention %</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Cohort</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">New Rev</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Repeat Rev</th>
                {retentionCols.map(h => (
                  <th key={h} className="px-2 py-2 text-center font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">{row.cohort}</td>
                  <td className="px-3 py-2 text-right text-gray-800 font-semibold">
                    {row.newRevenue != null ? `₹${Number(row.newRevenue).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-blue-700 font-semibold">
                    {row.repeatRevenue != null ? `₹${Number(row.repeatRevenue).toFixed(2)}` : '—'}
                  </td>
                  {retentionCols.map(h => {
                    const val = row[h];
                    const { bg, text } = heatColor(val, 150);
                    return (
                      <td key={h} className={`px-2 py-2 text-center font-medium ${bg} ${text}`}>
                        {val != null ? `${val.toFixed(1)}%` : '—'}
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
