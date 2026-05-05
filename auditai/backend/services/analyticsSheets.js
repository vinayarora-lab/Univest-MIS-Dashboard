const https = require('https');
const XLSX = require('xlsx');

const SHEET_ID = '12XFIw3JSstYZyjLCbbjyizIOVGhKHzyRz67TAJwUGIE';
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

let cache = { wb: null, ts: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getAnalyticsWorkbook() {
  const now = Date.now();
  if (cache.wb && now - cache.ts < CACHE_TTL_MS) return cache.wb;
  console.log('[analyticsSheets] Fetching analytics sheet...');
  const buf = await fetchBuffer(EXPORT_URL);
  const wb = XLSX.read(buf, { type: 'buffer' });
  cache = { wb, ts: now };
  console.log('[analyticsSheets] Loaded. Sheets:', wb.SheetNames.join(', '));
  return wb;
}

module.exports = { getAnalyticsWorkbook };
