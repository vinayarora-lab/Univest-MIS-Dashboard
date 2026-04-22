import React, { useState, useEffect } from 'react';
import api from '../api/client';

const STATUS_STYLES = {
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};

const PAGE_SIZE = 20;

export default function AuditLogs() {
  const [allEntries, setAllEntries] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get(`/api/auditlog?days=${days}`).then(r => {
      setAllEntries(r.data.entries || []);
      setPage(1);
    }).catch(() => {});
  }, [days]);

  useEffect(() => {
    let f = allEntries;
    if (statusFilter !== 'all') f = f.filter(e => e.status === statusFilter);
    if (userFilter !== 'all') f = f.filter(e => e.user === userFilter);
    if (search) {
      const q = search.toLowerCase();
      f = f.filter(e =>
        e.action?.toLowerCase().includes(q) ||
        e.resource?.toLowerCase().includes(q) ||
        e.user?.toLowerCase().includes(q) ||
        e.details?.toLowerCase().includes(q)
      );
    }
    setFiltered(f);
    setPage(1);
  }, [allEntries, statusFilter, userFilter, search]);

  const users = [...new Set(allEntries.map(e => e.user))];
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-6xl space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search action, resource, user..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-[#185FA5]"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#185FA5]"
        >
          <option value="all">All Status</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
        <select
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#185FA5]"
        >
          <option value="all">All Users</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <div className="flex gap-1 ml-auto">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                days === d
                  ? 'bg-[#185FA5] text-white border-[#185FA5]'
                  : 'border-gray-300 text-gray-600 hover:border-[#185FA5]'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">{filtered.length} entries</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-striped sticky-header">
            <thead>
              <tr>
                {['Timestamp', 'User', 'Action', 'Resource', 'IP Address', 'Status', 'Details'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((entry, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/30">
                  <td className="px-3 py-2 text-gray-500 text-xs font-mono whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString('en-IN')}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">{entry.user}</td>
                  <td className="px-3 py-2 text-xs font-mono text-[#185FA5]">{entry.action}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{entry.resource}</td>
                  <td className="px-3 py-2 text-xs font-mono text-gray-500">{entry.ip_address}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[entry.status] || ''}`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate" title={entry.details}>
                    {entry.details}
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">Page {page} of {totalPages} · {filtered.length} total</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
              >«</button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
              >‹</button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
              >›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
              >»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
