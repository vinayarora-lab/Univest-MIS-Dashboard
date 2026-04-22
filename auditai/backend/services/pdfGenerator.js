/**
 * PDF Report Generator
 * Generates board-ready PDF reports from structured financial data + AI analysis.
 * Uses PDFKit for pure Node.js PDF generation.
 */
const PDFDocument = require('pdfkit');

const COLORS = {
  primary: '#0f1f3d',
  accent: '#185FA5',
  green: '#16a34a',
  red: '#dc2626',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  white: '#ffffff',
  border: '#e5e7eb',
};

function addHeader(doc, title, subtitle, period) {
  // Dark header bar
  doc.rect(0, 0, doc.page.width, 70).fill(COLORS.primary);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(18).text(title, 40, 20);
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(9).text(`${subtitle}  |  ${period}`, 40, 46);
  // Accent line
  doc.rect(0, 70, doc.page.width, 3).fill(COLORS.accent);
  doc.moveDown(2);
}

function addFooter(doc, pageNum) {
  const y = doc.page.height - 30;
  doc.rect(0, y - 5, doc.page.width, 35).fill(COLORS.primary);
  doc.fillColor('#64748b').font('Helvetica').fontSize(7)
    .text('CONFIDENTIAL — Univest Group Internal Document', 40, y + 2)
    .text(`Page ${pageNum}`, doc.page.width - 80, y + 2);
}

function sectionTitle(doc, title) {
  doc.moveDown(0.5);
  doc.rect(40, doc.y, doc.page.width - 80, 22).fill(COLORS.accent);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9)
    .text(title.toUpperCase(), 48, doc.y - 16);
  doc.moveDown(0.8);
}

function kpiCard(doc, x, y, label, value, color = COLORS.primary) {
  doc.rect(x, y, 115, 52).fill(COLORS.lightGray).stroke(COLORS.border);
  doc.fillColor(COLORS.gray).font('Helvetica').fontSize(7).text(label, x + 6, y + 8, { width: 103 });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(14).text(value, x + 6, y + 22, { width: 103 });
}

function table(doc, headers, rows, startY) {
  const colWidth = (doc.page.width - 80) / headers.length;
  let y = startY || doc.y;

  // Header row
  doc.rect(40, y, doc.page.width - 80, 18).fill(COLORS.primary);
  headers.forEach((h, i) => {
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7.5)
      .text(h, 44 + i * colWidth, y + 4, { width: colWidth - 4, align: i === 0 ? 'left' : 'right' });
  });
  y += 18;

  // Data rows
  rows.forEach((row, ri) => {
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = 100;
    }
    const bg = ri % 2 === 0 ? COLORS.white : COLORS.lightGray;
    doc.rect(40, y, doc.page.width - 80, 16).fill(bg);
    row.forEach((cell, ci) => {
      const isNeg = typeof cell === 'string' && (cell.startsWith('(') || cell.startsWith('-'));
      const color = isNeg ? COLORS.red : COLORS.primary;
      doc.fillColor(color).font(ci === 0 ? 'Helvetica' : 'Helvetica').fontSize(7.5)
        .text(String(cell ?? '—'), 44 + ci * colWidth, y + 3, { width: colWidth - 4, align: ci === 0 ? 'left' : 'right' });
    });
    // Subtle border
    doc.rect(40, y, doc.page.width - 80, 16).stroke(COLORS.border);
    y += 16;
  });

  doc.y = y + 4;
}

function fmtL(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  if (n < 0) return `(₹${Math.abs(n).toFixed(1)}L)`;
  return `₹${n.toFixed(1)}L`;
}

