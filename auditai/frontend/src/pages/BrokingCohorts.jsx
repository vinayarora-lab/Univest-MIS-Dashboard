import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
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

  const { fromMonth, toMonth } = useDateRange();

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;
  const fromIdx = ALL_MONTHS.indexOf(normMonth(fromMonth));
  const toIdx   = ALL_MONTHS.indexOf(normMonth(toMonth));
  const rows = data.data.filter(r => {
    const i = ALL_MONTHS.indexOf(normMonth(r.month));
    return i >= fromIdx && i <= toIdx;
  });

  const broking = (data.broking || []).filter(r => {
    const i = ALL_MONTHS.indexOf(normMonth(r.month));
    return i >= fromIdx && i <= toIdx;
  });
  const bLast = broking[broking.length - 1] || {};
  const totalNewTraders = broking.reduce((s, r) => s + (r.newTraders || 0), 0);

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

      {/* ── SECTION 1: Current State ── */}
      {broking.length > 0 && (
        <>
          <div className="border-t border-gray-200 pt-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
              1. Current State — Users · Revenue · Trades
            </h2>
            {/* KPI strip */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'New Traders (Latest Month)', value: bLast.newTraders?.toLocaleString() || '—', sub: bLast.month, color: '#185FA5' },
                { label: 'Repeat Traders (Latest Month)', value: bLast.repTraders?.toLocaleString() || '—', sub: `${bLast.totalTraders?.toLocaleString()} total active`, color: '#0F6E56' },
                { label: 'M0 Brokerage Revenue', value: bLast.revMn != null ? `₹${bLast.revMn} Mn` : '—', sub: bLast.month, color: '#7C3AED' },
                { label: 'Revenue per New Trader', value: bLast.revPerNewTrader != null ? `₹${bLast.revPerNewTrader.toLocaleString()}` : '—', sub: 'M0 cohort avg', color: '#D97706' },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{k.label}</div>
                  <div className="text-xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{k.sub}</div>
                </div>
              ))}
            </div>
            {/* Combined chart + table: all 5 metrics */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-1">Monthly Brokerage User &amp; Revenue Detail</h3>
              <p className="text-[11px] text-gray-400 mb-4">New Traders · Repeat Traders · Total Active · M0 Revenue · Rev/New Trader</p>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={broking} margin={{ top: 0, right: 70, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 9 }} tickFormatter={v => v.toLocaleString()} width={55} label={{ value: 'Users', angle: -90, position: 'insideLeft', style: { fontSize: 9 }, offset: 10 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `₹${v}`} width={65} label={{ value: '₹Mn / ₹ per user', angle: 90, position: 'insideRight', style: { fontSize: 9 }, offset: 10 }} />
                  <Tooltip formatter={(v, n) => {
                    if (n === 'M0 Revenue (₹Mn)') return `₹${v} Mn`;
                    if (n === 'Rev/New Trader (₹)') return `₹${Number(v).toLocaleString()}`;
                    return Number(v).toLocaleString();
                  }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="l" dataKey="newTraders"      name="New Traders"       stackId="s" fill="#185FA5" radius={[0,0,0,0]} opacity={0.9} />
                  <Bar yAxisId="l" dataKey="repTraders"      name="Repeat Traders"    stackId="s" fill="#0F6E56" radius={[0,0,0,0]} opacity={0.9} />
                  <Line yAxisId="l" type="monotone" dataKey="totalTraders"  name="Total Active"      stroke="#374151" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
                  <Line yAxisId="r" type="monotone" dataKey="revMn"         name="M0 Revenue (₹Mn)" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line yAxisId="r" type="monotone" dataKey="revPerNewTrader" name="Rev/New Trader (₹)" stroke="#D97706" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── SECTION 2: Brokerage Faster Growth ── */}
          <div className="border-t border-gray-200 pt-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
              2. Brokerage Faster Growth — Within &amp; Outside User Base
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Within user base: repeat rate trend */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 text-sm mb-1">Within User Base — Repeat Traders Trend</h3>
                <p className="text-[11px] text-gray-400 mb-4">Existing users returning to trade again in the same month</p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={broking} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                    <YAxis yAxisId="l" tick={{ fontSize: 9 }} width={45} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar yAxisId="l" dataKey="newTraders"  name="New"    fill="#93C5FD" radius={[0,0,0,0]} />
                    <Bar yAxisId="l" dataKey="repTraders"  name="Repeat" fill="#185FA5" radius={[3,3,0,0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {/* Outside user base: PAN → Fund → Trade funnel */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 text-sm mb-1">Outside User Base — Acquisition Funnel</h3>
                <p className="text-[11px] text-gray-400 mb-4">PAN submissions → Fund Add Users → Active Traders</p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={broking} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} width={55} tickFormatter={v => v.toLocaleString()} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="panSubmitted"  name="PAN Submitted"  fill="#E2E8F0" radius={[3,3,0,0]} />
                    <Bar dataKey="newFundUsers"  name="Fund Add Users" fill="#93C5FD" radius={[3,3,0,0]} />
                    <Bar dataKey="newTraders"    name="Active Traders" fill="#185FA5" radius={[3,3,0,0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── SECTION 3: Subscription Product for Brokerage ── */}
          <div className="border-t border-gray-200 pt-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
              3. Subscription Product for Brokerage — Status &amp; Updates
            </h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">Total Paid PAN Submissions</div>
                <div className="text-2xl font-bold text-amber-800">
                  {broking.reduce((s, r) => s + (r.panSubmitted || 0), 0).toLocaleString()}
                </div>
                <div className="text-[10px] text-amber-600 mt-1">Users who submitted PAN in selected period</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-1">Total Active Traders (Cumul.)</div>
                <div className="text-2xl font-bold text-blue-800">
                  {totalNewTraders.toLocaleString()}
                </div>
                <div className="text-[10px] text-blue-600 mt-1">New traders from subscription base</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wide mb-1">Avg PAN → eSign Rate</div>
                <div className="text-2xl font-bold text-purple-800">
                  {broking.filter(r => r.esignPct != null).length > 0
                    ? `${(broking.filter(r => r.esignPct != null).reduce((s, r) => s + r.esignPct, 0) / broking.filter(r => r.esignPct != null).length).toFixed(1)}%`
                    : '—'}
                </div>
                <div className="text-[10px] text-purple-600 mt-1">Average eSign completion rate</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-1">Full Funnel — PAN → eSign → Fund → Trade (Latest Month)</h3>
              <p className="text-[11px] text-gray-400 mb-4">Step-wise conversion for {bLast.month}</p>
              <div className="flex items-center gap-3 flex-wrap">
                {[
                  { label: 'PAN Submitted', value: bLast.panSubmitted, pct: '100%', color: '#E2E8F0', text: '#374151' },
                  { label: '→ eSign', value: bLast.esignPct != null ? Math.round(bLast.panSubmitted * bLast.esignPct / 100) : null, pct: bLast.esignPct != null ? `${bLast.esignPct}%` : '—', color: '#BFDBFE', text: '#1D4ED8' },
                  { label: '→ Fund Added', value: bLast.newFundUsers, pct: bLast.panSubmitted > 0 ? `${(bLast.newFundUsers / bLast.panSubmitted * 100).toFixed(1)}%` : '—', color: '#93C5FD', text: '#1D4ED8' },
                  { label: '→ Active Trader', value: bLast.newTraders, pct: bLast.panSubmitted > 0 ? `${bLast.panToTradePct}%` : '—', color: '#185FA5', text: '#fff' },
                ].map((step, i) => (
                  <div key={i} className="flex-1 min-w-[120px] rounded-xl px-4 py-3 text-center" style={{ background: step.color }}>
                    <div className="text-[10px] font-semibold mb-1" style={{ color: step.text }}>{step.label}</div>
                    <div className="text-xl font-bold" style={{ color: step.text }}>{step.value?.toLocaleString() ?? '—'}</div>
                    <div className="text-[11px] font-semibold mt-0.5" style={{ color: step.text, opacity: 0.8 }}>{step.pct}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
