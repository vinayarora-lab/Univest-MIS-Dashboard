import React, { useState } from 'react';
import { useStore } from '../store/useStore';

const MODULES = [
  { id: 'treasury', label: 'Treasury Overview', icon: '📊' },
  { id: 'cash-bank', label: 'Cash in Bank', icon: '🏦' },
  { id: 'investments', label: 'Investment Portfolio', icon: '📈' },
  { id: 'monthly-overview', label: 'FD & Cash MoM', icon: '📅' },
  { id: 'ai', label: 'AI Treasury Advisor', icon: '🤖' },
];

// Quick preset date ranges
const PRESETS = [
  { label: 'FY 24-25', from: '2024-04-01', to: '2025-03-31' },
  { label: 'FY 23-24', from: '2023-04-01', to: '2024-03-31' },
  { label: 'Q4 FY25',  from: '2025-01-01', to: '2025-03-31' },
  { label: 'Q3 FY25',  from: '2024-10-01', to: '2024-12-31' },
  { label: 'Q2 FY25',  from: '2024-07-01', to: '2024-09-30' },
  { label: 'Q1 FY25',  from: '2024-04-01', to: '2024-06-30' },
  { label: 'Last 3M',  from: () => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  }, to: () => new Date().toISOString().slice(0, 10) },
  { label: 'Last 6M',  from: () => {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  }, to: () => new Date().toISOString().slice(0, 10) },
  { label: 'This Year', from: () => `${new Date().getFullYear()}-01-01`,
    to: () => new Date().toISOString().slice(0, 10) },
];

