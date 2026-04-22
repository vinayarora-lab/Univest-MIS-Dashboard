/**
 * Loads compact MIS Datapack summaries from Google Sheets for AI context.
 * Returns only the last N months of each sheet to stay within token limits.
 */
const XLSX = require('xlsx');
const { getWorkbook } = require('./googleSheets');

function getRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
  return rows.filter(r => r.some(c => c !== ''));
}

function excelDate(serial) {
  if (!serial || typeof serial !== 'number') return String(serial);
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function consolidatedIS(wb, lastN = 12) {
  const rows = getRows(wb, 'Consolidated IS - Accrued');
  const dateRow = rows.find(r => typeof r[2] === 'number' && r[2] > 40000 && String(r[1]).includes('Particulars'));
  if (!dateRow) return null;

  const seen = new Set();
  const monthlyCols = [];
  dateRow.forEach((d, idx) => {
    if (idx >= 57) return;
    if (typeof d === 'number' && d > 40000 && !seen.has(d)) {
      seen.add(d);
      monthlyCols.push({ idx, date: excelDate(d) });
    }
  });

  const keyLabels = [
    'Total Net Revenue', 'Gross Margin %', 'CM2 %',
    'EBITDA (non-broking)', 'EBITDA (non-broking) %',
    'Overall EBITDA', 'Overall EBITDA %', 'Overall PBT ( Accrued )',
    'Employee Costs', 'Total Performance Marketing', 'Broking Income',
  ];

  const recent = monthlyCols.slice(-lastN);
  const dateRowIdx = rows.indexOf(dateRow);
  const items = [];

  rows.slice(dateRowIdx + 1).forEach(r => {
    const label = String(r[1] || '').trim();
    if (!keyLabels.includes(label)) return;
    const values = recent.map(c => typeof r[c.idx] === 'number' ? Number(r[c.idx].toFixed(2)) : null);
    items.push({ label, values });
  });

  return { dates: recent.map(c => c.date), items };
}

function retentionSummary(wb, lastN = 6) {
  const rows = getRows(wb, 'Retention Improvements');
  const headerIdx = rows.findIndex(r => r[0] === 'Month');
  if (headerIdx < 0) return null;

  const rawHdr = rows[headerIdx];
  const firstM0 = rawHdr.indexOf('M0');
  const secondM0 = rawHdr.indexOf('M0', firstM0 + 1);
  const headers = rawHdr.slice(0, secondM0 > 0 ? secondM0 : rawHdr.length).filter(h => h !== '').slice(1, 7); // M0–M5

  const data = rows.slice(headerIdx + 1)
    .filter(r => typeof r[0] === 'string' && r[0].includes('2'))
    .slice(0, lastN)
    .map(r => {
      const obj = { month: r[0] };
      headers.forEach((h, i) => { obj[h] = typeof r[i + 1] === 'number' ? Number((r[i + 1] * 100).toFixed(1)) : null; });
      return obj;
    });

  return { headers, data };
}

function subscriptionCohorts(wb, lastN = 6) {
  const rows = getRows(wb, 'Subscription Booking Cohorts');
  const headerIdx = rows.findIndex(r => String(r[1]).includes('INR Mn'));
  const header2Idx = rows.findIndex((r, i) => i > headerIdx && String(r[1]).includes('INR Mn'));
  const sec1Rows = rows.slice(headerIdx + 1, header2Idx > 0 ? header2Idx : undefined);

  const data = sec1Rows
    .filter(r => typeof r[1] === 'number' && r[1] > 40000 && typeof r[2] === 'number')
    .slice(-lastN)
    .map(r => {
      const obj = { cohort: excelDate(r[1]), newRevenue: Number(r[2].toFixed(3)), repeatRevenue: typeof r[3] === 'number' ? Number(r[3].toFixed(3)) : null };
      ['Repeat M0','M1','M2','M3','M4','M5'].forEach((h, i) => {
        obj[h] = typeof r[i + 4] === 'number' ? Number((r[i + 4] * 100).toFixed(1)) : null;
      });
      return obj;
    });
  return { data };
}

function revenueMix(wb, lastN = 12) {
  const rows = getRows(wb, 'Revenue Mix');
  const planHeaderIdx = rows.findIndex(r => String(r[1]).includes('Booked Revenue Mix by Plan'));
  if (planHeaderIdx < 0) return null;
  const dateRow = rows[planHeaderIdx];
  const allDates = dateRow.slice(2).filter(d => d !== '').map(d => typeof d === 'number' ? excelDate(d) : String(d));
  const recent = allDates.slice(-lastN);
  const startOffset = allDates.length - lastN;

  const plans = [];
  for (let i = planHeaderIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const plan = String(r[1] || '').trim();
    if (!plan || plan === 'Subscription Mix') break;
    if (plan) {
      plans.push({ plan, values: recent.map((_, j) => r[j + 2 + startOffset] || 0), isTotal: plan === 'Total' });
    }
  }
  return { dates: recent, plans: plans.filter(p => p.plan) };
}

function signupConversion(wb, lastN = 6) {
  const rows = getRows(wb, 'Signup to Conversion Cohorts');
  const headerIdx = rows.findIndex(r => String(r[2]).includes('Total Signups'));
  if (headerIdx < 0) return null;
  const rawHdr = rows[headerIdx];
  const mCols = rawHdr.slice(3).filter(h => h !== '' && String(h).startsWith('M')).slice(0, 7); // M0–M6
  const allDataRows = rows.slice(headerIdx + 1).filter(r => typeof r[1] === 'number' && r[1] > 40000);
  const table1 = allDataRows.filter(r => r[3] === 0 || (typeof r[3] === 'number' && r[3] < 1));
  const data = table1.slice(-lastN).map(r => {
    const obj = { cohort: excelDate(r[1]), totalSignups: r[2] };
    mCols.forEach((h, i) => {
      const v = r[i + 3];
      obj[h] = typeof v === 'number' ? Number((v * 100).toFixed(1)) : null;
    });
    return obj;
  });
  return { headers: mCols, data };
}

function channelCAC(wb, lastN = 3) {
  const rows = getRows(wb, 'Channel Level CACs');
  const months = [];
  let currentMonth = null, currentRows = [];
  rows.forEach(r => {
    const cell0 = String(r[0] || '').trim();
    const cell1 = String(r[1] || '').trim();
    if (cell0.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'\d{2}$/) && !cell1) {
      if (currentMonth && currentRows.length) months.push({ month: currentMonth, rows: currentRows });
      currentMonth = cell0; currentRows = [];
    } else if (currentMonth && cell0 === 'Grand Total') {
      months.push({ month: currentMonth, rows: currentRows, grandTotal: { conversions: r[2]||0, spends: r[3]||0, cac: r[4]||0 } });
      currentMonth = null; currentRows = [];
    } else if (currentMonth && cell1 && cell1 !== 'Platform' && cell1 !== 'OS') {
      currentRows.push({ platform: cell1, conversions: r[2]||0, spends: r[3]||0, cac: r[4]||0 });
    }
  });
  return months.slice(0, lastN);
}

function keyInitiatives(wb) {
  const rows = getRows(wb, 'Key Initiatives Summary');
  const initiatives = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const problem = r[0] ? String(r[0]).trim() : '';
    const hypothesis = r[1] ? String(r[1]).trim() : '';
    const actions = r[2] ? String(r[2]).trim() : '';
    const presentImpact = r[3] ? String(r[3]).trim() : '';
    const longTermImpact = r[4] ? String(r[4]).trim() : '';
    if (!actions && !presentImpact) continue;
    initiatives.push({ problem: problem || hypothesis, actions, presentImpact, longTermImpact });
  }
  return initiatives;
}

