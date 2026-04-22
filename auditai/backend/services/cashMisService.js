const axios = require('axios');
const XLSX = require('xlsx');

const SHEET_ID = '1sdYNFMLKg1b1LDRQOIWIP7-c0bG2xBbOIDDZmDYlD0g';
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

let cache = { wb: null, ts: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getWorkbook() {
  const now = Date.now();
  if (cache.wb && now - cache.ts < CACHE_TTL_MS) {
    return cache.wb;
  }
  console.log('[cashMisService] Fetching latest data from Cash MIS Google Sheet...');
  const response = await axios.get(EXPORT_URL, {
    responseType: 'arraybuffer',
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 30000,
  });
  const wb = XLSX.read(response.data, { type: 'buffer' });
  cache = { wb, ts: now };
  console.log('[cashMisService] Workbook loaded. Sheets:', wb.SheetNames.join(', '));
  return wb;
}

// Maps any month spelling/abbreviation (lowercase) → canonical 3-letter abbr
const MONTH_MAP = {
  // full names
  january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr',
  may: 'May', june: 'Jun', july: 'Jul', august: 'Aug',
  september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec',
  // 3-letter abbreviations (covers uppercase like DEC, FEB, OCT)
  jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr',
  jun: 'Jun', jul: 'Jul', aug: 'Aug',
  sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec',
};

function parseMonthLabel(header) {
  // Handles: "April 23 Actuals", "Aug23 Actuals", "DEC 23 Actuals", "FEB 24 Actuals"
  const s = String(header).trim();
  // Optional space between month and year
  const match = s.match(/^([A-Za-z]+)\s*(\d{2})\s+Actuals/i);
  if (!match) return null;
  const abbr = MONTH_MAP[match[1].toLowerCase()];
  if (!abbr) return null;
  return `${abbr} ${match[2]}`;
}

function toLakhs(v) {
  return Math.round((v || 0) / 100000) / 10;
}

const KEY_ROWS = [
  'Total Net Revenue (A)',
  'Total Expenses (B)',
  'Net Burn ',
  'Closing FD',
  'Closing Cash',
  'Employee costs',
  '- Digital / Media Marketing',
  '- Cashback & Rewards',
  '- Tech Expenses',
  'Legal and professional expenses',
  'Office rental and supplies',
];

async function getCashMISSummary() {
  const wb = await getWorkbook();
  const ws = wb.Sheets['Matrix Cash'];
  if (!ws) throw new Error('Sheet "Matrix Cash" not found. Available: ' + wb.SheetNames.join(', '));

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });

  // Row 0 = headers
  const headerRow = rows[0];

  // Build list of Actuals column indices (exclude YTD, exclude empty)
  const actualsColIndices = [];
  const actualsMonthLabels = [];

  headerRow.forEach((cell, idx) => {
    const s = String(cell || '');
    if (!s) return;
    if (s.includes('YTD')) return;
    if (s.includes('Actuals')) {
      const label = parseMonthLabel(s);
      if (label) {
        actualsColIndices.push(idx);
        actualsMonthLabels.push(label);
      }
    }
  });

  // Find row indices for key rows (first occurrence of each label)
  const rowIndexMap = {};
  KEY_ROWS.forEach(key => {
    for (let i = 1; i < rows.length; i++) {
      const label = String(rows[i][0] || '');
      if (label === key && rowIndexMap[key] === undefined) {
        rowIndexMap[key] = i;
        break;
      }
    }
  });

  function extractSeries(rowLabel) {
    const ri = rowIndexMap[rowLabel];
    if (ri === undefined) return actualsColIndices.map(() => 0);
    const row = rows[ri];
    return actualsColIndices.map(ci => toLakhs(typeof row[ci] === 'number' ? row[ci] : 0));
  }

  const revenue  = extractSeries('Total Net Revenue (A)');
  const expenses = extractSeries('Total Expenses (B)');
  const netBurn  = extractSeries('Net Burn ');
  const closingFD   = extractSeries('Closing FD');
  const closingCash = extractSeries('Closing Cash');

  // Breakdown: find last month index with non-zero revenue
  let lastIdx = revenue.length - 1;
  for (let i = revenue.length - 1; i >= 0; i--) {
    if (revenue[i] !== 0 || expenses[i] !== 0) { lastIdx = i; break; }
  }

  function breakdownVal(rowLabel) {
    const ri = rowIndexMap[rowLabel];
    if (ri === undefined) return 0;
    const row = rows[ri];
    const ci = actualsColIndices[lastIdx];
    return toLakhs(typeof row[ci] === 'number' ? row[ci] : 0);
  }

  const breakdown = {
    employee:  breakdownVal('Employee costs'),
    marketing: breakdownVal('- Digital / Media Marketing'),
    cashback:  breakdownVal('- Cashback & Rewards'),
    tech:      breakdownVal('- Tech Expenses'),
    legal:     breakdownVal('Legal and professional expenses'),
    office:    breakdownVal('Office rental and supplies'),
  };

  const latestMonth = actualsMonthLabels[lastIdx] || '';
  const latest = {
    month:        latestMonth,
    revenue_L:    revenue[lastIdx]    || 0,
    expenses_L:   expenses[lastIdx]   || 0,
    netBurn_L:    netBurn[lastIdx]    || 0,
    closingFD_L:  closingFD[lastIdx]  || 0,
    closingCash_L: closingCash[lastIdx] || 0,
    totalLiquid_L: (closingFD[lastIdx] || 0) + (closingCash[lastIdx] || 0),
  };

  return {
    months: actualsMonthLabels,
    series: { revenue, expenses, netBurn, closingFD, closingCash },
    breakdown,
    latest,
  };
}

module.exports = { getCashMISSummary };
