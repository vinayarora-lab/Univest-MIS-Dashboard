import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../api/client';

const COLORS = {
  revenue:  '#22c55e',
  expenses: '#ef4444',
  netBurn:  '#f97316',
  fd:       '#185FA5',
  cash:     '#8b5cf6',
};

function fmtM(v) {
  if (v == null) return '—';
  return `₹${v} M`;
}

function SummaryCard({ label, value, color, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-1">
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{fmtM(value)}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function SkeletonCard() {
  return <div className="bg-gray-100 border border-gray-200 rounded-lg h-24 animate-pulse" />;
}

export default function CashMIS() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/cash-mis/summary')
      .then(r => {
        if (r.data.ok) setData(r.data.data);
        else setError(r.data.error || 'Unknown error');
      })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;

  if (!data) {
    return (
      <div className="max-w-6xl space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <div className="bg-gray-100 border border-gray-200 rounded-lg h-72 animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-100 border border-gray-200 rounded-lg h-64 animate-pulse" />
          <div className="bg-gray-100 border border-gray-200 rounded-lg h-64 animate-pulse" />
        </div>
        <div className="bg-gray-100 border border-gray-200 rounded-lg h-48 animate-pulse" />
      </div>
    );
  }

  const { months, series, breakdown, latest } = data;

  // Last 24 months of trend data
  const trendSlice = months.length > 24 ? months.length - 24 : 0;
  const trendMonths  = months.slice(trendSlice);
  const trendRevenue = series.revenue.slice(trendSlice);
  const trendExp     = series.expenses.slice(trendSlice);
  const trendBurn    = series.netBurn.slice(trendSlice);
  const trendFD      = series.closingFD.slice(trendSlice);
  const trendCash    = series.closingCash.slice(trendSlice);

  const trendData = trendMonths.map((m, i) => ({
    month: m,
    Revenue: trendRevenue[i],
    Expenses: trendExp[i],
    'Net Burn': trendBurn[i],
  }));

  const liquidData = trendMonths.map((m, i) => ({
    month: m,
    'Closing FD': trendFD[i],
    'Closing Cash': trendCash[i],
  }));

  const breakdownData = [
    { name: 'Employee',  value: breakdown.employee },
    { name: 'Marketing', value: breakdown.marketing },
    { name: 'Cashback',  value: breakdown.cashback },
    { name: 'Tech',      value: breakdown.tech },
    { name: 'Legal',     value: breakdown.legal },
    { name: 'Office',    value: breakdown.office },
  ].filter(d => d.value !== 0);

  // Table: newest first
  const tableRows = months.map((m, i) => ({
    month: m,
    revenue:  series.revenue[i],
    expenses: series.expenses[i],
    netBurn:  series.netBurn[i],
    fd:       series.closingFD[i],
    cash:     series.closingCash[i],
  })).reverse();

  return (
    <div className="max-w-6xl space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Revenue" value={latest.revenue_L} color={COLORS.revenue} sub={`Latest: ${latest.month}`} />
        <SummaryCard label="Expenses" value={latest.expenses_L} color={COLORS.expenses} sub={`Latest: ${latest.month}`} />
        <SummaryCard label="Net Burn" value={latest.netBurn_L} color={COLORS.netBurn} sub={`Latest: ${latest.month}`} />
        <SummaryCard label="Total Liquid (FD + Cash)" value={latest.totalLiquid_L} color={COLORS.fd} sub={`FD: ₹${latest.closingFD_L} M · Cash: ₹${latest.closingCash_L} M`} />
      </div>

      {/* Revenue, Expenses, Net Burn trend */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">Revenue, Expenses & Net Burn Trend — Last 24 Months (₹ Millions)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={2} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v, name) => [fmtM(v), name]} />
            <Legend />
            <Line type="monotone" dataKey="Revenue"  stroke={COLORS.revenue}  strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Expenses" stroke={COLORS.expenses} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Net Burn" stroke={COLORS.netBurn}  strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Liquid Assets + Expense Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Closing FD & Cash */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-4">Closing FD & Cash Balance (₹ Millions)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={liquidData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, name) => [fmtM(v), name]} />
              <Legend />
              <Area type="monotone" dataKey="Closing FD"   stroke={COLORS.fd}   fill={COLORS.fd}   fillOpacity={0.15} strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Closing Cash" stroke={COLORS.cash} fill={COLORS.cash} fillOpacity={0.15} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-1">Expense Breakdown — {latest.month} (₹ Millions)</h2>
          <p className="text-xs text-gray-400 mb-3">Key cost categories</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={breakdownData} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
              <Tooltip formatter={(v) => [fmtM(v), 'Amount']} />
              <Bar dataKey="value" fill={COLORS.expenses} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Monthly Cash MIS Data</h2>
          <p className="text-xs text-gray-500 mt-0.5">All values in ₹ Millions · newest first</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">Month</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">Revenue (M)</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">Expenses (M)</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">Net Burn (M)</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">FD Balance (M)</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">Cash Balance (M)</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => (
                <tr key={row.month} className={`border-b border-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30`}>
                  <td className="px-4 py-2 font-medium text-gray-700">{row.month}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-700">{row.revenue !== 0 ? fmtM(row.revenue) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-600">{row.expenses !== 0 ? fmtM(row.expenses) : '—'}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${row.netBurn < 0 ? 'text-red-500' : 'text-orange-500'}`}>
                    {row.netBurn !== 0 ? fmtM(row.netBurn) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[#185FA5]">{row.fd !== 0 ? fmtM(row.fd) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-purple-600">{row.cash !== 0 ? fmtM(row.cash) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
