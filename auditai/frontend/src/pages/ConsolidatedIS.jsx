import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { api } from '../api/client';
import { useDateRange, getSliceRange } from '../context/DateRangeContext';

function fmt(v, isPercent) {
  if (v == null) return '—';
  if (isPercent) return `${(v * 100).toFixed(1)}%`;
  return v >= 0
    ? `₹${Math.abs(v).toFixed(2)}`
    : `(₹${Math.abs(v).toFixed(2)})`;
}

function valClass(v, isPercent, isTotal) {
  if (v == null) return 'text-gray-300';
  const num = isPercent ? v * 100 : v;
  if (isTotal) {
    if (num > 0) return 'text-green-700 font-semibold';
    if (num < 0) return 'text-red-600 font-semibold';
    return 'text-gray-500';
  }
  return 'text-gray-700';
}

const SECTIONS = ['Revenue', 'Margins', 'Costs', 'Profitability', 'Broking'];
const SECTION_COLORS = {
  Revenue: 'text-blue-700', Margins: 'text-green-700',
  Costs: 'text-orange-600', Profitability: 'text-purple-700', Broking: 'text-teal-700'
};

export default function ConsolidatedIS() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/consolidated-is')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { fromMonth, toMonth } = useDateRange();
  const { start, end } = getSliceRange(data.dates, fromMonth, toMonth);
  const dates = data.dates.slice(start, end + 1);
  const items = data.items.map(i => ({ ...i, values: i.values.slice(start, end + 1) }));
  const n = dates.length - 1; // latest month index within range

  const get = (label) => items.find(i => i.label === label);
  const revenue = get('Total Net Revenue');
  const grossMargin = get('Gross Margin');
  const gmPct = get('Gross Margin %');
  const ebitda = get('Overall EBITDA');
  const ebitdaPct = get('Overall EBITDA %');
  const pbt = get('Overall PBT ( Accrued )');
  const pbtPct = get('Overall PBT %');

  // Summary: latest month
  const latestDate = dates[n];
  const latestRev = revenue?.values[n];
  const latestGM = grossMargin?.values[n];
  const latestGMPct = gmPct?.values[n];
  const latestEBITDA = ebitda?.values[n];
  const latestEBITDAPct = ebitdaPct?.values[n];
  const latestPBT = pbt?.values[n];

  // Chart data — last 12 months
  const chartDates = dates.slice(-12);
  const startIdx = n - 11;
  const trendData = chartDates.map((d, i) => ({
    month: d,
    'Net Revenue': revenue?.values[startIdx + i] != null ? Number(revenue.values[startIdx + i].toFixed(2)) : null,
    'Gross Margin': grossMargin?.values[startIdx + i] != null ? Number(grossMargin.values[startIdx + i].toFixed(2)) : null,
    'Overall EBITDA': ebitda?.values[startIdx + i] != null ? Number(ebitda.values[startIdx + i].toFixed(2)) : null,
  }));

  const gmPctData = chartDates.map((d, i) => ({
    month: d,
    'GM %': gmPct?.values[startIdx + i] != null ? Number((gmPct.values[startIdx + i] * 100).toFixed(1)) : null,
    'EBITDA %': ebitdaPct?.values[startIdx + i] != null ? Number((ebitdaPct.values[startIdx + i] * 100).toFixed(1)) : null,
  }));

  return (
    <div className="max-w-7xl space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Net Revenue — {latestDate}</div>
          <div className="text-2xl font-bold text-[#185FA5]">
            {latestRev != null ? `₹${latestRev.toFixed(2)} Mn` : '—'}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Gross Margin</div>
          <div className={`text-2xl font-bold ${latestGM >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {latestGM != null ? `₹${Math.abs(latestGM).toFixed(2)} Mn` : '—'}
            {latestGMPct != null && (
              <span className="text-base ml-1">({(latestGMPct * 100).toFixed(1)}%)</span>
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Overall EBITDA</div>
          <div className={`text-2xl font-bold ${latestEBITDA >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {latestEBITDA != null ? `${latestEBITDA >= 0 ? '' : '('}₹${Math.abs(latestEBITDA).toFixed(2)} Mn${latestEBITDA < 0 ? ')' : ''}` : '—'}
            {latestEBITDAPct != null && (
              <span className="text-base ml-1">({(latestEBITDAPct * 100).toFixed(1)}%)</span>
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">Overall PBT (Accrued)</div>
          <div className={`text-2xl font-bold ${latestPBT >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {latestPBT != null ? `${latestPBT >= 0 ? '' : '('}₹${Math.abs(latestPBT).toFixed(2)} Mn${latestPBT < 0 ? ')' : ''}` : '—'}
          </div>
        </div>
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-3">Revenue & Margins Trend (INR Mn) — Last 12 months</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={1} />
              <YAxis tick={{ fontSize: 9 }} width={44} />
              <Tooltip formatter={(v, name) => [`₹${v} Mn`, name]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Line type="monotone" dataKey="Net Revenue" stroke="#185FA5" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="Gross Margin" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="Overall EBITDA" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 text-sm mb-3">GM % & EBITDA % Trend — Last 12 months</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={gmPctData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={1} />
              <YAxis tick={{ fontSize: 9 }} unit="%" width={44} />
              <Tooltip formatter={v => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Line type="monotone" dataKey="GM %" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="EBITDA %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* P&L Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Consolidated Income Statement — Accrued</h2>
          <p className="text-xs text-gray-500 mt-0.5">Values in INR Millions · Apr'23 → Mar'26 · Brackets = loss/negative</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[230px]">Particulars</th>
                {dates.map(d => (
                  <th key={d} className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap min-w-[60px]">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map(section => {
                const sectionItems = items.filter(i => i.section === section);
                if (!sectionItems.length) return null;
                return (
                  <React.Fragment key={section}>
                    <tr className="bg-gray-50">
                      <td colSpan={dates.length + 1} className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide ${SECTION_COLORS[section]}`}>
                        {section}
                      </td>
                    </tr>
                    {sectionItems.map((item, idx) => (
                      <tr key={idx} className={`border-b border-gray-50 ${item.isTotal ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <td className={`px-4 py-2 sticky left-0 whitespace-nowrap ${item.isTotal ? 'bg-blue-50 font-semibold text-gray-800' : 'bg-white text-gray-600'}`}>
                          {item.label}
                        </td>
                        {item.values.map((v, vi) => (
                          <td key={vi} className={`px-2 py-2 text-right tabular-nums ${valClass(v, item.isPercent, item.isTotal)}`}>
                            {fmt(v, item.isPercent)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
