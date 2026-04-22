/**
 * Categorizer
 * Takes all normalized transactions and builds a structured cash flow report.
 */

// ---------------------------------------------------------------------------
// De-duplicate transactions across data sources
// Bank transactions from /banktransactions often overlap with customer/vendor
// payments. We keep the more-specific record when we can detect overlap.
// ---------------------------------------------------------------------------
function deduplicateTransactions(allTxns) {
  const seen = new Set();
  const result = [];

  // Prefer specific types (customer_payment, vendor_payment, expense) over
  // generic bank_transaction records for the same date + amount + account.
  const specificTypes = new Set([
    'customer_payment',
    'vendor_payment',
    'expense',
    'sales_receipt',
    'creditnote_refund',
  ]);

  // First pass: index specific transactions
  const specificKeys = new Set();
  allTxns.forEach((t) => {
    if (specificTypes.has(t.type)) {
      specificKeys.add(`${t.date}|${t.amount}|${t.accountId}`);
    }
  });

  // Second pass: add all specific first, then non-overlapping bank/journal
  for (const t of allTxns) {
    if (specificTypes.has(t.type)) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        result.push(t);
      }
    } else {
      const key = `${t.date}|${t.amount}|${t.accountId}`;
      if (!specificKeys.has(key) && !seen.has(t.id)) {
        seen.add(t.id);
        result.push(t);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Build the cash flow report structure
// ---------------------------------------------------------------------------
function buildCashFlowReport({ bankAccounts, transactions, fromDate, toDate }) {
  const txns = deduplicateTransactions(transactions);

  // ── Categorize ────────────────────────────────────────────────────────────
  // Exclude contra/transfer entries (inter-account transfers) from inflows & outflows
  // so they don't inflate both sides of the cash flow statement.
  const inflows = txns.filter((t) => t.category === 'inflow' && t.activity !== 'transfer');
  const outflows = txns.filter((t) => t.category === 'outflow' && t.activity !== 'transfer');
  const transfers = txns.filter((t) => t.activity === 'transfer');

  // ── Group inflows by type ─────────────────────────────────────────────────
  const customerPayments = inflows.filter((t) => t.type === 'customer_payment');
  const salesReceipts = inflows.filter((t) => t.type === 'sales_receipt');
  const otherInflows = inflows.filter(
    (t) => !['customer_payment', 'sales_receipt'].includes(t.type)
  );

  // ── Group outflows by type ────────────────────────────────────────────────
  const vendorPayments = outflows.filter((t) => t.type === 'vendor_payment');
  const expenses = outflows.filter((t) => t.type === 'expense');
  const creditRefunds = outflows.filter((t) => t.type === 'creditnote_refund');
  const otherOutflows = outflows.filter(
    (t) => !['vendor_payment', 'expense', 'creditnote_refund'].includes(t.type)
  );

  // ── Activity split ────────────────────────────────────────────────────────
  const operatingInflows = inflows.filter((t) => t.activity === 'operating');
  const operatingOutflows = outflows.filter((t) => t.activity === 'operating');
  const investingInflows = inflows.filter((t) => t.activity === 'investing');
  const investingOutflows = outflows.filter((t) => t.activity === 'investing');
  const financingInflows = inflows.filter((t) => t.activity === 'financing');
  const financingOutflows = outflows.filter((t) => t.activity === 'financing');

  // ── Totals ────────────────────────────────────────────────────────────────
  const sum = (arr) => arr.reduce((acc, t) => acc + t.amount, 0);
  const round = (n) => Math.round(n * 100) / 100;

  const totalInflow = round(sum(inflows));
  const totalOutflow = round(sum(outflows));
  const netCashFlow = round(totalInflow - totalOutflow);

  const netOperating = round(sum(operatingInflows) - sum(operatingOutflows));
  const netInvesting = round(sum(investingInflows) - sum(investingOutflows));
  const netFinancing = round(sum(financingInflows) - sum(financingOutflows));

  // ── Opening & Closing Balances ────────────────────────────────────────────
  const openingBalance = round(
    bankAccounts.reduce((acc, a) => acc + (a.openingBalance || 0), 0)
  );
  // For bank accounts, use the current balance returned by the API for closing
  const closingBalance = round(
    bankAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0)
  );

  const accountSummary = bankAccounts.map((a) => ({
    accountId: a.accountId,
    accountName: a.accountName,
    accountType: a.accountType,
    currency: a.currency,
    openingBalance: a.openingBalance,
    closingBalance: a.currentBalance,
  }));

  // ── Client-wise Breakdown (Inflows) ──────────────────────────────────────
  const clientMap = {};
  inflows.forEach((t) => {
    const name = t.partyName || 'Unknown';
    if (!clientMap[name]) clientMap[name] = { name, totalInflow: 0, customerPayments: 0, salesReceipts: 0, otherInflows: 0, count: 0 };
    clientMap[name].totalInflow = round(clientMap[name].totalInflow + t.amount);
    clientMap[name].count += 1;
    if (t.type === 'customer_payment') clientMap[name].customerPayments = round(clientMap[name].customerPayments + t.amount);
    else if (t.type === 'sales_receipt') clientMap[name].salesReceipts = round(clientMap[name].salesReceipts + t.amount);
    else clientMap[name].otherInflows = round(clientMap[name].otherInflows + t.amount);
  });
  const clientBreakdown = Object.values(clientMap).sort((a, b) => b.totalInflow - a.totalInflow);

  // ── Vendor-wise Breakdown (Outflows) ──────────────────────────────────────
  const vendorMap = {};
  outflows.forEach((t) => {
    const name = t.partyName || t.expenseAccount || 'Unknown';
    if (!vendorMap[name]) vendorMap[name] = { name, totalOutflow: 0, vendorPayments: 0, expenses: 0, otherOutflows: 0, count: 0 };
    vendorMap[name].totalOutflow = round(vendorMap[name].totalOutflow + t.amount);
    vendorMap[name].count += 1;
    if (t.type === 'vendor_payment') vendorMap[name].vendorPayments = round(vendorMap[name].vendorPayments + t.amount);
    else if (t.type === 'expense') vendorMap[name].expenses = round(vendorMap[name].expenses + t.amount);
    else vendorMap[name].otherOutflows = round(vendorMap[name].otherOutflows + t.amount);
  });
  const vendorBreakdown = Object.values(vendorMap).sort((a, b) => b.totalOutflow - a.totalOutflow);

  // ── Monthly Breakdown ─────────────────────────────────────────────────────
  const monthlyMap = {};
  txns.forEach((t) => {
    const month = t.date ? t.date.substring(0, 7) : 'unknown'; // YYYY-MM
    if (!monthlyMap[month]) {
      monthlyMap[month] = { inflow: 0, outflow: 0, customerPayments: 0, salesReceipts: 0, vendorPayments: 0, expenses: 0, otherInflows: 0, otherOutflows: 0, count: 0 };
    }
    const m = monthlyMap[month];
    m.count += 1;
    if (t.activity === 'transfer') return; // skip contra entries
    if (t.category === 'inflow') {
      m.inflow = round(m.inflow + t.amount);
      if (t.type === 'customer_payment') m.customerPayments = round(m.customerPayments + t.amount);
      else if (t.type === 'sales_receipt') m.salesReceipts = round(m.salesReceipts + t.amount);
      else m.otherInflows = round(m.otherInflows + t.amount);
    } else if (t.category === 'outflow') {
      m.outflow = round(m.outflow + t.amount);
      if (t.type === 'vendor_payment') m.vendorPayments = round(m.vendorPayments + t.amount);
      else if (t.type === 'expense') m.expenses = round(m.expenses + t.amount);
      else m.otherOutflows = round(m.otherOutflows + t.amount);
    }
    m.net = round(m.inflow - m.outflow);
  });

  const monthlyBreakdown = Object.keys(monthlyMap)
    .sort()
    .map((month) => {
      const [year, mon] = month.split('-');
      const monthName = new Date(year, parseInt(mon) - 1, 1)
        .toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      return { month, monthName, ...monthlyMap[month] };
    });

  // ── Bank-wise Breakdown ───────────────────────────────────────────────────
  const bankMap = {};
  // Seed with all known bank accounts first
  bankAccounts.forEach((a) => {
    bankMap[a.accountId] = {
      accountId: a.accountId,
      accountName: a.accountName,
      accountType: a.accountType,
      currency: a.currency,
      openingBalance: a.openingBalance || 0,
      closingBalance: a.currentBalance || 0,
      totalInflow: 0,
      totalOutflow: 0,
      net: 0,
      count: 0,
      transactions: [],
    };
  });
  txns.forEach((t) => {
    const key = t.accountId || 'unknown';
    if (!bankMap[key]) {
      bankMap[key] = {
        accountId: key,
        accountName: t.accountName || 'Unknown Account',
        accountType: '',
        currency: t.currency || '',
        openingBalance: 0,
        closingBalance: 0,
        totalInflow: 0,
        totalOutflow: 0,
        net: 0,
        count: 0,
        transactions: [],
      };
    }
    const b = bankMap[key];
    b.count += 1;
    b.transactions.push(t);
    if (t.activity !== 'transfer') {
      if (t.category === 'inflow') b.totalInflow = round(b.totalInflow + t.amount);
      else if (t.category === 'outflow') b.totalOutflow = round(b.totalOutflow + t.amount);
    }
    b.net = round(b.totalInflow - b.totalOutflow);
  });
  const bankWiseBreakdown = Object.values(bankMap)
    .sort((a, b) => b.closingBalance - a.closingBalance);

  // ── FD / Investment Detection ─────────────────────────────────────────────
  // Only match on description & reference — NOT accountName/partyName — to avoid
  // false positives like "credit card" matching 'rd ', or vendor names like
  // "Uniapps Investment Adviser" matching 'invest'.
  const FD_DESC_KEYWORDS = [
    'fixed deposit', 'fixeddeposit', 'term deposit', 'f.d.',
    'fd booked', 'fd through', 'fd redeem', 'fd maturity', 'fd closure',
    'fd interest', 'fd credit', 'fd ', ' fd ', '/fd/', 'trf to fd', 'open fd',
    'fd no.', 'fd no ', 'for fd', 'fd -', ':fd:',
    'mutual fund', 'mf redemption', 'mf purchase', 'liquid fund',
    'debt fund', 'equity fund',
    'ulip',
    'recurring deposit',
    'ppf a/c', 'ppf account', 'nsc purchase', 'nps contribution',
    'debenture', 'bond purchase', 'bond redemption',
  ];
  // For account name only match very explicit FD terms (not short codes)
  const FD_ACCOUNT_KEYWORDS = [
    'fixed deposit', 'term deposit', 'mutual fund', 'liquid fund',
    'recurring deposit',
  ];
  const isFdOrInvestment = (t) => {
    const descHaystack = [t.description, t.reference].join(' ').toLowerCase();
    const acctHaystack = (t.accountName || '').toLowerCase();
    return (
      FD_DESC_KEYWORDS.some((kw) => descHaystack.includes(kw)) ||
      FD_ACCOUNT_KEYWORDS.some((kw) => acctHaystack.includes(kw))
    );
  };
  const investmentTxns = txns.filter(isFdOrInvestment);

  // Group investments by account/type
  const investmentMap = {};
  investmentTxns.forEach((t) => {
    const key = t.accountName || t.partyName || 'Unknown';
    if (!investmentMap[key]) {
      investmentMap[key] = { name: key, invested: 0, redeemed: 0, net: 0, count: 0, transactions: [] };
    }
    const iv = investmentMap[key];
    iv.count += 1;
    iv.transactions.push(t);
    if (t.category === 'outflow') iv.invested = round(iv.invested + t.amount);
    else iv.redeemed = round(iv.redeemed + t.amount);
    iv.net = round(iv.redeemed - iv.invested);
    iv.returnPct = iv.invested > 0 ? round((iv.net / iv.invested) * 100) : 0;
  });
  const investmentBreakdown = Object.values(investmentMap)
    .sort((a, b) => b.invested - a.invested);

  // ── Assemble report ───────────────────────────────────────────────────────
  return {
    reportMeta: {
      generatedAt: new Date().toISOString(),
      fromDate,
      toDate,
      totalTransactions: txns.length,
    },

    openingBalance: {
      total: openingBalance,
      byAccount: accountSummary,
    },

    inflows: {
      total: totalInflow,
      customerPayments: {
        total: round(sum(customerPayments)),
        count: customerPayments.length,
        transactions: customerPayments,
      },
      salesReceipts: {
        total: round(sum(salesReceipts)),
        count: salesReceipts.length,
        transactions: salesReceipts,
      },
      otherInflows: {
        total: round(sum(otherInflows)),
        count: otherInflows.length,
        transactions: otherInflows,
      },
    },

    outflows: {
      total: totalOutflow,
      vendorPayments: {
        total: round(sum(vendorPayments)),
        count: vendorPayments.length,
        transactions: vendorPayments,
      },
      expenses: {
        total: round(sum(expenses)),
        count: expenses.length,
        transactions: expenses,
      },
      creditRefunds: {
        total: round(sum(creditRefunds)),
        count: creditRefunds.length,
        transactions: creditRefunds,
      },
      otherOutflows: {
        total: round(sum(otherOutflows)),
        count: otherOutflows.length,
        transactions: otherOutflows,
      },
    },

    transfers: {
      total: round(sum(transfers)),
      count: transfers.length,
      transactions: transfers,
    },

    activities: {
      operating: {
        inflow: round(sum(operatingInflows)),
        outflow: round(sum(operatingOutflows)),
        net: netOperating,
      },
      investing: {
        inflow: round(sum(investingInflows)),
        outflow: round(sum(investingOutflows)),
        net: netInvesting,
      },
      financing: {
        inflow: round(sum(financingInflows)),
        outflow: round(sum(financingOutflows)),
        net: netFinancing,
      },
    },

    summary: {
      openingBalance,
      totalInflow,
      totalOutflow,
      netCashFlow,
      closingBalance,
      netOperatingCashFlow: netOperating,
      netInvestingCashFlow: netInvesting,
      netFinancingCashFlow: netFinancing,
    },

    closingBalance: {
      total: closingBalance,
      byAccount: accountSummary,
    },

    monthlyBreakdown,
    clientBreakdown,
    vendorBreakdown,
    bankWiseBreakdown,
    investmentBreakdown,
  };
}

module.exports = { buildCashFlowReport };
