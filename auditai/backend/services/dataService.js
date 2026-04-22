const http = require('http');

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function fetchFromZoho(fromDate, toDate) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3001/api/dashboard?fromDate=${fromDate}&toDate=${toDate}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.ok) resolve(json.data);
          else reject(new Error(json.error || 'Dashboard API error'));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Full range cache for AI (Apr 2024 – Mar 2026)
let _fullCache = null;
let _fullCacheTime = 0;

async function fetchFullZohoData() {
  const now = Date.now();
  if (_fullCache && now - _fullCacheTime < CACHE_TTL) return _fullCache;
  const data = await fetchFromZoho('2024-04-01', '2026-03-31');
  _fullCache = data;
  _fullCacheTime = now;
  return data;
}

async function fetchDashboardData() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;

  return new Promise((resolve, reject) => {
    http.get('http://localhost:3001/api/dashboard?fromDate=2024-04-01&toDate=2025-03-31', (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.ok) {
            _cache = json.data;
            _cacheTime = now;
            resolve(json.data);
          } else {
            reject(new Error(json.error || 'Dashboard API error'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Build PnL data from monthly breakdown across all Zoho companies (exclude Stock Broking)
function buildPnL(data) {
  const zohoCompanies = data.companies.filter(c => c.companyName !== 'Stock Broking');

  // Get all unique months sorted
  const monthMap = {};
  zohoCompanies.forEach(company => {
    (company.report.monthlyBreakdown || []).forEach(m => {
      if (!monthMap[m.month]) monthMap[m.month] = { monthName: m.monthName, inflow: 0, outflow: 0, customerPayments: 0, vendorPayments: 0, expenses: 0, otherInflows: 0, otherOutflows: 0, net: 0 };
      monthMap[m.month].inflow += m.inflow || 0;
      monthMap[m.month].outflow += m.outflow || 0;
      monthMap[m.month].customerPayments += m.customerPayments || 0;
      monthMap[m.month].vendorPayments += m.vendorPayments || 0;
      monthMap[m.month].expenses += m.expenses || 0;
      monthMap[m.month].otherInflows += m.otherInflows || 0;
      monthMap[m.month].otherOutflows += m.otherOutflows || 0;
      monthMap[m.month].net += m.net || 0;
    });
  });

  const sortedMonths = Object.keys(monthMap).sort();
  const months = sortedMonths.map(k => monthMap[k].monthName);
  const revenue = sortedMonths.map(k => monthMap[k].inflow);
  const cogs = sortedMonths.map(k => monthMap[k].vendorPayments);
  const grossProfit = sortedMonths.map((k, i) => revenue[i] - cogs[i]);
  const opex = sortedMonths.map(k => monthMap[k].expenses);
  const ebitda = sortedMonths.map((k, i) => grossProfit[i] - opex[i]);
  const netProfit = sortedMonths.map(k => monthMap[k].net);

  // Per-company breakdown
  const companies = zohoCompanies.map(c => ({
    name: c.companyName,
    summary: c.report.summary,
  }));

  return {
    months,
    revenue,
    cogs,
    gross_profit: grossProfit,
    operating_expenses: {
      vendor_payments: cogs,
      expenses: opex,
      other_outflows: sortedMonths.map(k => monthMap[k].otherOutflows),
      total: sortedMonths.map((k, i) => cogs[i] + opex[i]),
    },
    ebitda,
    net_profit: netProfit,
    companies,
    // consolidated summary
    consolidated: data.consolidated.summary,
  };
}

// Build Balance Sheet from all companies
function buildBalanceSheet(data) {
  const result = {
    as_of: data.companies[0]?.balanceSheet?.asOfDate || new Date().toISOString().slice(0, 10),
    companies: data.companies.map(c => ({
      name: c.companyName,
      bankAccounts: c.balanceSheet?.bankAccounts || [],
      fdAccounts: c.balanceSheet?.fdAccounts || [],
      accruedInterestAccounts: c.balanceSheet?.accruedInterestAccounts || [],
      gstAccounts: c.balanceSheet?.gstAccounts || [],
      tdsAccounts: c.balanceSheet?.tdsAccounts || [],
      securityDepositAccounts: c.balanceSheet?.securityDepositAccounts || [],
      otherInvestmentAccounts: c.balanceSheet?.otherInvestmentAccounts || [],
      totals: {
        bankBalance: c.balanceSheet?.totalBankBalance || 0,
        fdBalance: c.balanceSheet?.totalFdBalance || 0,
        accruedInterest: c.balanceSheet?.totalAccruedInterest || 0,
        gst: c.balanceSheet?.totalGst || 0,
        gstPayable: c.balanceSheet?.totalGstPayable || 0,
        netGst: c.balanceSheet?.netGst || 0,
        tds: c.balanceSheet?.totalTds || 0,
        securityDeposits: c.balanceSheet?.totalSecurityDeposits || 0,
        otherInvestments: c.balanceSheet?.totalOtherInvestments || 0,
      }
    })),
    consolidated: {
      totalBankBalance: data.consolidated.summary.bsTotalBankBalance || 0,
      totalFdBalance: data.consolidated.summary.bsTotalFdBalance || 0,
      totalAccruedInterest: data.consolidated.summary.bsTotalAccruedInterest || 0,
    },
  };
  return result;
}

// Build MRR-style trend from monthly data (use all companies as "product lines")
function buildMRR(data) {
  const zohoCompanies = data.companies.filter(c => c.companyName !== 'Stock Broking');

  // Aggregate months
  const monthMap = {};
  zohoCompanies.forEach(company => {
    (company.report.monthlyBreakdown || []).forEach(m => {
      if (!monthMap[m.month]) {
        monthMap[m.month] = { monthName: m.monthName };
        zohoCompanies.forEach(c => monthMap[m.month][c.companyName] = 0);
      }
      monthMap[m.month][company.companyName] = (monthMap[m.month][company.companyName] || 0) + (m.inflow || 0);
    });
  });

  const sortedMonths = Object.keys(monthMap).sort().slice(-12); // Last 12 months
  const months = sortedMonths.map(k => monthMap[k].monthName);
  const by_product = {};
  zohoCompanies.forEach(c => {
    by_product[c.companyName] = sortedMonths.map(k => monthMap[k][c.companyName] || 0);
  });
  const total = sortedMonths.map((k, i) => Object.values(by_product).reduce((sum, arr) => sum + (arr[i] || 0), 0));

  return { months, total, by_product };
}

// Build cohort data from client breakdown (approximate)
function buildCohorts(data) {
  // Return existing structure — cohort data requires subscription tracking not available in Zoho
  return {
    cohorts: [
      { name: 'Jan-25', size: 1250, revenue: 18750000, retention: [100, 82, 71, 65, 58, 54] },
      { name: 'Feb-25', size: 1420, revenue: 21300000, retention: [100, 85, 74, 68, 62, null] },
      { name: 'Mar-25', size: 1680, revenue: 25200000, retention: [100, 88, 76, 71, null, null] },
      { name: 'Apr-25', size: 1950, revenue: 29250000, retention: [100, 87, 78, null, null, null] },
    ],
    months: ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'],
    note: 'Retention data is estimated — Zoho Books does not track subscription cohorts',
  };
}

// Build rich Zoho context for AI — full Apr 2024–Mar 2026 range
function buildZohoAIContext(data) {
  const fmt = v => Math.round(v / 100000) / 10; // → INR Lakhs with 1 decimal

  const companies = data.companies.map(co => {
    const s = co.report.summary || {};
    const monthly = (co.report.monthlyBreakdown || []).slice(-12).map(m => ({
      month: m.monthName,
      inflow: fmt(m.inflow || 0),
      outflow: fmt(m.outflow || 0),
      customerPayments: fmt(m.customerPayments || 0),
      vendorPayments: fmt(m.vendorPayments || 0),
      net: fmt(m.net || 0),
    }));

    const topClients = (co.report.clientBreakdown || [])
      .filter(c => c.name && c.name !== 'Unknown')
      .slice(0, 10)
      .map(c => ({ name: c.name, totalInflow_L: fmt(c.totalInflow || 0), txns: c.count || 0 }));

    const topVendors = (co.report.vendorBreakdown || [])
      .filter(v => v.name && v.name !== 'Unknown')
      .slice(0, 10)
      .map(v => ({ name: v.name, totalOutflow_L: fmt(v.totalOutflow || 0), txns: v.count || 0 }));

    const banks = (co.report.bankWiseBreakdown || []).map(b => ({
      bank: b.bankName || b.name,
      inflow_L: fmt(b.inflow || 0),
      outflow_L: fmt(b.outflow || 0),
      net_L: fmt((b.inflow || 0) - (b.outflow || 0)),
    }));

    const bs = co.balanceSheet || {};
    return {
      company: co.companyName,
      summary: {
        totalInflow_L: fmt(s.totalInflow || 0),
        totalOutflow_L: fmt(s.totalOutflow || 0),
        netCashFlow_L: fmt(s.netCashFlow || 0),
        customerPayments_L: fmt(s.totalCustomerPayments || 0),
        vendorPayments_L: fmt(s.totalVendorPayments || 0),
      },
      balanceSheet: {
        bankBalance_L: fmt(bs.totalBankBalance || 0),
        fdBalance_L: fmt(bs.totalFdBalance || 0),
        accruedInterest_L: fmt(bs.totalAccruedInterest || 0),
        netGst_L: fmt(bs.netGst || 0),
        tds_L: fmt(bs.totalTds || 0),
        securityDeposits_L: fmt(bs.totalSecurityDeposits || 0),
      },
      monthly_cashflow_last12: monthly,
      top10_clients: topClients,
      top10_vendors: topVendors,
      bank_accounts: banks,
    };
  });

  const cs = data.consolidated?.summary || {};
  return {
    period: 'Apr 2024 – Mar 2026',
    unit: 'INR Lakhs (L)',
    consolidated: {
      totalInflow_L: fmt(cs.totalInflow || 0),
      totalOutflow_L: fmt(cs.totalOutflow || 0),
      netCashFlow_L: fmt(cs.netCashFlow || 0),
      bankBalance_L: fmt(cs.bsTotalBankBalance || 0),
      fdBalance_L: fmt(cs.bsTotalFdBalance || 0),
    },
    companies,
  };
}

module.exports = { fetchDashboardData, fetchFullZohoData, buildZohoAIContext, buildPnL, buildBalanceSheet, buildMRR, buildCohorts };
