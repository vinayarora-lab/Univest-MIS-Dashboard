const express = require('express');
const router = express.Router();
const axios = require('axios');
const XLSX = require('xlsx');
const { getWorkbook: getMISWorkbook } = require('../services/googleSheets');

const BOARD_SHEET_ID = '12XFIw3JSstYZyjLCbbjyizIOVGhKHzyRz67TAJwUGIE';
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${BOARD_SHEET_ID}/export?format=xlsx`;

let cache = { wb: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

async function getWorkbook() {
  const now = Date.now();
  if (cache.wb && now - cache.ts < CACHE_TTL) return cache.wb;
  const res = await axios.get(EXPORT_URL, {
    responseType: 'arraybuffer', maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30000,
  });
  const wb = XLSX.read(res.data, { type: 'buffer' });
  cache = { wb, ts: now };
  return wb;
}

function getRows(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false })
    .filter(r => r.some(c => c !== ''));
}

function toMonth(serial) {
  // Some rows have serials ~365 days too high (data entry quirk in the sheet)
  const s = serial > 46200 ? serial - 365 : serial;
  const d = new Date((s - 25569) * 86400 * 1000);
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

// Static competitive data extracted from univest_vs_tm_full_comparison.html
const COMPETITIVE = {
  univestWins: 10, tmWins: 0,
  scale: [
    { label: 'Total paying users (till date)', univest: '4,31,729', tm: '2,58,660', winner: 'U' },
    { label: 'ARR (Mar \'26)',                 univest: '$30M',      tm: '~$2.2M',   winner: 'U' },
    { label: 'Total revenue (till date)',       univest: '₹177 Cr',  tm: '₹18 Cr (FY26)', winner: 'U' },

  ],
  unitEcon: [
    { label: 'Blended AOV (1st txn)', univest: '₹2,555', tm: '₹1,581', winner: 'U' },
    { label: 'Repeat AOV',            univest: '₹3,437', tm: '₹1,675', winner: 'U' },
    { label: 'Blended LTV per user',  univest: '₹4,100', tm: '₹1,581', winner: 'U' },
  ],
  retention: [
    { label: 'Overall repeat rate',      univest: '44.95%', tm: '17.7%',       winner: 'U' },
    { label: 'Non-mandate repeat rate',  univest: '52.53%', tm: '—',            winner: 'U' },
    { label: 'Mandate repeat rate',      univest: '30.77%', tm: 'No E-NACH',    winner: 'U' },
    { label: 'Upgrade % on repeat',      univest: '36.7%',  tm: 'Not tracked',  winner: 'U' },
  ],
  planLTV: [
    { plan: 'Pro / Flagship',     univest: '₹3,348', tm: '₹1,232' },
    { plan: 'Super / Multiplier', univest: '₹4,999', tm: '₹3,287' },
    { plan: 'Edge / Edge',        univest: '₹3,361', tm: '₹2,266' },
    { plan: 'Black',              univest: '₹14,194', tm: 'Univest only' },
  ],
  verdict: 'Univest wins all 10 tracked metrics: 1.7x more paying users (4.3L vs 2.6L), 2.5x higher repeat rate (45% vs 18%), 2.6x higher LTV (₹4,100 vs ₹1,581), and 10x+ larger ARR ($30M vs ~$2.2M). At $30M ARR with 5x growth in 12 months (from $6M), Univest is operating at a fundamentally different scale and trajectory.',
};

// GET /api/board/data
router.get('/data', async (req, res) => {
  try {
    const wb = await getWorkbook();

    // ── CAC & Growth ──────────────────────────────────────────
    const cacRows = getRows(wb, 'CAC');
    const cac = cacRows.slice(1)
      .filter(r => typeof r[0] === 'number' && r[0] > 40000)
      .map(r => ({
        month:      toMonth(r[0]),
        serial:     r[0],
        signups:    typeof r[1] === 'number' ? r[1] : 0,
        conversions:typeof r[2] === 'number' ? r[2] : 0,
        spends:     typeof r[3] === 'number' ? r[3] : 0,
        signupCac:  typeof r[4] === 'number' ? Math.round(r[4]) : null,
        newUserCac: typeof r[5] === 'number' ? Math.round(r[5]) : null,
      }))
      .sort((a, b) => a.serial - b.serial);

    // ── Retention Cohorts (New Users section only) ────────────
    const retRows = getRows(wb, 'Retention Data ');
    // Find first "Month" header row that has M0 in col 2
    const hIdx = retRows.findIndex(r => r[0] === 'Month' && String(r[2]).includes('M0'));
    // Find second "Month" header (start of Repeat Users section) to stop parsing
    const h2Idx = retRows.findIndex((r, i) => i > hIdx && r[0] === 'Month');
    const retSection = retRows.slice(hIdx + 1, h2Idx > 0 ? h2Idx : undefined);

    // Sheet has some rows where dates are 1 year ahead — correct serials > 46170 (Jun 2026+)
    const retRaw = retSection
      .filter(r => typeof r[0] === 'number' && r[0] > 40000 && (r[1] || 0) > 100)
      .map(r => {
        const serial = r[0] > 46170 ? r[0] - 365 : r[0];
        const M0 = r[2] || 0;
        return {
          month:  toMonth(serial),
          serial,
          total:  r[1] || 0,
          M0,
          M1: r[3] || 0, M2: r[4] || 0, M3: r[5] || 0,
          M4: r[6] || 0, M5: r[7] || 0, M6: r[8] || 0,
          M1pct: M0 > 0 ? +((r[3] / M0) * 100).toFixed(1) : null,
          M2pct: M0 > 0 ? +((r[4] / M0) * 100).toFixed(1) : null,
          M3pct: M0 > 0 ? +((r[5] / M0) * 100).toFixed(1) : null,
          M4pct: M0 > 0 && r[6] ? +((r[6] / M0) * 100).toFixed(1) : null,
          M5pct: M0 > 0 && r[7] ? +((r[7] / M0) * 100).toFixed(1) : null,
        };
      })
      .sort((a, b) => a.serial - b.serial);

    // Deduplicate by month — keep the row with the highest total conversions
    const retByMonth = new Map();
    for (const row of retRaw) {
      const existing = retByMonth.get(row.month);
      if (!existing || row.total > existing.total) retByMonth.set(row.month, row);
    }
    const retention = [...retByMonth.values()].sort((a, b) => a.serial - b.serial);

    // ── AOP vs Actual FY25-26 ─────────────────────────────────
    // AOP targets: analytics sheet "AOP vs Actual" tab
    // Actuals:     MIS "Consolidated IS - Accrued"
    function rawToMonth(serial) {
      const d = new Date((serial - 25569) * 86400 * 1000);
      return d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    }

    let aop = { months: [], metrics: [] };
    try {
      // — AOP columns from analytics sheet —
      // Serials > 46107 (Mar 26) are 1 year ahead → correct by -365
      const aopRows = getRows(wb, 'AOP vs Actual');
      const aopHdr = aopRows.find(r => typeof r[1] === 'number' && r[1] > 40000);
      const aopCols = [];
      if (aopHdr) {
        aopHdr.forEach((v, i) => {
          if (typeof v === 'number' && v > 40000) {
            const s = v > 46107 ? v - 365 : v;
            if (s >= 45748 && s <= 46120) aopCols.push({ i, serial: s }); // Apr 25–Mar 26
          }
        });
        aopCols.sort((a, b) => a.serial - b.serial);
      }

      // — FY24-25 actuals from MIS IS Accrued (cols 15-26) —
      const misWb2 = await getMISWorkbook();
      const isRowsFY2425 = getRows(misWb2, 'Consolidated IS - Accrued');
      const isHdrFY2425 = isRowsFY2425.find(r => typeof r[2] === 'number' && r[2] > 40000);
      const fy2425Cols = [];
      if (isHdrFY2425) {
        isHdrFY2425.forEach((v, i) => {
          if (i >= 15 && i <= 26 && typeof v === 'number' && v >= 45400 && v <= 45745)
            fy2425Cols.push({ i, serial: v });
        });
        fy2425Cols.sort((a, b) => a.serial - b.serial);
      }
      const fy2425BrevRow = isRowsFY2425.find(r => String(r[1]).trim() === 'Booked Revenue(with GST)');
      const fy2425GmPctRow = isRowsFY2425.find(r => String(r[1]).trim() === 'Gross Margin %');
      const fy2425 = {
        months: fy2425Cols.map(c => rawToMonth(c.serial)),
        bookedRevValues: fy2425Cols.map(c => {
          const v = fy2425BrevRow ? fy2425BrevRow[c.i] : null;
          return typeof v === 'number' ? +v.toFixed(2) : null;
        }),
        gpPctValues: fy2425Cols.map(c => {
          const v = fy2425GmPctRow ? fy2425GmPctRow[c.i] : null;
          return typeof v === 'number' ? +(v * 100).toFixed(1) : null;
        }),
      };

      // — Actual columns from MIS IS Accrued —
      const isRows = getRows(misWb2, 'Consolidated IS - Accrued');
      const isHdr = isRows.find(r => typeof r[2] === 'number' && r[2] > 40000);
      const isCols = [];
      if (isHdr) {
        isHdr.forEach((v, i) => {
          if (i < 55 && typeof v === 'number' && v >= 45748 && v <= 46120) {
            // If the col immediately after the date col has an empty header, the
            // actual value is there (MIS stores AOP plan at date col for Apr/May 25).
            // If the next col is "GOLM" (GL adjustment), the date col itself is actual.
            const nextHdr = isHdr[i + 1];
            const actualIdx = (nextHdr === '' || nextHdr == null) ? i + 1 : i;
            isCols.push({ dateI: i, serial: v, actualI: actualIdx });
          }
        });
        isCols.sort((a, b) => a.serial - b.serial);
      }

      // Map AOP serial → IS serial (closest match within 15 days)
      const matchedCols = aopCols.map(ac => {
        const match = isCols.find(ic => Math.abs(ic.serial - ac.serial) <= 15);
        return { aopIdx: ac.i, serial: ac.serial, isIdx: match ? match.actualI : null };
      });

      const months2 = matchedCols.map(c => rawToMonth(c.serial));

      const METRIC_MAP = [
        { label: 'Total Income',  aopKey: 'Total Income',  isKey: 'Booked Revenue(with GST)', isPercent: false },
        { label: 'GP%',           aopKey: 'GP%',           isKey: 'Gross Margin %',           isPercent: true  },
      ];

      const metrics = METRIC_MAP.map(m => {
        const aopRow = aopRows.find(r => String(r[0]).trim() === m.aopKey);
        const isRow  = isRows.find(r => String(r[1]).trim() === m.isKey);
        const aopValues    = matchedCols.map(c => {
          const v = aopRow ? aopRow[c.aopIdx] : null;
          if (typeof v !== 'number') return null;
          return m.isPercent ? +(v * 100).toFixed(1) : +v.toFixed(2);
        });
        const actualValues = matchedCols.map(c => {
          if (c.isIdx == null || !isRow) return null;
          const v = isRow[c.isIdx];
          if (typeof v !== 'number') return null;
          return m.isPercent ? +(v * 100).toFixed(1) : +v.toFixed(2);
        });
        return { label: m.label, isPercent: m.isPercent, aopValues, actualValues };
      });

      // Append Apr 26 (user-provided: AOP 134.2, Actual 119, GP% ~96%)
      months2.push('Apr 26');
      metrics.forEach(m => {
        if (m.label === 'Total Income') { m.aopValues.push(134.2); m.actualValues.push(119); }
        else if (m.label === 'GP%')     { m.aopValues.push(96);    m.actualValues.push(96);  }
        else                            { m.aopValues.push(null);  m.actualValues.push(null); }
      });
      fy2425.bookedRevValues.push(null);
      fy2425.gpPctValues.push(null);

      aop = { months: months2, metrics, fy2425 };
    } catch (e) {
      console.error('[AOP vs Actual]', e.message);
    }

    // ── CAC-LTV (from analytics workbook) ─────────────────────
    const cacLtvRows = getRows(wb, 'CAC-LTV');
    const cacLtv = cacLtvRows.slice(1)
      .filter(r => typeof r[0] === 'string' && r[0].trim())
      .map(r => {
        const newUsers   = typeof r[1] === 'number' ? r[1] : 0;
        const repUsers   = typeof r[2] === 'number' ? r[2] : 0;
        const totalUsers = typeof r[3] === 'number' ? r[3] : 0;
        const rev1       = typeof r[4] === 'number' ? r[4] : 0;
        const revRep     = typeof r[5] === 'number' ? r[5] : 0;
        const totalRev   = typeof r[6] === 'number' ? r[6] : 0;
        // Cols 7+8 added (Repeat Eligible Users, User already Repeated) → shift all after col 6
        const repeatRate = typeof r[9] === 'number' ? r[9] : 0;
        const userCac    = typeof r[14] === 'number' ? Math.round(r[14]) : null;
        const ltv        = typeof r[15] === 'number' ? Math.round(r[15]) : null;
        const ltvcacRatio = typeof r[16] === 'number' ? +r[16].toFixed(2) : null;
        const timeline   = typeof r[17] === 'string' ? r[17].trim() : '';
        // Short month label e.g. "Apr 26"
        const d = new Date(r[0]); // "April 2026" parses fine
        const shortMonth = isNaN(d) ? r[0] : d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
        return {
          month: shortMonth,
          fullMonth: r[0],
          timeline,
          newUsers,
          repUsers,
          totalUsers,
          rev1InrL:   +( rev1    / 100000).toFixed(2),
          revRepInrL: +( revRep  / 100000).toFixed(2),
          totalRevInrL: +(totalRev / 100000).toFixed(2),
          repeatRate: +(repeatRate * 100).toFixed(1),
          newUserArpu: newUsers > 0 ? Math.round(rev1 / newUsers) : null,
          repUserArpu: repUsers > 0 ? Math.round(revRep / repUsers) : null,
          blendedArpu: totalUsers > 0 ? Math.round(totalRev / totalUsers) : null,
          userCac,
          ltv,
          ltvcacRatio,
        };
      })
      .reverse(); // oldest → newest

    // ── Broking Summary (from MIS workbook) ───────────────────
    let broking = { dates: [], items: [] };
    try {
      const misWb = await getMISWorkbook();
      const bRows = getRows(misWb, 'IS- Broking Accrued. ');
      const NUM_MONTHS = 24;
      const START_YEAR = 2024, START_MONTH = 3;
      const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const bDates = [];
      for (let i = 0; i < NUM_MONTHS; i++) {
        const m = (START_MONTH + i) % 12;
        const y = START_YEAR + Math.floor((START_MONTH + i) / 12);
        bDates.push(`${MONTH_NAMES[m]} ${String(y).slice(2)}`);
      }
      const bKeyLabels = ['Total Income', 'Gross Margin', 'EBITDA', 'Net Profit/(Loss)'];
      const bItems = bKeyLabels.map(label => {
        const row = bRows.find(r => String(r[0]).trim() === label);
        if (!row) return null;
        const values = Array.from({ length: NUM_MONTHS }, (_, i) => typeof row[i + 1] === 'number' ? +row[i + 1].toFixed(2) : 0);
        return { label, values, isPercent: false };
      }).filter(Boolean);
      broking = { dates: bDates, items: bItems };
    } catch (_) {}

    // ── Accrued Revenue (from MIS workbook) ───────────────────
    let accruedRev = { months: [], bookedRev: [], otherRev: [], grossRev: [], gpPct: [] };
    try {
      const misWb = await getMISWorkbook();
      const arRows = getRows(misWb, 'Consolidated IS - Accrued');
      const arHdr = arRows.find(r => typeof r[2] === 'number' && r[2] > 40000);
      if (arHdr) {
        const arCols = [];
        arHdr.forEach((v, i) => {
          if (i >= 2 && i < 55 && typeof v === 'number' && v > 40000)
            arCols.push({ i, serial: v });
        });
        arCols.sort((a, b) => a.serial - b.serial);

        const bookedRevRow = arRows.find(r => String(r[1]).trim() === 'Booked Revenue(with GST)');
        const otherRevRow  = arRows.find(r => String(r[1]).trim() === 'Other Revenue');
        const grossRevRow  = arRows.find(r => String(r[1]).trim() === 'Gross Revenue (with GST) - Accrued');
        const gpPctRow     = arRows.find(r => String(r[1]).trim() === 'Gross Margin %');

        const pick = (row, col) => {
          const v = row ? row[col.i] : null;
          return typeof v === 'number' ? +v.toFixed(2) : null;
        };

        accruedRev = {
          months:    arCols.map(c => rawToMonth(c.serial)),
          bookedRev: arCols.map(c => pick(bookedRevRow, c)),
          otherRev:  arCols.map(c => pick(otherRevRow,  c)),
          grossRev:  arCols.map(c => pick(grossRevRow,  c)),
          gpPct:     arCols.map(c => {
            const v = gpPctRow ? gpPctRow[c.i] : null;
            return typeof v === 'number' ? +(v * 100).toFixed(1) : null;
          }),
        };
      }
    } catch (e) { console.error('[accruedRev]', e.message); }

    // ── Fundraise (from MIS workbook) ─────────────────────────
    let fundraise = { rounds: [], totalRaised: 0 };
    try {
      const misWb = await getMISWorkbook();
      const fRows = getRows(misWb, 'Fundraise History');
      const fHIdx = fRows.findIndex(r => String(r[1]).toLowerCase() === 'round');
      const fData = fRows.slice(fHIdx + 1).filter(r =>
        typeof r[1] === 'string' && r[1].trim() && r[1] !== 'Total' && typeof r[3] === 'number'
      );
      fundraise.rounds = fData.map(r => ({
        round: r[1],
        period: typeof r[2] === 'number' ? toMonth(r[2]) : r[2],
        amount: r[3],
        investors: r[4] || '',
      }));
      fundraise.totalRaised = fData.reduce((s, r) => s + (typeof r[3] === 'number' ? r[3] : 0), 0);
    } catch (_) {}

    // ── IS Summary — ARR & Total Revenue (from MIS workbook) ──
    let isSummary = { arrInrCr: null, arrUsdM: null, totalRevenueInrCr: null, latestMonth: null, latestMonthlyInrCr: null, basis: '' };
    try {
      const misWb = await getMISWorkbook();
      const isRows = getRows(misWb, 'Consolidated IS - Accrued');
      const isHdrRow = isRows.find(r => typeof r[2] === 'number' && r[2] > 40000);
      if (isHdrRow) {
        const dateCols = [];
        isHdrRow.forEach((v, i) => {
          if (i < 55 && typeof v === 'number' && v > 40000) dateCols.push({ i, serial: v });
        });
        const bookedRevRow = isRows.find(r => String(r[1]).trim() === 'Booked Revenue(with GST)');
        if (bookedRevRow && dateCols.length > 0) {
          const vals = dateCols
            .map(c => ({ serial: c.serial, month: toMonth(c.serial), v: bookedRevRow[c.i] }))
            .filter(x => typeof x.v === 'number' && x.v > 0)
            .sort((a, b) => a.serial - b.serial);
          const latest = vals[vals.length - 1];
          const totalInrMn = vals.reduce((s, x) => s + x.v, 0);
          const arrInrMn = latest.v * 12;
          isSummary = {
            arrInrCr: +(arrInrMn / 10).toFixed(1),
            arrUsdM: +(arrInrMn * 1e6 / 84 / 1e6).toFixed(1),
            totalRevenueInrCr: +(totalInrMn / 10).toFixed(1),
            latestMonth: latest.month,
            latestMonthlyInrCr: +(latest.v / 10).toFixed(2),
            basis: 'Accrued · incl. GST',
          };
        }
      }
    } catch (_) {}

    // Update ARR entry in competitive table with live value
    const competitive = { ...COMPETITIVE };
    if (isSummary.arrUsdM) {
      competitive.scale = COMPETITIVE.scale.map(m =>
        m.label === "ARR (Mar '26)"
          ? { ...m, univest: `$${isSummary.arrUsdM}M` }
          : m.label === 'Total revenue (till date)'
          ? { ...m, univest: `₹${isSummary.totalRevenueInrCr} Cr` }
          : m
      );
      competitive.verdict = COMPETITIVE.verdict
        .replace('$30M', `$${isSummary.arrUsdM}M`)
        .replace('₹177 Cr', `₹${isSummary.totalRevenueInrCr} Cr`);
    }

    // ── iOS Conversion Stats ─────────────────────────────────
    let iosConversion = [];
    try {
      const IOS_SHEET_ID = '1OF0SuJ7y14_l7UF9avyOdh3Y9MC2gv_yTvawnv35SFQ';
      const IOS_URL = `https://docs.google.com/spreadsheets/d/${IOS_SHEET_ID}/export?format=csv&gid=430724246`;
      const iosRes = await axios.get(IOS_URL, {
        maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000,
      });
      const lines = iosRes.data.split('\n');
      const parsePct = s => { const n = parseFloat(String(s).replace('%','')); return isNaN(n) ? null : n; };
      const fmtMonth = s => {
        if (!s || !s.match(/^\d{4}-\d{2}$/)) return null;
        const d = new Date(s + '-01');
        return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      };
      const parseRow = cols => {
        const ym = cols[0]?.trim();
        if (!ym || !ym.match(/^\d{4}-\d{2}$/)) return null;
        return {
          month: fmtMonth(ym),
          ym,
          d0Pct:       parsePct(cols[1]),
          d30Pct:      parsePct(cols[2]),
          tillDatePct: parsePct(cols[3]),
          revenueInrL: cols[4] ? +(parseInt(cols[4]) / 100000).toFixed(2) : null,
          signups:     cols[5] ? parseInt(cols[5]) : null,
          trialPct:    parsePct(cols[6]),
        };
      };
      // Parse CSV manually to handle embedded commas
      const csvRows = lines.map(l => l.split(','));
      // Find monthly pivot tables (col index 20)
      const allMonthly = {};
      for (const row of csvRows) {
        const r1 = parseRow(row.slice(20, 28));
        if (r1) allMonthly[r1.ym] = r1;
        // Also try col 0 for the second smaller table (it appears mixed)
      }
      // Also check second pivot table (sometimes in cols 20+, already covered above)
      iosConversion = Object.values(allMonthly)
        .filter(r => r.ym && r.ym !== 'Grand Total')
        .sort((a, b) => a.ym.localeCompare(b.ym));
    } catch(e) {
      console.warn('[iOS] fetch failed:', e.message);
    }

    // ── Broking Packs Summary (from analytics workbook) ──────
    let brokingPacks = null;
    try {
      const bpRows = getRows(wb, 'Broking Packs Summary');
      if (bpRows.length >= 2) {
        const hdr = bpRows[0];
        const toNum = v => {
          if (typeof v === 'number') return v;
          const n = parseFloat(String(v).replace(/,/g, ''));
          return isNaN(n) ? 0 : n;
        };
        const colIdx = key => hdr.findIndex(h => String(h).toLowerCase().includes(key.toLowerCase()));
        const iMonth = 0;
        const iPlans = colIdx('Plans');
        const iTxnSold = colIdx('Trades Sold');
        const iUtil = colIdx('Utilized');
        const iRev = colIdx('Revenue');
        const iCpt = colIdx('Cost Per');
        const iExp = colIdx('Expired');
        const iBal = colIdx('Balance');

        const rows = bpRows.slice(1).map(r => ({
          month:       String(r[iMonth] ?? '').trim(),
          plans:       toNum(r[iPlans]),
          txnSold:     toNum(r[iTxnSold]),
          txnUtilized: toNum(r[iUtil]),
          revenue:     toNum(r[iRev]),
          costPerTrade: toNum(r[iCpt]),
          txnExpired:  toNum(r[iExp]),
          txnBalance:  toNum(r[iBal]),
        })).filter(r => r.month);

        const sum = key => rows.reduce((s, r) => s + (r[key] || 0), 0);
        brokingPacks = {
          rows,
          totals: {
            plans:       sum('plans'),
            txnSold:     sum('txnSold'),
            txnUtilized: sum('txnUtilized'),
            revenue:     sum('revenue'),
            txnExpired:  sum('txnExpired'),
            txnBalance:  sum('txnBalance'),
          },
        };
      }
    } catch(e) {
      console.warn('[BrokingPacks] parse failed:', e.message);
    }

    res.json({ cac, retention, competitive, aop, broking, fundraise, isSummary, cacLtv, accruedRev, iosConversion, brokingPacks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
