import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line, Cell,
} from 'recharts';
import { useStore } from '../../store/useStore';
import { fmtINR, fmtCount, getChangeColor, CHART_COLORS, shortMonthName } from '../../utils/format';

function SummaryCard({ label, value, sub, color = 'text-bloomberg-accent' }) {
  return (
    <div className="card p-4">
      <div className="metric-label mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{fmtINR(value)}</div>
      {sub && <div className="text-[10px] text-bloomberg-muted mt-1">{sub}</div>}
    </div>
  );
}

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

function WaterfallBar({ value, isNet }) {
  const color = isNet
    ? (value >= 0 ? CHART_COLORS.inflow : CHART_COLORS.outflow)
    : value > 0 ? CHART_COLORS.inflow : CHART_COLORS.outflow;
  return <Cell fill={color} />;
}

export default function CashflowStatement() {
  const { dashboardData, selectedCompany } = useStore();
  const [activeTab, setActiveTab] = useState('monthly');
  const [drillCompany, setDrillCompany] = useState(null);

  if (!dashboardData) return <div className="text-bloomberg-muted p-8 text-center text-sm">No data loaded.</div>;

  // Determine which data to show
  const isAll = selectedCompany === 'all';
  const companies = dashboardData.companies;
  const consolidated = dashboardData.consolidated;

  // Build monthly chart data
  const getMonthlyData = (report) => {
    return (report.monthlyBreakdown || []).map((m) => ({
      name: shortMonthName(m.month),
      month: m.month,
      Inflow: m.inflow,
      Outflow: m.outflow,
      Net: m.net,
    }));
  };

  // For consolidated: aggregate months across companies
  const consolidatedMonthly = (() => {
    const map = {};
    companies.forEach(({ report }) => {
      (report.monthlyBreakdown || []).forEach((m) => {
        if (!map[m.month]) map[m.month] = { month: m.month, name: shortMonthName(m.month), Inflow: 0, Outflow: 0, Net: 0 };
        map[m.month].Inflow += m.inflow;
        map[m.month].Outflow += m.outflow;
        map[m.month].Net += m.net;
      });
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  })();

  const activeReport = isAll
    ? { summary: consolidated.summary, monthlyBreakdown: [] }
    : companies.find((c) => c.companyName === selectedCompany)?.report;

  const monthlyData = isAll ? consolidatedMonthly : getMonthlyData(activeReport);

  // Waterfall data for summary
  const waterfallData = [
    { name: 'Opening', value: consolidated.summary.openingBalance, isNet: false, isBase: true },
    { name: 'Operating', value: consolidated.summary.netOperatingCashFlow, isNet: true },
    { name: 'Investing', value: consolidated.summary.netInvestingCashFlow, isNet: true },
    { name: 'Financing', value: consolidated.summary.netFinancingCashFlow, isNet: true },
    { name: 'Closing', value: consolidated.summary.closingBalance, isNet: false, isBase: true },
  ];

  // Company comparison
  const companyComparison = companies.map(({ companyName, report }) => ({
    name: companyName.slice(0, 8),
    fullName: companyName,
    Inflow: report.summary.totalInflow,
    Outflow: report.summary.totalOutflow,
    Net: report.summary.netCashFlow,
  }));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <SummaryCard label="Opening Balance" value={consolidated.summary.openingBalance} color="text-bloomberg-subtle" />
        <SummaryCard label="Total Inflows" value={consolidated.summary.totalInflow} color="text-bloomberg-green" />
        <SummaryCard label="Total Outflows" value={consolidated.summary.totalOutflow} color="text-bloomberg-red" />
        <SummaryCard
          label="Net Cash Flow"
          value={consolidated.summary.netCashFlow}
          color={consolidated.summary.netCashFlow >= 0 ? 'text-bloomberg-green' : 'text-bloomberg-red'}
        />
        <SummaryCard label="Closing Balance" value={consolidated.summary.closingBalance} color="text-bloomberg-accent" />
        <div className="card p-4">
          <div className="metric-label mb-1">Operating / Investing / Financing</div>
          <div className="text-xs space-y-1 mt-1">
            <div className="flex justify-between">
              <span className="text-bloomberg-muted">Operating</span>
              <span className={`tabular-nums font-medium ${getChangeColor(consolidated.summary.netOperatingCashFlow)}`}>
                {fmtINR(consolidated.summary.netOperatingCashFlow, true)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bloomberg-muted">Investing</span>
              <span className={`tabular-nums font-medium ${getChangeColor(consolidated.summary.netInvestingCashFlow)}`}>
                {fmtINR(consolidated.summary.netInvestingCashFlow, true)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bloomberg-muted">Financing</span>
              <span className={`tabular-nums font-medium ${getChangeColor(consolidated.summary.netFinancingCashFlow)}`}>
                {fmtINR(consolidated.summary.netFinancingCashFlow, true)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Bar Chart */}
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">Monthly Cash Flow</span>
            <div className="flex gap-1">
              {['monthly', 'comparison', 'waterfall'].map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`tab-btn py-0.5 text-[10px] ${activeTab === t ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 h-64">
            {activeTab === 'monthly' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Inflow" fill={CHART_COLORS.inflow} radius={[2, 2, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="Outflow" fill={CHART_COLORS.outflow} radius={[2, 2, 0, 0]} maxBarSize={20} />
                  <Line dataKey="Net" stroke={CHART_COLORS.net} dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {activeTab === 'comparison' && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={companyComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Inflow" fill={CHART_COLORS.inflow} maxBarSize={30} />
                  <Bar dataKey="Outflow" fill={CHART_COLORS.outflow} maxBarSize={30} />
                  <Bar dataKey="Net" fill={CHART_COLORS.net} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {activeTab === 'waterfall' && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" maxBarSize={40}>
                    {waterfallData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isBase
                          ? CHART_COLORS.net
                          : entry.value >= 0 ? CHART_COLORS.inflow : CHART_COLORS.outflow}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Monthly Breakdown Table */}
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">Monthly Drill-down</span>
          </div>
          <div className="overflow-auto max-h-64">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Inflows</th>
                  <th>Outflows</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m) => (
                  <tr key={m.month}>
                    <td className="font-medium">{m.name}</td>
                    <td className="text-bloomberg-green">{fmtINR(m.Inflow, true)}</td>
                    <td className="text-bloomberg-red">{fmtINR(m.Outflow, true)}</td>
                    <td className={getChangeColor(m.Net)}>{fmtINR(m.Net, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Company-wise Inflow/Outflow Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {companies.map(({ companyName, report, source, error }, idx) => {
          const isFocapsNoData = source === 'focaps' && report.reportMeta?.totalTransactions === 0;
          const isRateLimited = error && (error.includes('429') || error.includes('rate limit') || error.includes('2,000'));
          const hasError = error && !isRateLimited;
          return (
          <div key={companyName} className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS.companies[idx] }} />
                <span className="text-sm font-medium text-bloomberg-subtle">{companyName}</span>
                {source === 'focaps' && (
                  <span className="badge badge-amber text-[9px]">Univest BO</span>
                )}
                {isRateLimited && <span className="badge badge-amber text-[9px]">Rate Limited</span>}
                {hasError && <span className="badge badge-red text-[9px]">Error</span>}
              </div>
              <div className="flex items-center gap-2">
                {!isFocapsNoData && !isRateLimited && (
                  <span className={`badge ${report.summary.netCashFlow >= 0 ? 'badge-green' : 'badge-red'}`}>
                    {fmtINR(report.summary.netCashFlow, true)}
                  </span>
                )}
              </div>
            </div>
            {isFocapsNoData ? (
              <div className="p-4 text-center space-y-2">
                <div className="text-bloomberg-amber text-xs font-semibold uppercase tracking-wider">
                  Connected — Report Access Pending
                </div>
                <div className="text-bloomberg-muted text-[10px] leading-relaxed">
                  Logged in to Univest Back Office (Focaps) successfully.<br/>
                  Financial reports require Focaps report permissions.
                </div>
                <div className="text-[10px] text-bloomberg-muted border-t border-bloomberg-border pt-2 mt-2">
                  Broker: BSE_CASH &nbsp;|&nbsp; Exchange: BSE &nbsp;|&nbsp; Segment: TRADING
                </div>
              </div>
            ) : isRateLimited ? (
              <div className="p-4 text-center space-y-2">
                <div className="text-bloomberg-amber text-xs font-semibold uppercase tracking-wider">
                  API Limit Reached — Data Unavailable
                </div>
                <div className="text-bloomberg-muted text-[10px] leading-relaxed">
                  Zoho Books daily API limit (2,000 calls) has been reached.<br/>
                  Data will be available again after midnight IST.<br/>
                  Dashboard now caches data for 10 minutes to prevent this.
                </div>
              </div>
            ) : (
              <div className="p-4 grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] text-bloomberg-muted uppercase">Inflow</div>
                  <div className="text-bloomberg-green font-bold text-sm">{fmtINR(report.summary.totalInflow, true)}</div>
                  <div className="text-[10px] text-bloomberg-muted mt-1">
                    Cust. Pymt: {fmtINR(report.inflows?.customerPayments?.total, true)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-bloomberg-muted uppercase">Outflow</div>
                  <div className="text-bloomberg-red font-bold text-sm">{fmtINR(report.summary.totalOutflow, true)}</div>
                  <div className="text-[10px] text-bloomberg-muted mt-1">
                    Vendor: {fmtINR(report.outflows?.vendorPayments?.total, true)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-bloomberg-muted uppercase">Closing Bal.</div>
                  <div className="text-bloomberg-accent font-bold text-sm">{fmtINR(report.summary.closingBalance, true)}</div>
                  <div className="text-[10px] text-bloomberg-muted mt-1">
                    Txns: {fmtCount(report.reportMeta?.totalTransactions)}
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
