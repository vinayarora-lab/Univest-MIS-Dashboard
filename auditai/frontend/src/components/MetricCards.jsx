import React, { useEffect, useState } from 'react';
import api from '../api/client';

function formatINR(val) {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
  return `₹${val.toLocaleString('en-IN')}`;
}

function Card({ label, value, change, color, icon }) {
  const isPositive = change >= 0;
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {change !== undefined && (
        <div className={`text-xs mt-1 font-medium ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
          {isPositive ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% MoM
        </div>
      )}
    </div>
  );
}

export default function MetricCards() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/api/reports/pnl').then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  // Total Revenue: use consolidated totalInflow if available, else sum revenue array
  const totalRev = data.consolidated?.totalInflow != null
    ? data.consolidated.totalInflow
    : (data.revenue || []).reduce((a, b) => a + b, 0);

  // MRR: latest month inflow
  const rev = data.revenue || [];
  const mrr = rev[rev.length - 1] || 0;
  const prevMrr = rev[rev.length - 2] || 0;
  const mrrChange = prevMrr ? ((mrr - prevMrr) / prevMrr) * 100 : 0;

  // Net Cash Flow: use consolidated netCashFlow if available, else sum net_profit array
  const netCashFlow = data.consolidated?.netCashFlow != null
    ? data.consolidated.netCashFlow
    : (data.net_profit || []).reduce((a, b) => a + b, 0);

  const netProfit = data.net_profit || [];
  const lastProfit = netProfit[netProfit.length - 1] || 0;
  const prevProfit = netProfit[netProfit.length - 2] || 0;
  const profitChange = prevProfit ? ((lastProfit - prevProfit) / Math.abs(prevProfit)) * 100 : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        label="Total Revenue (FY)"
        value={formatINR(totalRev)}
        color="text-gray-900"
        icon="💰"
      />
      <Card
        label={`MRR (${data.months?.[data.months.length - 1] || 'Latest'})`}
        value={formatINR(mrr)}
        change={mrrChange}
        color="text-[#185FA5]"
        icon="📈"
      />
      <Card
        label="Net Cash Flow (FY)"
        value={formatINR(Math.abs(netCashFlow))}
        change={profitChange}
        color={netCashFlow < 0 ? 'text-red-600' : 'text-green-700'}
        icon={netCashFlow < 0 ? '⚠️' : '✅'}
      />
      <Card
        label="FD Balance"
        value={formatINR(data.consolidated?.bsTotalFdBalance || 0)}
        color="text-green-700"
        icon="🏦"
      />
    </div>
  );
}
