import React, { useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useStore } from '../../store/useStore';
import { fmtINR, CHART_COLORS } from '../../utils/format';

const LIQUIDITY_COLORS = {
  'Overnight / Liquid': '#22c55e',
  'Short-term (< 90 days)': '#f59e0b',
  'Medium-term (90-365 days)': '#3b82f6',
  'Long-term (> 1 year)': '#a855f7',
  'Current Account': '#06b6d4',
};

function classifyLiquidity(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('liquid') || n.includes('overnight') || n.includes('savings')) return 'Overnight / Liquid';
  if (n.includes('30') || n.includes('45') || n.includes('60') || n.includes('90')) return 'Short-term (< 90 days)';
  if (n.includes('6 month') || n.includes('180') || n.includes('270') || n.includes('1 year') || n.includes('1yr')) return 'Medium-term (90-365 days)';
  if (n.includes('fd') || n.includes('fixed deposit') || n.includes('term deposit')) return 'Short-term (< 90 days)';
  if (n.includes('mutual fund') || n.includes('mf') || n.includes('sip')) return 'Short-term (< 90 days)';
  if (n.includes('current') || n.includes('od') || n.includes('overdraft')) return 'Current Account';
  return 'Medium-term (90-365 days)';
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs">
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.fill || p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="tabular-nums">{fmtINR(p.value, true)}</span>
        </div>
      ))}
    </div>
  );
}

export default function FundParking() {
  const { dashboardData, selectedCompany } = useStore();

  if (!dashboardData) return <div className="text-bloomberg-muted p-8 text-center text-sm">No data loaded.</div>;

  const companies = dashboardData.companies;
  const filteredCompanies = selectedCompany === 'all'
    ? companies
    : companies.filter((c) => c.companyName === selectedCompany);

  // Build fund parking items from bank accounts + investments
  const parkingItems = [];

  filteredCompanies.forEach(({ companyName, report }) => {
    // Bank accounts
    (report.bankWiseBreakdown || []).forEach((b) => {
      if (b.closingBalance > 0) {
        parkingItems.push({
          name: b.accountName,
          value: b.closingBalance,
          company: companyName,
          type: 'Bank',
          liquidity: classifyLiquidity(b.accountName + ' ' + b.accountType),
          accountType: b.accountType,
        });
      }
    });

    // Investments (outstanding = invested - redeemed)
    (report.investmentBreakdown || []).forEach((iv) => {
      const outstanding = iv.invested - iv.redeemed;
      if (outstanding > 0) {
        parkingItems.push({
          name: iv.name,
          value: outstanding,
          company: companyName,
          type: 'Investment',
          liquidity: classifyLiquidity(iv.name),
          accountType: 'investment',
        });
      }
    });
  });

  const totalFunds = parkingItems.reduce((a, p) => a + p.value, 0);

  // Group by liquidity
  const liquidityMap = {};
  parkingItems.forEach((p) => {
    if (!liquidityMap[p.liquidity]) liquidityMap[p.liquidity] = { name: p.liquidity, value: 0, items: [] };
    liquidityMap[p.liquidity].value += p.value;
    liquidityMap[p.liquidity].items.push(p);
  });
  const liquidityBreakdown = Object.values(liquidityMap).sort((a, b) => b.value - a.value);

  // Group by company
  const companyFundMap = {};
  parkingItems.forEach((p) => {
    if (!companyFundMap[p.company]) companyFundMap[p.company] = { company: p.company, bank: 0, investment: 0 };
    if (p.type === 'Bank') companyFundMap[p.company].bank += p.value;
    else companyFundMap[p.company].investment += p.value;
  });
  const companyFundData = Object.values(companyFundMap);

  // Donut data
  const donutData = liquidityBreakdown.map((l) => ({
    name: l.name,
    value: l.value,
    fill: LIQUIDITY_COLORS[l.name] || '#94a3b8',
  }));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="metric-label mb-1">Total Funds Parked</div>
          <div className="text-xl font-bold tabular-nums text-bloomberg-accent">{fmtINR(totalFunds)}</div>
        </div>
        {liquidityBreakdown.slice(0, 3).map((l) => (
          <div key={l.name} className="card p-4">
            <div className="metric-label mb-1">{l.name}</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: LIQUIDITY_COLORS[l.name] || '#94a3b8' }}>
              {fmtINR(l.value, true)}
            </div>
            <div className="text-[10px] text-bloomberg-muted mt-1">
              {totalFunds > 0 ? ((l.value / totalFunds) * 100).toFixed(1) : 0}% of total
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Liquidity donut */}
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">Liquidity Profile</span>
            <span className="text-xs text-bloomberg-muted">{fmtINR(totalFunds, true)}</span>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {donutData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtINR(v, true)} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Company stacked bar */}
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">By Company — Bank vs Investments</span>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={companyFundData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="company" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => fmtINR(v, true)} tick={{ fontSize: 10 }} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="bank" name="Bank Balance" fill={CHART_COLORS.cyan} stackId="a" />
                <Bar dataKey="investment" name="Investments" fill={CHART_COLORS.purple} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Liquidity Heatmap / Detail Table */}
      {liquidityBreakdown.map((l) => (
        <div key={l.name} className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ background: LIQUIDITY_COLORS[l.name] || '#94a3b8' }} />
              <span className="text-sm font-medium text-bloomberg-subtle">{l.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold tabular-nums text-bloomberg-accent">{fmtINR(l.value, true)}</span>
              <span className="text-[10px] text-bloomberg-muted">
                {totalFunds > 0 ? ((l.value / totalFunds) * 100).toFixed(1) : 0}%
              </span>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Instrument / Account</th>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {l.items.sort((a, b) => b.value - a.value).map((item, i) => (
                  <tr key={i}>
                    <td className="font-medium">{item.name}</td>
                    <td className="text-bloomberg-muted text-xs">{item.company}</td>
                    <td>
                      <span className={`badge ${item.type === 'Bank' ? 'badge-blue' : 'badge-purple'}`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="text-bloomberg-accent">{fmtINR(item.value, true)}</td>
                    <td className="text-bloomberg-muted">
                      {totalFunds > 0 ? ((item.value / totalFunds) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
