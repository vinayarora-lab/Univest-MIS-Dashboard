import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function AnalyticsReport() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/analytics-report')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading report...</div>;

  const { leftSections, rightSections, achievements, ltvcac, aopHighlights } = data;

  // Split left sections into named buckets — headings start with digit+dot, "Outcome:", or "The "
  const sectionBuckets = [];
  let current = null;
  for (const line of leftSections) {
    if (/^\d+\.|^Outcome:|^The /.test(line)) {
      if (current) sectionBuckets.push(current);
      current = { heading: line, bullets: [] };
    } else if (current) {
      current.bullets.push(line);
    } else {
      // Lines before first heading — create an intro bucket
      current = { heading: line, bullets: [] };
    }
  }
  if (current) sectionBuckets.push(current);

  // Split right sections into buckets
  const rightBuckets = [];
  let rcurrent = null;
  for (const line of rightSections) {
    if (/^FY2[0-9].*vs|^\d+\.|^New User CAC/i.test(line)) {
      if (rcurrent) rightBuckets.push(rcurrent);
      rcurrent = { heading: line, bullets: [] };
    } else if (rcurrent) {
      rcurrent.bullets.push(line);
    }
  }
  if (rcurrent) rightBuckets.push(rcurrent);

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-xl px-6 py-4 text-white">
        <h1 className="text-lg font-bold">FY25–FY26 Revenue · User · ARPU Analysis</h1>
        <p className="text-blue-200 text-xs mt-0.5">Signup → Conversion · CAC · LTV · AOP Summary</p>
      </div>

      {/* LTV-CAC Alert */}
      {ltvcac && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4 flex flex-wrap gap-6 items-center">
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wider">New User CAC (Apr '26)</div>
            <div className="text-2xl font-bold text-red-600">₹{ltvcac.cac.toLocaleString()}</div>
          </div>
          <div className="text-gray-400 text-xl font-light">vs</div>
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Current LTV (approx)</div>
            <div className="text-2xl font-bold text-gray-700">₹{ltvcac.ltv.toLocaleString()}</div>
          </div>
          <div className="text-gray-400 text-xl font-light">=</div>
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Net Loss per User</div>
            <div className="text-2xl font-bold text-red-700">₹{ltvcac.netLoss.toLocaleString()}</div>
          </div>
          <div className="flex-1 text-xs text-red-700 italic ml-2">
            LTV-to-CAC deficit — cost per paying user exceeds lifetime value
          </div>
        </div>
      )}

      {/* Two column: left analysis + right funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Revenue-User-ARPU */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider border-b pb-2">Revenue · User · ARPU Analysis</h2>
          {sectionBuckets.map((sec, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="text-xs font-semibold text-blue-800 mb-2">{sec.heading}</div>
              <ul className="space-y-1">
                {sec.bullets.map((b, j) => (
                  <li key={j} className="text-xs text-gray-700 leading-relaxed">{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Right: Funnel + CAC */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider border-b pb-2">Signup → Conversion · CAC Analysis</h2>
          {rightBuckets.map((sec, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <div className="text-xs font-semibold text-indigo-800 mb-2">{sec.heading}</div>
              <ul className="space-y-1">
                {sec.bullets.map((b, j) => (
                  <li key={j} className="text-xs text-gray-700 leading-relaxed">{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* AOP Highlights */}
      {aopHighlights?.length > 1 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">FY2025 AOP Highlights</h2>
          <ul className="space-y-2">
            {aopHighlights.slice(1).map((line, i) => (
              <li key={i} className="text-xs text-gray-700 flex gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key Achievements */}
      {achievements?.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-green-800 mb-3">Key Achievements</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {achievements.map((a, i) => (
              <div key={i} className="flex gap-2 text-xs text-green-800">
                <span className="text-green-500 font-bold mt-0.5">✓</span>
                <span>{a.replace(/^-\s*/, '')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
