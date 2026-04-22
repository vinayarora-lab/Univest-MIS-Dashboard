const axios = require('axios');
const XLSX = require('xlsx');

const SHEET_ID = '1qk1AxAY8DFfI17u2UFI1QVR1mshrwBJ7';
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

// Cache: workbook + timestamp
let cache = { wb: null, ts: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getWorkbook() {
  const now = Date.now();
  if (cache.wb && now - cache.ts < CACHE_TTL_MS) {
    return cache.wb;
  }

  console.log('[googleSheets] Fetching latest data from Google Sheets...');
  const response = await axios.get(EXPORT_URL, {
    responseType: 'arraybuffer',
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    timeout: 30000,
  });

  const wb = XLSX.read(response.data, { type: 'buffer' });
  cache = { wb, ts: now };
  console.log('[googleSheets] Workbook loaded. Sheets:', wb.SheetNames.join(', '));
  return wb;
}

module.exports = { getWorkbook, cache };
