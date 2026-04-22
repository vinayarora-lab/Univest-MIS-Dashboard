import React from 'react';

function getHeatColor(value) {
  if (value === null || value === undefined) return 'bg-gray-50 text-gray-300';
  if (value >= 90) return 'bg-blue-700 text-white';
  if (value >= 80) return 'bg-blue-600 text-white';
  if (value >= 70) return 'bg-blue-500 text-white';
  if (value >= 60) return 'bg-blue-400 text-white';
  if (value >= 50) return 'bg-blue-300 text-blue-900';
  if (value >= 40) return 'bg-blue-200 text-blue-900';
  return 'bg-blue-100 text-blue-900';
}

export default function CohortTable({ data }) {
  if (!data) return <div className="text-gray-400 text-sm py-4">Loading...</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm sticky-header">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-200 w-24">Cohort</th>
            <th className="text-center px-2 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-200">Size</th>
            {data.months.map(m => (
              <th key={m} className="text-center px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-200">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.cohorts.map(cohort => (
            <tr key={cohort.name} className="border-b border-gray-100">
              <td className="px-3 py-2 font-medium text-gray-700">{cohort.name}</td>
              <td className="px-2 py-2 text-center text-gray-600">{cohort.size.toLocaleString()}</td>
              {cohort.retention.map((val, i) => (
                <td key={i} className={`px-3 py-2 text-center font-medium rounded-sm ${getHeatColor(val)}`}>
                  {val !== null ? `${val}%` : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
