import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { useStore } from '../../store/useStore';
import { fmtINR, getChangeColor, CHART_COLORS, shortMonthName } from '../../utils/format';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs min-w-[180px]">
      <div className="text-bloomberg-accent mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="tabular-nums">{fmtINR(p.value, true)}</span>
        </div>
      ))}
    </div>
  );
}

export default function MonthlyOverview() {
  const { dashboardData, selectedCompany } = useStore();
  const [view, setView] = useState('combined'); // 'combined' | 'fd' | 'cash' | 'table'

  if (!dashboardData) return <div className="text-bloomberg-muted p-8 text-center text-sm">No data loaded.</div>;

  const companies = dashboardData.companies;
  const filteredCompanies = selectedCompany === 'all'
    ? companies
    : companies.filter((c) => c.companyName === selectedCompany);

  // ── Build FD month-on-month from investment transactions ──────────────────
  const fdMonthMap = useMemo(() => {
    const map = {};
    filteredCompanies.forEach(({ report }) => {
      (report.investmentBreakdown || []).forEach((iv) => {
        (iv.transactions || []).forEach((t) => {
          const month = t.date ? t.date.substring(0, 7) : null;
          if (!month) return;
          if (!map[month]) map[month] = { month, fdInvested: 0, fdRedeemed: 0 };
          if (t.category === 'outflow') map[month].fdInvested += t.amount;
          else map[month].fdRedeemed += t.amount;
        });
      });
    });
    return map;
  }, [filteredCompanies]);

  // ── Build Cash month-on-month from monthly breakdown ──────────────────────
  const cashMonthMap = useMemo(() => {
    const map = {};
    filteredCompanies.forEach(({ report }) => {
      (report.monthlyBreakdown || []).forEach((m) => {
        if (!map[m.month]) map[m.month] = { month: m.month, cashInflow: 0, cashOutflow: 0 };
        map[m.month].cashInflow += m.inflow;
        map[m.month].cashOutflow += m.outflow;
      });
    });
    return map;
  }, [filteredCompanies]);

  // ── Merge and compute running balances ────────────────────────────────────
  const openingBalance = filteredCompanies.reduce(
    (sum, { report }) => sum + (report.summary?.openingBalance || 0), 0
  );

  // Use balance sheet FD balance as authoritative total (falls back to transaction-based)
  const bsFdTotal = filteredCompanies.reduce(
    (sum, { balanceSheet }) => sum + (balanceSheet?.totalFdBalance || 0), 0
  );
  const bsFdAccrued = filteredCompanies.reduce(
    (sum, { balanceSheet }) => sum + (balanceSheet?.totalAccruedInterest || 0), 0
  );
  const totalFdInvested = filteredCompanies.reduce(
    (sum, { report }) => sum + (report.investmentBreakdown || []).reduce((a, iv) => a + iv.invested, 0), 0
  );
  const totalFdRedeemed = filteredCompanies.reduce(
    (sum, { report }) => sum + (report.investmentBreakdown || []).reduce((a, iv) => a + iv.redeemed, 0), 0
  );
  const totalFdOutstanding = bsFdTotal > 0 ? bsFdTotal : (totalFdInvested - totalFdRedeemed);

  // Use balance sheet bank balance if available
  const bsBankTotal = filteredCompanies.reduce(
    (sum, { balanceSheet }) => sum + (balanceSheet?.totalBankBalance || 0), 0
  );
  const totalCashClosing = bsBankTotal > 0
    ? bsBankTotal
    : filteredCompanies.reduce((sum, { report }) => sum + (report.summary?.closingBalance || 0), 0);

  // Merge all months from both sources
  const allMonths = Array.from(
    new Set([...Object.keys(fdMonthMap), ...Object.keys(cashMonthMap)])
  ).sort();

  let runningCash = openingBalance;
  let runningFdOutstanding = 0;

  const monthlyData = allMonths.map((month) => {
    const fd = fdMonthMap[month] || { fdInvested: 0, fdRedeemed: 0 };
    const cash = cashMonthMap[month] || { cashInflow: 0, cashOutflow: 0 };

    runningCash += cash.cashInflow - cash.cashOutflow;
    runningFdOutstanding += fd.fdInvested - fd.fdRedeemed;

    return {
      month,
      name: shortMonthName(month),
      fdInvested: Math.round(fd.fdInvested),
      fdRedeemed: Math.round(fd.fdRedeemed),
      fdNet: Math.round(fd.fdInvested - fd.fdRedeemed),
      fdOutstanding: Math.round(runningFdOutstanding),
      cashInflow: Math.round(cash.cashInflow),
      cashOutflow: Math.round(cash.cashOutflow),
      cashBalance: Math.round(runningCash),
    };
  });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="metric-label mb-1">Cash in Bank</div>
          <div className="text-2xl font-bold tabular-nums text-bloomberg-accent">{fmtINR(totalCashClosing)}</div>
          <div className="text-[10px] mt-1">
            {bsBankTotal > 0
              ? <span className="text-bloomberg-green">• Balance Sheet</span>
              : <span className="text-bloomberg-muted">Period closing balance</span>}
          </div>
        </div>
        <div className="card p-4">
          <div className="metric-label mb-1">Total FD Balance</div>
          <div className="text-xl font-bold tabular-nums text-bloomberg-blue">{fmtINR(totalFdOutstanding)}</div>
          <div className="text-[10px] mt-1">
            {bsFdTotal > 0
              ? <span className="text-bloomberg-green">• Balance Sheet</span>
              : <span className="text-bloomberg-muted">Net locked in FDs</span>}
          </div>
        </div>
      </div>

      {/* ── View Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-bloomberg-border">
        {[
          { id: 'combined', label: '📊 Combined View' },
          { id: 'cash',     label: '🏦 Cash MoM' },
          { id: 'fd',       label: '🔒 FD MoM' },
          { id: 'table',    label: '📋 Table' },
        ].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`tab-btn ${view === v.id ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── Combined View ─────────────────────────────────────────────────── */}
      {view === 'combined' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cash Balance trend */}
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium text-bloomberg-subtle">Cash Balance — Month on Month</span>
            </div>
            <div className="p-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.net} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.net} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area dataKey="cashBalance" name="Cash Balance" stroke={CHART_COLORS.net}
                    fill="url(#cashGrad)" strokeWidth={2.5} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* FD Outstanding trend */}
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium text-bloomberg-subtle">FD Outstanding — Month on Month</span>
            </div>
            <div className="p-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="fdGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.operating} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.operating} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area dataKey="fdOutstanding" name="FD Outstanding" stroke={CHART_COLORS.operating}
                    fill="url(#fdGrad)" strokeWidth={2.5} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Cash MoM View ─────────────────────────────────────────────────── */}
      {view === 'cash' && (
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">Cash Inflow / Outflow / Balance — Month on Month</span>
          </div>
          <div className="p-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="cashInflow" name="Cash Inflow" fill={CHART_COLORS.inflow} maxBarSize={20} radius={[2,2,0,0]} />
                <Bar dataKey="cashOutflow" name="Cash Outflow" fill={CHART_COLORS.outflow} maxBarSize={20} radius={[2,2,0,0]} />
                <Line dataKey="cashBalance" name="Running Balance" stroke={CHART_COLORS.net}
                  strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── FD MoM View ───────────────────────────────────────────────────── */}
      {view === 'fd' && (
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">FD Invested / Redeemed / Outstanding — Month on Month</span>
          </div>
          <div className="p-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="fdInvested" name="FD Invested" fill={CHART_COLORS.operating} maxBarSize={20} radius={[2,2,0,0]} />
                <Bar dataKey="fdRedeemed" name="FD Redeemed" fill={CHART_COLORS.green} maxBarSize={20} radius={[2,2,0,0]} />
                <Line dataKey="fdOutstanding" name="FD Outstanding" stroke={CHART_COLORS.investing}
                  strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Table View ────────────────────────────────────────────────────── */}
      {view === 'table' && (
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">Month-on-Month Breakdown</span>
            <span className="text-xs text-bloomberg-muted">{monthlyData.length} months</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Cash Inflow</th>
                  <th>Cash Outflow</th>
                  <th>Cash Balance</th>
                  <th>FD Invested</th>
                  <th>FD Redeemed</th>
                  <th>FD Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m) => (
                  <tr key={m.month}>
                    <td className="font-medium">{m.name} {m.month.split('-')[0]}</td>
                    <td className="text-bloomberg-green">{fmtINR(m.cashInflow, true)}</td>
                    <td className="text-bloomberg-red">{fmtINR(m.cashOutflow, true)}</td>
                    <td className={`font-bold ${getChangeColor(m.cashBalance)}`}>{fmtINR(m.cashBalance, true)}</td>
                    <td className="text-bloomberg-blue">{m.fdInvested > 0 ? fmtINR(m.fdInvested, true) : '—'}</td>
                    <td className="text-bloomberg-green">{m.fdRedeemed > 0 ? fmtINR(m.fdRedeemed, true) : '—'}</td>
                    <td className={`font-medium ${getChangeColor(m.fdOutstanding)}`}>
                      {fmtINR(m.fdOutstanding, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-bloomberg-border">
                  <td className="font-bold text-bloomberg-subtle">TOTAL / FINAL</td>
                  <td className="font-bold text-bloomberg-green">
                    {fmtINR(monthlyData.reduce((a, m) => a + m.cashInflow, 0), true)}
                  </td>
                  <td className="font-bold text-bloomberg-red">
                    {fmtINR(monthlyData.reduce((a, m) => a + m.cashOutflow, 0), true)}
                  </td>
                  <td className="font-bold text-bloomberg-accent">{fmtINR(totalCashClosing, true)}</td>
                  <td className="font-bold text-bloomberg-blue">{fmtINR(totalFdInvested, true)}</td>
                  <td className="font-bold text-bloomberg-green">{fmtINR(totalFdRedeemed, true)}</td>
                  <td className={`font-bold ${getChangeColor(totalFdOutstanding)}`}>{fmtINR(totalFdOutstanding, true)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
