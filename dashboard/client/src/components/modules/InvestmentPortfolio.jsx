import React, { useState, useEffect, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useStore } from '../../store/useStore';
import { fmtINR, CHART_COLORS } from '../../utils/format';

export default function InvestmentPortfolio() {
  const { dashboardData, selectedCompany } = useStore();
  const [rates, setRates] = useState({});       // { accountName: ratePercent }
  const [saving, setSaving] = useState(false);

  // Load saved FD rates from server on mount
  useEffect(() => {
    fetch('/api/fd-rates')
      .then((r) => r.json())
      .then((d) => { if (d.ok) setRates(d.rates || {}); })
      .catch(() => {});
  }, []);

  const saveRates = useCallback((newRates) => {
    setSaving(true);
    fetch('/api/fd-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRates),
    })
      .finally(() => setSaving(false));
  }, []);

  const handleRateChange = (accountName, value) => {
    const updated = { ...rates, [accountName]: value };
    setRates(updated);
    saveRates(updated);
  };

  if (!dashboardData) return <div className="text-bloomberg-muted p-8 text-center text-sm">No data loaded.</div>;

  const companies = dashboardData.companies;
  const filteredCompanies = selectedCompany === 'all'
    ? companies
    : companies.filter((c) => c.companyName === selectedCompany);

  // ── All FD accounts from Balance Sheet ──────────────────────────────────
  const allFdAccounts = [];
  filteredCompanies.forEach(({ companyName, balanceSheet }) => {
    (balanceSheet?.fdAccounts || []).forEach((fd) => {
      const rate = parseFloat(rates[fd.accountName] || 0);
      const estAnnualInterest = fd.balance * rate / 100;
      allFdAccounts.push({ ...fd, companyName, rate, estAnnualInterest });
    });
  });

  // ── Other investments (Gratuity Insurance, etc.) ─────────────────────
  const allOtherInvestments = [];
  filteredCompanies.forEach(({ companyName, balanceSheet }) => {
    (balanceSheet?.otherInvestmentAccounts || []).forEach((acc) => {
      const rate = parseFloat(rates[acc.accountName] || 0);
      const estAnnualInterest = acc.balance * rate / 100;
      allOtherInvestments.push({ ...acc, companyName, rate, estAnnualInterest });
    });
  });

  const totalFdBalance = allFdAccounts.reduce((s, fd) => s + fd.balance, 0);
  const totalEstInterest = allFdAccounts.reduce((s, fd) => s + fd.estAnnualInterest, 0);
  const totalOtherBalance = allOtherInvestments.reduce((s, a) => s + a.balance, 0);
  const totalOtherInterest = allOtherInvestments.reduce((s, a) => s + a.estAnnualInterest, 0);

  // Pie chart — allocation by FD account
  const pieData = allFdAccounts
    .filter((fd) => fd.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .map((fd, i) => ({
      name: fd.accountName.slice(0, 24),
      value: fd.balance,
      fill: CHART_COLORS.companies[i % CHART_COLORS.companies.length],
    }));

  // Company-wise FD summary
  const companySummary = filteredCompanies.map(({ companyName, balanceSheet }, idx) => {
    const fds = (balanceSheet?.fdAccounts || []).map((fd) => ({
      ...fd,
      rate: parseFloat(rates[fd.accountName] || 0),
    }));
    const total = fds.reduce((s, fd) => s + fd.balance, 0);
    const estInterest = fds.reduce((s, fd) => s + fd.balance * fd.rate / 100, 0);
    return { companyName, total, estInterest, count: fds.length, idx };
  }).filter((c) => c.total > 0 || c.count > 0);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="metric-label mb-1">Total FD Balance</div>
          <div className="text-xl font-bold tabular-nums text-bloomberg-blue">{fmtINR(totalFdBalance)}</div>
          <div className="text-[10px] text-bloomberg-green mt-1">• Balance Sheet (as of period end)</div>
        </div>
        <div className="card p-4">
          <div className="metric-label mb-1">Est. Annual Interest</div>
          <div className="text-xl font-bold tabular-nums text-bloomberg-green">{fmtINR(totalEstInterest)}</div>
          <div className="text-[10px] text-bloomberg-muted mt-1">Based on rates entered below</div>
        </div>
        <div className="card p-4">
          <div className="metric-label mb-1">Other Investments</div>
          <div className="text-xl font-bold tabular-nums text-orange-400">{fmtINR(totalOtherBalance)}</div>
          <div className="text-[10px] text-bloomberg-muted mt-1">Gratuity insurance & similar</div>
        </div>
        <div className="card p-4">
          <div className="metric-label mb-1">No. of FDs</div>
          <div className="text-xl font-bold tabular-nums text-bloomberg-subtle">{allFdAccounts.length}</div>
          <div className="text-[10px] text-bloomberg-muted mt-1">Active instruments</div>
        </div>
      </div>

      {/* ── Portfolio Chart + Company Summary ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut */}
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">Portfolio Allocation</span>
            <span className="text-xs text-bloomberg-muted">{fmtINR(totalFdBalance, true)} total</span>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                  paddingAngle={3} dataKey="value" nameKey="name">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtINR(v, true)} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Company Summary */}
        <div className="card p-4">
          <div className="text-sm font-medium text-bloomberg-subtle mb-3">Company-wise FD Summary</div>
          <div className="space-y-3">
            {companySummary.map(({ companyName, total, estInterest, count, idx }) => (
              <div key={companyName} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS.companies[idx] }} />
                    <span className="text-xs font-medium text-bloomberg-subtle">{companyName}</span>
                    <span className="text-[10px] text-bloomberg-muted">{count} FD{count !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-xs font-bold text-bloomberg-blue tabular-nums">{fmtINR(total, true)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-bloomberg-muted pl-4">
                  <span>Est. Annual Interest</span>
                  <span className="text-bloomberg-green tabular-nums">{fmtINR(estInterest, true)}</span>
                </div>
                <div className="h-1 bg-bloomberg-border rounded overflow-hidden ml-4">
                  <div className="h-full rounded" style={{
                    width: `${totalFdBalance > 0 ? Math.min(100, (total / totalFdBalance) * 100) : 0}%`,
                    background: CHART_COLORS.companies[idx],
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FD Table with Rate of Interest ────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="text-sm font-medium text-bloomberg-subtle">FD & Securities — Balance Sheet</span>
          <div className="flex items-center gap-2">
            {saving && <span className="text-[10px] text-bloomberg-muted">Saving...</span>}
            <span className="badge badge-green text-[9px]">Balance Sheet</span>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>FD / Security Account</th>
                <th>Company</th>
                <th>Balance</th>
                <th className="text-center">Rate % p.a.</th>
                <th>Est. Annual Interest</th>
              </tr>
            </thead>
            <tbody>
              {allFdAccounts
                .sort((a, b) => b.balance - a.balance)
                .map((fd, i) => (
                  <tr key={i}>
                    <td className="font-medium text-bloomberg-subtle">{fd.accountName}</td>
                    <td className="text-bloomberg-muted text-xs">{fd.companyName}</td>
                    <td className="text-bloomberg-blue font-bold tabular-nums">{fmtINR(fd.balance, true)}</td>
                    <td className="text-center">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="30"
                        value={rates[fd.accountName] ?? ''}
                        placeholder="—"
                        onChange={(e) => handleRateChange(fd.accountName, e.target.value)}
                        className="w-16 text-center text-xs bg-bloomberg-bg border border-bloomberg-border rounded px-1 py-0.5 text-bloomberg-text tabular-nums focus:outline-none focus:border-bloomberg-accent"
                      />
                    </td>
                    <td className="text-bloomberg-green tabular-nums font-medium">
                      {fd.rate > 0 ? fmtINR(fd.estAnnualInterest, true) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-bloomberg-border">
                <td colSpan={2} className="font-bold text-bloomberg-subtle">TOTAL</td>
                <td className="font-bold text-bloomberg-accent tabular-nums">{fmtINR(totalFdBalance, true)}</td>
                <td />
                <td className="font-bold text-bloomberg-green tabular-nums">
                  {totalEstInterest > 0 ? fmtINR(totalEstInterest, true) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Other Investments Table ────────────────────────────────────────── */}
      {allOtherInvestments.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="text-sm font-medium text-bloomberg-subtle">Other Investments — Gratuity Insurance & Similar</span>
            <div className="flex items-center gap-2">
              {saving && <span className="text-[10px] text-bloomberg-muted">Saving...</span>}
              <span className="badge badge-amber text-[9px]">Balance Sheet</span>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Company</th>
                  <th>Balance</th>
                  <th className="text-center">Rate % p.a.</th>
                  <th>Est. Annual Return</th>
                </tr>
              </thead>
              <tbody>
                {allOtherInvestments
                  .sort((a, b) => b.balance - a.balance)
                  .map((acc, i) => (
                    <tr key={i}>
                      <td className="font-medium text-bloomberg-subtle">{acc.accountName}</td>
                      <td className="text-bloomberg-muted text-xs">{acc.companyName}</td>
                      <td className="text-orange-400 font-bold tabular-nums">{fmtINR(acc.balance, true)}</td>
                      <td className="text-center">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="30"
                          value={rates[acc.accountName] ?? ''}
                          placeholder="—"
                          onChange={(e) => handleRateChange(acc.accountName, e.target.value)}
                          className="w-16 text-center text-xs bg-bloomberg-bg border border-bloomberg-border rounded px-1 py-0.5 text-bloomberg-text tabular-nums focus:outline-none focus:border-bloomberg-accent"
                        />
                      </td>
                      <td className="text-bloomberg-green tabular-nums font-medium">
                        {acc.rate > 0 ? fmtINR(acc.estAnnualInterest, true) : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-bloomberg-border">
                  <td colSpan={2} className="font-bold text-bloomberg-subtle">TOTAL</td>
                  <td className="font-bold text-orange-400 tabular-nums">{fmtINR(totalOtherBalance, true)}</td>
                  <td />
                  <td className="font-bold text-bloomberg-green tabular-nums">
                    {totalOtherInterest > 0 ? fmtINR(totalOtherInterest, true) : '—'}
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