function overallCohorts(wb, lastN = 6) {
  const rows = getRows(wb, 'Overall Cohorts (Subscription)');
  const headerIdx = rows.findIndex(r => String(r[1]).includes('INR Mn') || String(r[2]) === 'M0');
  if (headerIdx < 0) return null;
  const rawHdr = rows[headerIdx];
  const mCols = rawHdr.slice(3).filter(h => h !== '' && String(h).startsWith('M')).slice(0, 7);
  const data = rows.slice(headerIdx + 1)
    .filter(r => typeof r[1] === 'number' && r[1] > 40000 && typeof r[2] === 'number')
    .slice(-lastN)
    .map(r => {
      const obj = { cohort: excelDate(r[1]), m0Revenue: Number(r[2].toFixed(3)) };
      mCols.forEach((h, i) => {
        const v = r[i + 3];
        obj[h] = typeof v === 'number' ? (h === 'M0' ? Number(v.toFixed(3)) : Number(((v / r[2]) * 100).toFixed(1))) : null;
      });
      return obj;
    });
  return { headers: mCols, data };
}

function brokingIS(wb, lastN = 12) {
  const NUM_MONTHS = 24;
  const START_YEAR = 2024, START_MONTH = 3;
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const allDates = [];
  for (let i = 0; i < NUM_MONTHS; i++) {
    const m = (START_MONTH + i) % 12;
    const y = START_YEAR + Math.floor((START_MONTH + i) / 12);
    allDates.push(`${MONTH_NAMES[m]} ${String(y).slice(2)}`);
  }

  const KEY_LABELS = new Set([
    'Total Income', 'Total Direct Expenses', 'Gross Margin', 'GP%',
    'Contribution Margin 2', 'CM2 %', 'EBITDA', 'EBITDA %',
    'PBT', 'PBT %', 'Net Profit/(Loss)',
  ]);

  const rows = getRows(wb, 'IS- Broking Accrued. ');
  const items = [];
  rows.forEach(r => {
    const label = String(r[0] || '').trim();
    if (!label || label === 'Particulars') return;
    if (typeof r[1] === 'number' && r[1] > 40000) return;
    if (!KEY_LABELS.has(label)) return;
    const values = Array.from({ length: NUM_MONTHS }, (_, i) => typeof r[i + 1] === 'number' ? r[i + 1] : 0);
    items.push({ label, values: values.slice(-lastN) });
  });

  return { dates: allDates.slice(-lastN), items };
}

async function loadAllMISData() {
  const wb = await getWorkbook();
  return {
    consolidatedIS: consolidatedIS(wb, 12),
    brokingIS: brokingIS(wb, 12),
    retention: retentionSummary(wb, 6),
    subscriptionCohorts: subscriptionCohorts(wb, 6),
    overallCohorts: overallCohorts(wb, 6),
    signupConversion: signupConversion(wb, 6),
    revenueMix: revenueMix(wb, 12),
    channelCAC: channelCAC(wb, 3),
    keyInitiatives: keyInitiatives(wb),
  };
}

module.exports = { loadAllMISData };
