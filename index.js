/**
 * Zoho Books Cash Flow Statement Generator — Multi-Company
 * ─────────────────────────────────────────────────────────
 * Usage:
 *   node index.js                          # uses .env defaults
 *   node index.js --from=2024-04-01 --to=2025-03-31
 *   node index.js --format=excel
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ZohoClient = require('./src/zohoClient');
const {
  fetchBankAccounts,
  fetchCustomerPayments,
  fetchSalesReceipts,
  fetchVendorPayments,
  fetchExpenses,
  fetchBankTransactions,
  fetchJournals,
  fetchCreditNoteRefunds,
} = require('./src/fetchers');
const { buildCashFlowReport } = require('./src/categorizer');
const { writeJSON, writeCSV, writeExcel, printSummary } = require('./src/reporters');

// ---------------------------------------------------------------------------
// Parse CLI args (--key=value format)
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    args[key] = value;
  });
  return args;
}

// ---------------------------------------------------------------------------
// Load companies from env
// Supports:
//   ZOHO_ORGANIZATION_ID=111       (single, backwards compatible)
//   ZOHO_COMPANIES=[{"name":"Co A","orgId":"111"},{"name":"Co B","orgId":"222"}]
// ---------------------------------------------------------------------------
function loadCompanies() {
  if (process.env.ZOHO_COMPANIES) {
    try {
      return JSON.parse(process.env.ZOHO_COMPANIES);
    } catch {
      console.error('[error] ZOHO_COMPANIES is not valid JSON. Check your .env file.');
      process.exit(1);
    }
  }
  // Fallback: single company mode
  if (!process.env.ZOHO_ORGANIZATION_ID) {
    console.error('[error] Set ZOHO_ORGANIZATION_ID or ZOHO_COMPANIES in .env');
    process.exit(1);
  }
  return [
    {
      name: process.env.COMPANY_NAME || 'Company 1',
      orgId: process.env.ZOHO_ORGANIZATION_ID,
    },
  ];
}

function validateEnv() {
  // If ZOHO_COMPANIES is set with per-company credentials, global keys are not required
  if (process.env.ZOHO_COMPANIES) return;
  const required = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\n[error] Missing required environment variables:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Fetch all data for one company
// ---------------------------------------------------------------------------
async function fetchCompanyData(client, companyName, fromDate, toDate) {
  console.log(`\n  ── ${companyName} ──`);
  const bankAccounts = await fetchBankAccounts(client);

  const [
    customerPayments,
    salesReceipts,
    vendorPayments,
    expenses,
    bankTransactions,
    journals,
    creditRefunds,
  ] = await Promise.all([
    fetchCustomerPayments(client, fromDate, toDate),
    fetchSalesReceipts(client, fromDate, toDate),
    fetchVendorPayments(client, fromDate, toDate),
    fetchExpenses(client, fromDate, toDate),
    fetchBankTransactions(client, fromDate, toDate),
    fetchJournals(client, fromDate, toDate),
    fetchCreditNoteRefunds(client, fromDate, toDate),
  ]);

  console.log(`    Bank accounts: ${bankAccounts.length}  |  Customer payments: ${customerPayments.length}  |  Vendor payments: ${vendorPayments.length}  |  Expenses: ${expenses.length}  |  Bank txns: ${bankTransactions.length}`);

  return {
    bankAccounts,
    transactions: [
      ...customerPayments,
      ...salesReceipts,
      ...vendorPayments,
      ...expenses,
      ...bankTransactions,
      ...journals,
      ...creditRefunds,
    ],
  };
}

// ---------------------------------------------------------------------------
// Build consolidated report by merging per-company reports
// ---------------------------------------------------------------------------
function buildConsolidatedReport(companyReports, fromDate, toDate) {
  const round = (n) => Math.round(n * 100) / 100;
  const sumKey = (arr, key) => arr.reduce((acc, r) => acc + (r.summary[key] || 0), 0);

  return {
    reportMeta: {
      generatedAt: new Date().toISOString(),
      fromDate,
      toDate,
      companies: companyReports.map((c) => c.companyName),
      totalTransactions: companyReports.reduce((a, c) => a + c.report.reportMeta.totalTransactions, 0),
    },
    summary: {
      openingBalance: round(sumKey(companyReports.map((c) => c.report), 'openingBalance')),
      totalInflow: round(sumKey(companyReports.map((c) => c.report), 'totalInflow')),
      totalOutflow: round(sumKey(companyReports.map((c) => c.report), 'totalOutflow')),
      netCashFlow: round(sumKey(companyReports.map((c) => c.report), 'netCashFlow')),
      closingBalance: round(sumKey(companyReports.map((c) => c.report), 'closingBalance')),
      netOperatingCashFlow: round(sumKey(companyReports.map((c) => c.report), 'netOperatingCashFlow')),
      netInvestingCashFlow: round(sumKey(companyReports.map((c) => c.report), 'netInvestingCashFlow')),
      netFinancingCashFlow: round(sumKey(companyReports.map((c) => c.report), 'netFinancingCashFlow')),
    },
    companies: companyReports,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n Zoho Books — Cash Flow Statement Generator (Multi-Company)');
  console.log('═'.repeat(60));

  validateEnv();

  const args = parseArgs();
  const fromDate = args.from || process.env.FROM_DATE || '2024-04-01';
  const toDate   = args.to   || process.env.TO_DATE   || '2025-03-31';
  const format   = args.format || process.env.OUTPUT_FORMAT || 'all';
  const outputDir = args.output || process.env.OUTPUT_DIR || './reports';

  const companies = loadCompanies();

  console.log(`\n  Period    : ${fromDate}  →  ${toDate}`);
  console.log(`  Companies : ${companies.map((c) => c.name).join(', ')}`);
  console.log(`  Format    : ${format}`);
  console.log(`  Output    : ${outputDir}\n`);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // ── Fetch & build report per company ──────────────────────────────────────
  console.log('[1/3] Fetching data from Zoho Books...');
  const companyReports = [];

  for (const company of companies) {
    // Each company may have its own OAuth credentials or share the global ones
    const client = new ZohoClient({
      clientId:     company.clientId     || process.env.ZOHO_CLIENT_ID,
      clientSecret: company.clientSecret || process.env.ZOHO_CLIENT_SECRET,
      refreshToken: company.refreshToken || process.env.ZOHO_REFRESH_TOKEN,
      organizationId: company.orgId,
      region: process.env.ZOHO_REGION || 'in',
    });

    const { bankAccounts, transactions } = await fetchCompanyData(
      client,
      company.name,
      fromDate,
      toDate
    );

    const report = buildCashFlowReport({
      bankAccounts,
      transactions,
      fromDate,
      toDate,
      companyName: company.name,
    });

    companyReports.push({ companyName: company.name, orgId: company.orgId, report });
  }

  // ── Consolidated report ───────────────────────────────────────────────────
  console.log('\n[2/3] Building reports...');
  const consolidated = buildConsolidatedReport(companyReports, fromDate, toDate);

  // ── Write output ──────────────────────────────────────────────────────────
  console.log('\n[3/3] Writing output files...');
  const outputs = [];

  if (format === 'json' || format === 'all') {
    outputs.push(writeJSON({ consolidated, companies: companyReports }, outputDir));
  }
  if (format === 'csv' || format === 'all') {
    // Write one CSV per company + one consolidated
    companyReports.forEach(({ companyName, report }) => {
      const slug = companyName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      outputs.push(writeCSV(report, outputDir, `cashflow_${slug}.csv`));
    });
  }
  if (format === 'excel' || format === 'all') {
    outputs.push(await writeExcel(companyReports, outputDir));
  }

  // ── Console summary ───────────────────────────────────────────────────────
  companyReports.forEach(({ companyName, report }) => {
    console.log(`\n${'━'.repeat(55)}`);
    console.log(`  ${companyName.toUpperCase()}`);
    console.log('━'.repeat(55));
    printSummary(report);
  });

  // Consolidated console summary
  if (companyReports.length > 1) {
    const s = consolidated.summary;
    const fmt = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    console.log('\n' + '█'.repeat(60));
    console.log('  CONSOLIDATED SUMMARY — ALL COMPANIES');
    console.log('█'.repeat(60));
    companyReports.forEach(({ companyName, report }) => {
      console.log(`  ${companyName.padEnd(30)} Net: ${fmt(report.summary.netCashFlow)}`);
    });
    console.log('─'.repeat(60));
    console.log(`  ${'TOTAL NET CASH FLOW'.padEnd(30)} ${fmt(s.netCashFlow)}`);
    console.log(`  ${'TOTAL INFLOWS'.padEnd(30)} ${fmt(s.totalInflow)}`);
    console.log(`  ${'TOTAL OUTFLOWS'.padEnd(30)} ${fmt(s.totalOutflow)}`);
    console.log(`  ${'TOTAL CLOSING BALANCE'.padEnd(30)} ${fmt(s.closingBalance)}`);
    console.log('█'.repeat(60) + '\n');
  }

  console.log('  Files saved:');
  outputs.filter(Boolean).forEach((f) => console.log(`    ${path.resolve(f)}`));
  console.log();
}

main().catch((err) => {
  console.error(`\n[fatal] ${err.message}`);
  if (err.response?.data) {
    console.error('  API response:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
