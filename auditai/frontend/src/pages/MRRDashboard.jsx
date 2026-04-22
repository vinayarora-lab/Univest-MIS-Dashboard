import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import api from '../api/client';

const COLORS = ['#185FA5', '#22c55e', '#f59e0b', '#8b5cf6'];

function formatINR(val) {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
  return `₹${val.toLocaleString('en-IN')}`;
}

export default function MRRDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/api/reports/mrr').then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading MRR data...</div>;

  const products = Object.keys(data.by_product);
  const lastIdx = data.months.length - 1;
  const prevIdx = lastIdx - 1;

  const chartData = data.months.map((m, i) => ({
    month: m.replace(' 2024', "'24").replace(' 2025', "'25"),
    total: data.total[i],
    ...Object.fromEntries(products.map(p => [p, data.by_product[p][i]])),
  }));

  const lastMonthData = products.map((p) => ({
    name: p,
    value: data.by_product[p][lastIdx],
  }));

  const totalMRR = data.total[lastIdx];
  const prevMRR = data.total[prevIdx];
  const mrrGrowth = prevMRR ? ((totalMRR - prevMRR) / prevMRR * 100).toFixed(1) : '0.0';

  // Top company by last month inflow
  const topProduct = products.reduce((best, p) =>
    (data.by_product[p][lastIdx] || 0) > (data.by_product[best][lastIdx] || 0) ? p : best,
    products[0]
  );
  const topShare = totalMRR > 0 ? ((data.by_product[topProduct][lastIdx] / totalMRR) * 100).toFixed(1) : '0.0';

  // 6-month growth (first vs last of available data, up to 6 apart)
  const sixMonthStart = Math.max(0, lastIdx - 5);
  const sixMonthGrowth = data.total[sixMonthStart] > 0
    ? ((totalMRR - data.total[sixMonthStart]) / data.total[sixMonthStart] * 100).toFixed(1)
    : '0.0';

  return (
    <div className="max-w-5xl space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Latest Month Inflow ({data.months[lastIdx]})</div>
          <div className="text-2xl font-bold text-[#185FA5]">{formatINR(totalMRR)}</div>
          <div className={`text-xs font-medium mt-1 ${parseFloat(mrrGrowth) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {parseFloat(mrrGrowth) >= 0 ? '▲' : '▼'} {Math.abs(mrrGrowth)}% MoM
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">6-Month Growth</div>
          <div className="text-2xl font-bold text-gray-800">
            {parseFloat(sixMonthGrowth) >= 0 ? '+' : ''}{sixMonthGrowth}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {data.months[sixMonthStart]} → {data.months[lastIdx]}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Top Entity</div>
          <div className="text-2xl font-bold text-gray-800">{topProduct}</div>
          <div className="text-xs text-gray-500 mt-1">{topShare}% of inflow</div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Monthly Inflow Trend by Entity</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} />
            <YAxis
              tickFormatter={v => v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` : `₹${(v / 100000).toFixed(0)}L`}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              width={75}
            />
            <Tooltip formatter={(v, n) => [formatINR(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {products.map((p, i) => (
              <Line
                key={p}
                type="monotone"
                dataKey={p}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown Table + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Entity Breakdown — {data.months[lastIdx]}</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Entity</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Inflow</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Share</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">MoM</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const curr = data.by_product[p][lastIdx] || 0;
                const prev = data.by_product[p][prevIdx] || 0;
                const mom = prev ? ((curr - prev) / prev * 100).toFixed(1) : '0.0';
                const share = totalMRR > 0 ? (curr / totalMRR * 100).toFixed(1) : '0.0';
                return (
                  <tr key={p} className="border-b border-gray-100">
                    <td className="px-4 py-2.5 font-medium text-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        {p}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">{formatINR(curr)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{share}%</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${parseFloat(mom) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {parseFloat(mom) >= 0 ? '▲' : '▼'} {Math.abs(mom)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Inflow Share — {data.months[lastIdx]}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={lastMonthData}
                cx="50%"
                cy="50%"
                outerRadius={85}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {lastMonthData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => formatINR(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
