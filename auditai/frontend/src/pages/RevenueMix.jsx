import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { api } from '../api/client';
import { useDateRange, getSliceRange } from '../context/DateRangeContext';

const COLORS = ['#185FA5', '#2563eb', '#60a5fa', '#93c5fd', '#bfdbfe', '#1e40af', '#3b82f6', '#dbeafe'];

export default function RevenueMix() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/revenue-mix')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { fromMonth, toMonth } = useDateRange();
  const { start, end } = getSliceRange(data.dates, fromMonth, toMonth);
  const dates = data.dates.slice(start, end + 1);
  const plans = data.plans.map(p => ({ ...p, values: p.values.slice(start, end + 1) }));
  const nonTotalPlans = plans.filter(p => !p.isTotal);
  const totalPlan = plans.find(p => p.isTotal);
  const last12Dates = dates.slice(-12);
  const last12Idx = Math.max(0, dates.length - 12);

  const chartData = last12Dates.map((d, i) => {
    const idx = last12Idx + i;
    const entry = { date: d };
    nonTotalPlans.forEach(p => { entry[p.plan] = Number((p.values[idx] || 0).toFixed(3)); });
    if (totalPlan) entry['Total'] = Number((totalPlan.values[idx] || 0).toFixed(3));
    return entry;
  });

  return (
    <div className="max-w-5xl space-y-6">
      {/* Stacked bar */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">Booked Revenue by Plan — Stacked (INR Mn)</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={v => `₹${v} Mn`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {nonTotalPlans.map((p, i) => (
              <Bar key={p.plan} dataKey={p.plan} stackId="a" fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Total area chart */}
      {totalPlan && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-4">Total Revenue Trend (INR Mn)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#185FA5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#185FA5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => `₹${v} Mn`} />
              <Area type="monotone" dataKey="Total" stroke="#185FA5" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Revenue Mix by Plan — Last 12 Months (INR Mn)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Plan</th>
                {last12Dates.map(d => (
                  <th key={d} className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((plan, i) => (
                <tr key={i} className={`border-b border-gray-100 ${plan.isTotal ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <td className={`px-3 py-2 whitespace-nowrap ${plan.isTotal ? 'text-[#185FA5] font-bold' : 'text-gray-700'}`}>
                    {plan.plan}
                  </td>
                  {last12Dates.map((_, j) => {
                    const idx = last12Idx + j;
                    const v = plan.values[idx];
                    return (
                      <td key={j} className={`px-2 py-2 text-right tabular-nums ${plan.isTotal ? 'text-[#185FA5] font-bold' : 'text-gray-700'}`}>
                        {v != null && v !== 0 ? Number(v).toFixed(2) : '—'}
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
