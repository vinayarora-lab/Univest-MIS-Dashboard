import React, { useEffect, useState } from 'react';
import api from '../api/client';

function formatINR(val) {
  if (val === null || val === undefined || val === 0) return '₹0';
  if (Math.abs(val) >= 10000000) return `₹${(Math.abs(val) / 10000000).toFixed(2)} Cr`;
  if (Math.abs(val) >= 100000) return `₹${(Math.abs(val) / 100000).toFixed(2)} L`;
  return `₹${Math.abs(val).toLocaleString('en-IN')}`;
}

function AccountTable({ title, accounts, totalLabel, total }) {
  if (!accounts || accounts.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wide">{title}</div>
      {accounts.map((acc, i) => (
        <div key={i} className={`flex justify-between px-4 py-2 text-sm border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
          <span className="text-gray-600 pl-3 truncate mr-4">{acc.accountName || acc.accountId}</span>
          <span className="tabular-nums text-gray-800 flex-shrink-0">{formatINR(acc.balance)}</span>
        </div>
      ))}
      {totalLabel && (
        <div className="flex justify-between px-4 py-2 text-sm font-semibold bg-blue-50 text-blue-800 border-b border-blue-100">
          <span className="pl-3">{totalLabel}</span>
          <span className="tabular-nums">{formatINR(total)}</span>
        </div>
      )}
    </div>
  );
}

function CompanyCard({ company }) {
  const t = company.totals;
  const totalAssets = t.bankBalance + t.fdBalance + t.accruedInterest + t.securityDeposits + t.otherInvestments;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm">{company.name}</h2>
        <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
          Total: {formatINR(totalAssets)}
        </span>
      </div>

      <AccountTable
        title="Bank Accounts"
        accounts={company.bankAccounts}
        totalLabel="Total Bank Balance"
        total={t.bankBalance}
      />
      <AccountTable
        title="Fixed Deposits"
        accounts={company.fdAccounts}
        totalLabel="Total FD Balance"
        total={t.fdBalance}
      />
      {t.accruedInterest > 0 && (
        <AccountTable
          title="Accrued Interest"
          accounts={company.accruedInterestAccounts}
          totalLabel="Total Accrued Interest"
          total={t.accruedInterest}
        />
      )}
      {t.securityDeposits > 0 && (
        <AccountTable
          title="Security Deposits"
          accounts={company.securityDepositAccounts}
          totalLabel="Total Security Deposits"
          total={t.securityDeposits}
        />
      )}
      {t.otherInvestments > 0 && (
        <AccountTable
          title="Other Investments"
          accounts={company.otherInvestmentAccounts}
          totalLabel="Total Other Investments"
          total={t.otherInvestments}
        />
      )}

      {/* GST / TDS summary rows */}
      {(t.netGst !== 0 || t.tds > 0) && (
        <div className="mb-1">
          <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-700 uppercase tracking-wide">Tax Positions</div>
          {t.netGst !== 0 && (
            <div className="flex justify-between px-4 py-2 text-sm border-b border-gray-100 bg-white">
              <span className="text-gray-600 pl-3">Net GST</span>
              <span className={`tabular-nums font-medium ${t.netGst < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatINR(t.netGst)}</span>
            </div>
          )}
          {t.tds > 0 && (
            <div className="flex justify-between px-4 py-2 text-sm border-b border-gray-100 bg-gray-50/50">
              <span className="text-gray-600 pl-3">TDS Receivable</span>
              <span className="tabular-nums text-gray-800">{formatINR(t.tds)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BalanceSheet() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/reports/balance-sheet').then(r => setData(r.data)).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Failed to load: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading Balance Sheet...</div>;

  const cons = data.consolidated;
  const totalConsolidated = cons.totalBankBalance + cons.totalFdBalance + cons.totalAccruedInterest;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Consolidated Summary Bar */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Consolidated Balance Sheet</h2>
          <p className="text-xs text-gray-500 mt-0.5">As of {data.as_of} · All entities</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-gray-100">
          <div className="px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Total Bank Balance</div>
            <div className="text-lg font-bold text-[#185FA5]">{formatINR(cons.totalBankBalance)}</div>
          </div>
          <div className="px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Total FD Balance</div>
            <div className="text-lg font-bold text-gray-800">{formatINR(cons.totalFdBalance)}</div>
          </div>
          <div className="px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Accrued Interest</div>
            <div className="text-lg font-bold text-gray-800">{formatINR(cons.totalAccruedInterest)}</div>
          </div>
          <div className="px-5 py-4 bg-blue-50">
            <div className="text-xs text-gray-500 mb-1">Total Financial Assets</div>
            <div className="text-lg font-bold text-blue-800">{formatINR(totalConsolidated)}</div>
          </div>
        </div>
      </div>

      {/* Consolidated table across companies */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Entity Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600">Entity</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Bank Balance</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">FD Balance</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Accrued Interest</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">Net GST</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">TDS</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 bg-blue-50">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.companies.map((c, i) => {
                const t = c.totals;
                const rowTotal = t.bankBalance + t.fdBalance + t.accruedInterest + t.securityDeposits + t.otherInvestments;
                return (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-2.5 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatINR(t.bankBalance)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatINR(t.fdBalance)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatINR(t.accruedInterest)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${t.netGst < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatINR(t.netGst)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatINR(t.tds)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-800 bg-blue-50/50">{formatINR(rowTotal)}</td>
                  </tr>
                );
              })}
              {/* Consolidated total row */}
              <tr className="border-t-2 border-gray-300 bg-[#185FA5] text-white font-bold">
                <td className="px-5 py-3">CONSOLIDATED TOTAL</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(cons.totalBankBalance)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(cons.totalFdBalance)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(cons.totalAccruedInterest)}</td>
                <td className="px-4 py-3 text-right tabular-nums">—</td>
                <td className="px-4 py-3 text-right tabular-nums">—</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(totalConsolidated)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-company detail cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.companies.map((c, i) => (
          <CompanyCard key={i} company={c} />
        ))}
      </div>
    </div>
  );
}
