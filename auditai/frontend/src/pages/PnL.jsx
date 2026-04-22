import React, { useEffect, useState } from 'react';
import api from '../api/client';

function formatINR(val) {
  if (val === null || val === undefined) return '—';
  if (Math.abs(val) >= 10000000) return `₹${(Math.abs(val) / 10000000).toFixed(2)} Cr`;
  if (Math.abs(val) >= 100000) return `₹${(Math.abs(val) / 100000).toFixed(2)} L`;
  return `₹${Math.abs(val).toLocaleString('en-IN')}`;
}

function pct(current, prev) {
  if (!prev) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function PctCell({ value }) {
  if (value === null) return <td className="px-3 py-2.5 text-center text-gray-400">—</td>;
  const pos = value >= 0;
  return (
    <td className={`px-3 py-2.5 text-center text-xs font-medium ${pos ? 'text-green-600' : 'text-red-500'}`}>
      {pos ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </td>
  );
}

export default function PnL() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/reports/pnl').then(r => setData(r.data)).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Failed to load: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading P&L data...</div>;

  // Show last 6 months
  const totalMonths = data.months.length;
  const startIdx = Math.max(0, totalMonths - 6);
  const displayMonths = data.months.slice(startIdx);

  function slice6(arr) {
    if (!arr) return [];
    return arr.slice(startIdx);
  }

  const opex6 = slice6(data.operating_expenses.expenses);
  const vendorPay6 = slice6(data.operating_expenses.vendor_payments);
  const otherOut6 = slice6(data.operating_expenses.other_outflows);
  const opexTotal6 = slice6(data.operating_expenses.total);

  const rows = [
    { label: 'Revenue (Inflow)', values: slice6(data.revenue), bold: true, indent: 0 },
    { label: 'Vendor Payments (COGS)', values: vendorPay6, indent: 1, negative: true },
    { label: 'Gross Profit', values: slice6(data.gross_profit), bold: true, highlight: true, indent: 0 },
    { label: 'Operating Expenses', values: opexTotal6, indent: 1, negative: true },
    { label: '  · Expenses', values: opex6, indent: 2, small: true },
    { label: '  · Other Outflows', values: otherOut6, indent: 2, small: true },
    { label: 'EBITDA', values: slice6(data.ebitda), bold: true, highlight: true, indent: 0 },
    { label: 'Net Cash Flow', values: slice6(data.net_profit), bold: true, highlight: true, color: 'text-green-700', indent: 0 },
  ];

  const lastIdx = displayMonths.length - 1;
  const prevIdx = lastIdx - 1;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Main P&L Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Profit &amp; Loss Statement</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Last 6 months · {displayMonths[0]} – {displayMonths[displayMonths.length - 1]}
              {totalMonths > 6 && <span className="ml-2 text-blue-500">(showing last 6 of {totalMonths} months)</span>}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 w-64">Line Item</th>
                {displayMonths.map(m => (
                  <th key={m} className="text-right px-4 py-3 text-xs font-semibold text-gray-600">{m}</th>
                ))}
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-600">MoM %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={`border-b border-gray-100 ${row.highlight ? 'bg-blue-50/50' : 'hover:bg-gray-50/50'}`}>
                  <td className={`px-5 py-2.5 ${row.bold ? 'font-semibold text-gray-800' : 'text-gray-600'} ${row.small ? 'text-xs' : ''}`}>
                    {row.label}
                  </td>
                  {row.values.map((val, j) => (
                    <td key={j} className={`px-4 py-2.5 text-right tabular-nums ${row.bold ? 'font-semibold' : ''} ${row.color || ''} ${row.negative ? 'text-red-600' : ''}`}>
                      {row.negative ? `(${formatINR(val)})` : formatINR(val)}
                    </td>
                  ))}
                  <PctCell value={pct(row.values[lastIdx], row.values[prevIdx])} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Consolidated Summary */}
      {data.consolidated && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800">Consolidated Summary (FY)</h2>
            <p className="text-xs text-gray-500 mt-0.5">All Zoho companies · Apr 2024 – Mar 2025</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-0 divide-x divide-y divide-gray-100">
            {[
              { label: 'Total Inflow', value: data.consolidated.totalInflow },
              { label: 'Total Outflow', value: data.consolidated.totalOutflow },
              { label: 'Net Cash Flow', value: data.consolidated.netCashFlow },
              { label: 'Operating CF', value: data.consolidated.netOperatingCashFlow },
              { label: 'Investing CF', value: data.consolidated.netInvestingCashFlow },
              { label: 'Financing CF', value: data.consolidated.netFinancingCashFlow },
            ].map(item => (
              <div key={item.label} className="px-5 py-4">
                <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                <div className={`text-base font-semibold tabular-nums ${item.value < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                  {item.value < 0 ? `(${formatINR(item.value)})` : formatINR(item.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Company Summary */}
      {data.companies && data.companies.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800">Company-wise Summary</h2>
            <p className="text-xs text-gray-500 mt-0.5">Individual entity performance</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600">Company</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Total Inflow</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Total Outflow</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Net Cash Flow</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.companies.map((c, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-2.5 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatINR(c.summary?.totalInflow)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{formatINR(c.summary?.totalOutflow)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${(c.summary?.netCashFlow || 0) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {(c.summary?.netCashFlow || 0) < 0 ? `(${formatINR(c.summary?.netCashFlow)})` : formatINR(c.summary?.netCashFlow)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatINR(c.summary?.closingBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
