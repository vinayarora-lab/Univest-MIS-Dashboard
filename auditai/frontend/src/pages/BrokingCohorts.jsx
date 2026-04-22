import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { api } from '../api/client';
import { useDateRange, normMonth, ALL_MONTHS } from '../context/DateRangeContext';

export default function BrokingCohorts() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/broking-cohorts')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { fromMonth, toMonth } = useDateRange();
  const fromIdx = ALL_MONTHS.indexOf(normMonth(fromMonth));
  const toIdx   = ALL_MONTHS.indexOf(normMonth(toMonth));
  const rows = data.data.filter(r => {
    const i = ALL_MONTHS.indexOf(normMonth(r.month));
    return i >= fromIdx && i <= toIdx;
  });

  return (
    <div className="max-w-5xl space-y-6">
      {/* PAN submissions bar chart */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">Monthly PAN Submissions</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="pan_submitted" name="PAN Submitted" fill="#185FA5" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* eSign trend line chart */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">eSign Completion % Trend</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit="%" />
            <Tooltip formatter={v => `${Number(v).toFixed(1)}%`} />
            <Legend />
            <Line type="monotone" dataKey="overall_esign_pct" name="Overall eSign %" stroke="#185FA5" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="esign_15min_pct" name="eSign ≤15min %" stroke="#60a5fa" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="esign_30min_pct" name="eSign ≤30min %" stroke="#93c5fd" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="d0_pct" name="D0 Activation %" stroke="#10b981" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Funnel table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">PAN-to-eSign Funnel by Month</h2>
          <p className="text-xs text-gray-500 mt-0.5">eSign % = proportion completing e-signature · D0/D1 = same/next day activation</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Month</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">PAN Submitted</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Overall eSign %</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">eSign ≤15min %</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">eSign ≤30min %</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">D0 Activation %</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">D1 Activation %</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 font-medium">{row.month}</td>
                  <td className="px-3 py-2 text-right text-gray-800 font-semibold">{row.pan_submitted?.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-[#185FA5] font-semibold">{row.overall_esign_pct ? `${row.overall_esign_pct.toFixed(1)}%` : '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{row.esign_15min_pct ? `${row.esign_15min_pct.toFixed(1)}%` : '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{row.esign_30min_pct ? `${row.esign_30min_pct.toFixed(1)}%` : '—'}</td>
                  <td className="px-3 py-2 text-right text-green-700 font-semibold">{row.d0_pct ? `${row.d0_pct.toFixed(1)}%` : '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{row.d1_pct ? `${row.d1_pct.toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
