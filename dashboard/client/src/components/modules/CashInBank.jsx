import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';
import { useStore } from '../../store/useStore';
import { fmtINR, getChangeColor, CHART_COLORS, shortMonthName } from '../../utils/format';

const COMPANY_COLORS = {
  Uniresearch: '#f59e0b',
  Univest: '#3b82f6',
  Uniapps: '#22c55e',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs">
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

function BankAccountCard({ account, companyName, companyColor, rank }) {
  const change = account.closingBalance - account.openingBalance;
  const changePct = account.openingBalance > 0
    ? ((change / account.openingBalance) * 100)
    : 0;
  const isPositive = change >= 0;

  return (
    <div className="card p-0 overflow-hidden">
      {/* Colored top strip */}
      <div className="h-1" style={{ background: companyColor }} />
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-bloomberg-text truncate">{account.accountName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-medium" style={{ color: companyColor }}>{companyName}</span>
              <span className="text-bloomberg-muted text-[10px]">•</span>
              <span className="text-bloomberg-muted text-[10px] capitalize">{account.accountType || 'bank'}</span>
              {account.currency && account.currency !== 'INR' && (
                <span className="badge badge-amber text-[9px]">{account.currency}</span>
              )}
            </div>
          </div>
          <div className={`badge flex-shrink-0 ${isPositive ? 'badge-green' : 'badge-red'}`}>
            {isPositive ? '▲' : '▼'} {Math.abs(changePct).toFixed(1)}%
          </div>
        </div>

        {/* Closing balance — big number */}
        <div>
          <div className="text-[10px] text-bloomberg-muted uppercase tracking-wider mb-0.5">Current Balance</div>
          <div className="text-2xl font-bold tabular-nums text-bloomberg-accent">
            {fmtINR(account.closingBalance)}
          </div>
        </div>

        {/* Opening / Net row */}
        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-bloomberg-border">
          <div>
            <div className="text-[10px] text-bloomberg-muted uppercase">Opening</div>
            <div className="text-xs tabular-nums text-bloomberg-subtle font-medium">{fmtINR(account.openingBalance, true)}</div>
          </div>
          <div>
            <div className="text-[10px] text-bloomberg-muted uppercase">Inflows</div>
            <div className="text-xs tabular-nums text-bloomberg-green font-medium">{fmtINR(account.totalInflow, true)}</div>
          </div>
          <div>
            <div className="text-[10px] text-bloomberg-muted uppercase">Outflows</div>
            <div className="text-xs tabular-nums text-bloomberg-red font-medium">{fmtINR(account.totalOutflow, true)}</div>
          </div>
        </div>

        {/* Net change bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-bloomberg-muted">Net Movement</span>
            <span className={`tabular-nums font-medium ${getChangeColor(change)}`}>
              {change >= 0 ? '+' : ''}{fmtINR(change, true)}
            </span>
          </div>
          <div className="h-1.5 bg-bloomberg-border rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{
                width: `${Math.min(100, Math.abs(changePct) * 2)}%`,
                background: isPositive ? CHART_COLORS.inflow : CHART_COLORS.outflow,
              }}
            />
          </div>
        </div>

        {/* Txn count */}
        {account.count > 0 && (
          <div className="text-[10px] text-bloomberg-muted">{account.count} transactions</div>
        )}
      </div>
    </div>
  );
}

export default function CashInBank() {
  const { dashboardData, selectedCompany } = useStore();
  const [viewMode, setViewMode] = useState('accounts'); // 'accounts' | 'trend' | 'compare'

  if (!dashboardData) return <div className="text-bloomberg-muted p-8 text-center text-sm">No data loaded.</div>;

  const companies = dashboardData.companies;
  const filteredCompanies = selectedCompany === 'all'
    ? companies
    : companies.filter((c) => c.companyName === selectedCompany);

  // Flat list of all bank accounts — prefer balance sheet data if available
  const allAccounts = filteredCompanies.flatMap(({ companyName, report, balanceSheet }) => {
    const color = COMPANY_COLORS[companyName] || '#94a3b8';
    // If balance sheet bank accounts exist, use them as authoritative closing balance
    if (balanceSheet?.bankAccounts?.length) {
      return balanceSheet.bankAccounts
        .filter((b) => b.balance !== 0)
        .map((b) => {
          // Try to match with bankWiseBreakdown for inflow/outflow detail
          const bwb = (report.bankWiseBreakdown || []).find(
            (r) => r.accountId === b.accountId || r.accountName === b.accountName
          );
          return {
            accountId: b.accountId,
            accountName: b.accountName,
            accountType: bwb?.accountType || 'bank',
            currency: bwb?.currency || 'INR',
            openingBalance: bwb?.openingBalance || 0,
            closingBalance: b.balance,          // from balance sheet — authoritative
            totalInflow: bwb?.totalInflow || 0,
            totalOutflow: bwb?.totalOutflow || 0,
            count: bwb?.count || 0,
            companyName,
            companyColor: color,
            fromBalanceSheet: true,
          };
        });
    }
    // Fallback: use transaction-derived bankWiseBreakdown
    return (report.bankWiseBreakdown || [])
      .filter((b) => b.closingBalance > 0 || b.openingBalance > 0)
      .map((b) => ({ ...b, companyName, companyColor: color }));
  }).sort((a, b) => b.closingBalance - a.closingBalance);

  // Use balance sheet totals for headline if available
  const bsTotalBank = filteredCompanies.reduce((s, c) => s + (c.balanceSheet?.totalBankBalance || 0), 0);
  const totalClosing = bsTotalBank > 0 ? bsTotalBank : allAccounts.reduce((a, b) => a + b.closingBalance, 0);
  const totalOpening = allAccounts.reduce((a, b) => a + b.openingBalance, 0);
  const totalNet = totalClosing - totalOpening;

  // Pie chart: each bank account as segment
  const pieData = allAccounts
    .filter((b) => b.closingBalance > 0)
    .map((b, i) => ({
      name: `${b.companyName.slice(0, 4)} – ${b.accountName.slice(0, 18)}`,
      value: b.closingBalance,
      fill: CHART_COLORS.companies[i % CHART_COLORS.companies.length],
    }));

  // Per-company totals for comparison bar
  const companyTotals = filteredCompanies.map(({ companyName, report }) => {
    const accounts = report.bankWiseBreakdown || [];
    return {
      name: companyName,
      Opening: accounts.reduce((a, b) => a + (b.openingBalance || 0), 0),
      Closing: accounts.reduce((a, b) => a + (b.closingBalance || 0), 0),
      Inflow: accounts.reduce((a, b) => a + (b.totalInflow || 0), 0),
      Outflow: accounts.reduce((a, b) => a + (b.totalOutflow || 0), 0),
    };
  });

  // Monthly trend (aggregate across filtered companies)
  const monthlyMap = {};
  filteredCompanies.forEach(({ report }) => {
    (report.monthlyBreakdown || []).forEach((m) => {
      if (!monthlyMap[m.month]) monthlyMap[m.month] = { month: m.month, name: shortMonthName(m.month), Inflow: 0, Outflow: 0 };
      monthlyMap[m.month].Inflow += m.inflow;
      monthlyMap[m.month].Outflow += m.outflow;
    });
  });
  let runningBalance = totalOpening;
  const monthlyTrend = Object.values(monthlyMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => {
      runningBalance += m.Inflow - m.Outflow;
      return { ...m, Balance: Math.round(runningBalance) };
    });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Top Summary ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="metric-label mb-1">Total Bank Balance</div>
          <div className="text-2xl font-bold tabular-nums text-bloomberg-accent">{fmtINR(totalClosing)}</div>
          <div className="text-[10px] text-bloomberg-muted mt-1">
            {allAccounts.length} accounts
            {bsTotalBank > 0 && <span className="ml-1 text-bloomberg-green">• Balance Sheet</span>}
          </div>
        </div>
        <div className="card p-4">
          <div className="metric-label mb-1">Opening Balance</div>
          <div className="text-xl font-bold tabular-nums text-bloomberg-subtle">{fmtINR(totalOpening)}</div>
        </div>
        <div className="card p-4">
          <div className="metric-label mb-1">Net Movement</div>
          <div className={`text-xl font-bold tabular-nums ${getChangeColor(totalNet)}`}>
            {totalNet >= 0 ? '+' : ''}{fmtINR(totalNet)}
          </div>
        </div>
        <div className="card p-4">
          <div className="metric-label mb-1">Balance Change</div>
          <div className={`text-2xl font-bold tabular-nums ${getChangeColor(totalNet)}`}>
            {totalOpening > 0 ? ((totalNet / totalOpening) * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      {/* ── View Toggle ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-bloomberg-border">
        {[
          { id: 'accounts', label: '🏦 Account Cards' },
          { id: 'compare', label: '📊 Company Compare' },
          { id: 'trend', label: '📈 Balance Trend' },
          { id: 'table', label: '📋 Table View' },
        ].map((v) => (
          <button key={v.id} onClick={() => setViewMode(v.id)}
            className={`tab-btn ${viewMode === v.id ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── Account Cards View ────────────────────────────────────────────── */}
      {viewMode === 'accounts' && (
        <div className="space-y-4">
          {/* Donut + cards side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Donut */}
            <div className="card">
              <div className="card-header">
                <span className="text-sm font-medium text-bloomberg-subtle">Balance Distribution</span>
              </div>
              <div className="p-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                      paddingAngle={2} dataKey="value" nameKey="name">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtINR(v, true)} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per-company summary pills */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              {filteredCompanies.map(({ companyName, report }) => {
                const accts = report.bankWiseBreakdown || [];
                const total = accts.reduce((a, b) => a + (b.closingBalance || 0), 0);
                const opening = accts.reduce((a, b) => a + (b.openingBalance || 0), 0);
                const net = total - opening;
                const color = COMPANY_COLORS[companyName] || '#94a3b8';
                return (
                  <div key={companyName} className="card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-sm font-bold text-bloomberg-text">{companyName}</span>
                    </div>
                    <div className="text-xl font-bold tabular-nums text-bloomberg-accent mb-1">
                      {fmtINR(total, true)}
                    </div>
                    <div className={`text-xs tabular-nums ${getChangeColor(net)}`}>
                      {net >= 0 ? '+' : ''}{fmtINR(net, true)} vs opening
                    </div>
                    <div className="text-[10px] text-bloomberg-muted mt-2">{accts.length} accounts</div>
                    <div className="h-1 bg-bloomberg-border rounded mt-2 overflow-hidden">
                      <div className="h-full rounded" style={{
                        width: `${Math.min(100, (total / totalClosing) * 100)}%`,
                        background: color,
                      }} />
                    </div>
                    <div className="text-[10px] text-bloomberg-muted mt-1">
                      {totalClosing > 0 ? ((total / totalClosing) * 100).toFixed(1) : 0}% of group total
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Individual bank account cards — grouped by company, using BS data */}
          {filteredCompanies.map(({ companyName }) => {
            const accts = allAccounts
              .filter((b) => b.companyName === companyName)
              .sort((a, b) => b.closingBalance - a.closingBalance);
            if (!accts.length) return null;
            const color = COMPANY_COLORS[companyName] || '#94a3b8';
            return (
              <div key={companyName}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <h3 className="text-sm font-bold text-bloomberg-text">{companyName}</h3>
                  <span className="text-bloomberg-muted text-xs">— {accts.length} bank account{accts.length !== 1 ? 's' : ''}</span>
                  {accts[0]?.fromBalanceSheet && <span className="badge badge-green text-[9px]">Balance Sheet</span>}
                  <div className="flex-1 h-px bg-bloomberg-border" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {accts.map((acc, i) => (
                    <BankAccountCard
                      key={acc.accountId || i}
                      account={acc}
                      companyName={companyName}
                      companyColor={color}
                      rank={i + 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Company Compare View ──────────────────────────────────────────── */}
      {viewMode === 'compare' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium text-bloomberg-subtle">Opening vs Closing by Company</span>
            </div>
            <div className="p-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={companyTotals}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={60} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Opening" fill="#64748b" maxBarSize={30} />
                  <Bar dataKey="Closing" fill={CHART_COLORS.net} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="text-sm font-medium text-bloomberg-subtle">Inflow vs Outflow by Company</span>
            </div>
            <div className="p-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={companyTotals}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={60} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Inflow" fill={CHART_COLORS.inflow} maxBarSize={30} />
                  <Bar dataKey="Outflow" fill={CHART_COLORS.outflow} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Trend View ────────────────────────────────────────────────────── */}
      {viewMode === 'trend' && (
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">Estimated Running Bank Balance</span>
            <span className="text-xs text-bloomberg-muted">Based on monthly inflow/outflow</span>
          </div>
          <div className="p-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={65} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Line dataKey="Balance" name="Est. Balance" stroke={CHART_COLORS.net} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.net }} />
                <Line dataKey="Inflow" stroke={CHART_COLORS.inflow} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line dataKey="Outflow" stroke={CHART_COLORS.outflow} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Table View ────────────────────────────────────────────────────── */}
      {viewMode === 'table' && (
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">All Bank Accounts</span>
            <span className="text-xs text-bloomberg-muted">{allAccounts.length} accounts</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Account Name</th>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Opening</th>
                  <th>Inflows</th>
                  <th>Outflows</th>
                  <th>Closing Balance</th>
                  <th>Net Change</th>
                </tr>
              </thead>
              <tbody>
                {allAccounts.map((acc, i) => {
                  const net = acc.closingBalance - acc.openingBalance;
                  return (
                    <tr key={i}>
                      <td className="font-medium">{acc.accountName}</td>
                      <td>
                        <span className="text-xs font-medium" style={{ color: acc.companyColor }}>
                          {acc.companyName}
                        </span>
                      </td>
                      <td className="text-bloomberg-muted capitalize text-xs">{acc.accountType || 'bank'}</td>
                      <td className="text-bloomberg-subtle">{fmtINR(acc.openingBalance, true)}</td>
                      <td className="text-bloomberg-green">{fmtINR(acc.totalInflow, true)}</td>
                      <td className="text-bloomberg-red">{fmtINR(acc.totalOutflow, true)}</td>
                      <td className="text-bloomberg-accent font-bold">{fmtINR(acc.closingBalance, true)}</td>
                      <td className={`font-medium ${getChangeColor(net)}`}>
                        {net >= 0 ? '+' : ''}{fmtINR(net, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2 border-bloomberg-border">
                  <td colSpan={3} className="font-bold text-bloomberg-subtle">TOTAL</td>
                  <td className="font-bold text-bloomberg-subtle">{fmtINR(totalOpening, true)}</td>
                  <td className="font-bold text-bloomberg-green">
                    {fmtINR(allAccounts.reduce((a, b) => a + (b.totalInflow || 0), 0), true)}
                  </td>
                  <td className="font-bold text-bloomberg-red">
                    {fmtINR(allAccounts.reduce((a, b) => a + (b.totalOutflow || 0), 0), true)}
                  </td>
                  <td className="font-bold text-bloomberg-accent">{fmtINR(totalClosing, true)}</td>
                  <td className={`font-bold ${getChangeColor(totalNet)}`}>
                    {totalNet >= 0 ? '+' : ''}{fmtINR(totalNet, true)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
