import React, { useState, useEffect } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, AreaChart, Area, Cell,
} from 'recharts';
import { api } from '../api/client';
import AnalyticsReport from './AnalyticsReport';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtL(n) { return `₹${(n / 100000).toFixed(1)}L`; }
function fmtCr(n) { return `₹${(n / 10000000).toFixed(2)} Cr`; }

function KPI({ label, value, sub, color = '#185FA5' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex flex-col gap-1">
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1.5">{title}</h2>
      {children}
    </div>
  );
}

function retColor(pct) {
  if (pct == null) return 'bg-gray-50 text-gray-300';
  if (pct >= 60) return 'bg-emerald-600 text-white';
  if (pct >= 45) return 'bg-emerald-500 text-white';
  if (pct >= 30) return 'bg-blue-500 text-white';
  if (pct >= 20) return 'bg-blue-400 text-white';
  if (pct >= 10) return 'bg-blue-200 text-blue-900';
  if (pct > 0)   return 'bg-gray-100 text-gray-600';
  return 'bg-gray-50 text-gray-300';
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function BoardMeeting() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('growth');

  useEffect(() => {
    api.get('/api/board/data')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-6">Error: {error}</div>;
  if (!data)  return <div className="text-gray-400 text-sm p-6 animate-pulse">Loading investor data…</div>;

  const { cac, retention, competitive, aop, broking, fundraise, isSummary, cacLtv, accruedRev, iosConversion = [], brokingPacks } = data;
  const latest = cac[cac.length - 1] || {};
  const prev   = cac[cac.length - 2] || {};

  // Chart data: monthly growth (last 12 months)
  const growthData = cac.slice(-12).map(r => ({
    month: r.month,
    'New Users': r.conversions,
    'Signups': r.signups,
    'Signup CAC (₹)': r.signupCac,
    'Conversion CAC (₹)': r.newUserCac,
    'Spends (L)': +(r.spends / 100000).toFixed(1),
  }));

  const spendData = cac.slice(-12).map(r => ({
    month: r.month,
    'Spends (L)': +(r.spends / 100000).toFixed(1),
    'Conversions': r.conversions,
  }));

  // Retention heatmap — last 12 complete months
  const retRows = retention.filter(r => r.M0 > 500).slice(-12);

  // Competitive all-metrics flat list
  const allMetrics = [
    ...competitive.scale.map(m => ({ ...m, cat: 'Scale' })),
    ...competitive.unitEcon.map(m => ({ ...m, cat: 'Unit Economics' })),
    ...competitive.retention.map(m => ({ ...m, cat: 'Retention' })),
  ];

  return (
    <div className="max-w-6xl space-y-8 pb-10">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Investor Board Meeting</h1>
          <p className="text-xs text-gray-400 mt-0.5">Live data · Univest MIS · As of May 2026</p>
        </div>
        <div className="flex items-center gap-3 text-xs">

          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full font-semibold border border-blue-200">
            Univest wins {competitive.univestWins}/{competitive.univestWins + competitive.tmWins} metrics vs Tejimandi
          </span>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-5 gap-3">
        <KPI
          label={`ARR (${isSummary?.latestMonth || "Mar '26"})`}
          value={isSummary?.arrUsdM ? `$${isSummary.arrUsdM}M` : '—'}
          sub={isSummary?.arrInrCr ? `₹${isSummary.arrInrCr} Cr · ${isSummary.basis}` : ''}
          color="#185FA5"
        />
        <KPI label="Total Paying Users" value="4,31,729" sub="1.7x vs Tejimandi" color="#0F6E56" />
        <KPI
          label="Total Revenue (till date)"
          value={isSummary?.totalRevenueInrCr ? `₹${isSummary.totalRevenueInrCr} Cr` : '₹177 Cr'}
          sub={isSummary?.basis ? `${isSummary.basis}` : '1st txn 62% · Repeat 38%'}
          color="#185FA5"
        />
        <KPI label="Overall Repeat Rate" value="44.95%" sub="vs Tejimandi 17.7% — 2.5x lead" color="#0F6E56" />
        <KPI
          label={`Signup CAC (${latest.month})`}
          value={`₹${latest.signupCac}`}
          sub={`↓ from ₹${prev.signupCac} — improving`}
          color="#7C3AED"
        />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {[['growth', 'Growth & CAC'], ['competitive', 'Vs Tejimandi'], ['aop', 'AOP vs Actual'], ['cacltv', 'CAC-LTV'], ['revenue', 'Accrued Revenue'], ['brokerage', 'Brokerage'], ['brokingpacks', 'Broking Packs'], ['ios', 'iOS Conversion'], ['summary', 'Summary']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tab === k ? 'bg-white text-[#185FA5] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >{l}</button>
        ))}
      </div>

      {/* ── Growth & CAC ── */}
      {tab === 'growth' && (
        <div className="space-y-6">
          {/* New Users + Signup CAC */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 text-sm">Monthly New Users & Signup CAC</h3>
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#185FA5] inline-block"/> New Users (Conversions)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1.5 bg-[#f97316] inline-block rounded"/> Signup CAC (₹)</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={growthData} margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={v => v.toLocaleString()} width={55} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `₹${v}`} width={55} />
                <Tooltip formatter={(v, n) => n.includes('CAC') ? `₹${v}` : v.toLocaleString()} />
                <Bar yAxisId="left" dataKey="New Users" fill="#185FA5" radius={[3, 3, 0, 0]} opacity={0.85} />
                <Line yAxisId="right" type="monotone" dataKey="Signup CAC (₹)" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3, fill: '#f97316' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Spends trend */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">Digital Monthly Spends (₹ Lakhs)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={spendData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#185FA5" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#185FA5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} width={40} />
                  <Tooltip formatter={v => `₹${v}L`} />
                  <Area type="monotone" dataKey="Spends (L)" stroke="#185FA5" strokeWidth={2} fill="url(#spendGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">Monthly Signups Volume</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={growthData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0F6E56" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#0F6E56" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} width={40} />
                  <Tooltip formatter={v => v.toLocaleString()} />
                  <Area type="monotone" dataKey="Signups" stroke="#0F6E56" strokeWidth={2} fill="url(#signupGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Key growth metrics table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Monthly Growth Summary (Last 6 Months)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-500 font-semibold uppercase tracking-wide text-[10px]">
                    <th className="px-4 py-2 text-left">Month</th>
                    <th className="px-3 py-2 text-right">Signups</th>
                    <th className="px-3 py-2 text-right">New Users</th>
                    <th className="px-3 py-2 text-right">Conv. Rate</th>
                    <th className="px-3 py-2 text-right">Spends</th>
                    <th className="px-3 py-2 text-right">Signup CAC</th>
                    <th className="px-3 py-2 text-right">User CAC</th>
                  </tr>
                </thead>
                <tbody>
                  {cac.slice(-6).reverse().map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-semibold text-gray-700">{r.month}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{r.signups.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-[#185FA5]">{r.conversions.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {r.signups > 0 ? `${((r.conversions / r.signups) * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{fmtL(r.spends)}</td>
                      <td className="px-3 py-2.5 text-right text-[#7C3AED] font-semibold">₹{r.signupCac ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">₹{r.newUserCac?.toLocaleString() ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Retention Cohorts ── */}
      {tab === 'retention' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Overall Repeat Rate', value: '44.95%', sub: '2.5x vs Tejimandi (17.7%)', c: '#0F6E56' },
              { label: 'Non-mandate Repeat', value: '52.53%', sub: 'Users choosing to renew', c: '#0F6E56' },
              { label: 'Upgrade on Repeat', value: '36.7%', sub: 'Users upgrading plans on renewal', c: '#185FA5' },
            ].map(k => <KPI key={k.label} label={k.label} value={k.value} sub={k.sub} color={k.c} />)}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">New User Retention Cohorts</h3>
              <p className="text-xs text-gray-400 mt-0.5">M0 = activations in cohort month · M1–M5 = % of M0 retained in subsequent months</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-500 font-semibold uppercase tracking-wide text-[10px]">
                    <th className="px-4 py-2.5 text-left sticky left-0 bg-gray-50">Cohort</th>
                    <th className="px-3 py-2.5 text-right">Total Conv.</th>
                    <th className="px-3 py-2.5 text-center">M0 (New)</th>
                    <th className="px-3 py-2.5 text-center">M1</th>
                    <th className="px-3 py-2.5 text-center">M2</th>
                    <th className="px-3 py-2.5 text-center">M3</th>
                    <th className="px-3 py-2.5 text-center">M4</th>
                    <th className="px-3 py-2.5 text-center">M5</th>
                  </tr>
                </thead>
                <tbody>
                  {[...retRows].reverse().map((r, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-white">{r.month}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500">{r.total.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-center bg-[#185FA5] text-white font-bold">{r.M0.toLocaleString()}</td>
                      {[r.M1pct, r.M2pct, r.M3pct, r.M4pct, r.M5pct].map((pct, j) => (
                        <td key={j} className={`px-3 py-2.5 text-center font-medium ${retColor(pct)}`}>
                          {pct != null ? (
                            <div>
                              <div>{pct}%</div>
                              <div className="text-[10px] opacity-70">
                                {[r.M1, r.M2, r.M3, r.M4, r.M5][j]?.toLocaleString()}
                              </div>
                            </div>
                          ) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Retention trend chart */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 text-sm mb-4">M1 Retention Trend Over Time</h3>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={retRows.map(r => ({ month: r.month, 'M0 New Users': r.M0, 'M1 Ret %': r.M1pct, 'M3 Ret %': r.M3pct }))}
                margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={v => v.toLocaleString()} width={55} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} unit="%" width={35} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar yAxisId="left" dataKey="M0 New Users" fill="#185FA5" opacity={0.5} radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="M1 Ret %" stroke="#0F6E56" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="M3 Ret %" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Competitive ── */}
      {tab === 'competitive' && (
        <div className="space-y-6">
          {/* Score card */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { name: 'UNIVEST', score: competitive.univestWins, color: '#0F6E56', bg: '#E1F5EE', border: '#1D9E75' },
              { name: 'TEJIMANDI', score: competitive.tmWins, color: '#993C1D', bg: '#FAECE7', border: '#D85A30' },
            ].map(s => (
              <div key={s.name} style={{ borderLeft: `4px solid ${s.border}`, background: s.bg }}
                className="rounded-xl p-5 text-center">
                <div className="text-xs font-bold text-gray-500 mb-1">{s.name}</div>
                <div className="text-5xl font-bold mb-1" style={{ color: s.color }}>{s.score}</div>
                <div className="text-xs text-gray-500">metrics won (out of {competitive.univestWins + competitive.tmWins})</div>
              </div>
            ))}
          </div>

          {/* Metrics tables by category */}
          {['Scale', 'Unit Economics', 'Retention'].map(cat => {
            const rows = allMetrics.filter(m => m.cat === cat);
            return (
              <div key={cat} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <h3 className="font-bold text-gray-700 text-xs uppercase tracking-wide">{cat}</h3>
                  <div className="flex gap-2 text-[10px] font-semibold">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">U = Univest</span>
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded">T = Tejimandi</span>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                      <th className="px-5 py-2 text-left">Metric</th>
                      <th className="px-4 py-2 text-center text-[#185FA5]">Univest</th>
                      <th className="px-4 py-2 text-center text-[#D85A30]">Tejimandi</th>
                      <th className="px-3 py-2 text-center">Winner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-2.5 text-gray-600">{m.label}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-[#185FA5]">{m.univest}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-[#993C1D]">{m.tm}</td>
                        <td className="px-3 py-2.5 text-center">
                          {m.winner === 'U' && <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold">U</span>}
                          {m.winner === 'T' && <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-orange-100 text-orange-700 text-[9px] font-bold">T</span>}
                          {m.winner === 'D' && <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[9px] font-bold">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Plan LTV */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50">
              <h3 className="font-bold text-gray-700 text-xs uppercase tracking-wide">Plan-Level LTV Comparison</h3>
            </div>
            <div className="grid grid-cols-4 gap-0 divide-x divide-gray-100">
              {competitive.planLTV.map(p => (
                <div key={p.plan} className="px-5 py-4">
                  <div className="text-[10px] text-gray-400 font-semibold uppercase mb-2">{p.plan}</div>
                  <div className="text-lg font-bold text-[#185FA5]">{p.univest}</div>
                  <div className="text-xs text-[#993C1D] mt-0.5">vs {p.tm}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Verdict */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
            <div className="text-xs font-bold text-indigo-600 mb-2 uppercase tracking-wide">Board Summary</div>
            <p className="text-sm text-gray-700 leading-relaxed">{competitive.verdict}</p>
          </div>
        </div>
      )}

      {/* ── AOP vs Actual ── */}
      {tab === 'aop' && (
        <div className="space-y-6">
          {aop?.months?.length > 0 ? (
            <>
              {/* Chart — FY24-25 vs FY25-26 AOP vs Actual */}
              {(() => {
                const tiMetric = aop.metrics.find(m => m.label === 'Total Income');
                const gpMetric = aop.metrics.find(m => m.label === 'GP%');
                // Use aop.months directly so Apr 26 is included
                const chartData = aop.months.map((lbl, i) => ({
                  month: lbl,
                  'FY24-25 Actual': aop.fy2425?.bookedRevValues?.[i] ?? null,
                  'FY25-26 AOP':    tiMetric?.aopValues[i] ?? null,
                  'FY25-26 Actual': tiMetric?.actualValues[i] ?? null,
                  'FY24-25 GP%':    aop.fy2425?.gpPctValues?.[i] ?? null,
                  'FY25-26 GP%':    gpMetric?.actualValues[i] ?? null,
                }));
                return (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-1">Booked Revenue — FY24-25 vs FY25-26 AOP vs Actual (₹ Mn)</h3>
                    <p className="text-[11px] text-gray-400 mb-4">FY24-25 Actual · FY25-26 AOP target · FY25-26 Actual · Source: MIS Consolidated IS - Accrued</p>
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={chartData} margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                        <YAxis yAxisId="l" tick={{ fontSize: 9 }} tickFormatter={v => `₹${v}Mn`} width={65} />
                        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} width={45} />
                        <Tooltip formatter={(v, n) => v == null ? '—' : n.includes('%') ? `${v}%` : `₹${v} Mn`} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar yAxisId="l" dataKey="FY24-25 Actual" fill="#CBD5E1" radius={[3,3,0,0]} />
                        <Bar yAxisId="l" dataKey="FY25-26 AOP" fill="#93C5FD" radius={[3,3,0,0]} />
                        <Bar yAxisId="l" dataKey="FY25-26 Actual" fill="#185FA5" radius={[3,3,0,0]} />
                        <Line yAxisId="r" type="monotone" dataKey="FY24-25 GP%" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                        <Line yAxisId="r" type="monotone" dataKey="FY25-26 GP%" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}

              {/* Table — AOP vs Actual per metric */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 text-sm">AOP vs Actual — Monthly Detail (₹ Mn)</h3>
                  <div className="flex gap-3 text-[10px] font-semibold">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-gray-300 inline-block rounded"/> FY24-25 (Actual)</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-200 inline-block rounded"/> AOP (FY25-26)</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-[#185FA5] inline-block rounded"/> FY25-26 (Actual)</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                        <th className="px-4 py-2.5 text-left sticky left-0 bg-gray-50 min-w-[120px]">Metric</th>
                        <th className="px-3 py-2.5 text-center sticky left-[120px] bg-gray-50 min-w-[60px]">Row</th>
                        {aop.months.map((m, i) => <th key={i} className={`px-3 py-2.5 text-right whitespace-nowrap ${i === aop.months.length - 1 && m.includes('26') ? 'bg-blue-50 text-blue-600' : ''}`}>{i === aop.months.length - 1 && m.includes('26') ? m : m.split(' ')[0]}</th>)}
                        <th className="px-3 py-2.5 text-right whitespace-nowrap bg-gray-100 border-l border-gray-200">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aop.metrics.map((metric, i) => {
                        const fy2425Vals = metric.label === 'Total Income'
                          ? aop.fy2425?.bookedRevValues
                          : metric.label === 'GP%'
                          ? aop.fy2425?.gpPctValues
                          : null;
                        const calcTotal = (vals) => {
                          const nonNull = (vals || []).filter(v => v != null);
                          if (!nonNull.length) return null;
                          if (metric.isPercent) return +(nonNull.reduce((s,v) => s + v, 0) / nonNull.length).toFixed(1);
                          return +nonNull.reduce((s,v) => s + v, 0).toFixed(2);
                        };
                        const fy2425Total = calcTotal(fy2425Vals);
                        const aopTotal    = calcTotal(metric.aopValues);
                        const actTotal    = calcTotal(metric.actualValues);
                        return (
                          <>
                            <tr key={`${i}-fy2425`} className="border-b border-gray-100 bg-gray-50/60">
                              <td className="px-4 py-2 font-semibold text-gray-700 sticky left-0 bg-gray-50/80" rowSpan={3}>{metric.label}</td>
                              <td className="px-3 py-2 text-[10px] text-gray-500 font-semibold sticky left-[120px] bg-gray-50/80">FY24-25 (Actual)</td>
                              {aop.months.map((_, j) => {
                                const v = fy2425Vals?.[j] ?? null;
                                return (
                                  <td key={j} className="px-3 py-2 text-right text-gray-500">
                                    {v == null ? '—' : metric.isPercent ? `${v}%` : v.toLocaleString()}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right font-bold text-gray-600 bg-gray-100 border-l border-gray-200">
                                {fy2425Total == null ? '—' : metric.isPercent ? `${fy2425Total}%` : fy2425Total.toLocaleString()}
                              </td>
                            </tr>
                            <tr key={`${i}-aop`} className="border-b border-gray-100 bg-blue-50/40">
                              <td className="px-3 py-2 text-[10px] text-blue-600 font-semibold sticky left-[120px] bg-blue-50/60">AOP (FY25-26)</td>
                              {metric.aopValues.map((v, j) => (
                                <td key={j} className="px-3 py-2 text-right text-blue-700">
                                  {v == null ? '—' : metric.isPercent ? `${v}%` : v.toLocaleString()}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-right font-bold text-blue-700 bg-blue-50 border-l border-gray-200">
                                {aopTotal == null ? '—' : metric.isPercent ? `${aopTotal}%` : aopTotal.toLocaleString()}
                              </td>
                            </tr>
                            <tr key={`${i}-act`} className="border-b border-gray-200">
                              <td className="px-3 py-2 text-[10px] text-gray-500 font-semibold sticky left-[120px] bg-white">FY25-26 (Actual)</td>
                              {metric.actualValues.map((v, j) => {
                                const aopV = metric.aopValues[j];
                                const beat = v != null && aopV != null && (metric.isPercent ? v >= aopV : v >= aopV);
                                const missed = v != null && aopV != null && !beat;
                                return (
                                  <td key={j} className={`px-3 py-2 text-right font-semibold ${v == null ? 'text-gray-300' : v < 0 ? 'text-red-600' : beat ? 'text-emerald-700' : missed ? 'text-orange-600' : 'text-gray-700'}`}>
                                    {v == null ? '—' : metric.isPercent ? `${v}%` : v.toLocaleString()}
                                  </td>
                                );
                              })}
                              <td className={`px-3 py-2 text-right font-bold bg-gray-50 border-l border-gray-200 ${actTotal == null ? 'text-gray-300' : actTotal != null && aopTotal != null && actTotal >= aopTotal ? 'text-emerald-700' : 'text-orange-600'}`}>
                                {actTotal == null ? '—' : metric.isPercent ? `${actTotal}%` : actTotal.toLocaleString()}
                              </td>
                            </tr>
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-2 border-t bg-gray-50 text-[10px] text-gray-400 flex gap-4">
                  <span className="text-emerald-600 font-semibold">Green = beat AOP</span>
                  <span className="text-orange-500 font-semibold">Orange = missed AOP</span>
                  <span>AOP source: Analytics sheet · Actual source: MIS Consolidated IS - Accrued</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-400 text-sm p-6">No AOP data available.</div>
          )}
        </div>
      )}

      {/* ── CAC-LTV ── */}
      {tab === 'cacltv' && (
        <div className="space-y-6">
          {cacLtv?.length > 0 ? (() => {
            const last12 = cacLtv.slice(-13);

            // KPI strip — latest month
            const latest = cacLtv[cacLtv.length - 1];
            const prev   = cacLtv[cacLtv.length - 2] || {};

            // Chart data — use userCac directly from CAC-LTV sheet
            const chartData = last12.map(r => ({
              month: r.month,
              'New User ARPU': r.newUserArpu,
              'Repeat ARPU': r.repUserArpu,
              'Blended ARPU': r.blendedArpu,
              'User CAC': r.userCac ?? null,
            }));

            const repeatChartData = last12.map(r => ({
              month: r.month,
              'Repeat Rate %': r.repeatRate,
              'New Users': r.newUsers,
              'Repeat Users': r.repUsers,
            }));

            return (
              <>
                {/* LTV from M6 and M12 rows in the sheet */}
                {(() => {
                  const m6Row  = cacLtv.find(r => r.timeline === 'M6');
                  const m12Row = cacLtv.find(r => r.timeline === 'M12');
                  const ltv6   = m6Row?.ltv  ?? null;
                  const ltv12  = m12Row?.ltv ?? null;
                  const m6Cac  = m6Row?.userCac  ?? null;   // CAC at M6 (Oct 25)
                  const m12Cac = m12Row?.userCac ?? null;   // CAC at M12 (Apr 25)
                  const ltv6Cac  = m6Cac  && ltv6  ? (ltv6  / m6Cac).toFixed(2)  : null;
                  const ltv12Cac = m12Cac && ltv12 ? (ltv12 / m12Cac).toFixed(2) : null;
                  const repeatM12 = m12Row;
                  return (
                    <div className="grid grid-cols-4 gap-3">
                      <KPI label={`New User ARPU (${latest.month})`} value={`₹${latest.newUserArpu?.toLocaleString()}`} sub="1st txn only" color="#185FA5" />
                      <KPI label={`Repeat Rate (${repeatM12?.month ?? prev.month})`} value={`${repeatM12?.repeatRate ?? prev.repeatRate}%`} sub={`vs ${prev.repeatRate}% prev month`} color="#f97316" />
                      <KPI
                        label="6-Month LTV"
                        value={ltv6 != null ? `₹${ltv6.toLocaleString()}` : '—'}
                        sub={ltv6Cac ? `LTV:CAC = ${ltv6Cac}x vs CAC ₹${m6Cac?.toLocaleString()} (${m6Row?.month})` : `From ${m6Row?.month ?? 'M6'}`}
                        color={ltv6Cac && ltv6Cac >= 1 ? '#0F6E56' : '#DC2626'}
                      />
                      <KPI
                        label="12-Month LTV"
                        value={ltv12 != null ? `₹${ltv12.toLocaleString()}` : '—'}
                        sub={ltv12Cac ? `LTV:CAC = ${ltv12Cac}x vs CAC ₹${m12Cac?.toLocaleString()} (${m12Row?.month})` : `From ${m12Row?.month ?? 'M12'}`}
                        color={ltv12Cac && ltv12Cac >= 1 ? '#0F6E56' : '#DC2626'}
                      />
                    </div>
                  );
                })()}

                {/* ARPU vs CAC chart */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-semibold text-gray-800 text-sm mb-1">ARPU vs User CAC — Monthly Trend (₹)</h3>
                  <p className="text-[11px] text-gray-400 mb-4">LTV proxy = Blended ARPU (single transaction view) · Goal: ARPU &gt; CAC</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${v.toLocaleString()}`} width={70} />
                      <Tooltip formatter={v => v != null ? `₹${v.toLocaleString()}` : '—'} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="New User ARPU" fill="#93C5FD" radius={[3,3,0,0]} />
                      <Bar dataKey="Repeat ARPU" fill="#0F6E56" opacity={0.8} radius={[3,3,0,0]} />
                      <Line type="monotone" dataKey="User CAC" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Repeat rate + user mix chart */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-semibold text-gray-800 text-sm mb-4">Repeat Rate & User Mix — Monthly</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={repeatChartData} margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                      <YAxis yAxisId="l" tick={{ fontSize: 9 }} tickFormatter={v => v.toLocaleString()} width={55} />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} width={40} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar yAxisId="l" dataKey="New Users" fill="#93C5FD" radius={[3,3,0,0]} stackId="a" />
                      <Bar yAxisId="l" dataKey="Repeat Users" fill="#185FA5" radius={[3,3,0,0]} stackId="a" />
                      <Line yAxisId="r" type="monotone" dataKey="Repeat Rate %" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Detail table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b bg-gray-50">
                    <h3 className="font-semibold text-gray-800 text-sm">CAC-LTV Monthly Detail</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                          <th className="px-4 py-2.5 text-left sticky left-0 bg-gray-50">Month</th>
                          <th className="px-3 py-2.5 text-right">New Users</th>
                          <th className="px-3 py-2.5 text-right">Repeat Users</th>
                          <th className="px-3 py-2.5 text-right">Total Users</th>
                          <th className="px-3 py-2.5 text-right">Repeat Rate</th>
                          <th className="px-3 py-2.5 text-right">New ARPU</th>
                          <th className="px-3 py-2.5 text-right">Repeat ARPU</th>
                          <th className="px-3 py-2.5 text-right">Blended ARPU</th>
                          <th className="px-3 py-2.5 text-right">User CAC</th>
                          <th className="px-3 py-2.5 text-right">LTV:CAC</th>
                          <th className="px-3 py-2.5 text-right">Total Rev (₹L)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...cacLtv].reverse().map((r, i) => {
                          return (
                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-white">{r.month}</td>
                              <td className="px-3 py-2.5 text-right text-gray-600">{r.newUsers.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-[#185FA5] font-semibold">{r.repUsers.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-gray-600">{r.totalUsers.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right font-semibold" style={{ color: r.repeatRate >= 30 ? '#0F6E56' : r.repeatRate >= 20 ? '#f97316' : '#DC2626' }}>{r.repeatRate}%</td>
                              <td className="px-3 py-2.5 text-right text-gray-600">₹{r.newUserArpu?.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-[#0F6E56] font-semibold">₹{r.repUserArpu?.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-[#7C3AED] font-semibold">₹{r.blendedArpu?.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-red-600">{r.userCac ? `₹${r.userCac.toLocaleString()}` : '—'}</td>
                              <td className="px-3 py-2.5 text-right font-bold" style={{ color: r.ltvcacRatio == null ? '#9CA3AF' : r.ltvcacRatio >= 1 ? '#0F6E56' : '#DC2626' }}>
                                {r.ltvcacRatio != null ? `${r.ltvcacRatio}x` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right text-gray-600">₹{r.totalRevInrL.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })() : (
            <div className="text-gray-400 text-sm p-6">No CAC-LTV data available.</div>
          )}
        </div>
      )}

      {/* ── Accrued Revenue ── */}
      {tab === 'revenue' && (() => {
        const rv = accruedRev || {};
        if (!rv.months?.length) return <div className="text-gray-400 text-sm p-6">No revenue data available.</div>;

        // Last 24 months for the chart
        const last24 = rv.months.map((m, i) => ({
          month: m,
          'Booked Rev (₹Mn)': rv.bookedRev[i],
          'Other Rev (₹Mn)':  rv.otherRev[i],
          'Gross Rev (₹Mn)':  rv.grossRev[i],
          'GP%':              rv.gpPct[i],
        })).filter(r => r['Booked Rev (₹Mn)'] != null || r['Other Rev (₹Mn)'] != null).slice(-24);

        // Totals
        const totalBooked = rv.bookedRev.filter(v => v != null).reduce((s, v) => s + v, 0);
        const totalOther  = rv.otherRev.filter(v => v != null).reduce((s, v) => s + v, 0);
        const latestGP    = rv.gpPct.filter(v => v != null).slice(-1)[0];
        const latestMonth = rv.months[rv.months.length - 1];

        return (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3">
              <KPI label="Total Booked Revenue (cumul.)" value={`₹${(totalBooked/10).toFixed(1)} Cr`} sub="Accrued · incl. GST" color="#185FA5" />
              <KPI label="Total Other Revenue (cumul.)"  value={`₹${(totalOther/10).toFixed(1)} Cr`}  sub="Advisory, brokerage, etc." color="#0F6E56" />
              <KPI label="Combined Gross Revenue"        value={`₹${((totalBooked+totalOther)/10).toFixed(1)} Cr`} sub="Booked + Other" color="#7C3AED" />
              <KPI label={`Latest GP% (${latestMonth})`} value={latestGP != null ? `${latestGP}%` : '—'} sub="Gross Margin %" color="#D97706" />
            </div>

            {/* Stacked bar: Booked + Other Revenue */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-1">Monthly Accrued Revenue — Booked + Other (₹ Mn)</h3>
              <p className="text-[11px] text-gray-400 mb-4">Source: Consolidated IS - Accrued · Booked Revenue (with GST) + Other Revenue</p>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={last24} margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 9 }} tickFormatter={v => `₹${v}`} width={55} label={{ value: '₹ Mn', angle: -90, position: 'insideLeft', style: { fontSize: 9 }, offset: 10 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} width={40} />
                  <Tooltip formatter={(v, n) => v == null ? '—' : n === 'GP%' ? `${v}%` : `₹${v} Mn`} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="l" dataKey="Booked Rev (₹Mn)" stackId="rev" fill="#185FA5" radius={[0,0,0,0]} opacity={0.85} />
                  <Bar yAxisId="l" dataKey="Other Rev (₹Mn)"  stackId="rev" fill="#0F6E56" radius={[3,3,0,0]} opacity={0.85} />
                  <Line yAxisId="r" type="monotone" dataKey="GP%" stroke="#D97706" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly detail table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50">
                <h3 className="font-semibold text-gray-800 text-sm">Monthly Revenue Detail (₹ Mn)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left sticky left-0 bg-gray-50">Month</th>
                      <th className="px-3 py-2.5 text-right">Booked Rev (₹Mn)</th>
                      <th className="px-3 py-2.5 text-right">Other Rev (₹Mn)</th>
                      <th className="px-3 py-2.5 text-right">Gross Rev (₹Mn)</th>
                      <th className="px-3 py-2.5 text-right">GP%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...last24].reverse().map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-white">{r.month}</td>
                        <td className="px-3 py-2.5 text-right text-[#185FA5] font-semibold">{r['Booked Rev (₹Mn)'] != null ? r['Booked Rev (₹Mn)'].toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-[#0F6E56] font-semibold">{r['Other Rev (₹Mn)'] != null ? r['Other Rev (₹Mn)'].toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{r['Gross Rev (₹Mn)'] != null ? r['Gross Rev (₹Mn)'].toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-[#D97706] font-semibold">{r['GP%'] != null ? `${r['GP%']}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Brokerage ── */}
      {tab === 'brokerage' && (
        <div className="space-y-6">
          {broking?.items?.length > 0 ? (
            <>
              <div className="grid grid-cols-4 gap-3">
                {broking.items.filter(item => item.label !== 'EBITDA').map(item => {
                  const lastVal = [...item.values].reverse().find(v => v !== 0 && v != null);
                  return (
                    <KPI
                      key={item.label}
                      label={item.label}
                      value={lastVal != null ? `₹${lastVal.toLocaleString()}` : '—'}
                      sub="Latest month · ₹ Lakhs"
                      color={item.label.includes('Loss') || (lastVal != null && lastVal < 0) ? '#DC2626' : '#185FA5'}
                    />
                  );
                })}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 text-sm mb-4">Broking Business — Monthly P&L (₹ Lakhs)</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart
                    data={broking.dates.map((d, i) => {
                      const obj = { month: d };
                      broking.items.forEach(item => { obj[item.label] = item.values[i]; });
                      return obj;
                    })}
                    margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${v}`} width={55} />
                    <Tooltip formatter={v => `₹${v?.toLocaleString()}`} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Total Income" fill="#185FA5" opacity={0.8} radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="Net Profit/(Loss)" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50">
                  <h3 className="font-semibold text-gray-800 text-sm">Broking IS — Monthly Detail (₹ Lakhs)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                        <th className="px-4 py-2.5 text-left sticky left-0 bg-gray-50">Metric</th>
                        {broking.dates.map(d => <th key={d} className="px-3 py-2.5 text-right whitespace-nowrap">{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {broking.items.filter(item => item.label !== 'EBITDA').map((item, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-white">{item.label}</td>
                          {item.values.map((v, j) => (
                            <td key={j} className={`px-3 py-2.5 text-right ${v < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                              {v == null || v === 0 ? '—' : v.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-400 text-sm p-6">No broking data available.</div>
          )}
        </div>
      )}

      {/* ── Broking Packs ── */}
      {tab === 'brokingpacks' && (
        <div className="space-y-6">
          {brokingPacks?.rows?.length > 0 ? (() => {
            const t = brokingPacks.totals;
            const revenueL   = +(t.revenue / 100000).toFixed(2);
            const utilPct    = t.txnSold ? +((t.txnUtilized / t.txnSold) * 100).toFixed(1) : 0;
            const expiredPct = t.txnSold ? +((t.txnExpired  / t.txnSold) * 100).toFixed(1) : 0;
            const balancePct = t.txnSold ? +((t.txnBalance  / t.txnSold) * 100).toFixed(1) : 0;
            const chartData = brokingPacks.rows.map(r => ({
              month: r.month,
              'Trades Sold': r.txnSold,
              'Utilized': r.txnUtilized,
              'Expired': r.txnExpired,
              'Balance': r.txnBalance,
            }));
            return (
              <>
                {/* KPI strip */}
                <div className="grid grid-cols-4 gap-3">
                  <KPI label="Total Plans Sold" value={t.plans.toLocaleString()} sub="Across all expiry months" color="#185FA5" />
                  <KPI label="Total Revenue" value={`₹${revenueL}L`} sub="All packs combined" color="#0F6E56" />
                  <KPI label="Trades Sold" value={t.txnSold.toLocaleString()} sub={`Utilized ${utilPct}% · Balance ${balancePct}%`} color="#7C3AED" />
                  <KPI label="Trades Expired" value={t.txnExpired.toLocaleString()} sub={`${expiredPct}% of total trades sold`} color={t.txnExpired > 0 ? '#DC2626' : '#0F6E56'} />
                </div>

                {/* Stacked bar chart by month */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-semibold text-gray-800 text-sm mb-4">Trades by Expiry Month — Sold vs Utilized vs Expired vs Balance</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={chartData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v.toLocaleString()} width={70} />
                      <Tooltip formatter={v => v.toLocaleString()} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="Trades Sold" fill="#CBD5E1" radius={[3,3,0,0]} />
                      <Bar dataKey="Utilized" fill="#0F6E56" radius={[3,3,0,0]} />
                      <Bar dataKey="Expired" fill="#DC2626" radius={[3,3,0,0]} />
                      <Bar dataKey="Balance" fill="#185FA5" radius={[3,3,0,0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly detail table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b bg-gray-50">
                    <h3 className="font-semibold text-gray-800 text-sm">Broking Packs — Monthly Breakdown</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                          <th className="px-4 py-2.5 text-left sticky left-0 bg-gray-50">Expiry Month</th>
                          <th className="px-3 py-2.5 text-right">Plans</th>
                          <th className="px-3 py-2.5 text-right">Trades Sold</th>
                          <th className="px-3 py-2.5 text-right">Utilized</th>
                          <th className="px-3 py-2.5 text-right">Expired</th>
                          <th className="px-3 py-2.5 text-right">Balance</th>
                          <th className="px-3 py-2.5 text-right">Revenue</th>
                          <th className="px-3 py-2.5 text-right">Cost/Trade</th>
                          <th className="px-3 py-2.5 text-right">Util%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brokingPacks.rows.map((r, i) => {
                          const rUtil = r.txnSold ? +((r.txnUtilized / r.txnSold) * 100).toFixed(1) : 0;
                          return (
                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-white">{r.month}</td>
                              <td className="px-3 py-2.5 text-right text-gray-600">{r.plans.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-gray-600">{r.txnSold.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-[#0F6E56] font-semibold">{r.txnUtilized.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right text-red-600 font-semibold">{r.txnExpired > 0 ? r.txnExpired.toLocaleString() : '—'}</td>
                              <td className="px-3 py-2.5 text-right text-[#185FA5] font-semibold">{r.txnBalance > 0 ? r.txnBalance.toLocaleString() : '—'}</td>
                              <td className="px-3 py-2.5 text-right text-gray-600">₹{+(r.revenue / 100000).toFixed(2)}L</td>
                              <td className="px-3 py-2.5 text-right text-[#7C3AED]">₹{r.costPerTrade.toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-right font-bold" style={{ color: rUtil >= 50 ? '#0F6E56' : '#f97316' }}>{rUtil}%</td>
                            </tr>
                          );
                        })}
                        {/* Totals row */}
                        <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold text-xs">
                          <td className="px-4 py-2.5 sticky left-0 bg-gray-100">Total</td>
                          <td className="px-3 py-2.5 text-right">{t.plans.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{t.txnSold.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-[#0F6E56]">{t.txnUtilized.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-red-600">{t.txnExpired > 0 ? t.txnExpired.toLocaleString() : '—'}</td>
                          <td className="px-3 py-2.5 text-right text-[#185FA5]">{t.txnBalance.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">₹{revenueL}L</td>
                          <td className="px-3 py-2.5 text-right">—</td>
                          <td className="px-3 py-2.5 text-right text-[#7C3AED]">{utilPct}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })() : (
            <div className="text-gray-400 text-sm p-6">No Broking Packs data available.</div>
          )}
        </div>
      )}

      {/* ── iOS Conversion ── */}
      {tab === 'ios' && (
        <div className="space-y-6">
          {iosConversion.length > 0 ? (() => {
            // Cap at Apr 26 — exclude incomplete current month
            const upToApr26 = iosConversion.filter(r => r.ym <= '2026-04');
            const recent = upToApr26.slice(-13);
            // Use Apr 26 as display month (May 26 is incomplete)
            const apr26  = iosConversion.find(r => r.ym === '2026-04') || iosConversion[iosConversion.length - 2];
            const latest = apr26 || iosConversion[iosConversion.length - 1];
            const prev   = iosConversion[iosConversion.indexOf(latest) - 1] || {};
            const grandSignups  = iosConversion.reduce((s, r) => s + (r.signups || 0), 0);
            const grandRevInrCr = +(iosConversion.reduce((s, r) => s + (r.revenueInrL || 0), 0) / 100).toFixed(2);
            return (
              <>
                {/* KPI strip */}
                <div className="grid grid-cols-5 gap-3">
                  <KPI label={`D0 Conversion (${latest.month})`} value={`${latest.d0Pct}%`} sub={`vs ${prev.d0Pct}% prev month`} color="#185FA5" />
                  <KPI label={`D30 Conversion (${latest.month})`} value={`${latest.d30Pct}%`} sub={`vs ${prev.d30Pct}% prev month`} color="#0F6E56" />
                  <KPI label={`Till Date (${latest.month})`} value={`${latest.tillDatePct}%`} sub="Cumulative conversion" color="#7C3AED" />
                  <KPI label={`Signups (${latest.month})`} value={(latest.signups || 0).toLocaleString()} sub={`Total: ${grandSignups.toLocaleString()}`} color="#f97316" />
                  <KPI label={`Revenue (${latest.month})`} value={`₹${latest.revenueInrL}L`} sub={`Total: ₹${grandRevInrCr} Cr`} color="#185FA5" />
                </div>

                {/* Conversion rate trend chart */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-semibold text-gray-800 text-sm mb-1">iOS Conversion Rate Trend — Monthly</h3>
                  <p className="text-[11px] text-gray-400 mb-4">D0 = same-day · D30 = within 30 days · Till Date = cumulative</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={recent} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} width={40} />
                      <Tooltip formatter={(v, n) => [`${v}%`, n]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="d0Pct" name="D0 %" stroke="#185FA5" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="d30Pct" name="D30 %" stroke="#0F6E56" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="tillDatePct" name="Till Date %" stroke="#7C3AED" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
                      {recent[0]?.trialPct != null && (
                        <Line type="monotone" dataKey="trialPct" name="Trial %" stroke="#f97316" strokeWidth={1.5} strokeDasharray="3 2" dot={{ r: 2 }} connectNulls />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Signups & Revenue chart */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-semibold text-gray-800 text-sm mb-4">iOS Signups & Revenue — Monthly</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={recent} margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                      <YAxis yAxisId="l" tick={{ fontSize: 9 }} tickFormatter={v => v.toLocaleString()} width={55} />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `₹${v}L`} width={55} />
                      <Tooltip formatter={(v, n) => n === 'Revenue (₹L)' ? [`₹${v}L`, n] : [v.toLocaleString(), n]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar yAxisId="l" dataKey="signups" name="Signups" fill="#185FA5" opacity={0.8} radius={[3,3,0,0]} />
                      <Line yAxisId="r" type="monotone" dataKey="revenueInrL" name="Revenue (₹L)" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Detail table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b bg-gray-50">
                    <h3 className="font-semibold text-gray-800 text-sm">iOS Post-Trial Conversion — Monthly Detail</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                          <th className="px-4 py-2.5 text-left sticky left-0 bg-gray-50">Month</th>
                          <th className="px-3 py-2.5 text-right">Signups</th>
                          <th className="px-3 py-2.5 text-right">D0 Conv%</th>
                          <th className="px-3 py-2.5 text-right">D30 Conv%</th>
                          <th className="px-3 py-2.5 text-right">Till Date%</th>
                          <th className="px-3 py-2.5 text-right">Trial%</th>
                          <th className="px-3 py-2.5 text-right">Revenue (₹L)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...iosConversion].reverse().map((r, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-white">{r.month}</td>
                            <td className="px-3 py-2.5 text-right text-gray-600">{r.signups?.toLocaleString() ?? '—'}</td>
                            <td className="px-3 py-2.5 text-right text-[#185FA5] font-semibold">{r.d0Pct != null ? `${r.d0Pct}%` : '—'}</td>
                            <td className="px-3 py-2.5 text-right text-[#0F6E56] font-semibold">{r.d30Pct != null ? `${r.d30Pct}%` : '—'}</td>
                            <td className="px-3 py-2.5 text-right text-[#7C3AED] font-semibold">{r.tillDatePct != null ? `${r.tillDatePct}%` : '—'}</td>
                            <td className="px-3 py-2.5 text-right text-orange-500">{r.trialPct != null ? `${r.trialPct}%` : '—'}</td>
                            <td className="px-3 py-2.5 text-right text-gray-600">{r.revenueInrL != null ? `₹${r.revenueInrL.toLocaleString()}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })() : (
            <div className="text-gray-400 text-sm p-6">No iOS conversion data available.</div>
          )}
        </div>
      )}

      {/* ── Analytics Report ── */}
      {tab === 'analytics' && <AnalyticsReport />}

      {/* ── Summary ── */}
      {tab === 'summary' && (
        <div className="space-y-6">
          {/* Headline */}
          <div className="bg-gradient-to-r from-[#0F6E56] to-[#185FA5] rounded-xl px-6 py-5 text-white">
            <h2 className="text-lg font-bold">Company Highlights — What's Working</h2>
            <p className="text-sm text-white/70 mt-1">Key strengths and positive momentum as of May 2026</p>
          </div>

          {/* 2-column highlights grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Scale */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
              <div className="text-xs font-bold text-[#185FA5] uppercase tracking-wide border-b pb-2">Scale & Revenue</div>
              {[
                { label: 'Total Paying Users', value: '4,31,729', note: '1.7x more than Tejimandi (2.6L)' },
                { label: 'Total Revenue (till date)', value: isSummary?.totalRevenueInrCr ? `₹${isSummary.totalRevenueInrCr} Cr` : '₹177 Cr', note: isSummary?.basis || '1st txn 62% · Repeat 38%' },
                { label: `ARR (${isSummary?.latestMonth || "Mar '26"})`, value: isSummary?.arrUsdM ? `$${isSummary.arrUsdM}M` : '$30M', note: isSummary?.arrInrCr ? `₹${isSummary.arrInrCr} Cr annualized · ${isSummary.basis}` : '5x growth YoY' },
              ].map(h => (
                <div key={h.label} className="flex items-start gap-3">
                  <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                  <div>
                    <div className="text-xs font-semibold text-gray-800">{h.label} — <span className="text-[#185FA5]">{h.value}</span></div>
                    <div className="text-[11px] text-gray-400">{h.note}</div>
                  </div>
                </div>
              ))}
            </div>



            {/* Growth momentum from CAC data */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
              <div className="text-xs font-bold text-[#f97316] uppercase tracking-wide border-b pb-2">Growth Momentum</div>
              {cac.slice(-3).reverse().map(r => (
                <div key={r.month} className="flex items-start gap-3">
                  <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                  <div>
                    <div className="text-xs font-semibold text-gray-800">{r.month} — <span className="text-[#f97316]">{r.conversions.toLocaleString()} new users</span></div>
                    <div className="text-[11px] text-gray-400">{r.signups.toLocaleString()} signups · ₹{r.signupCac?.toLocaleString()} signup CAC · ₹{r.newUserCac?.toLocaleString()} user CAC</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Competitive wins banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <div className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3">Competitive Position</div>
            <p className="text-sm text-gray-700 leading-relaxed">{competitive.verdict}</p>
            <div className="mt-3 flex gap-2">
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">Univest {competitive.univestWins} wins</span>
              <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">Tejimandi {competitive.tmWins} wins</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
