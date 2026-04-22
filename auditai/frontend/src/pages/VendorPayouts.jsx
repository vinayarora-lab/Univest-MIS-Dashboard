import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/client';

const COMPANY_COLORS = {
  Uniresearch:    { bg: 'bg-blue-100',   text: 'text-blue-800'   },
  Univest:        { bg: 'bg-green-100',  text: 'text-green-800'  },
  Uniapps:        { bg: 'bg-orange-100', text: 'text-orange-800' },
  'Stock Broking':{ bg: 'bg-purple-100', text: 'text-purple-800' },
};

function CompanyBadge({ name }) {
  const c = COMPANY_COLORS[name] || { bg: 'bg-gray-100', text: 'text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {name}
    </span>
  );
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-1">
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

const ALL_TAB = 'All';
const COMPANY_TABS = [ALL_TAB, 'Uniresearch', 'Univest', 'Uniapps', 'Stock Broking'];

export default function VendorPayouts() {
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(ALL_TAB);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get('/api/datapack/vendor-outstanding')
      .then(r => {
        if (r.data.ok === false) setError(r.data.error || 'Unknown error');
        else setResult(r.data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredVendors = useMemo(() => {
    if (!result) return [];
    const vendors = result.topVendors || [];
    if (activeTab === ALL_TAB) return vendors;
    return vendors.filter(v => v.company === activeTab).map((v, i) => ({ ...v, rank: i + 1 }));
  }, [result, activeTab]);

  if (error) return (
    <div className="text-red-500 text-sm p-4 bg-red-50 border border-red-200 rounded-lg">
      Error: {error}
    </div>
  );

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header note */}
      <div className="flex items-start gap-3 flex-wrap">
        {result && (
          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            As of: <span className="font-medium text-gray-700">{result.asOf}</span>
          </div>
        )}
        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          Live data from Zoho Books — unpaid, overdue, and partially paid bills across all entities.
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="bg-gray-100 border border-gray-200 rounded-lg h-24 animate-pulse" />
          ))
        ) : result ? (
          <>
            <SummaryCard
              label="Total Outstanding"
              value={`₹${result.summary.totalOutstanding_L} M`}
              sub="Unpaid + overdue + partially paid"
            />
            <SummaryCard
              label="Unique Vendors"
              value={result.summary.totalVendors}
              sub="With pending balances"
            />
            <SummaryCard
              label="Entities"
              value={result.companies?.filter(c => !c.error).length ?? '—'}
              sub="Companies with outstanding bills"
            />
          </>
        ) : null}
      </div>

      {/* Per-company summary pills */}
      {result?.companies && (
        <div className="flex gap-3 flex-wrap">
          {result.companies.map(co => (
            <div key={co.name} className="bg-white border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-3">
              <CompanyBadge name={co.name} />
              {co.error ? (
                <span className="text-xs text-red-500">Error</span>
              ) : (
                <span className="text-sm font-semibold text-gray-800">₹{co.totalOutstanding_L} M</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Company Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {COMPANY_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              activeTab === tab
                ? 'bg-[#185FA5] text-white border-[#185FA5]'
                : 'bg-white text-gray-600 border-gray-300 hover:border-[#185FA5] hover:text-[#185FA5]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">
            Outstanding Vendor Balances
            {activeTab !== ALL_TAB && <span className="ml-2 text-[#185FA5]">— {activeTab}</span>}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {loading ? 'Loading from Zoho Books…' : `${filteredVendors.length} vendors · sorted by outstanding amount`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600 w-12">#</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Vendor Name</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Company</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">Outstanding (₹ M)</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">Billed (₹ M)</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Bills</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">Oldest Due</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No outstanding balances found.
                  </td>
                </tr>
              ) : (
                filteredVendors.map((v) => {
                  const isOverdue = v.oldestDue && new Date(v.oldestDue) < new Date();
                  return (
                    <tr key={`${v.company}-${v.vendor}-${v.rank}`} className="border-b border-gray-50 hover:bg-blue-50/30">
                      <td className="px-4 py-2.5 text-gray-400 font-mono">{v.rank}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{v.vendor}</td>
                      <td className="px-4 py-2.5"><CompanyBadge name={v.company} /></td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-red-700">₹{v.outstanding_L} M</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">₹{v.totalBilled_L} M</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{v.billCount}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                        {v.oldestDue || '—'}
                        {isOverdue && <span className="ml-1 text-red-500">⚠</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
