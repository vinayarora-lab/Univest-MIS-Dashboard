/**
 * CFO Zoho Service
 * Fetches structured financial data from the existing Zoho dashboard API
 * at localhost:3001, with 5-minute in-memory cache.
 */
const http = require('http');

const ZOHO_BASE = 'http://localhost:3001/api';
const CACHE = new Map();
const TTL_MS = 5 * 60 * 1000;

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  return null;
}
function cacheSet(key, data) {
  CACHE.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.ok === false) reject(new Error(json.error || 'API error'));
          else resolve(json.data !== undefined ? json.data : json);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getDashboardData(fromDate, toDate) {
  const key = `dashboard_${fromDate}_${toDate}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const data = await httpGet(`${ZOHO_BASE}/dashboard?fromDate=${fromDate}&toDate=${toDate}`);
  cacheSet(key, data);
  return data;
}

// ─── P&L Statement ───────────────────────────────────────────────────────────
async function getPLStatement(startDate, endDate, cohort = null) {
  const data = await getDashboardData(startDate, endDate);
  const fmt = v => Math.round((v || 0) / 100000) / 10; // → INR Lakhs

  const companies = data.companies.map(co => {
    const s = co.report.summary || {};
    const monthly = (co.report.monthlyBreakdown || []).map(m => ({
      month: m.monthName,
      inflow: fmt(m.inflow),
      outflow: fmt(m.outflow),
      customerPayments: fmt(m.customerPayments),
      vendorPayments: fmt(m.vendorPayments),
      expenses: fmt(m.expenses),
      otherInflows: fmt(m.otherInflows),
      otherOutflows: fmt(m.otherOutflows),
      net: fmt(m.net),
    }));
    return {
      company: co.companyName,
      totalInflow_L: fmt(s.totalInflow),
      totalOutflow_L: fmt(s.totalOutflow),
      netCashFlow_L: fmt(s.netCashFlow),
      customerPayments_L: fmt(s.totalCustomerPayments),
      vendorPayments_L: fmt(s.totalVendorPayments),
      monthly,
    };
  });

  const cs = data.consolidated.summary;
  return {
    period: `${startDate} to ${endDate}`,
    unit: 'INR Lakhs (L)',
    consolidated: {
      totalInflow_L: fmt(cs.totalInflow),
      totalOutflow_L: fmt(cs.totalOutflow),
      netCashFlow_L: fmt(cs.netCashFlow),
      grossMargin_pct: cs.totalInflow > 0 ? Number(((cs.totalCustomerPayments / cs.totalInflow) * 100).toFixed(1)) : null,
    },
    companies,
    cohort_filter: cohort || 'all',
  };
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────
async function getBalanceSheet(asOfDate) {
  const data = await getDashboardData('2024-04-01', asOfDate);
  const fmt = v => Math.round((v || 0) / 100000) / 10;

  const companies = data.companies.map(co => {
    const bs = co.balanceSheet || {};
    return {
      company: co.companyName,
      bankBalance_L: fmt(bs.totalBankBalance),
      fdBalance_L: fmt(bs.totalFdBalance),
      accruedInterest_L: fmt(bs.totalAccruedInterest),
      netGst_L: fmt(bs.netGst),
      tds_L: fmt(bs.totalTds),
      securityDeposits_L: fmt(bs.totalSecurityDeposits),
      bankAccounts: (bs.bankAccounts || []).map(b => ({
        name: b.accountName || b.name,
        balance_L: fmt(b.balance || b.closingBalance),
      })),
    };
  });

  const cs = data.consolidated.summary;
  return {
    as_of: asOfDate,
    unit: 'INR Lakhs (L)',
    consolidated: {
      totalBankBalance_L: fmt(cs.bsTotalBankBalance),
      totalFdBalance_L: fmt(cs.bsTotalFdBalance),
      totalAccruedInterest_L: fmt(cs.bsTotalAccruedInterest),
      netAssets_L: fmt((cs.bsTotalBankBalance || 0) + (cs.bsTotalFdBalance || 0) + (cs.bsTotalAccruedInterest || 0)),
    },
    companies,
  };
}

// ─── Cash Flow Statement ─────────────────────────────────────────────────────
async function getCashFlow(startDate, endDate) {
  const data = await getDashboardData(startDate, endDate);
  const fmt = v => Math.round((v || 0) / 100000) / 10;

  const companies = data.companies.map(co => {
    const s = co.report.summary || {};
    const banks = (co.report.bankWiseBreakdown || []).map(b => ({
      bank: b.bankName || b.name,
      inflow_L: fmt(b.inflow),
      outflow_L: fmt(b.outflow),
      net_L: fmt((b.inflow || 0) - (b.outflow || 0)),
    }));

    return {
      company: co.companyName,
      operating: {
        customerReceipts_L: fmt(s.totalCustomerPayments),
        vendorPayments_L: fmt(s.totalVendorPayments),
        expenses_L: fmt(s.totalExpenses),
        otherInflows_L: fmt(s.totalOtherInflows),
        otherOutflows_L: fmt(s.totalOtherOutflows),
        netOperating_L: fmt(s.netCashFlow),
      },
      bankBreakdown: banks,
    };
  });

  const cs = data.consolidated.summary;
  return {
    period: `${startDate} to ${endDate}`,
    unit: 'INR Lakhs (L)',
    consolidated: {
      totalInflow_L: fmt(cs.totalInflow),
      totalOutflow_L: fmt(cs.totalOutflow),
      netCashFlow_L: fmt(cs.netCashFlow),
      bankBalance_L: fmt(cs.bsTotalBankBalance),
      fdBalance_L: fmt(cs.bsTotalFdBalance),
    },
    companies,
  };
}

// ─── Top Clients / AR Aging Proxy ────────────────────────────────────────────
async function getAgingReport(type, startDate, endDate) {
  const data = await getDashboardData(startDate, endDate);
  const fmt = v => Math.round((v || 0) / 100000) / 10;

  if (type === 'AR') {
    const clients = [];
    data.companies.forEach(co => {
      (co.report.clientBreakdown || [])
        .filter(c => c.name && c.name !== 'Unknown')
        .forEach(c => clients.push({
          company: co.companyName,
          client: c.name,
          totalReceipts_L: fmt(c.totalInflow),
          transactions: c.count,
        }));
    });
    clients.sort((a, b) => b.totalReceipts_L - a.totalReceipts_L);
    return { type: 'AR', period: `${startDate} to ${endDate}`, topClients: clients.slice(0, 20) };
  } else {
    const vendors = [];
    data.companies.forEach(co => {
      (co.report.vendorBreakdown || [])
        .filter(v => v.name && v.name !== 'Unknown')
        .forEach(v => vendors.push({
          company: co.companyName,
          vendor: v.name,
          totalPayments_L: fmt(v.totalOutflow),
          transactions: v.count,
        }));
    });
    vendors.sort((a, b) => b.totalPayments_L - a.totalPayments_L);
    return { type: 'AP', period: `${startDate} to ${endDate}`, topVendors: vendors.slice(0, 20) };
  }
}

// ─── KPI Summary ─────────────────────────────────────────────────────────────
async function getKPISummary(startDate, endDate) {
  const data = await getDashboardData(startDate, endDate);
  const fmt = v => Math.round((v || 0) / 100000) / 10;
  const cs = data.consolidated.summary;

  const totalInflow = cs.totalInflow || 0;
  const totalOutflow = cs.totalOutflow || 0;
  const netCashFlow = cs.netCashFlow || 0;
  const customerPayments = cs.totalCustomerPayments || 0;
  const vendorPayments = cs.totalVendorPayments || 0;

  // Monthly data for trends
  const monthlyMap = {};
  data.companies.forEach(co => {
    (co.report.monthlyBreakdown || []).forEach(m => {
      if (!monthlyMap[m.month]) monthlyMap[m.month] = { monthName: m.monthName, inflow: 0, outflow: 0, net: 0 };
      monthlyMap[m.month].inflow += m.inflow || 0;
      monthlyMap[m.month].outflow += m.outflow || 0;
      monthlyMap[m.month].net += m.net || 0;
    });
  });
  const months = Object.keys(monthlyMap).sort();
  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];

  const currentMRR = lastMonth ? fmt(monthlyMap[lastMonth].inflow) : 0;
  const prevMRR = prevMonth ? fmt(monthlyMap[prevMonth].inflow) : 0;
  const momGrowth = prevMRR ? Number((((currentMRR - prevMRR) / prevMRR) * 100).toFixed(1)) : null;

  return {
    period: `${startDate} to ${endDate}`,
    unit: 'INR Lakhs (L)',
    kpis: {
      totalRevenue_L: fmt(totalInflow),
      totalExpenses_L: fmt(totalOutflow),
      netCashFlow_L: fmt(netCashFlow),
      customerReceipts_L: fmt(customerPayments),
      vendorPayments_L: fmt(vendorPayments),
      grossMargin_pct: totalInflow > 0 ? Number(((customerPayments / totalInflow) * 100).toFixed(1)) : null,
      burnRate_L: netCashFlow < 0 ? fmt(Math.abs(netCashFlow) / Math.max(months.length, 1)) : 0,
      bankBalance_L: fmt(cs.bsTotalBankBalance),
      fdBalance_L: fmt(cs.bsTotalFdBalance),
      liquidAssets_L: fmt((cs.bsTotalBankBalance || 0) + (cs.bsTotalFdBalance || 0)),
      runwayMonths: netCashFlow < 0 && months.length > 0 ?
        Number(((((cs.bsTotalBankBalance || 0) + (cs.bsTotalFdBalance || 0)) / (Math.abs(netCashFlow) / months.length))).toFixed(1)) : null,
    },
    trend: {
      currentMonthRevenue_L: currentMRR,
      prevMonthRevenue_L: prevMRR,
      momGrowth_pct: momGrowth,
      latestMonth: lastMonth ? monthlyMap[lastMonth].monthName : null,
    },
    companies: data.companies.map(co => ({
      name: co.companyName,
      revenue_L: fmt(co.report.summary?.totalInflow),
      expenses_L: fmt(co.report.summary?.totalOutflow),
      net_L: fmt(co.report.summary?.netCashFlow),
    })),
  };
}

// ─── Cohort Breakdown ─────────────────────────────────────────────────────────
async function getCohortBreakdown(cohortName, metric, startDate, endDate) {
  const data = await getDashboardData(startDate, endDate);
  const fmt = v => Math.round((v || 0) / 100000) / 10;

  // Map cohort names to companies
  const COHORT_MAP = {
    'uniresearch': ['Uniresearch'],
    'univest': ['Univest'],
    'uniapps': ['Uniapps'],
    'broking': ['Stock Broking'],
    'non-broking': ['Uniresearch', 'Univest', 'Uniapps'],
    'all': null,
  };

  const normalizedCohort = cohortName.toLowerCase().replace(/\s+/g, '-');
  const companyFilter = COHORT_MAP[normalizedCohort] || null;

  const companies = data.companies
    .filter(co => !companyFilter || companyFilter.includes(co.companyName))
    .map(co => {
      const s = co.report.summary || {};
      const monthly = (co.report.monthlyBreakdown || []).map(m => ({
        month: m.monthName,
        inflow_L: fmt(m.inflow),
        outflow_L: fmt(m.outflow),
        net_L: fmt(m.net),
        customerPayments_L: fmt(m.customerPayments),
      }));

      return {
        company: co.companyName,
        summary: {
          totalInflow_L: fmt(s.totalInflow),
          totalOutflow_L: fmt(s.totalOutflow),
          netCashFlow_L: fmt(s.netCashFlow),
        },
        topClients: (co.report.clientBreakdown || []).slice(0, 5).map(c => ({
          name: c.name, amount_L: fmt(c.totalInflow),
        })),
        monthly,
      };
    });

  return {
    cohort: cohortName,
    metric,
    period: `${startDate} to ${endDate}`,
    unit: 'INR Lakhs (L)',
    companies,
  };
}

module.exports = {
  getPLStatement,
  getBalanceSheet,
  getCashFlow,
  getAgingReport,
  getKPISummary,
  getCohortBreakdown,
  getDashboardData,
};
