import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';

const COLORS = ['#185FA5', '#2563eb', '#60a5fa', '#93c5fd', '#1e40af', '#3b82f6', '#bfdbfe', '#dbeafe', '#0ea5e9', '#0284c7'];

export default function FundraiseHistory() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/fundraise')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { fundraise, totalRaised, captable } = data;

  const pieData = captable
    .filter(r => r.shareholding > 0 && r.shareholder && r.shareholder !== 'Total')
    .map(r => ({ name: r.shareholder, value: Number(r.shareholding.toFixed(2)) }));

  return (
    <div className="max-w-5xl space-y-6">
      {/* Total raised banner */}
      <div className="bg-[#185FA5] rounded-lg px-6 py-5 text-white flex items-center justify-between">
        <div>
          <div className="text-sm opacity-80">Total Capital Raised</div>
          <div className="text-3xl font-bold mt-1">₹{totalRaised} Cr</div>
        </div>
        <div className="text-5xl opacity-20">💰</div>
      </div>

      {/* Fundraise timeline */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Fundraise History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Round</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Period</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">Amount (₹ Cr)</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">Investors</th>
              </tr>
            </thead>
            <tbody>
              {fundraise.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="inline-block bg-blue-100 text-[#185FA5] font-semibold px-2 py-0.5 rounded text-xs">
                      {r.round}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.period}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-800">
                    {r.amount != null ? `₹${Number(r.amount).toFixed(1)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.investors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Captable section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-4">Shareholding Distribution</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={110}
                dataKey="value"
                label={({ name, value }) => `${value.toFixed(1)}%`}
                labelLine={false}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={v => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Captable table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800 text-sm">Cap Table</h2>
          </div>
          <div className="overflow-y-auto max-h-[320px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Shareholder</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Equity</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">FDB Total</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">% Holding</th>
                </tr>
              </thead>
              <tbody>
                {captable.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${r.shareholder === 'Total' ? 'bg-blue-50 font-bold' : 'hover:bg-gray-50'}`}>
                    <td className={`px-3 py-2 whitespace-nowrap ${r.shareholder === 'Total' ? 'text-[#185FA5] font-bold' : 'text-gray-700'}`}>
                      {r.shareholder}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                      {r.equity ? r.equity.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                      {r.totalFDB ? r.totalFDB.toLocaleString() : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.shareholder === 'Total' ? 'text-[#185FA5]' : 'text-gray-800'}`}>
                      {r.shareholding ? `${r.shareholding.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
