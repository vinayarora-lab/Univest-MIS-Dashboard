const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const http = require('http');
const googleSheets = require('../services/googleSheets');
const { getVendorOutstanding } = require('../services/zohoOutstanding');

// GET /api/datapack/refresh — force re-fetch from Google Sheets
router.get('/refresh', async (req, res) => {
  try {
    googleSheets.cache.ts = 0;
    await googleSheets.getWorkbook();
    res.json({ ok: true, message: 'Workbook refreshed from Google Sheets' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const { getWorkbook } = googleSheets;

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

// GET /api/datapack/retention
router.get('/retention', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Retention Improvements');
    const headerIdx = rows.findIndex(r => r[0] === 'Month');
    // Only use New section: stop before the second occurrence of 'M0' in the raw header row
    const rawHdr = rows[headerIdx];
    const firstM0 = rawHdr.indexOf('M0');
    const secondM0 = rawHdr.indexOf('M0', firstM0 + 1);
    const newSectionHeaders = rawHdr.slice(0, secondM0 > 0 ? secondM0 : rawHdr.length).filter(h => h !== '');
    // newSectionHeaders = ['Month','M0','M1',...,'M18','New Conversions']
    const colHeaders = newSectionHeaders.slice(1); // remove 'Month'
    const data = rows.slice(headerIdx + 1)
      .filter(r => typeof r[0] === 'string' && r[0].includes('2'))
      .map(r => {
        const obj = { month: r[0] };
        colHeaders.forEach((h, i) => { obj[h] = typeof r[i + 1] === 'number' ? r[i + 1] : 0; });
        return obj;
      });
    res.json({ headers: colHeaders, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/signup-conversion
router.get('/signup-conversion', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Signup to Conversion Cohorts');
    const headerIdx = rows.findIndex(r => String(r[2]).includes('Total Signups'));
    const rawHdr = rows[headerIdx];
    // M0..M12 columns start at index 3 in raw row
    const mCols = rawHdr.slice(3).filter(h => h !== '' && String(h).startsWith('M')).slice(0, 13);
    // Use Table 1 rows only: where M0 value is a fraction (< 1) or 0
    const allDataRows = rows.slice(headerIdx + 1).filter(r => typeof r[1] === 'number' && r[1] > 40000);
    const table1 = allDataRows.filter(r => r[3] === 0 || (typeof r[3] === 'number' && r[3] < 1));
    const data = table1.slice(-18).map(r => {
      const obj = { cohort: excelDate(r[1]), totalSignups: r[2] };
      mCols.forEach((h, i) => {
        const v = r[i + 3];
        obj[h] = typeof v === 'number' ? Number((v * 100).toFixed(2)) : null;
      });
      return obj;
    });
    res.json({ headers: mCols, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/overall-cohorts
router.get('/overall-cohorts', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Overall Cohorts (Subscription)');
    const headerIdx = rows.findIndex(r => String(r[1]).includes('INR Mn') || String(r[2]) === 'M0');
    const rawHdr = rows[headerIdx];
    // M0..M12 as column labels (M0 = absolute rev, M1+ = % of M0)
    const mCols = rawHdr.slice(3).filter(h => h !== '' && String(h).startsWith('M')).slice(0, 13);
    const data = rows.slice(headerIdx + 1)
      .filter(r => typeof r[1] === 'number' && r[1] > 40000 && typeof r[2] === 'number')
      .slice(-18)
      .map(r => {
        const m0Rev = r[2]; // INR Mn absolute
        const obj = { cohort: excelDate(r[1]), m0Revenue: Number(m0Rev.toFixed(3)) };
        mCols.forEach((h, i) => {
          const v = r[i + 3];
          if (h === 'M0') {
            obj[h] = typeof v === 'number' ? Number(v.toFixed(3)) : null;
          } else {
            // M1+ as % of M0
            obj[h] = typeof v === 'number' && m0Rev > 0 ? Number(((v / m0Rev) * 100).toFixed(1)) : null;
          }
        });
        return obj;
      });
    res.json({ headers: mCols, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/subscription-cohorts
router.get('/subscription-cohorts', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Subscription Booking Cohorts');
    const headerIdx = rows.findIndex(r => String(r[1]).includes('INR Mn'));
    // Find the second INR Mn header (Section 2 = absolute revenue) to scope Section 1 only
    const header2Idx = rows.findIndex((r, i) => i > headerIdx && String(r[1]).includes('INR Mn'));
    const sec1Rows = rows.slice(headerIdx + 1, header2Idx > 0 ? header2Idx : undefined);
    const data = sec1Rows
      .filter(r => typeof r[1] === 'number' && r[1] > 40000 && typeof r[2] === 'number')
      .map(r => {
        const obj = { cohort: excelDate(r[1]), newRevenue: r[2], repeatRevenue: typeof r[3] === 'number' ? r[3] : null };
        ['Repeat M0','M1','M2','M3','M4','M5'].forEach((h, i) => {
          obj[h] = typeof r[i + 4] === 'number' ? Number((r[i + 4] * 100).toFixed(1)) : null;
        });
        return obj;
      }).slice(-18);
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/broking-is
router.get('/broking-is', async (req, res) => {
  try {
    const wb = await getWorkbook();

    // Use ONLY "IS- Broking Accrued. " (dot sheet) — has all 24 months Apr'24–Mar'26 in cols 1–24.
    // The sheet's own date headers are WRONG; generate correct dates programmatically.
    const NUM_MONTHS = 24;
    const START_YEAR = 2024, START_MONTH = 3; // Apr = month index 3 (0-based)
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dates = [];
    for (let i = 0; i < NUM_MONTHS; i++) {
      const m = (START_MONTH + i) % 12;
      const y = START_YEAR + Math.floor((START_MONTH + i) / 12);
      dates.push(`${MONTH_NAMES[m]} ${String(y).slice(2)}`);
    }

    const BROKING_SECTION = {
      'Gross Margin': 'Margins', 'GP%': 'Margins',
      'Contribution Margin 2': 'Margins', 'CM2 %': 'Margins',
      'EBITDA': 'Profitability', 'EBITDA %': 'Profitability',
      'PBT': 'Profitability', 'PBT %': 'Profitability',
      'Net Profit/(Loss)': 'Profitability',
    };
    const BROKING_PCT = new Set(['GP%', 'CM2 %', 'EBITDA %', 'PBT %']);
    const BROKING_TOTAL = new Set(['Total Income','Total Direct Expenses','Total Discount Direct Expenses and Marketing','Total Corporate Costs','Gross Margin','Contribution Margin 2','EBITDA','PBT','Net Profit/(Loss)']);

    const rows = getRows(wb, 'IS- Broking Accrued. ');
    const items = [];
    let section = '';
    rows.forEach(r => {
      const label = String(r[0] || '').trim();
      if (!label || label === 'Particulars') return;
      // Skip the date header row (col 1 is a large Excel serial / future date number)
      if (typeof r[1] === 'number' && r[1] > 40000) return;
      if (['Income','Expenses','Direct Income','Indirect Expenses'].includes(label)) { section = label; return; }
      const effectiveSection = BROKING_SECTION[label] || section;
      // Data is in cols 1–24
      const values = Array.from({ length: NUM_MONTHS }, (_, i) => typeof r[i + 1] === 'number' ? r[i + 1] : 0);
      if (values.some(v => v !== 0) || BROKING_TOTAL.has(label)) {
        items.push({ label, section: effectiveSection, values, isTotal: BROKING_TOTAL.has(label), isPercent: BROKING_PCT.has(label) });
      }
    });

    res.json({ dates, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/advisory-ideas
router.get('/advisory-ideas', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Advisory Idea Outcomes');
    const typeHeaderIdx = rows.findIndex(r => String(r[0]).includes('Type of idea'));
    // Deduplicate date headers; also fix fiscal-year text dates where "Jan 25" after "Dec 25"
    // means Jan 2026 (Indian FY: Apr-Mar, so Jan-Mar carry same FY year tag as prior months)
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const rawHeaders = rows[typeHeaderIdx].slice(1).filter(d => d !== '').map(d =>
      typeof d === 'number' ? excelDate(d) : String(d)
    );
    // Take unique headers stopping before second full repetition; prefer serial-converted ones
    const seenH = new Set(); const dateHeaders = [];
    for (const h of rawHeaders) {
      if (h === 'Overall') { dateHeaders.push(h); break; }
      if (!seenH.has(h)) { seenH.add(h); dateHeaders.push(h); }
    }
    // Fix fiscal-year text dates: Apr–Dec carry one calendar year, Jan–Mar carry next
    // e.g. FY26 = "Apr 25"…"Dec 25", "Jan 25"→"Jan 26", "Feb 25"→"Feb 26", "Mar 25"→"Mar 26"
    for (let i = 1; i < dateHeaders.length; i++) {
      const prev = dateHeaders[i-1]; const cur = dateHeaders[i];
      if (cur === 'Overall') break;
      const pm = MONTHS.findIndex(m => prev.startsWith(m));
      const cm = MONTHS.findIndex(m => cur.startsWith(m));
      const pyStr = prev.replace(/[^0-9]/g,''); const cyStr = cur.replace(/[^0-9]/g,'');
      if (!pyStr || !cyStr) continue;
      const prevYearHigher = parseInt(pyStr) > parseInt(cyStr);
      // Fiscal boundary: Dec(11) → Jan/Feb/Mar(0-2) with same year needs +1
      const fiscalBoundary = pm === 11 && cm <= 2 && pyStr === cyStr;
      if (prevYearHigher || fiscalBoundary) {
        const newYear = String(parseInt(cyStr) + 1).padStart(2, '0');
        dateHeaders[i] = cur.replace(cyStr, newYear);
      }
    }
    // Second dedup pass after year corrections
    const finalHeaders = []; const seenH2 = new Set();
    for (const h of dateHeaders) { if (!seenH2.has(h)) { seenH2.add(h); finalHeaders.push(h); } }
    dateHeaders.length = 0; finalHeaders.forEach(h => dateHeaders.push(h));

    const sections = ['Ideas Given (#)', 'Ideas Partially Hit/Hit (#)', 'Accuracy %', 'Returns %', 'Alpha %'];

    const parseSection = (startLabel) => {
      const startIdx = rows.findIndex(r => String(r[0]).includes(startLabel));
      if (startIdx < 0) return [];
      const result = [];
      for (let i = startIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const label = String(r[0] || '').trim();
        if (!label) continue;
        if (sections.some(s => String(r[0]).includes(s))) break;
        result.push({ type: label, values: dateHeaders.map((_, j) => r[j + 1] !== '' ? r[j + 1] : null) });
      }
      return result;
    };

    const ideasGiven = parseSection('Ideas Given (#)');
    const ideasHit = parseSection('Ideas Partially Hit/Hit (#)');
    const accuracy = parseSection('Accuracy %');
    const returns = parseSection('Returns %');
    const alpha = parseSection('Alpha %');

    res.json({ dateHeaders, ideasGiven, ideasHit, accuracy, returns, alpha });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/call-accuracy
router.get('/call-accuracy', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Call Accuracy');
    const typeHeaderIdx = rows.findIndex(r => String(r[1]).includes('Outcome of Idea') || String(r[0]).includes('Outcome'));
    const dateHeaders = rows[typeHeaderIdx].slice(2).filter(d => d !== '').map(d =>
      typeof d === 'number' ? excelDate(d) : String(d)
    );

    const sectionMap = {
      'Ideas Closed (#)': 'Ideas Closed (#)',
      'Ideas Hit (#)': 'Ideas Hit (#)',
      'Overall Ideas Accuracy Ratio (%)': 'Accuracy %',
    };
    const sectionLabels = Object.keys(sectionMap);
    const result = {};
    sectionLabels.forEach(sec => {
      const idx = rows.findIndex(r => String(r[1]).includes(sec) || String(r[0]).includes(sec));
      if (idx < 0) return;
      const outKey = sectionMap[sec];
      result[outKey] = [];
      for (let i = idx + 1; i < rows.length; i++) {
        const r = rows[i];
        const label = String(r[1] || r[0] || '').trim();
        if (!label) continue;
        if (sectionLabels.some(s => String(r[1]).includes(s) || String(r[0]).includes(s))) break;
        const isAccuracy = sec.includes('Accuracy');
        result[outKey].push({
          type: label,
          values: dateHeaders.map((_, j) => {
            const v = r[j + 2];
            if (v === '' || v === '-' || v === 'NA' || v == null) return null;
            return isAccuracy && typeof v === 'number' ? Number((v * 100).toFixed(1)) : v;
          }),
        });
      }
    });
    res.json({ dateHeaders, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/broking-cohorts
router.get('/broking-cohorts', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Broking Cohorts');
    const headerIdx = rows.findIndex(r => String(r[0]) === 'months' && String(r[1]) === 'Pan_submitted');
    // Normalize: sheet stores either decimal fractions (<1) or raw counts (>=1)
    const toPct = (val, pan) => {
      if (typeof val !== 'number') return 0;
      if (val < 1) return Number((val * 100).toFixed(2));          // decimal → %
      if (pan > 0) return Number((val / pan * 100).toFixed(2));    // raw count → %
      return 0;
    };
    const rawRows = rows.slice(headerIdx + 1)
      .filter(r => typeof r[0] === 'number' && r[0] > 40000 && typeof r[1] === 'number')
      .map(r => ({
        month: excelDate(r[0]),
        _serial: r[0],
        pan_submitted: r[1],
        overall_esign_pct: toPct(r[2], r[1]),
        esign_15min_pct:   toPct(r[3], r[1]),
        esign_30min_pct:   toPct(r[4], r[1]),
        d0_pct:            toPct(r[5], r[1]),
        d1_pct:            toPct(r[6], r[1]),
      }));
    // Deduplicate by displayed month name — keep the row with the larger pan_submitted (more complete)
    const seenM = new Map();
    rawRows.forEach(r => {
      if (!seenM.has(r.month) || r.pan_submitted > seenM.get(r.month).pan_submitted)
        seenM.set(r.month, r);
    });
    const data = [...seenM.values()]
      .sort((a, b) => a._serial - b._serial)
      .slice(-18)
      .map(({ _serial, ...r }) => r);
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/orders-mix
router.get('/orders-mix', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Orders Mix');
    const planHeaderIdx = rows.findIndex(r => String(r[1]).includes('Orders Mix by Plan'));
    const dateRow = rows[planHeaderIdx];
    // Stop at first duplicate date to avoid picking up the percentage-mix section
    const allDates = dateRow.slice(2).filter(d => d !== '').map(d => typeof d === 'number' ? excelDate(d) : String(d));
    const seenD = new Set(); const dates = [];
    for (const d of allDates) { if (seenD.has(d)) break; seenD.add(d); dates.push(d); }

    const plans = [];
    for (let i = planHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const plan = String(r[1] || '').trim();
      if (!plan || plan === 'Subscription Mix') break;
      if (plan === 'Total') {
        plans.push({ plan: 'Total', values: dates.map((_, j) => r[j + 2] || 0), isTotal: true });
      } else if (plan) {
        plans.push({ plan, values: dates.map((_, j) => r[j + 2] || 0) });
      }
    }
    res.json({ dates, plans });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/revenue-mix
router.get('/revenue-mix', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Revenue Mix');
    const planHeaderIdx = rows.findIndex(r => String(r[1]).includes('Booked Revenue Mix by Plan'));
    const dateRow = rows[planHeaderIdx];
    const allDates = dateRow.slice(2).filter(d => d !== '').map(d => typeof d === 'number' ? excelDate(d) : String(d));
    const seenD = new Set(); const dates = [];
    for (const d of allDates) { if (seenD.has(d)) break; seenD.add(d); dates.push(d); }

    const plans = [];
    for (let i = planHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const plan = String(r[1] || '').trim();
      if (!plan || plan === 'Subscription Mix') break;
      if (plan === 'Total' || plan) {
        plans.push({ plan: plan || 'Total', values: dates.map((_, j) => r[j + 2] || 0), isTotal: plan === 'Total' || !r[1] });
      }
    }
    res.json({ dates, plans: plans.filter(p => p.plan) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/offerings-matrix
router.get('/offerings-matrix', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Offerings Matrix');
    const headerIdx = rows.findIndex(r => String(r[1]).includes('Features'));
    const plans = rows[headerIdx].slice(2).filter(p => p !== '');

    const features = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const feature = String(r[1] || '').trim();
      if (!feature || String(r[1]).includes('Legend') || String(r[1]).includes('PRO Lite') || String(r[1]).includes('PRO Plus')) break;
      if (feature) {
        features.push({ feature, availability: plans.map((_, j) => String(r[j + 2] || '').trim()) });
      }
    }

    const legendIdx = rows.findIndex(r => String(r[1]).includes('Legend'));
    const legend = [];
    if (legendIdx >= 0) {
      for (let i = legendIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (r[1] && r[2]) legend.push({ plan: String(r[1]).trim(), description: String(r[2]).trim() });
      }
    }

    res.json({ plans, features, legend });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/fundraise
router.get('/fundraise', async (req, res) => {
  try {
    const wb = await getWorkbook();

    const frRows = getRows(wb, 'Fundraise History');
    const frHeaderIdx = frRows.findIndex(r => String(r[1]).includes('Round'));
    // Corrections: sheet has wrong round names and wrong date serials for some rows
    const ROUND_CORRECTIONS = {
      'Seed': { round: 'Angel', period: 'May 22' },
      'Seed 2': { round: 'Seed', period: 'Feb 23' },
      'Pre-Series A': { round: 'Pre-Series A', period: 'Apr 24' },
      'Series A': { round: 'Series A', period: 'Dec 24' },
    };
    const fundraise = frRows.slice(frHeaderIdx + 1).filter(r => r[1] && r[1] !== 'Total').map(r => {
      const sheetRound = String(r[1]).trim();
      const correction = ROUND_CORRECTIONS[sheetRound];
      return {
        round: correction ? correction.round : sheetRound,
        period: correction ? correction.period : (typeof r[2] === 'number' ? excelDate(r[2]) : String(r[2]).trim()),
        amount: r[3],
        investors: String(r[4] || '').trim()
      };
    });
    const total = frRows.find(r => String(r[1]).includes('Total'));

    const ctRows = getRows(wb, 'Captable');
    const ctHeaderIdx = ctRows.findIndex(r => String(r[1]).includes('Shareholder'));
    const captable = ctRows.slice(ctHeaderIdx + 1).filter(r => r[1] && r[1] !== '').map(r => ({
      shareholder: String(r[1]).trim(),
      equity: r[2] || 0,
      preference: r[3] || 0,
      totalFDB: r[4] || 0,
      shareholding: typeof r[5] === 'number' ? (r[5] * 100) : 0
    }));

    res.json({ fundraise, totalRaised: total ? total[3] : 94.9, captable });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/channel-cac
router.get('/channel-cac', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Channel Level CACs');

    const months = [];
    let currentMonth = null;
    let currentRows = [];

    rows.forEach(r => {
      const cell0 = String(r[0] || '').trim();
      const cell1 = String(r[1] || '').trim();
      if (cell0.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'\d{2}$/) && !cell1) {
        if (currentMonth && currentRows.length) months.push({ month: currentMonth, rows: currentRows });
        currentMonth = cell0;
        currentRows = [];
      } else if (currentMonth && cell1 === 'Platform') {
        // skip header row
      } else if (currentMonth && cell0 === 'Grand Total') {
        const total = { platform: 'Grand Total', conversions: r[2] || 0, spends: r[3] || 0, cac: r[4] || 0 };
        months.push({ month: currentMonth, rows: currentRows, grandTotal: total });
        currentMonth = null; currentRows = [];
      } else if (currentMonth && (cell0 || cell1) && cell1 !== 'OS' && cell1 !== 'Platform') {
        const platform = String(r[1] || '').trim();
        if (platform && platform !== 'Platform') {
          currentRows.push({
            os: String(r[0] || '').trim(),
            platform,
            conversions: r[2] !== '-' ? (r[2] || 0) : 0,
            spends: r[3] !== '-' ? (r[3] || 0) : 0,
            cac: r[4] !== '-' ? (r[4] || 0) : 0,
          });
        }
      }
    });

    res.json({ months });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/consolidated-is
router.get('/consolidated-is', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Consolidated IS - Accrued');
    const dateRow = rows.find(r => typeof r[2] === 'number' && r[2] > 40000 && String(r[1]).includes('Particulars'));
    if (!dateRow) return res.status(500).json({ error: 'Date row not found' });

    // Build monthly col index map (skip FY totals, GOLM, repeat section after col 56)
    const seen = new Set();
    const monthlyCols = [];
    dateRow.forEach((d, idx) => {
      if (idx >= 57) return;
      if (typeof d === 'number' && d > 40000 && !seen.has(d)) {
        seen.add(d);
        monthlyCols.push({ idx, date: excelDate(d) });
      }
    });

    // Some months (e.g. Apr 25, May 25) have the sheet structure [date_header(0/blank), actual, GOLM].
    // Detect these: if the date-header column has no numeric data in a reference row but the NEXT
    // column (blank date header) does, shift that month's column index by +1.
    const refRow = rows.find(r => String(r[1]).trim() === 'Total Net Revenue') ||
                   rows.find(r => String(r[1]).trim() === 'Gross Revenue (with GST) - Accrued');
    if (refRow) {
      monthlyCols.forEach(mc => {
        const val = refRow[mc.idx];
        const hasData = typeof val === 'number' && val !== 0;
        const nextIsBlank = !dateRow[mc.idx + 1] || typeof dateRow[mc.idx + 1] !== 'number';
        if (!hasData && nextIsBlank) {
          const nextVal = refRow[mc.idx + 1];
          if (typeof nextVal === 'number' && nextVal !== 0) mc.idx = mc.idx + 1;
        }
      });
    }

    const dates = monthlyCols.map(c => c.date);

    // Section grouping
    const sectionMap = {
      'Booked Revenue(with GST)': 'Revenue',
      'Subscription Revenue (with GST)': 'Revenue',
      'Gross Revenue (with GST) - Accrued': 'Revenue',
      'Total Net Revenue': 'Revenue',
      'Gross Margin': 'Margins',
      'Gross Margin %': 'Margins',
      'Total Performance Marketing': 'Costs',
      'Digital/Media Marketing': 'Costs',
      'Contribution Margin 2': 'Margins',
      'CM2 %': 'Margins',
      'Employee Costs': 'Costs',
      'Total Corporate Costs': 'Costs',
      'EBITDA (non-broking)': 'Profitability',
      'EBITDA (non-broking) %': 'Profitability',
      'Broking Income': 'Broking',
      'Broking Expenses': 'Broking',
      'Overall EBITDA': 'Profitability',
      'Overall EBITDA %': 'Profitability',
      'Overall PBT ( Accrued )': 'Profitability',
      'Overall PBT %': 'Profitability',
    };

    const keyLabels = new Set(Object.keys(sectionMap));
    const dateRowIdx = rows.indexOf(dateRow);
    const items = [];

    const seenLabels = new Set();
    rows.slice(dateRowIdx + 1).forEach(r => {
      const label = String(r[1] || '').trim();
      if (!label || !keyLabels.has(label) || seenLabels.has(label)) return;
      seenLabels.add(label);
      const values = monthlyCols.map(c => typeof r[c.idx] === 'number' ? r[c.idx] : null);
      const isPercent = label.includes('%');
      const isTotal = label.startsWith('Total') || label.startsWith('Overall') || label.startsWith('Gross') || label.startsWith('EBITDA') || label.startsWith('Contribution');
      items.push({ label, section: sectionMap[label], values, isPercent, isTotal });
    });

    res.json({ dates, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/key-initiatives
router.get('/key-initiatives', async (req, res) => {
  try {
    const wb = await getWorkbook();
    const rows = getRows(wb, 'Key Initiatives Summary');
    // Row 0 is the header row
    const initiatives = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const problem    = r[0] ? String(r[0]).trim() : '';
      const hypothesis = r[1] ? String(r[1]).trim() : '';
      const actions    = r[2] ? String(r[2]).trim() : '';
      const presentImpact   = r[3] ? String(r[3]).trim() : '';
      const longTermImpact  = r[4] ? String(r[4]).trim() : '';
      // Only include rows that have at least a problem/actions AND some impact (skip stub discussion rows)
      if (!actions && !presentImpact) continue;
      initiatives.push({ problem, hypothesis, actions, presentImpact, longTermImpact });
    }
    res.json({ initiatives });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/datapack/vendor-payouts
router.get('/vendor-payouts', async (req, res) => {
  try {
    const fmt = v => Math.round((v || 0) / 100000) / 10;

    // Determine date range defaults: last completed fiscal year or current FY
    let { fromDate, toDate } = req.query;
    if (!fromDate || !toDate) {
      const now = new Date();
      const month = now.getMonth(); // 0-based, 3 = April
      const year  = now.getFullYear();
      if (month === 3) {
        // Current month is April — use previous FY: Apr 1 of last year → Mar 31 of this year
        fromDate = `${year - 1}-04-01`;
        toDate   = `${year}-03-31`;
      } else if (month < 3) {
        // Jan–Mar: current FY started last April
        fromDate = `${year - 1}-04-01`;
        toDate   = `${year}-03-31`;
      } else {
        // May–Dec: current FY in progress, Apr 1 this year to today
        fromDate = `${year}-04-01`;
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        toDate   = `${year}-${mm}-${dd}`;
      }
    }

    // Call the main dashboard API on localhost:3001
    const dashboardData = await new Promise((resolve, reject) => {
      const url = `http://localhost:3001/api/dashboard?fromDate=${fromDate}&toDate=${toDate}`;
      http.get(url, (resp) => {
        let body = '';
        resp.on('data', chunk => { body += chunk; });
        resp.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('Failed to parse dashboard response: ' + e.message)); }
        });
      }).on('error', reject);
    });

    // Unwrap { ok, data: { companies } } envelope
    const payload = dashboardData.data || dashboardData;
    const companies = payload.companies || [];
    const allVendors = [];

    // Intercompany keywords — payments between Univest Group entities
    const INTERCOMPANY = [
      'univest communication', 'uniresearch global', 'uniapps global',
      'uniapps investment adviser', 'univest stock broking', 'univest securities',
    ];
    const isIntercompany = name => {
      const n = name.toLowerCase();
      return INTERCOMPANY.some(kw => n.includes(kw));
    };

    const companiesOut = companies.map(company => {
      const vendorBreakdown = (company.report && company.report.vendorBreakdown) || [];
      const vendors = vendorBreakdown
        .filter(v => v.name && v.name !== 'Unknown' && !isIntercompany(v.name))
        .map(v => ({
          name: v.name,
          totalPaid_L: fmt(v.totalOutflow),
          transactions: v.count || 0,
        }))
        .sort((a, b) => b.totalPaid_L - a.totalPaid_L);
      const totalPaid_L = vendors.reduce((s, v) => s + v.totalPaid_L, 0);
      vendors.forEach(v => {
        allVendors.push({ vendor: v.name, company: company.companyName || company.name, totalPaid_L: v.totalPaid_L, transactions: v.transactions });
      });
      return { name: company.companyName || company.name, totalPaid_L: Math.round(totalPaid_L * 10) / 10, vendors };
    });

    // Sort all vendors descending and take top 50
    allVendors.sort((a, b) => b.totalPaid_L - a.totalPaid_L);
    const topVendors = allVendors.slice(0, 50).map((v, i) => ({ rank: i + 1, ...v }));

    const totalPaid_L  = Math.round(allVendors.reduce((s, v) => s + v.totalPaid_L, 0) * 10) / 10;
    const totalTx      = allVendors.reduce((s, v) => s + v.transactions, 0);
    const totalVendors = new Set(allVendors.map(v => v.vendor)).size;

    res.json({
      period: `${fromDate} to ${toDate}`,
      summary: { totalVendors, totalPaid_L, totalTransactions: totalTx },
      companies: companiesOut,
      topVendors,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/datapack/vendor-outstanding — live unpaid bills per vendor from Zoho Books
router.get('/vendor-outstanding', async (req, res) => {
  try {
    const data = await getVendorOutstanding();
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
