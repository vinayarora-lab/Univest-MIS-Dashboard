/**
 * Runway Slide Generator
 * Fetches last 6 months of financial data and generates runway_slide.pptx
 */

'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { getDashboardData } = require('./services/financialDataService');
const { loadCompanies }    = require('./services/zohoAdapter');
const ZohoClient           = require(path.resolve(__dirname, '../../src/zohoClient'));
const PptxGenJS = require('pptxgenjs');

// ── Config ────────────────────────────────────────────────────────────────────
const TODAY = new Date('2026-03-29');

const COLORS = {
  bg:        '0F172A',
  accent:    '6366F1',
  amber:     'F59E0B',
  green:     '22C55E',
  red:       'EF4444',
  redDark:   '7F1D1D',
  greenDark: '14532D',
  card:      '1E293B',
  border:    '334155',
  white:     'F8FAFC',
  muted:     '94A3B8',
  dim:       '64748B',
  footer:    '475569',
  dataLabel: 'CBD5E1',
  warnRed:   'FCA5A5',
  warnGreen: '86EFAC',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCr(n) {
  const abs = Math.abs(n);
  if (abs >= 1e7) return (n < 0 ? '-' : '') + '\u20B9' + (abs / 1e7).toFixed(2) + ' Cr';
  return (n < 0 ? '-' : '') + '\u20B9' + (abs / 1e5).toFixed(1) + ' L';
}

function lastDayOf(y, m) { return new Date(y, m + 1, 0).getDate(); }
function pad(n) { return String(n).padStart(2, '0'); }

function monthRanges() {
  const months = [];
  for (let i = 6; i >= 1; i--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    months.push({
      label: d.toLocaleString('en-IN', { month: 'short' }).slice(0, 3) + " '" + String(y).slice(2),
      from:  `${y}-${pad(m + 1)}-01`,
      to:    `${y}-${pad(m + 1)}-${pad(lastDayOf(y, m))}`,
    });
  }
  return months;
}

// ── Fetch & Compute ──────────────────────────────────────────────────────────
async function computeMetrics() {
  const months   = monthRanges();
  const fromDate = months[0].from;
  const toDate   = months[months.length - 1].to;

  const round = (n) => Math.round(n * 100) / 100;

  // ── 1. Balance sheet + Innoven transactions from getDashboardData cache ─────
  console.log(`\nFetching dashboard data (balance sheet + transactions): ${fromDate} → ${toDate} ...`);
  const data        = await getDashboardData(fromDate, toDate);
  const allCompanies = data.companies || [];
  const zohoCompanies = allCompanies.filter((c) => c.source !== 'excel');
  const stockBroking  = allCompanies.find((c) => c.source === 'excel');

  // Balance sheet closing values — bank from Zoho only, FD includes Stock Broking
  const bsBank = round(zohoCompanies.reduce((s, c) => s + (c.balanceSheet?.totalBankBalance || 0), 0));
  const bsFd   = round(
    zohoCompanies.reduce((s, c) => s + (c.balanceSheet?.totalFdBalance || 0), 0) +
    (stockBroking?.balanceSheet?.totalFdBalance || 0)
  );
  const totalLiquid = bsBank + bsFd;

  // ── 2. Innoven principal payments from vendor_payment transactions ──────────
  // Principal repayments are NOT in P&L (they reduce the loan liability on BS).
  // We detect them as vendor_payment type with Innoven Capital / Alria party name.
  const LOAN_PARTIES = /innoven\s*capital|alri[ae]/i;
  const innovenByMonth = {};
  zohoCompanies.forEach((c) => {
    (c.transactions || []).forEach((t) => {
      if (t.type !== 'vendor_payment') return;
      if (!LOAN_PARTIES.test(t.partyName || '')) return;
      const ym = (t.date || '').slice(0, 7);
      if (!ym) return;
      innovenByMonth[ym] = (innovenByMonth[ym] || 0) + (t.amount || 0);
    });
  });

  // ── 3. P&L income & expenses per month per company (Zoho Books API) ─────────
  // P&L correctly excludes FD bookings/redemptions, fund transfers, interco entries.
  // pl[0].account_transactions[0].total = Total Operating Income
  // pl[1].account_transactions[0].total = Total Operating Expenses (incl. Finance Cost)
  const companyCreds = loadCompanies().filter((c) => c.orgId !== 'stock-broking');
  const region       = process.env.ZOHO_REGION || 'in';

  console.log(`\nFetching P&L from Zoho Books for ${companyCreds.length} companies × ${months.length} months ...`);

  const monthly = [];

  for (const monthDef of months) {
    const { label, from, to } = monthDef;
    const ym = from.slice(0, 7);

    let totalIncome = 0, totalExpenses = 0;

    for (const cred of companyCreds) {
      try {
        const client = new ZohoClient({
          clientId:       cred.clientId     || process.env.ZOHO_CLIENT_ID,
          clientSecret:   cred.clientSecret || process.env.ZOHO_CLIENT_SECRET,
          refreshToken:   cred.refreshToken || process.env.ZOHO_REFRESH_TOKEN,
          organizationId: cred.orgId,
          region,
        });

        const result = await client.request('/reports/profitandloss', {
          from_date: from,
          to_date:   to,
        });

        const pl       = result.profit_and_loss || [];
        // pl[0] = Income section; pl[0].account_transactions[0] = Operating Income sub-section
        // pl[1] = Expense section; pl[1].account_transactions[0] = Operating Expense sub-section
        const income   = Math.abs(parseFloat(pl[0]?.account_transactions?.[0]?.total || 0));
        const expenses = Math.abs(parseFloat(pl[1]?.account_transactions?.[0]?.total || 0));

        totalIncome   += income;
        totalExpenses += expenses;

        console.log(`  ${label} | ${cred.name}: Income ${fmtCr(income)}, Expenses ${fmtCr(expenses)}`);
      } catch (err) {
        console.error(`  [P&L ERROR] ${label} | ${cred.name}:`, err.message);
      }
    }

    const loanPayouts = round(innovenByMonth[ym] || 0);
    // Net Burn = P&L Income − P&L Expenses (incl. Finance Cost) − Innoven Principal
    const netBurn = totalIncome - totalExpenses - loanPayouts;

    monthly.push({
      label,
      income:      Math.round(totalIncome),
      expenses:    Math.round(totalExpenses),
      loanPayouts: Math.round(loanPayouts),
      netBurn:     Math.round(netBurn),
    });
  }

  // Cash balance month-end — work backwards from BS closing
  const cashBal = [];
  let running = bsBank;
  for (let i = 5; i >= 0; i--) {
    cashBal[i] = running;
    if (i > 0) running -= monthly[i].netBurn;   // netBurn already signed
  }
  monthly.forEach((m, i) => { m.cash = Math.round(cashBal[i]); });

  // KPI averages
  const avgIncome   = monthly.reduce((s, m) => s + m.income, 0) / 6;
  const avgExpenses = monthly.reduce((s, m) => s + m.expenses, 0) / 6;
  const avgLoans    = monthly.reduce((s, m) => s + m.loanPayouts, 0) / 6;
  const avgNetBurn  = monthly.reduce((s, m) => s + m.netBurn, 0) / 6;   // avg monthly net (neg = burn)
  const avgBurn     = avgExpenses + avgLoans;    // total cash out (for display)

  const currentCash = totalLiquid;
  // Runway uses abs(avgNetBurn) when burning (negative netBurn)
  const monthlyBurn = -avgNetBurn;   // positive number = burning X Cr/month
  const runway      = monthlyBurn > 0 ? Math.floor(currentCash / monthlyBurn) : 999;
  const burnTrend   = monthly[0].expenses > 0
    ? ((monthly[5].expenses - monthly[0].expenses) / monthly[0].expenses) * 100
    : 0;

  const zeroDate = new Date(TODAY);
  zeroDate.setMonth(zeroDate.getMonth() + Math.max(runway, 0));
  const zeroDateLabel = zeroDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' });

  console.log('\n── Monthly Breakdown ──────────────────────────────');
  monthly.forEach((m) =>
    console.log(`  ${m.label}  Income: ${fmtCr(m.income).padEnd(14)} Expenses: ${fmtCr(m.expenses).padEnd(14)} Loans: ${fmtCr(m.loanPayouts).padEnd(14)} Net Burn: ${fmtCr(m.netBurn).padEnd(14)} Cash: ${fmtCr(m.cash)}`),
  );
  console.log('\n── KPIs ──────────────────────────────────────────');
  console.log(`  BS Bank Balance:    ${fmtCr(bsBank)}`);
  console.log(`  BS FD Balance:      ${fmtCr(bsFd)}`);
  console.log(`  Total Liquid:       ${fmtCr(currentCash)}`);
  console.log(`  Avg Monthly Income: ${fmtCr(avgIncome)}`);
  console.log(`  Avg Monthly Burn:   ${fmtCr(avgBurn)}`);
  console.log(`  Avg Monthly Loans:  ${fmtCr(avgLoans)}`);
  console.log(`  Avg Net Burn/mo:    ${fmtCr(avgNetBurn)}`);
  console.log(`  Runway (net):       ${runway} months → ${zeroDateLabel}`);
  console.log(`  Burn Trend:         ${burnTrend >= 0 ? '+' : ''}${burnTrend.toFixed(1)}%`);

  return { monthly, avgBurn, avgNetBurn, avgIncome, currentCash, bsBank, bsFd, runway, burnTrend, zeroDateLabel, fromDate, toDate };
}

// ── PPTX ─────────────────────────────────────────────────────────────────────
function buildSlide(metrics) {
  const {
    monthly, avgBurn, avgNetBurn, currentCash, bsBank, bsFd,
    runway, burnTrend, zeroDateLabel,
  } = metrics;

  const labels  = monthly.map((m) => m.label);
  const burns   = monthly.map((m) => (m.expenses + m.loanPayouts) / 1e7);   // Gross burn in Cr
  const cashes  = monthly.map((m) => Math.max(m.cash, 0) / 1e7);

  const pptx = new PptxGenJS();
  pptx.layout  = 'LAYOUT_WIDE';
  pptx.author  = 'Univest Dashboard';
  pptx.subject = 'Cash Runway Analysis';

  const slide = pptx.addSlide();

  // Background
  slide.background = { color: COLORS.bg };

  // ── Left accent stripe ───────────────────────────────────────────────────
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.18, h: 5.625,
    fill: { color: COLORS.accent },
    line: { color: COLORS.accent, width: 0 },
  });

  // ── Header labels ────────────────────────────────────────────────────────
  slide.addText('RUNWAY ANALYSIS', {
    x: 0.35, y: 0.18, w: 9.3, h: 0.22,
    fontSize: 11, color: COLORS.accent,
    charSpacing: 4, fontFace: 'Calibri', bold: false,
  });

  slide.addText('Cash Burn & Runway Forecast', {
    x: 0.35, y: 0.42, w: 9.3, h: 0.42,
    fontSize: 26, color: COLORS.white,
    bold: true, fontFace: 'Calibri',
  });

  slide.addText(
    `Last 6 Months  \u00B7  ${labels[0]} \u2013 ${labels[5]}  \u00B7  Bank + FD basis`,
    {
      x: 0.35, y: 0.87, w: 9.3, h: 0.22,
      fontSize: 11, color: COLORS.muted, fontFace: 'Calibri',
    },
  );

  // ── 4 KPI Cards ──────────────────────────────────────────────────────────
  const runwayColor = runway >= 9 ? COLORS.green : COLORS.red;
  const CARDS = [
    {
      label: 'TOTAL LIQUID (Bank + FD)',
      value: fmtCr(currentCash),
      sub:   `Bank: ${fmtCr(bsBank)}  FD: ${fmtCr(bsFd)}`,
      bar:   COLORS.accent,
    },
    {
      label: 'AVG MONTHLY BURN (Gross)',
      value: fmtCr(avgBurn),
      sub:   `Net burn: ${fmtCr(avgNetBurn)}/mo`,
      bar:   COLORS.amber,
    },
    {
      label: 'RUNWAY (Net Burn Basis)',
      value: `${Math.max(runway, 0)} mos`,
      sub:   `Est. zero: ${zeroDateLabel}`,
      bar:   runwayColor,
    },
    {
      label: 'BURN TREND (Sept\u2192Feb)',
      value: (burnTrend >= 0 ? '+' : '') + burnTrend.toFixed(1) + '%',
      sub:   `${fmtCr(monthly[0].expenses)} \u2192 ${fmtCr(monthly[5].expenses)}`,
      bar:   'F87171',
    },
  ];

  const CARD_W = 2.2;
  const CARD_GAP = 0.09;
  const CARD_X0 = 0.35;
  const CARD_Y = 1.6;
  const CARD_H = 1.3;

  CARDS.forEach((card, i) => {
    const x = CARD_X0 + i * (CARD_W + CARD_GAP);

    // Card background
    slide.addShape(pptx.ShapeType.rect, {
      x, y: CARD_Y, w: CARD_W, h: CARD_H,
      fill: { color: COLORS.card },
      line: { color: COLORS.border, width: 0.75 },
    });

    // Accent bar on top
    slide.addShape(pptx.ShapeType.rect, {
      x, y: CARD_Y, w: CARD_W, h: 0.06,
      fill: { color: card.bar },
      line: { color: card.bar, width: 0 },
    });

    // Label
    slide.addText(card.label, {
      x: x + 0.12, y: CARD_Y + 0.1, w: CARD_W - 0.24, h: 0.2,
      fontSize: 7.5, color: COLORS.muted, charSpacing: 1.5,
      fontFace: 'Calibri', margin: 0,
    });

    // Value
    slide.addText(card.value, {
      x: x + 0.12, y: CARD_Y + 0.32, w: CARD_W - 0.24, h: 0.52,
      fontSize: card.value.length > 9 ? 18 : 22,
      color: COLORS.white, bold: true,
      fontFace: 'Calibri', margin: 0,
    });

    // Subtitle
    slide.addText(card.sub, {
      x: x + 0.12, y: CARD_Y + 0.88, w: CARD_W - 0.24, h: 0.28,
      fontSize: 8.5, color: COLORS.dim,
      fontFace: 'Calibri', margin: 0, wrap: true,
    });
  });

  // ── Chart area shared opts ───────────────────────────────────────────────
  const chartAreaFill = { color: COLORS.card };
  const axisLabelColor = COLORS.muted;
  const gridColor      = COLORS.border;

  const CHART_Y = 3.08;
  const CHART_H = 2.0;

  // LEFT: Bar — Monthly Gross Burn (Cr)
  slide.addChart(pptx.ChartType.bar, [
    {
      name: 'Monthly Burn',
      labels,
      values: burns,
    },
  ], {
    x: 0.35, y: CHART_Y, w: 4.6, h: CHART_H,
    chartColors: [COLORS.accent],
    chartArea:   { fill: chartAreaFill },
    plotArea:    { fill: chartAreaFill },
    catAxisLabelColor:  axisLabelColor,
    valAxisLabelColor:  axisLabelColor,
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 8,
    valGridLine: { color: gridColor, style: 'solid', size: 0.5 },
    catGridLine: { style: 'none' },
    showValue:   true,
    dataLabelColor: COLORS.dataLabel,
    dataLabelFontSize: 7.5,
    dataLabelFormatCode: '0.00',
    showLegend:  false,
    title:       'Monthly Gross Burn (\u20B9 Cr)',
    titleColor:  COLORS.muted,
    titleFontSize: 9,
    valAxisNumFmt: '0.00',
    border:      { pt: 0 },
  });

  // RIGHT: Line — Cash Balance Trend (Cr)
  slide.addChart(pptx.ChartType.line, [
    {
      name: 'Cash Balance',
      labels,
      values: cashes,
    },
  ], {
    x: 5.15, y: CHART_Y, w: 4.6, h: CHART_H,
    chartColors: [COLORS.green],
    chartArea:   { fill: chartAreaFill },
    plotArea:    { fill: chartAreaFill },
    catAxisLabelColor:  axisLabelColor,
    valAxisLabelColor:  axisLabelColor,
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 8,
    valGridLine: { color: gridColor, style: 'solid', size: 0.5 },
    catGridLine: { style: 'none' },
    lineSize:    2.5,
    lineSmooth:  true,
    showValue:   false,
    showLegend:  false,
    title:       'Bank Balance Trend (\u20B9 Cr)',
    titleColor:  COLORS.muted,
    titleFontSize: 9,
    valAxisNumFmt: '0.00',
    border:      { pt: 0 },
  });

  // ── Warning Banner ───────────────────────────────────────────────────────
  const warnBg   = runway < 9 ? COLORS.redDark   : COLORS.greenDark;
  const warnFg   = runway < 9 ? COLORS.warnRed   : COLORS.warnGreen;
  const warnText = runway < 9
    ? `\u26A0  Runway < 9 months (${Math.max(runway, 0)} mos net) \u2014 Review cash strategy  |  Liquid: ${fmtCr(currentCash)}  |  Avg net burn: ${fmtCr(avgNetBurn)}/mo`
    : `\u2713  Runway healthy (${runway} mos) \u2014 Monitor monthly burn  |  Liquid: ${fmtCr(currentCash)}`;

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.35, y: 5.18, w: 9.4, h: 0.26,
    fill: { color: warnBg },
    line: { color: warnBg, width: 0 },
  });

  slide.addText(warnText, {
    x: 0.35, y: 5.18, w: 9.4, h: 0.26,
    fontSize: 9, bold: true, color: warnFg,
    fontFace: 'Calibri', align: 'center', valign: 'middle', margin: 0,
  });

  // ── Footer ───────────────────────────────────────────────────────────────
  const todayStr = TODAY.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  slide.addText(
    `Confidential  \u00B7  Generated from Univest Finance Dashboard  \u00B7  ${todayStr}  \u00B7  Amounts in \u20B9 Crores`,
    {
      x: 0.35, y: 5.47, w: 9.4, h: 0.16,
      fontSize: 7.5, color: COLORS.footer,
      fontFace: 'Calibri', align: 'center',
    },
  );

  return pptx;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const metrics = await computeMetrics();
    const pptx    = buildSlide(metrics);

    const outFile = path.resolve(__dirname, '../../runway_slide.pptx');
    await pptx.writeFile({ fileName: outFile });

    const { runway, avgNetBurn, zeroDateLabel } = metrics;
    console.log(`\n\u2705 runway_slide.pptx created.`);
    console.log(`   Runway : ${Math.max(runway, 0)} months (until ${zeroDateLabel})`);
    console.log(`   Avg net burn : ${fmtCr(avgNetBurn)}/mo`);
    console.log(`   File : ${outFile}`);
  } catch (err) {
    console.error('\u274C Error generating slide:', err.message);
    process.exit(1);
  }
})();