function fmtPct(v) {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)}%`;
}

// ─── Report: Executive Summary ────────────────────────────────────────────────
function generateExecutiveSummary(kpis, aiAnalysis, period) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    addHeader(doc, 'Executive Summary', 'Univest Group — CFO Report', period);

    // KPI grid
    sectionTitle(doc, 'Key Performance Indicators');
    const kpiY = doc.y;
    const k = kpis.kpis || {};
    const t = kpis.trend || {};
    kpiCard(doc, 40, kpiY, 'TOTAL REVENUE', fmtL(k.totalRevenue_L), COLORS.accent);
    kpiCard(doc, 165, kpiY, 'NET CASH FLOW', fmtL(k.netCashFlow_L), k.netCashFlow_L >= 0 ? COLORS.green : COLORS.red);
    kpiCard(doc, 290, kpiY, 'BANK BALANCE', fmtL(k.bankBalance_L), COLORS.accent);
    kpiCard(doc, 415, kpiY, 'FD BALANCE', fmtL(k.fdBalance_L), COLORS.green);
    doc.y = kpiY + 62;
    kpiCard(doc, 40, doc.y, 'CUSTOMER RECEIPTS', fmtL(k.customerReceipts_L), COLORS.green);
    kpiCard(doc, 165, doc.y, 'GROSS MARGIN', fmtPct(k.grossMargin_pct), COLORS.accent);
    kpiCard(doc, 290, doc.y, 'MOM GROWTH', t.momGrowth_pct != null ? `${t.momGrowth_pct > 0 ? '+' : ''}${t.momGrowth_pct}%` : '—', t.momGrowth_pct >= 0 ? COLORS.green : COLORS.red);
    kpiCard(doc, 415, doc.y, 'RUNWAY', k.runwayMonths ? `${k.runwayMonths} months` : 'Positive', COLORS.green);
    doc.moveDown(4.5);

    // Company breakdown
    if (kpis.companies?.length) {
      sectionTitle(doc, 'Entity-wise Performance');
      table(doc,
        ['Company', 'Revenue (L)', 'Expenses (L)', 'Net (L)'],
        kpis.companies.map(c => [c.name, fmtL(c.revenue_L), fmtL(c.expenses_L), fmtL(c.net_L)])
      );
    }

    // AI Analysis
    if (aiAnalysis) {
      doc.addPage();
      addHeader(doc, 'CFO Analysis & Insights', 'Univest Group — CFO Report', period);
      sectionTitle(doc, 'AI CFO Analysis');
      doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9)
        .text(aiAnalysis, 40, doc.y, { width: doc.page.width - 80, lineGap: 3 });
    }

    addFooter(doc, 1);
    doc.end();
  });
}

// ─── Report: P&L Statement ────────────────────────────────────────────────────
function generatePLReport(plData, aiAnalysis, period) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    addHeader(doc, 'Profit & Loss Statement', 'Univest Group — Consolidated', period);
    sectionTitle(doc, 'Consolidated P&L');

    const cs = plData.consolidated || {};
    table(doc,
      ['Particulars', 'Amount (INR L)'],
      [
        ['Total Revenue (Inflows)', fmtL(cs.totalInflow_L)],
        ['Total Expenses (Outflows)', fmtL(cs.totalOutflow_L)],
        ['Gross Margin %', fmtPct(cs.grossMargin_pct)],
        ['Net Cash Flow', fmtL(cs.netCashFlow_L)],
      ]
    );

    if (plData.companies?.length) {
      sectionTitle(doc, 'Entity-wise Breakdown');
      table(doc,
        ['Entity', 'Revenue (L)', 'Expenses (L)', 'Cust Payments (L)', 'Net (L)'],
        plData.companies.map(c => [c.company, fmtL(c.totalInflow_L), fmtL(c.totalOutflow_L), fmtL(c.customerPayments_L), fmtL(c.netCashFlow_L)])
      );

      // Monthly trend per company
      plData.companies.forEach(co => {
        if (!co.monthly?.length) return;
        sectionTitle(doc, `Monthly Trend — ${co.company}`);
        table(doc,
          ['Month', 'Revenue (L)', 'Expenses (L)', 'Net (L)'],
          co.monthly.map(m => [m.month, fmtL(m.inflow), fmtL(m.outflow), fmtL(m.net)])
        );
      });
    }

    if (aiAnalysis) {
      doc.addPage();
      addHeader(doc, 'CFO P&L Analysis', 'Univest Group', period);
      sectionTitle(doc, 'AI CFO Insights');
      doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9)
        .text(aiAnalysis, 40, doc.y, { width: doc.page.width - 80, lineGap: 3 });
    }

    addFooter(doc, 1);
    doc.end();
  });
}

// ─── Report: Balance Sheet ─────────────────────────────────────────────────────
function generateBalanceSheetReport(bsData, aiAnalysis) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    addHeader(doc, 'Balance Sheet', 'Univest Group — Consolidated', `As of ${bsData.as_of}`);
    sectionTitle(doc, 'Consolidated Position');

    const cs = bsData.consolidated || {};
    table(doc,
      ['Asset Category', 'Amount (INR L)'],
      [
        ['Bank Balance', fmtL(cs.totalBankBalance_L)],
        ['Fixed Deposits', fmtL(cs.totalFdBalance_L)],
        ['Accrued Interest', fmtL(cs.totalAccruedInterest_L)],
        ['Total Net Assets', fmtL(cs.netAssets_L)],
      ]
    );

    if (bsData.companies?.length) {
      sectionTitle(doc, 'Entity-wise Balance Sheet');
      table(doc,
        ['Entity', 'Bank (L)', 'FD (L)', 'Net GST (L)', 'TDS (L)'],
        bsData.companies.map(c => [c.company, fmtL(c.bankBalance_L), fmtL(c.fdBalance_L), fmtL(c.netGst_L), fmtL(c.tds_L)])
      );

      bsData.companies.forEach(co => {
        if (!co.bankAccounts?.length) return;
        sectionTitle(doc, `Bank Accounts — ${co.company}`);
        table(doc,
          ['Account', 'Balance (INR L)'],
          co.bankAccounts.map(b => [b.name, fmtL(b.balance_L)])
        );
      });
    }

    if (aiAnalysis) {
      sectionTitle(doc, 'CFO Commentary');
      doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9)
        .text(aiAnalysis, 40, doc.y, { width: doc.page.width - 80, lineGap: 3 });
    }

    addFooter(doc, 1);
    doc.end();
  });
}

// ─── Report: Cash Flow ───────────────────────────────────────────────────────
function generateCashFlowReport(cfData, aiAnalysis, period) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    addHeader(doc, 'Cash Flow Statement', 'Univest Group', period);
    sectionTitle(doc, 'Consolidated Cash Flow');

    const cs = cfData.consolidated || {};
    table(doc,
      ['Cash Flow Category', 'Amount (INR L)'],
      [
        ['Total Inflows', fmtL(cs.totalInflow_L)],
        ['Total Outflows', fmtL(cs.totalOutflow_L)],
        ['Net Cash Flow', fmtL(cs.netCashFlow_L)],
        ['Bank Balance (Closing)', fmtL(cs.bankBalance_L)],
        ['FD Balance', fmtL(cs.fdBalance_L)],
      ]
    );

    cfData.companies?.forEach(co => {
      sectionTitle(doc, `${co.company} — Cash Flow`);
      const op = co.operating || {};
      table(doc,
        ['Category', 'Amount (INR L)'],
        [
          ['Customer Receipts', fmtL(op.customerReceipts_L)],
          ['Vendor Payments', fmtL(op.vendorPayments_L)],
          ['Operating Expenses', fmtL(op.expenses_L)],
          ['Other Inflows', fmtL(op.otherInflows_L)],
          ['Net Operating Cash Flow', fmtL(op.netOperating_L)],
        ]
      );
      if (co.bankBreakdown?.length) {
        table(doc,
          ['Bank', 'Inflow (L)', 'Outflow (L)', 'Net (L)'],
          co.bankBreakdown.map(b => [b.bank, fmtL(b.inflow_L), fmtL(b.outflow_L), fmtL(b.net_L)])
        );
      }
    });

    if (aiAnalysis) {
      sectionTitle(doc, 'CFO Commentary');
      doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9)
        .text(aiAnalysis, 40, doc.y, { width: doc.page.width - 80, lineGap: 3 });
    }

    addFooter(doc, 1);
    doc.end();
  });
}

// ─── Report: AR/AP Aging ──────────────────────────────────────────────────────
function generateAgingReport(agingData, aiAnalysis) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const isAR = agingData.type === 'AR';
    addHeader(doc, isAR ? 'Accounts Receivable Summary' : 'Accounts Payable Summary', 'Univest Group', agingData.period);

    if (isAR && agingData.topClients) {
      sectionTitle(doc, 'Top Clients by Receipts');
      table(doc,
        ['Client', 'Company', 'Total Receipts (L)', 'Transactions'],
        agingData.topClients.map(c => [c.client, c.company, fmtL(c.totalReceipts_L), c.transactions])
      );
    } else if (!isAR && agingData.topVendors) {
      sectionTitle(doc, 'Top Vendors by Payments');
      table(doc,
        ['Vendor', 'Company', 'Total Payments (L)', 'Transactions'],
        agingData.topVendors.map(v => [v.vendor, v.company, fmtL(v.totalPayments_L), v.transactions])
      );
    }

    if (aiAnalysis) {
      sectionTitle(doc, 'CFO Commentary');
      doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9)
        .text(aiAnalysis, 40, doc.y, { width: doc.page.width - 80, lineGap: 3 });
    }

    addFooter(doc, 1);
    doc.end();
  });
}

// ─── Report: Board Pack ───────────────────────────────────────────────────────
async function generateBoardPack(kpis, plData, bsData, cfData, aiAnalysis, period) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cover page
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.primary);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(28)
      .text('UNIVEST GROUP', 40, 180, { align: 'center' });
    doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(18)
      .text('BOARD REPORT PACK', 40, 222, { align: 'center' });
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(12)
      .text(period, 40, 256, { align: 'center' });
    doc.fillColor('#64748b').font('Helvetica').fontSize(9)
      .text('CONFIDENTIAL — FOR BOARD USE ONLY', 40, doc.page.height - 60, { align: 'center' });

    // KPI Summary page
    doc.addPage();
    addHeader(doc, 'Executive Dashboard', 'Univest Group Board Pack', period);
    sectionTitle(doc, 'Key Performance Indicators');

    const k = kpis.kpis || {};
    const kpiY = doc.y;
    kpiCard(doc, 40, kpiY, 'TOTAL REVENUE', fmtL(k.totalRevenue_L), COLORS.accent);
    kpiCard(doc, 165, kpiY, 'NET CASH FLOW', fmtL(k.netCashFlow_L), k.netCashFlow_L >= 0 ? COLORS.green : COLORS.red);
    kpiCard(doc, 290, kpiY, 'LIQUID ASSETS', fmtL(k.liquidAssets_L), COLORS.green);
    kpiCard(doc, 415, kpiY, 'GROSS MARGIN', fmtPct(k.grossMargin_pct), COLORS.accent);
    doc.y = kpiY + 62;

    if (kpis.companies?.length) {
      sectionTitle(doc, 'Entity Performance');
      table(doc,
        ['Entity', 'Revenue (L)', 'Expenses (L)', 'Net (L)'],
        kpis.companies.map(c => [c.name, fmtL(c.revenue_L), fmtL(c.expenses_L), fmtL(c.net_L)])
      );
    }

    // P&L page
    if (plData) {
      doc.addPage();
      addHeader(doc, 'P&L Statement', 'Univest Group Board Pack', period);
      sectionTitle(doc, 'Consolidated P&L');
      const cs = plData.consolidated || {};
      table(doc,
        ['Particulars', 'Amount (INR L)'],
        [
          ['Total Revenue', fmtL(cs.totalInflow_L)],
          ['Total Expenses', fmtL(cs.totalOutflow_L)],
          ['Gross Margin %', fmtPct(cs.grossMargin_pct)],
          ['Net Cash Flow', fmtL(cs.netCashFlow_L)],
        ]
      );
    }

    // Balance Sheet page
    if (bsData) {
      doc.addPage();
      addHeader(doc, 'Balance Sheet', 'Univest Group Board Pack', `As of ${bsData.as_of}`);
      sectionTitle(doc, 'Net Asset Position');
      const bs = bsData.consolidated || {};
      table(doc,
        ['Asset Category', 'Amount (INR L)'],
        [
          ['Bank Balance', fmtL(bs.totalBankBalance_L)],
          ['Fixed Deposits', fmtL(bs.totalFdBalance_L)],
          ['Net Assets', fmtL(bs.netAssets_L)],
        ]
      );
    }

    // CFO Analysis page
    if (aiAnalysis) {
      doc.addPage();
      addHeader(doc, 'CFO Analysis & Recommendations', 'Univest Group Board Pack', period);
      sectionTitle(doc, 'AI CFO Analysis');
      doc.fillColor(COLORS.primary).font('Helvetica').fontSize(9.5)
        .text(aiAnalysis, 40, doc.y, { width: doc.page.width - 80, lineGap: 4 });
    }

    addFooter(doc, 1);
    doc.end();
  });
}

module.exports = {
  generateExecutiveSummary,
  generatePLReport,
  generateBalanceSheetReport,
  generateCashFlowReport,
  generateAgingReport,
  generateBoardPack,
};
