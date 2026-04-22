import React from 'react';
import { NavLink } from 'react-router-dom';

const navGroups = [
  {
    group: 'Zoho Finance',
    items: [
      { path: '/zoho', label: 'Treasury & Cash Flow', icon: '🏦' },
    ]
  },
  {
    group: 'Cash MIS',
    items: [
      { path: '/cash-mis', label: 'Cash MIS', icon: '💵' },
    ]
  },
  {
    group: 'Core Financials',
    items: [
      { path: '/consolidated-is', label: 'Consolidated IS - Accrued', icon: '📑' },
      { path: '/broking-is', label: 'IS- Broking Accrued', icon: '📊' },
    ]
  },
  {
    group: 'Customer Cohorts',
    items: [
      { path: '/signup-conversion', label: 'Signup → Conversion', icon: '🔄' },
      { path: '/retention', label: 'Retention Improvements', icon: '📉' },
      { path: '/overall-cohorts', label: 'Overall Cohorts', icon: '🧩' },
      { path: '/subscription-cohorts', label: 'Subscription Cohorts', icon: '📋' },
      { path: '/broking-cohorts', label: 'Broking Cohorts', icon: '📂' },
    ]
  },
  {
    group: 'Revenue & Orders',
    items: [
      { path: '/orders-mix', label: 'Orders Mix', icon: '🛒' },
      { path: '/revenue-mix', label: 'Revenue Mix', icon: '💹' },
      { path: '/advisory-ideas', label: 'Advisory Idea Outcomes', icon: '💡' },
      { path: '/call-accuracy', label: 'Call Accuracy', icon: '🎯' },
    ]
  },
  {
    group: 'Company',
    items: [
      { path: '/offerings-matrix', label: 'Offerings Matrix', icon: '🔲' },
      { path: '/fundraise', label: 'Fundraise & Captable', icon: '💰' },
      { path: '/channel-cac', label: 'Channel CACs', icon: '📣' },
    ]
  },
  {
    group: 'Strategy',
    items: [
      { path: '/key-initiatives', label: 'Key Initiatives', icon: '🚀' },
    ]
  },
  {
    group: 'AI Assistant',
    items: [
      { path: '/cfo', label: 'CFO Assistant', icon: '🤖' },
    ]
  }
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-[#0f1f3d] flex flex-col flex-shrink-0 h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.png" alt="Univest" className="w-8 h-8 rounded-lg bg-white object-contain p-0.5" />
          <div>
            <div className="text-white font-semibold text-sm">Univest MIS</div>
            <div className="text-gray-400 text-xs">Data Analytics</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {navGroups.map(group => (
          <div key={group.group}>
            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-3 mb-1">{group.group}</div>
            {group.items.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-[#185FA5] text-white font-medium'
                      : 'text-gray-400 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span className="text-xs">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <div className="text-gray-500 text-xs">Univest MIS · v1.0</div>
      </div>
    </aside>
  );
}
