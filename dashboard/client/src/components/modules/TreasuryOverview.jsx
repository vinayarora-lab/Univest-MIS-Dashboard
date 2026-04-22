import React from 'react';
import { useStore } from '../../store/useStore';
import { fmtINR } from '../../utils/format';

function SectionCard({ title, icon, total, color, children, headerExtra }) {
  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-xs font-bold text-bloomberg-text uppercase tracking-wider">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {headerExtra}
          <span className={`text-sm font-bold tabular-nums ${color}`}>{fmtINR(total)}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-bloomberg-border">
              <th className="text-left px-4 py-2 text-bloomberg-muted font-medium">Company</th>
              <th className="text-left px-4 py-2 text-bloomberg-muted font-medium">Account</th>
              <th className="text-right px-4 py-2 text-bloomberg-muted font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountRow({ company, accountName, balance, idx, isPayable }) {
  return (
    <tr className={`border-b border-bloomberg-border/50 hover:bg-bloomberg-card/50 transition-colors ${idx % 2 === 0 ? '' : 'bg-bloomberg-card/20'}`}>
      <td className="px-4 py-2 text-bloomberg-muted whitespace-nowrap">{company}</td>
      <td className={`px-4 py-2 ${isPayable ? 'text-bloomberg-red' : 'text-bloomberg-subtle'}`}>
        {accountName}
        {isPayable && <span className="ml-1 text-[9px] text-bloomberg-red opacity-70">(payable)</span>}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap ${isPayable ? 'text-bloomberg-red' : 'text-bloomberg-text'}`}>
        {isPayable ? `(${fmtINR(balance)})` : fmtINR(balance)}
      </td>
    </tr>
  );
}

function NetRow({ label, value }) {
  const isNegative = value < 0;
  return (
    <tr className="border-t-2 border-bloomberg-border bg-bloomberg-card/40">
      <td colSpan={2} className="px-4 py-2 font-bold text-bloomberg-subtle uppercase tracking-wider text-[10px]">{label}</td>
      <td className={`px-4 py-2 text-right tabular-nums font-bold text-sm whitespace-nowrap ${isNegative ? 'text-bloomberg-red' : 'text-bloomberg-green'}`}>
        {fmtINR(value)}
      </td>
    </tr>
  );
}

function EmptyRow({ message }) {
  return (
    <tr>
      <td colSpan={3} className="px-4 py-6 text-center text-bloomberg-muted text-xs">{message}</td>
    </tr>
  );
}

export default function TreasuryOverview() {
  const { dashboardData, selectedCompany } = useStore();

  if (!dashboardData) {
    return <div className="text-bloomberg-muted text-sm p-8 text-center">Loading...</div>;
  }

  const companies = (dashboardData.companies || []).filter(
    (c) => selectedCompany === 'all' || c.companyName === selectedCompany
  );

  // Aggregate accounts across all (filtered) companies
  const bankRows = [];
  const fdRows = [];
  const gstRows = [];       // receivable (input) + payable (output)
  const tdsRows = [];
  const secDepRows = [];

  const otherInvRows = [];
  let totalBank = 0, totalFd = 0;
  let totalGstReceivable = 0, totalGstPayable = 0;
  let totalTds = 0, totalSecDep = 0, totalOtherInv = 0;

  companies.forEach((c) => {
    const bs = c.balanceSheet || {};
    const name = c.companyName;

    (bs.bankAccounts || []).forEach((a) => {
      bankRows.push({ company: name, accountName: a.accountName, balance: a.balance });
      totalBank += a.balance || 0;
    });

    (bs.fdAccounts || []).forEach((a) => {
      fdRows.push({ company: name, accountName: a.accountName, balance: a.balance });
      totalFd += a.balance || 0;
    });

    // GST receivable (input)
    (bs.gstAccounts || []).forEach((a) => {
      gstRows.push({ company: name, accountName: a.accountName, balance: a.balance, isPayable: false });
      totalGstReceivable += a.balance || 0;
    });
    // GST payable (output) — shown in red as deduction
    (bs.gstPayableAccounts || []).forEach((a) => {
      const amt = Math.abs(a.balance || 0);
      gstRows.push({ company: name, accountName: a.accountName, balance: amt, isPayable: true });
      totalGstPayable += amt;
    });

    (bs.tdsAccounts || []).forEach((a) => {
      tdsRows.push({ company: name, accountName: a.accountName, balance: a.balance });
      totalTds += a.balance || 0;
    });

    (bs.securityDepositAccounts || []).forEach((a) => {
      secDepRows.push({ company: name, accountName: a.accountName, balance: a.balance });
      totalSecDep += a.balance || 0;
    });

    (bs.otherInvestmentAccounts || []).forEach((a) => {
      otherInvRows.push({ company: name, accountName: a.accountName, balance: a.balance });
      totalOtherInv += a.balance || 0;
    });
  });

  const netGst = totalGstReceivable - totalGstPayable;
  const grandTotal = totalBank + totalFd + netGst + totalTds + totalSecDep + totalOtherInv;

  const summaryCards = [
    { label: 'Cash in Bank',      value: totalBank,   color: 'text-bloomberg-green',  icon: '🏦' },
    { label: 'Fixed Deposits',    value: totalFd,     color: 'text-bloomberg-accent', icon: '📈' },
    { label: 'Net GST',           value: netGst,      color: netGst >= 0 ? 'text-bloomberg-blue' : 'text-bloomberg-red', icon: '🧾' },
    { label: 'TDS Receivable',    value: totalTds,    color: 'text-purple-400',       icon: '📋' },
    { label: 'Security Deposits', value: totalSecDep,  color: 'text-orange-400',  icon: '🔒' },
    { label: 'Other Investments', value: totalOtherInv, color: 'text-yellow-400', icon: '🛡️' },
  ];

  // Sort GST rows: receivables first, then payables
  const sortedGstRows = [
    ...gstRows.filter(r => !r.isPayable),
    ...gstRows.filter(r => r.isPayable),
  ];

  return (
    <div className="space-y-4">

      {/* ── Grand Total Banner ─────────────────────────────────────────────── */}
      <div className="card p-4 flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg, #f59e0b11, #0a0a0f)' }}>
        <div>
          <div className="text-[10px] text-bloomberg-muted uppercase tracking-widest mb-0.5">Total Assets (Treasury View)</div>
          <div className="text-2xl font-bold text-bloomberg-accent tabular-nums">{fmtINR(grandTotal)}</div>
        </div>
        <div className="text-4xl opacity-20">📊</div>
      </div>

      {/* ── Summary Pills ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map((s) => (
          <div key={s.label} className="card p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-base">{s.icon}</span>
              <span className="text-[10px] text-bloomberg-muted uppercase tracking-wider">{s.label}</span>
            </div>
            <div className={`text-sm font-bold tabular-nums ${s.color}`}>{fmtINR(s.value)}</div>
          </div>
        ))}
      </div>

      {/* ── Detail Tables ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Cash in Bank */}
        <SectionCard title="Cash in Bank" icon="🏦" total={totalBank} color="text-bloomberg-green">
          {bankRows.length === 0
            ? <EmptyRow message="No bank accounts found" />
            : bankRows.map((r, i) => <AccountRow key={i} idx={i} {...r} />)
          }
        </SectionCard>

        {/* Fixed Deposits */}
        <SectionCard title="Fixed Deposits" icon="📈" total={totalFd} color="text-bloomberg-accent">
          {fdRows.length === 0
            ? <EmptyRow message="No FD accounts found" />
            : fdRows.map((r, i) => <AccountRow key={i} idx={i} {...r} />)
          }
        </SectionCard>

        {/* GST — Receivable less Payable = Net */}
        <SectionCard
          title="GST — Input Tax Credit"
          icon="🧾"
          total={netGst}
          color={netGst >= 0 ? 'text-bloomberg-blue' : 'text-bloomberg-red'}
          headerExtra={
            <div className="text-[10px] text-bloomberg-muted text-right leading-tight">
              <div>Receivable: <span className="text-bloomberg-blue tabular-nums">{fmtINR(totalGstReceivable)}</span></div>
              <div>Payable: <span className="text-bloomberg-red tabular-nums">({fmtINR(totalGstPayable)})</span></div>
            </div>
          }
        >
          {sortedGstRows.length === 0
            ? <EmptyRow message="No GST accounts found" />
            : <>
                {sortedGstRows.map((r, i) => <AccountRow key={i} idx={i} {...r} />)}
                <NetRow label="Net GST Receivable" value={netGst} />
              </>
          }
        </SectionCard>

        {/* TDS Receivable */}
        <SectionCard title="TDS Receivable" icon="📋" total={totalTds} color="text-purple-400">
          {tdsRows.length === 0
            ? <EmptyRow message="No TDS receivable accounts found" />
            : tdsRows.map((r, i) => <AccountRow key={i} idx={i} {...r} />)
          }
        </SectionCard>

        {/* Security Deposits */}
        <SectionCard title="Security Deposits" icon="🔒" total={totalSecDep} color="text-orange-400">
          {secDepRows.length === 0
            ? <EmptyRow message="No security deposit accounts found" />
            : secDepRows.map((r, i) => <AccountRow key={i} idx={i} {...r} />)
          }
        </SectionCard>

        {/* Other Investments */}
        {(otherInvRows.length > 0) && (
          <SectionCard title="Other Investments — Gratuity Insurance & Similar" icon="🛡️" total={totalOtherInv} color="text-yellow-400">
            {otherInvRows.map((r, i) => <AccountRow key={i} idx={i} {...r} />)}
          </SectionCard>
        )}

      </div>
    </div>
  );
}
