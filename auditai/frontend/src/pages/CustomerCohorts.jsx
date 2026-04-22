import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../api/client';
import CohortTable from '../components/CohortTable';

const COLORS = ['#185FA5', '#22c55e', '#f59e0b', '#8b5cf6'];

function formatINR(val) {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
  return `₹${val.toLocaleString('en-IN')}`;
}

export default function CustomerCohorts() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/api/cohorts').then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading cohort data...</div>;

  const lineData = data.months.map((month, i) => {
    const point = { month };
    data.cohorts.forEach(c => {
      point[c.name] = c.retention[i];
    });
    return point;
  });

  return (
    <div className="max-w-5xl space-y-6">
      {/* Heatmap */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Cohort Retention Heatmap</h2>
          <p className="text-xs text-gray-500 mt-0.5">Darker blue = higher retention</p>
        </div>
        <div className="p-5">
          <CohortTable data={data} />
        </div>
      </div>

      {/* Retention Curves */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Retention Curves by Cohort</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => v !== null ? `${v}%` : 'N/A'} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {data.cohorts.map((c, i) => (
              <Line
                key={c.name}
                type="monotone"
                dataKey={c.name}
                stroke={COLORS[i]}
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cohort Revenue Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Cohort Revenue Summary</h2>
        </div>
        <table className="w-full text-sm table-striped">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Cohort', 'Cohort Size', 'Initial Revenue', 'Avg Revenue/Customer', 'M1 Retention', 'M2 Retention'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((c, i) => (
              <tr key={c.name} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium" style={{ color: COLORS[i] }}>{c.name}</td>
                <td className="px-4 py-2.5 text-gray-700">{c.size.toLocaleString()}</td>
                <td className="px-4 py-2.5 tabular-nums text-gray-700">{formatINR(c.revenue)}</td>
                <td className="px-4 py-2.5 tabular-nums text-gray-700">{formatINR(Math.round(c.revenue / c.size))}</td>
                <td className="px-4 py-2.5 text-gray-700">{c.retention[1] !== null ? `${c.retention[1]}%` : '—'}</td>
                <td className="px-4 py-2.5 text-gray-700">{c.retention[2] !== null ? `${c.retention[2]}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
