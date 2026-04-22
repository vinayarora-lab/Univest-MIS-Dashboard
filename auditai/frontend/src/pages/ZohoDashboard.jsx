import React, { useState } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL || '';
const TREASURY_URL = import.meta.env.VITE_TREASURY_URL || '/treasury';

function ExcelDownloadButton() {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/cfo/treasury-excel`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `univest_treasury_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={download}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-[#185FA5] text-white text-xs font-semibold rounded-lg hover:bg-[#1a6bbf] disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
    >
      {loading ? (
        <>
          <span className="animate-spin">⏳</span>
          Generating…
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Treasury Excel
        </>
      )}
    </button>
  );
}

export default function ZohoDashboard() {
  return (
    <div className="flex flex-col h-full -m-6">
      {/* Download bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5 py-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Live data from Zoho Books · Bank accounts, FDs & cash flow across all entities
        </span>
        <ExcelDownloadButton />
      </div>

      {/* Dashboard iframe */}
      {TREASURY_URL ? (
        <iframe
          src={TREASURY_URL}
          className="flex-1 w-full border-0"
          style={{ minHeight: 'calc(100vh - 104px)' }}
          title="Zoho Finance Dashboard"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Treasury dashboard not configured. Set <code className="mx-1 bg-gray-100 px-1 rounded">VITE_TREASURY_URL</code> to enable.
        </div>
      )}
    </div>
  );
}
