import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDateRange, ALL_MONTHS } from '../context/DateRangeContext';

const PAGE_TITLES = {
  '/zoho': 'Treasury & Cash Flow',
  '/consolidated-is': 'Consolidated IS — Accrued',
  '/broking-is': 'IS — Broking Accrued',
  '/signup-conversion': 'Signup → Conversion Cohorts',
  '/retention': 'Retention Improvements',
  '/overall-cohorts': 'Overall Cohorts (Subscription)',
  '/subscription-cohorts': 'Subscription Booking Cohorts',
  '/advisory-ideas': 'Advisory Idea Outcomes',
  '/broking-cohorts': 'Broking Cohorts',
  '/orders-mix': 'Orders Mix',
  '/revenue-mix': 'Revenue Mix',
  '/call-accuracy': 'Call Accuracy',
  '/offerings-matrix': 'Offerings Matrix',
  '/fundraise': 'Fundraise & Captable',
  '/channel-cac': 'Channel Level CACs',
  '/key-initiatives': 'Key Initiatives Summary',
  '/cash-mis': 'Cash MIS',
};

export default function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = PAGE_TITLES[location.pathname] || 'Dashboard';
  const { fromMonth, setFromMonth, toMonth, setToMonth } = useDateRange();

  const fromOptions = ALL_MONTHS.filter(m => ALL_MONTHS.indexOf(m) <= ALL_MONTHS.indexOf(toMonth));
  const toOptions   = ALL_MONTHS.filter(m => ALL_MONTHS.indexOf(m) >= ALL_MONTHS.indexOf(fromMonth));

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="text-xs text-gray-500">Univest MIS · Apr 23 → Mar 26</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Date range selector */}
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
          <span className="text-xs text-gray-500 font-medium">From</span>
          <select
            value={fromMonth}
            onChange={e => setFromMonth(e.target.value)}
            className="text-xs text-gray-700 bg-transparent outline-none cursor-pointer font-medium"
          >
            {fromOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="text-gray-400 text-xs mx-0.5">→</span>
          <span className="text-xs text-gray-500 font-medium">To</span>
          <select
            value={toMonth}
            onChange={e => setToMonth(e.target.value)}
            className="text-xs text-gray-700 bg-transparent outline-none cursor-pointer font-medium"
          >
            {toOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <button
          onClick={() => navigate('/cfo')}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
            location.pathname === '/cfo'
              ? 'bg-[#185FA5] text-white border-[#185FA5]'
              : 'bg-white text-gray-600 border-gray-300 hover:border-[#185FA5] hover:text-[#185FA5]'
          }`}
        >
          <span>🤖</span>
          <span>CFO Assistant</span>
        </button>
        <img src="/favicon.png" alt="Univest" className="w-8 h-8 rounded-full bg-white object-contain p-0.5 border border-gray-200" />
        <button
          onClick={() => { localStorage.removeItem('mis_auth'); window.location.reload(); }}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          title="Sign out"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
