import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { api } from '../api/client';
import { useDateRange, getSliceRange } from '../context/DateRangeContext';

function MetricTable({ title, rows, dateHeaders }) {
  if (!rows || !rows.length) return null;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Type</th>
              {dateHeaders.map(d => (
                <th key={d} className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">{row.type}</td>
                {row.values.map((v, j) => (
                  <td key={j} className="px-2 py-2 text-right tabular-nums text-gray-700">
                    {v != null ? (typeof v === 'number' ? v.toFixed(1) : v) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CallAccuracy() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/call-accuracy')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { fromMonth, toMonth } = useDateRange();
  const { start, end } = getSliceRange(data.dateHeaders, fromMonth, toMonth);
  const dateHeaders = data.dateHeaders.slice(start, end + 1);
  const fr = rows => (rows || []).map(r => ({ ...r, values: r.values.slice(start, end + 1) }));
  const accuracyRows = fr(data['Accuracy %']);
  const closedRows   = fr(data['Ideas Closed (#)']);
  const hitRows      = fr(data['Ideas Hit (#)']);
  const returnsRows  = fr(data['Returns %']);
  const alphaRows    = fr(data['Alpha %']);

  // Chart: aggregate accuracy across all types per date
  const chartData = dateHeaders.map((d, idx) => {
    const vals = accuracyRows.map(r => r.values[idx]).filter(v => typeof v === 'number');
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    return { date: d, 'Avg Accuracy %': Number(avg.toFixed(1)) };
  });

  return (
    <div className="max-w-5xl space-y-6">
      {/* Accuracy chart */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">Average Call Accuracy % Over Time</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit="%" />
            <Tooltip formatter={v => `${v}%`} />
            <Bar dataKey="Avg Accuracy %" fill="#185FA5" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <MetricTable title="Ideas Closed (#)" rows={closedRows} dateHeaders={dateHeaders} />
      <MetricTable title="Ideas Hit (#)" rows={hitRows} dateHeaders={dateHeaders} />
      <MetricTable title="Accuracy %" rows={accuracyRows} dateHeaders={dateHeaders} />
      <MetricTable title="Returns %" rows={returnsRows} dateHeaders={dateHeaders} />
      <MetricTable title="Alpha %" rows={alphaRows} dateHeaders={dateHeaders} />
    </div>
  );
}
