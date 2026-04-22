import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function OfferingsMatrix() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/datapack/offerings-matrix')
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-500 text-sm p-4">Error: {error}</div>;
  if (!data) return <div className="text-gray-400 text-sm p-4 animate-pulse">Loading...</div>;

  const { plans, features, legend } = data;

  function renderAvail(val) {
    if (!val || val === '' || val === '-' || val === 'No' || val === 'N') {
      return <span className="text-gray-300 text-base">✗</span>;
    }
    if (val === 'Yes' || val === 'Y' || val === '✓' || val === '✔') {
      return <span className="text-green-600 font-bold text-base">✓</span>;
    }
    // Could be a partial value like "Limited" or a number
    return <span className="text-[#185FA5] text-xs font-medium">{val}</span>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Matrix table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Product Offerings Matrix</h2>
          <p className="text-xs text-gray-500 mt-0.5">Feature availability across subscription plans</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 bg-gray-50 min-w-[200px]">Feature</th>
                {plans.map((plan, i) => (
                  <th key={i} className="px-3 py-3 text-center font-bold text-white bg-[#185FA5] whitespace-nowrap min-w-[100px]">
                    {plan}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((row, i) => (
                <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <td className="px-4 py-2.5 text-gray-700 font-medium">{row.feature}</td>
                  {row.availability.map((val, j) => (
                    <td key={j} className="px-3 py-2.5 text-center">
                      {renderAvail(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      {legend && legend.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Plan Legend</h3>
          <div className="grid grid-cols-1 gap-2">
            {legend.map((item, i) => (
              <div key={i} className="flex gap-3 text-xs">
                <span className="font-bold text-[#185FA5] min-w-[120px] shrink-0">{item.plan}</span>
                <span className="text-gray-600">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
