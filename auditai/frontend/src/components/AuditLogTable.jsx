import React, { useState, useEffect } from 'react';
import api from '../api/client';

const STATUS_STYLES = {
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};

export default function AuditLogTable({ days = 30 }) {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    api.get(`/api/auditlog?days=${days}`).then(r => {
      setEntries(r.data.entries || []);
      setPage(1);
    }).catch(() => {});
  }, [days]);

  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm sticky-header table-striped">
          <thead>
            <tr>
              {['Timestamp', 'User', 'Action', 'Resource', 'IP Address', 'Status', 'Details'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((entry, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/30">
                <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap font-mono">
                  {new Date(entry.timestamp).toLocaleString('en-IN')}
                </td>
                <td className="px-3 py-2 text-gray-700 text-xs">{entry.user}</td>
                <td className="px-3 py-2 font-mono text-xs text-[#185FA5]">{entry.action}</td>
                <td className="px-3 py-2 text-gray-600 text-xs">{entry.resource}</td>
                <td className="px-3 py-2 text-gray-500 text-xs font-mono">{entry.ip_address}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[entry.status] || ''}`}>
                    {entry.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs max-w-xs truncate">{entry.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-3 border-t border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-500">{entries.length} entries · Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
            >← Prev</button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
