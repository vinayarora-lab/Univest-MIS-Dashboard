/**
 * Zoho Adapter — wraps the existing src/ modules for use by the dashboard server
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const path = require('path');
const ZohoClient = require(path.resolve(__dirname, '../../../src/zohoClient'));
const {
  fetchBankAccounts,
  fetchCustomerPayments,
  fetchSalesReceipts,
  fetchVendorPayments,
  fetchExpenses,
  fetchBankTransactions,
  fetchJournals,
  fetchCreditNoteRefunds,
  fetchBalanceSheet,
} = require(path.resolve(__dirname, '../../../src/fetchers'));
const { buildCashFlowReport } = require(path.resolve(__dirname, '../../../src/categorizer'));
const { fetchStockBrokingBalanceSheet } = require('./stockBrokingService');

function loadCompanies() {
  if (process.env.ZOHO_COMPANIES) {
    return JSON.parse(process.env.ZOHO_COMPANIES);
  }
  if (process.env.ZOHO_ORGANIZATION_ID) {
    return [{
      name: process.env.COMPANY_NAME || 'Company 1',
      orgId: process.env.ZOHO_ORGANIZATION_ID,
      clientId: process.env.ZOHO_CLIENT_ID,
      clientSecret: process.env.ZOHO_CLIENT_SECRET,
      refreshToken: process.env.ZOHO_REFRESH_TOKEN,
    }];
  }
  throw new Error('No company credentials configured in .env');
}

async function fetchCompanyData(client, companyName, fromDate, toDate) {
  const bankAccounts    = await fetchBankAccounts(client);
  const balanceSheet    = await fetchBalanceSheet(client, toDate);
  const customerPayments = await fetchCustomerPayments(client, fromDate, toDate);
  const salesReceipts    = await fetchSalesReceipts(client, fromDate, toDate);
  const vendorPayments   = await fetchVendorPayments(client, fromDate, toDate);
  const expenses         = await fetchExpenses(client, fromDate, toDate);
  const bankTransactions = await fetchBankTransactions(client, fromDate, toDate);
  const journals         = await fetchJournals(client, fromDate, toDate);
  const creditRefunds    = await fetchCreditNoteRefunds(client, fromDate, toDate);

  return {
    bankAccounts,
    balanceSheet,
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

async function fetchLiveDashboardData(fromDate, toDate) {
  const companies = loadCompanies();
  const region = process.env.ZOHO_REGION || 'in';

  const companyReports = [];
  for (const company of companies) {
    try {
      const client = new ZohoClient({
        clientId: company.clientId || process.env.ZOHO_CLIENT_ID,
        clientSecret: company.clientSecret || process.env.ZOHO_CLIENT_SECRET,
        refreshToken: company.refreshToken || process.env.ZOHO_REFRESH_TOKEN,
        organizationId: company.orgId,
        region,
      });

      const { bankAccounts, balanceSheet, transactions } = await fetchCompanyData(
        client, company.name, fromDate, toDate
      );

      const report = buildCashFlowReport({
        bankAccounts,
        transactions,
        fromDate,
        toDate,
        companyName: company.name,
      });

      companyReports.push({ companyName: company.name, orgId: company.orgId, report, balanceSheet, transactions });
    } catch (err) {
      console.error(`[zohoAdapter] ${company.name} fetch failed:`, err.message);
      companyReports.push({
        companyName: company.name,
        orgId: company.orgId,
        error: err.message,
        report: buildCashFlowReport({ bankAccounts: [], transactions: [], fromDate, toDate, companyName: company.name }),
        balanceSheet: { bankAccounts: [], fdAccounts: [], accruedInterestAccounts: [], totalBankBalance: 0, totalFdBalance: 0, totalAccruedInterest: 0 },
      });
    }
  }

  // ── 4th company: Stock Broking (Excel balance sheet from Google Drive) ──────
  try {
    const sbBalanceSheet = await fetchStockBrokingBalanceSheet();
    const sbReport = buildCashFlowReport({
      bankAccounts: sbBalanceSheet.bankAccounts.map((a) => ({
        accountId: a.accountId,
        accountName: a.accountName,
        accountType: 'bank',
        currency: 'INR',
        openingBalance: 0,
        currentBalance: a.balance,
      })),
      transactions: [],
      fromDate,
      toDate,
      companyName: 'Stock Broking',
    });
    companyReports.push({
      companyName: 'Stock Broking',
      orgId: 'stock-broking',
      source: 'excel',
      report: sbReport,
      balanceSheet: sbBalanceSheet,
    });
  } catch (err) {
    console.error('[zohoAdapter] Stock Broking sheet fetch failed:', err.message);
    companyReports.push({
      companyName: 'Stock Broking',
      orgId: 'stock-broking',
      source: 'excel',
      error: err.message,
      report: buildCashFlowReport({ bankAccounts: [], transactions: [], fromDate, toDate, companyName: 'Stock Broking' }),
      balanceSheet: { bankAccounts: [], fdAccounts: [], accruedInterestAccounts: [], totalBankBalance: 0, totalFdBalance: 0, totalAccruedInterest: 0 },
    });
  }

  const round = (n) => Math.round(n * 100) / 100;
  const sumKey = (key) => companyReports.reduce((acc, c) => acc + (c.report.summary[key] || 0), 0);

  // Consolidated balance sheet totals (only Zoho companies, not Focaps)
  const zohoCompanies = companyReports.filter((c) => c.source !== 'focaps');
  const totalBsBank = round(zohoCompanies.reduce((a, c) => a + (c.balanceSheet?.totalBankBalance || 0), 0));
  const totalBsFd   = round(zohoCompanies.reduce((a, c) => a + (c.balanceSheet?.totalFdBalance || 0), 0));
  const totalBsAccruedInterest = round(zohoCompanies.reduce((a, c) => a + (c.balanceSheet?.totalAccruedInterest || 0), 0));

  const consolidated = {
    reportMeta: {
      generatedAt: new Date().toISOString(),
      fromDate,
      toDate,
      companies: companyReports.map((c) => c.companyName),
      totalTransactions: companyReports.reduce((a, c) => a + c.report.reportMeta.totalTransactions, 0),
    },
    summary: {
      openingBalance: round(sumKey('openingBalance')),
      totalInflow: round(sumKey('totalInflow')),
      totalOutflow: round(sumKey('totalOutflow')),
      netCashFlow: round(sumKey('netCashFlow')),
      closingBalance: round(sumKey('closingBalance')),
      netOperatingCashFlow: round(sumKey('netOperatingCashFlow')),
      netInvestingCashFlow: round(sumKey('netInvestingCashFlow')),
      netFinancingCashFlow: round(sumKey('netFinancingCashFlow')),
      // Balance sheet derived totals
      bsTotalBankBalance: totalBsBank,
      bsTotalFdBalance: totalBsFd,
      bsTotalAccruedInterest: totalBsAccruedInterest,
    },
    companies: companyReports,
  };

  return { consolidated, companies: companyReports };
}

// ── Focaps (Stock Broking) data conversion ────────────────────────────────────
// Convert scraped ledger rows into the normalized transaction format used by
// buildCashFlowReport. Column names vary by Focaps version so we try common aliases.
function parseFocapsAmount(val) {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function focapsRowToTransactions(row, idx) {
  // Common column aliases for date
  const date = row['Date'] || row['Dt'] || row['TXN Date'] || row['Txn Date'] || '';
  // Normalize to YYYY-MM-DD
  let normDate = date;
  if (date && date.includes('/')) {
    const parts = date.split('/');
    if (parts.length === 3) {
      // DD/MM/YYYY → YYYY-MM-DD
      normDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  const description = row['Particulars'] || row['Description'] || row['Narration'] || row['Remarks'] || '';
  const debit = parseFocapsAmount(row['Debit'] || row['Dr'] || row['Dr.'] || row['Withdrawal'] || '');
  const credit = parseFocapsAmount(row['Credit'] || row['Cr'] || row['Cr.'] || row['Deposit'] || '');
  const voucher = row['Voucher No'] || row['Vch No'] || row['Ref No'] || row['Reference'] || `focaps_${idx}`;

  const txns = [];

  if (credit > 0) {
    txns.push({
      id: `focaps_cr_${idx}`,
      date: normDate,
      amount: credit,
      category: 'inflow',
      type: 'bank_transaction',
      activity: 'operating',
      accountId: 'focaps_ledger',
      accountName: 'Stock Broking Ledger',
      partyName: description,
      description,
      reference: voucher,
      currency: 'INR',
    });
  }

  if (debit > 0) {
    txns.push({
      id: `focaps_dr_${idx}`,
      date: normDate,
      amount: debit,
      category: 'outflow',
      type: 'bank_transaction',
      activity: 'operating',
      accountId: 'focaps_ledger',
      accountName: 'Stock Broking Ledger',
      partyName: description,
      description,
      reference: voucher,
      currency: 'INR',
    });
  }

  return txns;
}

async function fetchFocapsCompanyData() {
  console.log('[zohoAdapter] Fetching Stock Broking (Focaps) data...');
  const focapsData = await fetchAllFocapsData();

  const transactions = [];
  let closingBalance = 0;

  // Convert ledger rows
  if (focapsData.ledger && focapsData.ledger.data) {
    focapsData.ledger.data.forEach((row, i) => {
      transactions.push(...focapsRowToTransactions(row, i));
    });

    // Try to get closing balance from last row's Balance column
    const lastRow = focapsData.ledger.data[focapsData.ledger.data.length - 1];
    if (lastRow) {
      const bal = lastRow['Balance'] || lastRow['Bal'] || lastRow['Closing Balance'] || '';
      closingBalance = parseFocapsAmount(bal);
    }
  }

  // Convert portfolio rows as investing transactions (current holdings = asset)
  if (focapsData.portfolio && focapsData.portfolio.data) {
    focapsData.portfolio.data.forEach((row, i) => {
      const scrip = row['Scrip'] || row['Symbol'] || row['Stock'] || row['Security'] || `Stock_${i}`;
      const value = parseFocapsAmount(
        row['Current Value'] || row['Mkt Value'] || row['Market Value'] ||
        row['Value'] || row['Net Value'] || ''
      );
      if (value > 0) {
        transactions.push({
          id: `focaps_portfolio_${i}`,
          date: new Date().toISOString().split('T')[0],
          amount: value,
          category: 'inflow',
          type: 'bank_transaction',
          activity: 'investing',
          accountId: 'focaps_portfolio',
          accountName: 'Stock Portfolio',
          partyName: scrip,
          description: `Portfolio holding: ${scrip}`,
          currency: 'INR',
        });
      }
    });
  }

  const bankAccounts = [{
    accountId: 'focaps_ledger',
    accountName: 'Stock Broking Ledger (Univest)',
    accountType: 'broking',
    currency: 'INR',
    openingBalance: 0,
    currentBalance: closingBalance,
  }];

  return { bankAccounts, transactions, rawFocaps: focapsData };
}

module.exports = { fetchLiveDashboardData, loadCompanies };
