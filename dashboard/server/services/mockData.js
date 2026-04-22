/**
 * Mock data generator — used when MOCK_MODE=true
 * Produces realistic-looking financial data for UI development
 */

const COMPANIES = ['Uniresearch', 'Univest', 'Uniapps'];

function rand(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function months(fromDate, toDate) {
  const result = [];
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to) {
    result.push(cur.toISOString().substring(0, 7));
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

function buildCompanyReport(name, fromDate, toDate) {
  const monthList = months(fromDate, toDate);
  const monthlyBreakdown = monthList.map((month) => {
    const inflow = rand(800000, 4500000);
    const outflow = rand(600000, 3200000);
    const [year, mon] = month.split('-');
    const monthName = new Date(year, parseInt(mon) - 1, 1)
      .toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    return {
      month,
      monthName,
      inflow,
      outflow,
      net: Math.round((inflow - outflow) * 100) / 100,
      customerPayments: rand(400000, 2500000),
      salesReceipts: rand(200000, 800000),
      vendorPayments: rand(300000, 1800000),
      expenses: rand(100000, 600000),
      otherInflows: rand(50000, 300000),
      otherOutflows: rand(30000, 200000),
      count: randInt(40, 200),
    };
  });

  const totalInflow = monthlyBreakdown.reduce((a, m) => a + m.inflow, 0);
  const totalOutflow = monthlyBreakdown.reduce((a, m) => a + m.outflow, 0);

  const clientNames = ['Tata Consultancy', 'Infosys Ltd', 'HDFC Bank', 'Reliance Industries',
    'Wipro Ltd', 'Tech Mahindra', 'HCL Technologies', 'Bajaj Finance'];
  const clientBreakdown = clientNames.slice(0, 6).map((n) => ({
    name: n,
    totalInflow: rand(500000, 3000000),
    customerPayments: rand(300000, 2000000),
    salesReceipts: rand(100000, 600000),
    otherInflows: rand(20000, 200000),
    count: randInt(5, 40),
  })).sort((a, b) => b.totalInflow - a.totalInflow);

  const vendorNames = ['AWS India', 'Microsoft Azure', 'Zoho Corp', 'Tata Power', 'BSNL',
    'Swiggy Business', 'Office Supplies Co', 'HR Solutions'];
  const vendorBreakdown = vendorNames.slice(0, 6).map((n) => ({
    name: n,
    totalOutflow: rand(200000, 1500000),
    vendorPayments: rand(100000, 1000000),
    expenses: rand(50000, 400000),
    otherOutflows: rand(10000, 100000),
    count: randInt(3, 30),
  })).sort((a, b) => b.totalOutflow - a.totalOutflow);

  const bankNames = ['HDFC Current Account', 'ICICI Savings', 'SBI OD Account'];
  const bankWiseBreakdown = bankNames.map((n, i) => ({
    accountId: `ACC${i + 1}_${name.toUpperCase()}`,
    accountName: n,
    accountType: i === 2 ? 'overdraft' : 'bank',
    currency: 'INR',
    openingBalance: rand(1000000, 8000000),
    closingBalance: rand(1500000, 10000000),
    totalInflow: rand(500000, 4000000),
    totalOutflow: rand(400000, 3500000),
    net: rand(50000, 500000),
    count: randInt(30, 150),
    transactions: [],
  }));

  const openingBalance = bankWiseBreakdown.reduce((a, b) => a + b.openingBalance, 0);
  const closingBalance = bankWiseBreakdown.reduce((a, b) => a + b.closingBalance, 0);

  const investmentBreakdown = [
    { name: 'HDFC Fixed Deposit', invested: rand(2000000, 8000000), redeemed: rand(500000, 2000000), net: 0, count: 3, transactions: [] },
    { name: 'Kotak Mutual Fund - Liquid', invested: rand(1000000, 4000000), redeemed: rand(300000, 1500000), net: 0, count: 5, transactions: [] },
    { name: 'SBI FD - 1 Year', invested: rand(1500000, 5000000), redeemed: 0, net: 0, count: 2, transactions: [] },
  ].map((iv) => ({ ...iv, net: Math.round((iv.redeemed - iv.invested) * 100) / 100 }));

  return {
    reportMeta: {
      generatedAt: new Date().toISOString(),
      fromDate,
      toDate,
      totalTransactions: randInt(300, 1200),
    },
    summary: {
      openingBalance: Math.round(openingBalance * 100) / 100,
      totalInflow: Math.round(totalInflow * 100) / 100,
      totalOutflow: Math.round(totalOutflow * 100) / 100,
      netCashFlow: Math.round((totalInflow - totalOutflow) * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100,
      netOperatingCashFlow: rand(500000, 3000000),
      netInvestingCashFlow: rand(-2000000, -200000),
      netFinancingCashFlow: rand(-500000, 500000),
    },
    inflows: {
      total: Math.round(totalInflow * 100) / 100,
      customerPayments: { total: rand(10000000, 30000000), count: randInt(80, 300), transactions: [] },
      salesReceipts: { total: rand(2000000, 8000000), count: randInt(20, 80), transactions: [] },
      otherInflows: { total: rand(500000, 2000000), count: randInt(10, 40), transactions: [] },
    },
    outflows: {
      total: Math.round(totalOutflow * 100) / 100,
      vendorPayments: { total: rand(5000000, 15000000), count: randInt(50, 200), transactions: [] },
      expenses: { total: rand(1000000, 5000000), count: randInt(30, 120), transactions: [] },
      creditRefunds: { total: rand(100000, 500000), count: randInt(5, 20), transactions: [] },
      otherOutflows: { total: rand(200000, 1000000), count: randInt(10, 40), transactions: [] },
    },
    openingBalance: { total: Math.round(openingBalance * 100) / 100, byAccount: bankWiseBreakdown.map(b => ({ accountName: b.accountName, openingBalance: b.openingBalance, closingBalance: b.closingBalance })) },
    closingBalance: { total: Math.round(closingBalance * 100) / 100, byAccount: [] },
    monthlyBreakdown,
    clientBreakdown,
    vendorBreakdown,
    bankWiseBreakdown,
    investmentBreakdown,
    activities: {
      operating: { inflow: rand(8000000, 25000000), outflow: rand(6000000, 20000000), net: rand(500000, 5000000) },
      investing: { inflow: rand(500000, 3000000), outflow: rand(1000000, 5000000), net: rand(-3000000, -200000) },
      financing: { inflow: rand(200000, 2000000), outflow: rand(100000, 1000000), net: rand(-500000, 500000) },
    },
  };
}

function getMockDashboardData(fromDate = '2024-04-01', toDate = '2025-03-31') {
  const companyReports = COMPANIES.map((name) => ({
    companyName: name,
    orgId: `MOCK_${name.toUpperCase()}`,
    report: buildCompanyReport(name, fromDate, toDate),
  }));

  const sumKey = (key) => companyReports.reduce((acc, c) => acc + (c.report.summary[key] || 0), 0);

  const consolidated = {
    reportMeta: {
      generatedAt: new Date().toISOString(),
      fromDate,
      toDate,
      companies: COMPANIES,
      totalTransactions: companyReports.reduce((a, c) => a + c.report.reportMeta.totalTransactions, 0),
    },
    summary: {
      openingBalance: Math.round(sumKey('openingBalance') * 100) / 100,
      totalInflow: Math.round(sumKey('totalInflow') * 100) / 100,
      totalOutflow: Math.round(sumKey('totalOutflow') * 100) / 100,
      netCashFlow: Math.round(sumKey('netCashFlow') * 100) / 100,
      closingBalance: Math.round(sumKey('closingBalance') * 100) / 100,
      netOperatingCashFlow: Math.round(sumKey('netOperatingCashFlow') * 100) / 100,
      netInvestingCashFlow: Math.round(sumKey('netInvestingCashFlow') * 100) / 100,
      netFinancingCashFlow: Math.round(sumKey('netFinancingCashFlow') * 100) / 100,
    },
    companies: companyReports,
  };

  return { consolidated, companies: companyReports };
}

module.exports = { getMockDashboardData };
