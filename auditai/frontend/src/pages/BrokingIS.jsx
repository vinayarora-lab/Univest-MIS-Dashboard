import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useDateRange, getSliceRange } from '../context/DateRangeContext';

function fmt(v) {
  if (v == null || v === 0) return '—';
  return v.toFixed(2);
}

function valClass(v, isTotal) {
  if (!isTotal) return 'text-gray-700';
  if (v > 0) return 'text-green-700 font-semibold';
  if (v < 0) return 'text-red-600 font-semibold';
  return 'text-gray-500';
}

export default function BrokingIS() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/broking-is')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { fromMonth, toMonth } = useDateRange();
  const { start, end } = getSliceRange(data.dates, fromMonth, toMonth);
  const dates = data.dates.slice(start, end + 1);
  const items = data.items.map(i => ({ ...i, values: i.values.slice(start, end + 1) }));

  const totalIncome = items.find(i => i.label === 'Total Income');
  const totalExpenses = items.find(i => i.label === 'Broking Expenses');
  const netProfit = items.find(i => i.label === 'PBT') || items.find(i => i.label.startsWith('Net'));

  const chartData = dates.map((d, idx) => ({
    date: d,
    'Total Income': totalIncome ? Number((totalIncome.values[idx] || 0).toFixed(2)) : 0,
    'Total Expenses': totalExpenses ? Number((totalExpenses.values[idx] || 0).toFixed(2)) : 0,
    'Net Profit/Loss': netProfit ? Number((netProfit.values[idx] || 0).toFixed(2)) : 0,
  }));

  const sections = [...new Set(items.map(i => i.section))].filter(Boolean);

  return (
    <div className="max-w-6xl space-y-6">
      {/* Chart */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">Income, Expenses & Net Profit/Loss Trend (INR Millions)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v, name) => [`₹${v} Mn`, name]} />
            <Legend />
            <Line type="monotone" dataKey="Total Income" stroke="#185FA5" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Total Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Net Profit/Loss" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* P&L Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Income Statement — Broking Accrued</h2>
          <p className="text-xs text-gray-500 mt-0.5">Values in INR Millions</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[180px]">Particulars</th>
                {dates.map(d => (
                  <th key={d} className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map(section => (
                <React.Fragment key={section}>
                  <tr className="bg-gray-50">
                    <td colSpan={dates.length + 1} className="px-4 py-1.5 text-xs font-bold text-[#185FA5] uppercase tracking-wide">
                      {section}
                    </td>
                  </tr>
                  {items.filter(i => i.section === section).map((item, idx) => (
                    <tr key={idx} className={`border-b border-gray-50 ${item.isTotal ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <td className={`px-4 py-2 sticky left-0 ${item.isTotal ? 'bg-blue-50 font-semibold text-gray-800' : 'bg-white text-gray-700'} whitespace-nowrap`}>
                        {item.label}
                      </td>
                      {item.values.map((v, vi) => (
                        <td key={vi} className={`px-2 py-2 text-right tabular-nums ${valClass(v, item.isTotal)}`}>
                          {v !== 0 ? fmt(v) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {/* Net profit row without section */}
              {items.filter(i => !i.section && i.isTotal).map((item, idx) => (
                <tr key={`net-${idx}`} className="bg-gray-900 border-t-2 border-gray-700">
                  <td className="px-4 py-2.5 sticky left-0 bg-gray-900 font-bold text-white whitespace-nowrap">
                    {item.label}
                  </td>
                  {item.values.map((v, vi) => (
                    <td key={vi} className={`px-2 py-2.5 text-right font-bold tabular-nums ${v >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