function DatePicker({ open, onClose }) {
  const { fromDate, toDate, setDateRange, fetchDashboard, loading } = useStore();
  const [localFrom, setLocalFrom] = useState(fromDate);
  const [localTo, setLocalTo] = useState(toDate);

  if (!open) return null;

  const applyPreset = (preset) => {
    const from = typeof preset.from === 'function' ? preset.from() : preset.from;
    const to   = typeof preset.to   === 'function' ? preset.to()   : preset.to;
    setLocalFrom(from);
    setLocalTo(to);
  };

  const apply = () => {
    setDateRange(localFrom, localTo);
    fetchDashboard();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-full mt-1 z-50 card w-80 shadow-2xl border border-bloomberg-accent/20 animate-slide-up">
        <div className="card-header">
          <span className="text-xs font-semibold text-bloomberg-subtle uppercase tracking-wider">Select Date Range</span>
          <button onClick={onClose} className="btn-ghost text-bloomberg-muted">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Quick presets */}
          <div>
            <div className="text-[10px] text-bloomberg-muted uppercase tracking-wider mb-2">Quick Select</div>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => {
                const pFrom = typeof p.from === 'function' ? p.from() : p.from;
                const pTo   = typeof p.to   === 'function' ? p.to()   : p.to;
                const isActive = localFrom === pFrom && localTo === pTo;
                return (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className={`px-2 py-1.5 rounded text-xs border transition-all ${
                      isActive
                        ? 'border-bloomberg-accent text-bloomberg-accent bg-bloomberg-accent/10'
                        : 'border-bloomberg-border text-bloomberg-muted hover:border-bloomberg-accent/40 hover:text-bloomberg-subtle'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Manual inputs */}
          <div>
            <div className="text-[10px] text-bloomberg-muted uppercase tracking-wider mb-2">Custom Range</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-bloomberg-muted block mb-1">From Date</label>
                <input
                  type="date"
                  value={localFrom}
                  onChange={(e) => setLocalFrom(e.target.value)}
                  className="w-full bg-bloomberg-bg border border-bloomberg-border text-bloomberg-subtle text-xs px-2 py-2 rounded outline-none focus:border-bloomberg-accent/60 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-[10px] text-bloomberg-muted block mb-1">To Date</label>
                <input
                  type="date"
                  value={localTo}
                  onChange={(e) => setLocalTo(e.target.value)}
                  className="w-full bg-bloomberg-bg border border-bloomberg-border text-bloomberg-subtle text-xs px-2 py-2 rounded outline-none focus:border-bloomberg-accent/60 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Selected range display */}
          <div className="bg-bloomberg-bg rounded px-3 py-2 flex items-center justify-between text-xs border border-bloomberg-border">
            <span className="text-bloomberg-muted">Selected:</span>
            <span className="text-bloomberg-accent font-medium tabular-nums">
              {localFrom} → {localTo}
            </span>
          </div>

          {/* Apply button */}
          <button
            onClick={apply}
            disabled={loading || !localFrom || !localTo || localFrom > localTo}
            className="w-full btn-primary py-2 text-center uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Fetching...' : 'Apply & Fetch Data'}
          </button>
        </div>
      </div>
    </>
  );
}

export default function Layout({ children }) {
  const {
    activeModule, setActiveModule,
    dashboardData, selectedCompany, setSelectedCompany,
    lastUpdated, mockMode, loading,
    autoRefresh, toggleAutoRefresh,
    refreshData,
    fromDate, toDate,
  } = useStore();

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const companies = dashboardData?.companies?.map((c) => c.companyName) || [];
  const summary = dashboardData?.consolidated?.summary;

  // Format displayed date range label
  const dateLabel = fromDate && toDate
    ? `${fromDate} → ${toDate}`
    : 'Select Period';

  return (
    <div className="min-h-screen flex flex-col bg-bloomberg-bg">
      {/* ── Top Bar ───────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-bloomberg-border sticky top-0 z-50 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 gap-3">

          {/* Brand */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <img
              src="https://storage.googleapis.com/app-assets-univest/website-assets/UnivestLogo.jpg"
              alt="Univest"
              className="h-16 w-auto object-contain"
            />
            {mockMode && <span className="badge badge-amber text-[10px]">DEMO</span>}
          </div>


          {/* Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* ── Date Range Picker ── */}
            <div className="relative">
              <button
                onClick={() => setDatePickerOpen((o) => !o)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs border transition-all ${
                  datePickerOpen
                    ? 'border-bloomberg-accent text-bloomberg-accent bg-bloomberg-accent/10'
                    : 'border-bloomberg-border text-bloomberg-subtle hover:border-bloomberg-accent/40'
                }`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="hidden sm:inline tabular-nums">{dateLabel}</span>
                <span className="sm:hidden">Period</span>
                <svg className={`w-3 h-3 transition-transform ${datePickerOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <DatePicker open={datePickerOpen} onClose={() => setDatePickerOpen(false)} />
            </div>

            {/* Company filter */}
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="bg-bloomberg-card border border-bloomberg-border text-bloomberg-subtle text-xs px-2 py-1.5 rounded outline-none focus:border-bloomberg-accent/50 cursor-pointer"
            >
              <option value="all">All Companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Auto-refresh toggle */}
            <button
              onClick={toggleAutoRefresh}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs border transition-all ${
                autoRefresh
                  ? 'border-bloomberg-green/30 text-bloomberg-green bg-bloomberg-green/5'
                  : 'border-bloomberg-border text-bloomberg-muted'
              }`}
              title={autoRefresh ? 'Auto-refresh ON (10min — data cached 24h)' : 'Auto-refresh OFF'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-bloomberg-green animate-pulse' : 'bg-bloomberg-muted'}`} />
              <span className="hidden sm:inline">{autoRefresh ? 'LIVE' : 'PAUSED'}</span>
            </button>

            {/* Manual refresh */}
            <button onClick={refreshData} disabled={loading} className="btn-primary flex items-center gap-1">
              <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? 'Fetching...' : 'Refresh'}
            </button>

            {/* Last updated */}
            {lastUpdated && (
              <span className="text-[10px] text-bloomberg-muted hidden xl:block tabular-nums">
                {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* ── Module Nav ────────────────────────────────────────────────────── */}
        <div className="flex border-t border-bloomberg-border overflow-x-auto">
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveModule(m.id)}
              className={`tab-btn flex items-center gap-1.5 whitespace-nowrap ${
                activeModule === m.id ? 'tab-btn-active' : 'tab-btn-inactive'
              }`}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <main className="flex-1 p-4 overflow-auto">
        {children}
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-bloomberg-border px-4 py-1.5 flex items-center justify-between text-[10px] text-bloomberg-muted">
        <span>Financial Intelligence Dashboard • {mockMode ? 'Demo Data' : 'Live Zoho Books API'}</span>
        <span className="tabular-nums">{fromDate} → {toDate} • INR</span>
      </footer>
    </div>
  );
}
