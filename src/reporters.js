/**
 * Reporters — JSON, CSV, Excel (multi-company aware)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// JSON Reporter
// ---------------------------------------------------------------------------
function writeJSON(data, outputDir) {
  const filePath = path.join(outputDir, 'cashflow_report.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  [output] JSON report saved: ${filePath}`);
  return filePath;
}

// ---------------------------------------------------------------------------
// CSV Reporter (one file per company)
// ---------------------------------------------------------------------------
function writeCSV(report, outputDir, filename = 'cashflow_transactions.csv') {
  const filePath = path.join(outputDir, filename);
  const rows = [];

  rows.push(['Date','Type','Description','Party','Reference','Account','Category','Activity','Amount','Currency'].join(','));

  const allTxns = [
    ...report.inflows.customerPayments.transactions,
    ...report.inflows.salesReceipts.transactions,
    ...report.inflows.otherInflows.transactions,
    ...report.outflows.vendorPayments.transactions,
    ...report.outflows.expenses.transactions,
    ...report.outflows.creditRefunds.transactions,
    ...report.outflows.otherOutflows.transactions,
    ...report.transfers.transactions,
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  allTxns.forEach((t) => {
    const sign = t.category === 'outflow' ? '-' : '';
    rows.push([
      t.date, t.type,
      `"${(t.description||'').replace(/"/g,'""')}"`,
      `"${(t.partyName||'').replace(/"/g,'""')}"`,
      `"${(t.reference||'').replace(/"/g,'""')}"`,
      `"${(t.accountName||'').replace(/"/g,'""')}"`,
      t.category, t.activity, `${sign}${t.amount}`, t.currency||'',
    ].join(','));
  });

  rows.push('','ANNUAL SUMMARY');
  rows.push(`Opening Balance,${report.summary.openingBalance}`);
  rows.push(`Total Inflows,${report.summary.totalInflow}`);
  rows.push(`Total Outflows,${report.summary.totalOutflow}`);
  rows.push(`Net Cash Flow,${report.summary.netCashFlow}`);
  rows.push(`Closing Balance,${report.summary.closingBalance}`);
  rows.push('','ACTIVITY BREAKDOWN');
  rows.push(`Net Operating Cash Flow,${report.summary.netOperatingCashFlow}`);
  rows.push(`Net Investing Cash Flow,${report.summary.netInvestingCashFlow}`);
  rows.push(`Net Financing Cash Flow,${report.summary.netFinancingCashFlow}`);

  rows.push('','MONTHLY BREAKDOWN');
  rows.push('Month,Inflow,Outflow,Net Cash Flow,Customer Payments,Sales Receipts,Other Inflows,Vendor Payments,Expenses,Other Outflows,Transactions');
  report.monthlyBreakdown.forEach((m) => {
    rows.push([m.monthName,m.inflow,m.outflow,m.net,m.customerPayments,m.salesReceipts,m.otherInflows,m.vendorPayments,m.expenses,m.otherOutflows,m.count].join(','));
  });

  rows.push('','CLIENT-WISE INCOME');
  rows.push('Client,Total Inflow,Customer Payments,Sales Receipts,Other Inflows,Transactions');
  report.clientBreakdown.forEach((c) => {
    rows.push([`"${c.name.replace(/"/g,'""')}"`,c.totalInflow,c.customerPayments,c.salesReceipts,c.otherInflows,c.count].join(','));
  });

  rows.push('','VENDOR-WISE EXPENSES');
  rows.push('Vendor/Party,Total Outflow,Vendor Payments,Expenses,Other Outflows,Transactions');
  report.vendorBreakdown.forEach((v) => {
    rows.push([`"${v.name.replace(/"/g,'""')}"`,v.totalOutflow,v.vendorPayments,v.expenses,v.otherOutflows,v.count].join(','));
  });

  rows.push('','FD & INVESTMENTS');
  rows.push('Account/Description,Amount Invested,Amount Redeemed,Net (Interest),Return %,Transactions');
  report.investmentBreakdown.forEach((iv) => {
    rows.push([`"${iv.name.replace(/"/g,'""')}"`,iv.invested,iv.redeemed,iv.net,iv.returnPct !== undefined ? iv.returnPct : '',iv.count].join(','));
  });

  fs.writeFileSync(filePath, rows.join('\n'));
  console.log(`  [output] CSV report saved: ${filePath}`);
  return filePath;
}

// ---------------------------------------------------------------------------
// Excel Reporter — supports array of { companyName, report } or single report
// ---------------------------------------------------------------------------
async function writeExcel(reportOrCompanies, outputDir) {
  let ExcelJS;
  try { ExcelJS = require('exceljs'); }
  catch { console.warn('  [output] exceljs not installed. Run: npm install exceljs'); return null; }

  const companies = Array.isArray(reportOrCompanies)
    ? reportOrCompanies
    : [{ companyName: 'Company', report: reportOrCompanies }];

  const filePath = path.join(outputDir, 'cashflow_report.xlsx');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zoho Cash Flow Generator';
  wb.created = new Date();

  // ── Sheet 1: Consolidated Summary (only when multi-company) ───────────────
  if (companies.length > 1) {
    const sheet = wb.addWorksheet('Consolidated');
    sheet.columns = [
      { header: 'Item', key: 'item', width: 30 },
      ...companies.map((c) => ({ header: c.companyName, key: c.companyName, width: 22 })),
      { header: 'TOTAL', key: 'total', width: 22 },
    ];
    boldHeader(sheet);

    const metrics = [
      { label: 'Opening Balance',       key: 'openingBalance' },
      { label: 'Total Inflows',         key: 'totalInflow' },
      { label: 'Total Outflows',        key: 'totalOutflow' },
      { label: 'Net Cash Flow',         key: 'netCashFlow' },
      { label: 'Closing Balance',       key: 'closingBalance' },
      { label: 'Net Operating',         key: 'netOperatingCashFlow' },
      { label: 'Net Investing',         key: 'netInvestingCashFlow' },
      { label: 'Net Financing',         key: 'netFinancingCashFlow' },
    ];
    metrics.forEach(({ label, key }) => {
      const row = { item: label };
      let total = 0;
      companies.forEach((c) => { row[c.companyName] = c.report.summary[key]; total += c.report.summary[key] || 0; });
      row.total = Math.round(total * 100) / 100;
      const r = sheet.addRow(row);
      r.font = { bold: ['Net Cash Flow','Closing Balance'].includes(label) };
      [...companies.map((c) => c.companyName), 'total'].forEach((k) => r.getCell(k).numFmt = '#,##0.00');
    });
  }

  // ── Per-company sheets ────────────────────────────────────────────────────
  for (const { companyName, report } of companies) {
    const p = companies.length > 1 ? `${companyName} — ` : '';

    // Summary
    addSummarySheet(wb, `${p}Summary`, companyName, report);

    // Monthly
    addMonthlySheet(wb, `${p}Monthly`, report);

    // Clients
    addClientSheet(wb, `${p}Clients`, report);

    // Vendors
    addVendorSheet(wb, `${p}Vendors`, report);

    // Accounts
    addAccountSheet(wb, `${p}Accounts`, report);

    // Bank-wise
    addBankWiseSheet(wb, `${p}Bank-wise`, report);

    // Investments & FDs
    addInvestmentSheet(wb, `${p}FD & Investments`, report);

    // Transactions
    addTransactionSheet(wb, `${p}Transactions`, report);
  }

  await wb.xlsx.writeFile(filePath);
  console.log(`  [output] Excel report saved: ${filePath}`);
  return filePath;
}

// ---------------------------------------------------------------------------
// Sheet builders
// ---------------------------------------------------------------------------
function addSummarySheet(wb, sheetName, companyName, report) {
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = [{ header: 'Item', key: 'item', width: 35 }, { header: 'Amount', key: 'amount', width: 20 }];
  boldHeader(sheet);
  const s = report.summary;
  const rows = [
    { item: 'Company', amount: companyName },
    { item: 'Period', amount: `${report.reportMeta.fromDate} to ${report.reportMeta.toDate}` },
    { item: '' },
    { item: 'Opening Balance', amount: s.openingBalance },
    { item: '' },
    { item: 'Total Cash Inflows', amount: s.totalInflow },
    { item: '  Customer Payments', amount: report.inflows.customerPayments.total },
    { item: '  Sales Receipts', amount: report.inflows.salesReceipts.total },
    { item: '  Other Inflows', amount: report.inflows.otherInflows.total },
    { item: '' },
    { item: 'Total Cash Outflows', amount: -s.totalOutflow },
    { item: '  Vendor Payments', amount: -report.outflows.vendorPayments.total },
    { item: '  Expenses', amount: -report.outflows.expenses.total },
    { item: '  Credit Refunds', amount: -report.outflows.creditRefunds.total },
    { item: '  Other Outflows', amount: -report.outflows.otherOutflows.total },
    { item: '' },
    { item: 'Net Cash Flow', amount: s.netCashFlow },
    { item: 'Closing Balance', amount: s.closingBalance },
    { item: '' },
    { item: 'ACTIVITY BREAKDOWN' },
    { item: 'Net Operating Cash Flow', amount: s.netOperatingCashFlow },
    { item: 'Net Investing Cash Flow', amount: s.netInvestingCashFlow },
    { item: 'Net Financing Cash Flow', amount: s.netFinancingCashFlow },
  ];
  rows.forEach((row) => {
    const r = sheet.addRow(row);
    if (['Opening Balance','Total Cash Inflows','Total Cash Outflows','Net Cash Flow','Closing Balance','ACTIVITY BREAKDOWN'].includes(row.item)) r.font = { bold: true };
    if (typeof row.amount === 'number') r.getCell('amount').numFmt = '#,##0.00';
  });
}

function addMonthlySheet(wb, sheetName, report) {
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Month', key: 'monthName', width: 20 },
    { header: 'Inflow', key: 'inflow', width: 18 },
    { header: 'Outflow', key: 'outflow', width: 18 },
    { header: 'Net', key: 'net', width: 18 },
    { header: 'Customer Payments', key: 'customerPayments', width: 20 },
    { header: 'Sales Receipts', key: 'salesReceipts', width: 18 },
    { header: 'Other Inflows', key: 'otherInflows', width: 16 },
    { header: 'Vendor Payments', key: 'vendorPayments', width: 18 },
    { header: 'Expenses', key: 'expenses', width: 16 },
    { header: 'Other Outflows', key: 'otherOutflows', width: 16 },
    { header: 'Txns', key: 'count', width: 10 },
  ];
  boldHeader(sheet);
  const numCols = ['inflow','outflow','net','customerPayments','salesReceipts','otherInflows','vendorPayments','expenses','otherOutflows'];
  report.monthlyBreakdown.forEach((m) => {
    const r = sheet.addRow(m);
    numCols.forEach((c) => { r.getCell(c).numFmt = '#,##0.00'; });
    r.getCell('net').font = { color: { argb: m.net >= 0 ? 'FF006400' : 'FF8B0000' }, bold: true };
  });
  const tot = report.monthlyBreakdown.reduce((a, m) => { numCols.forEach((c) => a[c] = (a[c]||0) + (m[c]||0)); a.count = (a.count||0)+m.count; return a; }, {});
  const tr = sheet.addRow({ monthName: 'TOTAL', ...tot });
  tr.font = { bold: true };
  numCols.forEach((c) => tr.getCell(c).numFmt = '#,##0.00');
}

function addClientSheet(wb, sheetName, report) {
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Client Name', key: 'name', width: 35 },
    { header: 'Total Inflow', key: 'totalInflow', width: 18 },
    { header: 'Customer Payments', key: 'customerPayments', width: 20 },
    { header: 'Sales Receipts', key: 'salesReceipts', width: 18 },
    { header: 'Other Inflows', key: 'otherInflows', width: 16 },
    { header: 'Txns', key: 'count', width: 10 },
  ];
  boldHeader(sheet);
  report.clientBreakdown.forEach((c) => {
    const r = sheet.addRow(c);
    ['totalInflow','customerPayments','salesReceipts','otherInflows'].forEach((k) => r.getCell(k).numFmt = '#,##0.00');
    r.getCell('totalInflow').font = { color: { argb: 'FF006400' }, bold: true };
  });
  const tot = report.clientBreakdown.reduce((a,c) => { a.totalInflow+=c.totalInflow; a.customerPayments+=c.customerPayments; a.salesReceipts+=c.salesReceipts; a.otherInflows+=c.otherInflows; a.count+=c.count; return a; }, { totalInflow:0, customerPayments:0, salesReceipts:0, otherInflows:0, count:0 });
  const tr = sheet.addRow({ name: 'TOTAL', ...tot });
  tr.font = { bold: true };
  ['totalInflow','customerPayments','salesReceipts','otherInflows'].forEach((k) => tr.getCell(k).numFmt = '#,##0.00');
}

function addVendorSheet(wb, sheetName, report) {
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Vendor / Party', key: 'name', width: 35 },
    { header: 'Total Outflow', key: 'totalOutflow', width: 18 },
    { header: 'Vendor Payments', key: 'vendorPayments', width: 18 },
    { header: 'Expenses', key: 'expenses', width: 16 },
    { header: 'Other Outflows', key: 'otherOutflows', width: 16 },
    { header: 'Txns', key: 'count', width: 10 },
  ];
  boldHeader(sheet);
  report.vendorBreakdown.forEach((v) => {
    const r = sheet.addRow(v);
    ['totalOutflow','vendorPayments','expenses','otherOutflows'].forEach((k) => r.getCell(k).numFmt = '#,##0.00');
    r.getCell('totalOutflow').font = { color: { argb: 'FF8B0000' }, bold: true };
  });
  const tot = report.vendorBreakdown.reduce((a,v) => { a.totalOutflow+=v.totalOutflow; a.vendorPayments+=v.vendorPayments; a.expenses+=v.expenses; a.otherOutflows+=v.otherOutflows; a.count+=v.count; return a; }, { totalOutflow:0, vendorPayments:0, expenses:0, otherOutflows:0, count:0 });
  const tr = sheet.addRow({ name: 'TOTAL', ...tot });
  tr.font = { bold: true };
  ['totalOutflow','vendorPayments','expenses','otherOutflows'].forEach((k) => tr.getCell(k).numFmt = '#,##0.00');
}

function addAccountSheet(wb, sheetName, report) {
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Account Name', key: 'accountName', width: 30 },
    { header: 'Type', key: 'accountType', width: 16 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Opening Balance', key: 'openingBalance', width: 18 },
    { header: 'Closing Balance', key: 'closingBalance', width: 18 },
  ];
  boldHeader(sheet);
  report.closingBalance.byAccount.forEach((a) => {
    const r = sheet.addRow(a);
    r.getCell('openingBalance').numFmt = '#,##0.00';
    r.getCell('closingBalance').numFmt = '#,##0.00';
  });
}

function addBankWiseSheet(wb, sheetName, report) {
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Bank / Account', key: 'accountName', width: 35 },
    { header: 'Type', key: 'accountType', width: 16 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Opening Balance', key: 'openingBalance', width: 18 },
    { header: 'Total Inflow', key: 'totalInflow', width: 18 },
    { header: 'Total Outflow', key: 'totalOutflow', width: 18 },
    { header: 'Net Flow', key: 'net', width: 18 },
    { header: 'Closing Balance', key: 'closingBalance', width: 18 },
    { header: 'Transactions', key: 'count', width: 14 },
  ];
  boldHeader(sheet);
  const numCols = ['openingBalance', 'totalInflow', 'totalOutflow', 'net', 'closingBalance'];
  report.bankWiseBreakdown.forEach((b) => {
    const r = sheet.addRow(b);
    numCols.forEach((c) => r.getCell(c).numFmt = '#,##0.00');
    r.getCell('totalInflow').font = { color: { argb: 'FF006400' } };
    r.getCell('totalOutflow').font = { color: { argb: 'FF8B0000' } };
    r.getCell('net').font = { color: { argb: b.net >= 0 ? 'FF006400' : 'FF8B0000' }, bold: true };
    r.getCell('closingBalance').font = { bold: true };
  });
  // Totals
  const tot = report.bankWiseBreakdown.reduce(
    (a, b) => { a.totalInflow += b.totalInflow; a.totalOutflow += b.totalOutflow; a.net += b.net; a.openingBalance += b.openingBalance; a.closingBalance += b.closingBalance; a.count += b.count; return a; },
    { totalInflow: 0, totalOutflow: 0, net: 0, openingBalance: 0, closingBalance: 0, count: 0 }
  );
  const tr = sheet.addRow({ accountName: 'TOTAL', ...tot });
  tr.font = { bold: true };
  numCols.forEach((c) => tr.getCell(c).numFmt = '#,##0.00');
}

function addInvestmentSheet(wb, sheetName, report) {
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Account / Description', key: 'name', width: 40 },
    { header: 'Amount Invested', key: 'invested', width: 20 },
    { header: 'Amount Redeemed', key: 'redeemed', width: 20 },
    { header: 'Net (Interest / Return)', key: 'net', width: 22 },
    { header: 'Return %', key: 'returnPct', width: 12 },
    { header: 'Transactions', key: 'count', width: 14 },
  ];
  boldHeader(sheet);

  if (report.investmentBreakdown.length === 0) {
    sheet.addRow({ name: 'No FD / Investment transactions detected in this period.' });
    return;
  }

  report.investmentBreakdown.forEach((iv) => {
    const r = sheet.addRow(iv);
    ['invested', 'redeemed', 'net'].forEach((c) => r.getCell(c).numFmt = '#,##0.00');
    r.getCell('returnPct').numFmt = '0.00"%"';
    r.getCell('invested').font = { color: { argb: 'FF8B0000' } };
    r.getCell('redeemed').font = { color: { argb: 'FF006400' } };
    r.getCell('net').font = { color: { argb: iv.net >= 0 ? 'FF006400' : 'FF8B0000' }, bold: true };
    r.getCell('returnPct').font = { color: { argb: iv.returnPct >= 0 ? 'FF006400' : 'FF8B0000' } };
  });

  // Totals
  const tot = report.investmentBreakdown.reduce(
    (a, iv) => { a.invested += iv.invested; a.redeemed += iv.redeemed; a.net += iv.net; a.count += iv.count; return a; },
    { invested: 0, redeemed: 0, net: 0, count: 0 }
  );
  tot.returnPct = tot.invested > 0 ? Math.round((tot.net / tot.invested) * 10000) / 100 : 0;
  const tr = sheet.addRow({ name: 'TOTAL', ...tot });
  tr.font = { bold: true };
  ['invested', 'redeemed', 'net'].forEach((c) => tr.getCell(c).numFmt = '#,##0.00');
  tr.getCell('returnPct').numFmt = '0.00"%"';

  // Detail transactions below
  sheet.addRow({});
  sheet.addRow({ name: 'TRANSACTION DETAIL' }).font = { bold: true };
  const detailHeader = sheet.addRow({ name: 'Date', invested: 'Description', redeemed: 'Account', net: 'Amount', count: 'Type' });
  detailHeader.font = { bold: true };

  report.investmentBreakdown.forEach((iv) => {
    iv.transactions.forEach((t) => {
      sheet.addRow({
        name: t.date,
        invested: t.description || '',
        redeemed: t.accountName || '',
        net: t.category === 'outflow' ? -t.amount : t.amount,
        count: t.type,
      });
    });
  });
}

function addTransactionSheet(wb, sheetName, report) {
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Party', key: 'partyName', width: 25 },
    { header: 'Reference', key: 'reference', width: 20 },
    { header: 'Account', key: 'accountName', width: 25 },
    { header: 'Category', key: 'category', width: 12 },
    { header: 'Activity', key: 'activity', width: 12 },
    { header: 'Inflow', key: 'inflow', width: 16 },
    { header: 'Outflow', key: 'outflow', width: 16 },
    { header: 'Currency', key: 'currency', width: 10 },
  ];
  boldHeader(sheet);
  const txns = [
    ...report.inflows.customerPayments.transactions,
    ...report.inflows.salesReceipts.transactions,
    ...report.inflows.otherInflows.transactions,
    ...report.outflows.vendorPayments.transactions,
    ...report.outflows.expenses.transactions,
    ...report.outflows.creditRefunds.transactions,
    ...report.outflows.otherOutflows.transactions,
    ...report.transfers.transactions,
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  txns.forEach((t) => {
    const r = sheet.addRow({ ...t, inflow: t.category==='inflow'?t.amount:'', outflow: t.category==='outflow'?t.amount:'' });
    if (t.category === 'inflow') { r.getCell('inflow').numFmt='#,##0.00'; r.getCell('inflow').font={color:{argb:'FF006400'}}; }
    else { r.getCell('outflow').numFmt='#,##0.00'; r.getCell('outflow').font={color:{argb:'FF8B0000'}}; }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function boldHeader(sheet) {
  const h = sheet.getRow(1);
  h.font = { bold: true };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
  h.commit();
}

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------
function printSummary(report) {
  const { summary, reportMeta } = report;
  const fmt = (n) => typeof n === 'number'
    ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n;

  console.log('\n' + '═'.repeat(55));
  console.log('  CASH FLOW STATEMENT');
  console.log(`  Period: ${reportMeta.fromDate} → ${reportMeta.toDate}`);
  console.log('═'.repeat(55));
  console.log(`  Opening Balance          :  ${fmt(summary.openingBalance)}`);
  console.log('─'.repeat(55));
  console.log(`  (+) Total Inflows        :  ${fmt(summary.totalInflow)}`);
  console.log(`      Customer Payments    :  ${fmt(report.inflows.customerPayments.total)}`);
  console.log(`      Sales Receipts       :  ${fmt(report.inflows.salesReceipts.total)}`);
  console.log(`      Other Inflows        :  ${fmt(report.inflows.otherInflows.total)}`);
  console.log('─'.repeat(55));
  console.log(`  (-) Total Outflows       :  ${fmt(summary.totalOutflow)}`);
  console.log(`      Vendor Payments      :  ${fmt(report.outflows.vendorPayments.total)}`);
  console.log(`      Expenses             :  ${fmt(report.outflows.expenses.total)}`);
  console.log(`      Credit Refunds       :  ${fmt(report.outflows.creditRefunds.total)}`);
  console.log(`      Other Outflows       :  ${fmt(report.outflows.otherOutflows.total)}`);
  console.log('─'.repeat(55));
  console.log(`  Net Cash Flow            :  ${fmt(summary.netCashFlow)}`);
  console.log(`  Closing Balance          :  ${fmt(summary.closingBalance)}`);
  console.log('═'.repeat(55));
  console.log(`  Net Operating            :  ${fmt(summary.netOperatingCashFlow)}`);
  console.log(`  Net Investing            :  ${fmt(summary.netInvestingCashFlow)}`);
  console.log(`  Net Financing            :  ${fmt(summary.netFinancingCashFlow)}`);
  console.log('═'.repeat(55));
  console.log(`  Total Transactions       :  ${reportMeta.totalTransactions}`);

  console.log('\n' + '═'.repeat(90));
  console.log('  MONTHLY BREAKDOWN');
  console.log('═'.repeat(90));
  console.log('  Month'.padEnd(22) + 'Inflow'.padStart(20) + 'Outflow'.padStart(20) + 'Net'.padStart(20) + 'Txns'.padStart(8));
  console.log('─'.repeat(90));
  report.monthlyBreakdown.forEach((m) => {
    const net = m.net >= 0 ? `+${fmt(m.net)}` : fmt(m.net);
    console.log(`  ${m.monthName}`.padEnd(22) + fmt(m.inflow).padStart(20) + fmt(m.outflow).padStart(20) + net.padStart(20) + String(m.count).padStart(8));
  });
  console.log('═'.repeat(90) + '\n');

  console.log('═'.repeat(75));
  console.log('  CLIENT-WISE INCOME  (Top 20)');
  console.log('═'.repeat(75));
  console.log('  Client'.padEnd(35) + 'Total Inflow'.padStart(22) + 'Txns'.padStart(8));
  console.log('─'.repeat(75));
  report.clientBreakdown.slice(0, 20).forEach((c) => {
    const name = c.name.length > 32 ? c.name.substring(0, 32) + '…' : c.name;
    console.log(`  ${name}`.padEnd(35) + fmt(c.totalInflow).padStart(22) + String(c.count).padStart(8));
  });
  if (report.clientBreakdown.length > 20) console.log(`  ... and ${report.clientBreakdown.length - 20} more (see Excel/CSV)`);
  console.log('═'.repeat(75) + '\n');

  console.log('═'.repeat(75));
  console.log('  VENDOR-WISE EXPENSES  (Top 20)');
  console.log('═'.repeat(75));
  console.log('  Vendor / Party'.padEnd(35) + 'Total Outflow'.padStart(22) + 'Txns'.padStart(8));
  console.log('─'.repeat(75));
  report.vendorBreakdown.slice(0, 20).forEach((v) => {
    const name = v.name.length > 32 ? v.name.substring(0, 32) + '…' : v.name;
    console.log(`  ${name}`.padEnd(35) + fmt(v.totalOutflow).padStart(22) + String(v.count).padStart(8));
  });
  if (report.vendorBreakdown.length > 20) console.log(`  ... and ${report.vendorBreakdown.length - 20} more (see Excel/CSV)`);
  console.log('═'.repeat(75) + '\n');

  // Bank-wise breakdown
  console.log('═'.repeat(95));
  console.log('  BANK-WISE BREAKDOWN');
  console.log('═'.repeat(95));
  console.log(
    '  Bank / Account'.padEnd(35) +
    'Opening Bal'.padStart(18) +
    'Inflow'.padStart(18) +
    'Outflow'.padStart(18) +
    'Closing Bal'.padStart(18) +
    'Txns'.padStart(6)
  );
  console.log('─'.repeat(95));
  report.bankWiseBreakdown.forEach((b) => {
    const name = b.accountName.length > 32 ? b.accountName.substring(0, 32) + '…' : b.accountName;
    console.log(
      `  ${name}`.padEnd(35) +
      fmt(b.openingBalance).padStart(18) +
      fmt(b.totalInflow).padStart(18) +
      fmt(b.totalOutflow).padStart(18) +
      fmt(b.closingBalance).padStart(18) +
      String(b.count).padStart(6)
    );
  });
  const bTot = report.bankWiseBreakdown.reduce((a, b) => {
    a.openingBalance += b.openingBalance; a.totalInflow += b.totalInflow;
    a.totalOutflow += b.totalOutflow; a.closingBalance += b.closingBalance; a.count += b.count;
    return a;
  }, { openingBalance: 0, totalInflow: 0, totalOutflow: 0, closingBalance: 0, count: 0 });
  console.log('─'.repeat(95));
  console.log(
    '  TOTAL'.padEnd(35) +
    fmt(bTot.openingBalance).padStart(18) +
    fmt(bTot.totalInflow).padStart(18) +
    fmt(bTot.totalOutflow).padStart(18) +
    fmt(bTot.closingBalance).padStart(18) +
    String(bTot.count).padStart(6)
  );
  console.log('═'.repeat(95) + '\n');

  // FD & Investments
  console.log('═'.repeat(95));
  console.log('  FD & INVESTMENTS');
  console.log('═'.repeat(95));
  if (report.investmentBreakdown.length === 0) {
    console.log('  No FD / Investment transactions detected.');
  } else {
    console.log('  Account / Description'.padEnd(38) + 'Invested'.padStart(18) + 'Redeemed'.padStart(18) + 'Net (Interest)'.padStart(18) + 'Return%'.padStart(10) + 'Txns'.padStart(6));
    console.log('─'.repeat(95));
    report.investmentBreakdown.forEach((iv) => {
      const name = iv.name.length > 35 ? iv.name.substring(0, 35) + '…' : iv.name;
      const netStr = iv.net >= 0 ? `+${fmt(iv.net)}` : fmt(iv.net);
      const pct = iv.returnPct !== undefined ? `${iv.returnPct >= 0 ? '+' : ''}${iv.returnPct.toFixed(2)}%` : 'N/A';
      console.log(`  ${name}`.padEnd(38) + fmt(iv.invested).padStart(18) + fmt(iv.redeemed).padStart(18) + netStr.padStart(18) + pct.padStart(10) + String(iv.count).padStart(6));
    });
  }
  console.log('═'.repeat(95) + '\n');
}

module.exports = { writeJSON, writeCSV, writeExcel, printSummary };
