/**
 * Data Fetchers
 * Each function fetches one resource type from Zoho Books API.
 * All functions accept { client, fromDate, toDate } and return normalized arrays.
 */

// ---------------------------------------------------------------------------
// Helper: build date filter params used across endpoints
// ---------------------------------------------------------------------------
function dateParams(fromDate, toDate) {
  return { date_start: fromDate, date_end: toDate };
}

// ---------------------------------------------------------------------------
// Bank Accounts & Opening Balances
// ---------------------------------------------------------------------------

async function fetchBankAccounts(client) {
  console.log('  Fetching bank & cash accounts...');
  const accounts = await client.fetchAll('/bankaccounts', 'bankaccounts');
  return accounts.map((a) => ({
    accountId: a.account_id,
    accountName: a.account_name,
    accountType: a.account_type,       // bank_account | cash | credit_card
    currency: a.currency_code,
    currentBalance: parseFloat(a.balance || 0),
    // opening_balance is set during account setup; not always returned here
    openingBalance: parseFloat(a.opening_balance || 0),
    isActive: a.is_active,
  }));
}

// ---------------------------------------------------------------------------
// Customer Payments (Cash Inflows)
// ---------------------------------------------------------------------------

async function fetchCustomerPayments(client, fromDate, toDate) {
  console.log('  Fetching customer payments...');
  const payments = await client.fetchAll(
    '/customerpayments',
    'customerpayments',
    dateParams(fromDate, toDate)
  );
  return payments.map((p) => ({
    id: p.payment_id,
    type: 'customer_payment',
    date: p.date,
    amount: parseFloat(p.amount || 0),
    currency: p.currency_code,
    reference: p.reference_number || '',
    description: `Payment from ${p.customer_name}`,
    partyName: p.customer_name,
    paymentMode: p.payment_mode,
    accountId: p.account_id,
    accountName: p.account,
    category: 'inflow',
    activity: 'operating',
  }));
}

// ---------------------------------------------------------------------------
// Sales Receipts (Cash Inflows)
// ---------------------------------------------------------------------------

async function fetchSalesReceipts(client, fromDate, toDate) {
  console.log('  Fetching sales receipts...');
  // Sales receipts = direct cash sales (not invoice-based)
  const receipts = await client.fetchAll(
    '/salesreceipts',
    'salesreceipts',
    dateParams(fromDate, toDate)
  );
  return receipts.map((r) => ({
    id: r.salesreceipt_id,
    type: 'sales_receipt',
    date: r.date,
    amount: parseFloat(r.total || 0),
    currency: r.currency_code,
    reference: r.reference_number || r.salesreceipt_number || '',
    description: `Sales receipt - ${r.customer_name || 'Walk-in'}`,
    partyName: r.customer_name || '',
    paymentMode: r.payment_mode,
    accountId: r.deposit_account_id,
    accountName: r.deposit_account_name,
    category: 'inflow',
    activity: 'operating',
  }));
}

// ---------------------------------------------------------------------------
// Vendor Payments (Cash Outflows)
// ---------------------------------------------------------------------------

async function fetchVendorPayments(client, fromDate, toDate) {
  console.log('  Fetching vendor payments...');
  const payments = await client.fetchAll(
    '/vendorpayments',
    'vendorpayments',
    dateParams(fromDate, toDate)
  );
  return payments.map((p) => ({
    id: p.payment_id,
    type: 'vendor_payment',
    date: p.date,
    amount: parseFloat(p.amount || 0),
    currency: p.currency_code,
    reference: p.reference_number || '',
    description: `Payment to ${p.vendor_name}`,
    partyName: p.vendor_name,
    paymentMode: p.payment_mode,
    accountId: p.account_id,
    accountName: p.account,
    category: 'outflow',
    activity: 'operating',
  }));
}

// ---------------------------------------------------------------------------
// Expenses (Cash Outflows)
// ---------------------------------------------------------------------------

async function fetchExpenses(client, fromDate, toDate) {
  console.log('  Fetching expenses...');
  const expenses = await client.fetchAll(
    '/expenses',
    'expenses',
    dateParams(fromDate, toDate)
  );
  return expenses.map((e) => ({
    id: e.expense_id,
    type: 'expense',
    date: e.date,
    amount: parseFloat(e.total || e.amount || 0),
    currency: e.currency_code,
    reference: e.reference_number || '',
    description: e.description || e.expense_account_name,
    partyName: e.vendor_name || '',
    paymentMode: e.payment_mode,
    accountId: e.paid_through_account_id,
    accountName: e.paid_through_account_name,
    expenseAccount: e.expense_account_name,
    category: 'outflow',
    activity: classifyExpenseActivity(e.expense_account_name),
  }));
}

// Heuristic: classify expense as operating/investing/financing based on account name
function classifyExpenseActivity(accountName = '') {
  const name = accountName.toLowerCase();
  if (
    name.includes('fixed asset') ||
    name.includes('equipment') ||
    name.includes('machinery') ||
    name.includes('furniture') ||
    name.includes('vehicle') ||
    name.includes('capital')
  ) {
    return 'investing';
  }
  if (
    name.includes('loan') ||
    name.includes('interest') ||
    name.includes('mortgage') ||
    name.includes('finance charge')
  ) {
    return 'financing';
  }
  return 'operating';
}

// ---------------------------------------------------------------------------
// Bank Transactions (comprehensive view — transfers, adjustments, etc.)
// ---------------------------------------------------------------------------

async function fetchBankTransactions(client, fromDate, toDate) {
  console.log('  Fetching bank transactions...');
  const transactions = await client.fetchAll(
    '/banktransactions',
    'banktransactions',
    { ...dateParams(fromDate, toDate), filter_by: 'Status.All' }
  );

  return transactions.map((t) => {
    const isCredit = t.transaction_type === 'deposit' || t.credit_amount > 0;
    const amount = parseFloat(
      isCredit ? t.credit_amount || t.amount : t.debit_amount || t.amount || 0
    );

    return {
      id: t.transaction_id,
      type: 'bank_transaction',
      transactionType: t.transaction_type, // deposit | withdrawal | transfer_fund
      date: t.date,
      amount,
      currency: t.currency_code,
      reference: t.reference_number || '',
      description: t.description || t.payee || t.transaction_type,
      partyName: t.payee || '',
      accountId: t.account_id,
      accountName: t.account_name,
      category: isCredit ? 'inflow' : 'outflow',
      activity: classifyBankTransactionActivity(t.transaction_type),
    };
  });
}

function classifyBankTransactionActivity(txnType = '') {
  const type = txnType.toLowerCase();
  if (type.includes('transfer')) return 'transfer';
  if (type === 'deposit') return 'operating';
  if (type === 'withdrawal') return 'operating';
  return 'operating';
}

// ---------------------------------------------------------------------------
// Journals (manual entries — may include payroll, adjustments, FDs)
// ---------------------------------------------------------------------------

async function fetchJournals(client, fromDate, toDate) {
  console.log('  Fetching journal entries...');
  const journals = await client.fetchAll(
    '/journals',
    'journals',
    dateParams(fromDate, toDate)
  );

  const entries = [];
  journals.forEach((j) => {
    (j.line_items || []).forEach((line, idx) => {
      if (!line.debit_or_credit) return;
      const isCredit = line.debit_or_credit === 'credit';
      const amount = parseFloat(line.amount || 0);

      entries.push({
        id: `${j.journal_id}_${idx}`,
        type: 'journal',
        date: j.journal_date,
        amount,
        currency: j.currency_code,
        reference: j.journal_number || '',
        description: line.description || j.notes || 'Journal Entry',
        partyName: '',
        accountId: line.account_id,
        accountName: line.account_name,
        category: isCredit ? 'inflow' : 'outflow',
        activity: classifyJournalActivity(line.account_name || ''),
      });
    });
  });

  return entries;
}

function classifyJournalActivity(accountName = '') {
  const name = accountName.toLowerCase();
  if (
    name.includes('fixed deposit') ||
    name.includes('fd') ||
    name.includes('mutual fund') ||
    name.includes('investment') ||
    name.includes('shares') ||
    name.includes('securities')
  ) {
    return 'investing';
  }
  if (
    name.includes('loan') ||
    name.includes('equity') ||
    name.includes('share capital') ||
    name.includes('dividend') ||
    name.includes('borrowing')
  ) {
    return 'financing';
  }
  if (name.includes('salary') || name.includes('payroll') || name.includes('wages')) {
    return 'operating';
  }
  return 'operating';
}

// ---------------------------------------------------------------------------
// Credit Note Refunds (outflows back to customers)
// ---------------------------------------------------------------------------

async function fetchCreditNoteRefunds(client, fromDate, toDate) {
  console.log('  Fetching credit note refunds...');
  const refunds = await client.fetchAll(
    '/creditnotes/refunds',
    'creditnote_refunds',
    dateParams(fromDate, toDate)
  );
  return refunds.map((r) => ({
    id: r.refund_id,
    type: 'creditnote_refund',
    date: r.date,
    amount: parseFloat(r.amount || 0),
    currency: r.currency_code,
    reference: r.reference_number || '',
    description: `Refund to ${r.customer_name || 'customer'}`,
    partyName: r.customer_name || '',
    paymentMode: r.payment_mode,
    accountId: r.account_id,
    accountName: r.account_name,
    category: 'outflow',
    activity: 'operating',
  }));
}

// ---------------------------------------------------------------------------
// Balance Sheet — bank balances and FD account balances as of a given date
// ---------------------------------------------------------------------------

function flattenBSNodes(nodes, sectionPath) {
  const result = [];
  for (const node of (nodes || [])) {
    const path = sectionPath ? `${sectionPath} > ${node.name || ''}` : (node.name || '');
    if (node.account_id) {
      result.push({
        accountId: node.account_id,
        accountName: node.name,
        section: path,
        balance: parseFloat(node.total || 0),
      });
    }
    if (node.account_transactions?.length) {
      result.push(...flattenBSNodes(node.account_transactions, path));
    }
  }
  return result;
}

async function fetchBalanceSheet(client, asOfDate) {
  console.log(`  Fetching balance sheet (as of ${asOfDate})...`);
  const data = await client.request('/reports/balancesheet', { date: asOfDate });
  const allAccounts = flattenBSNodes(data.balance_sheet || [], '');

  // Helper: is this account on the Assets side of the BS?
  const isAsset = (a) => /^Assets/i.test(a.section);

  // Accrued interest accounts — match by name (exclude from bank and FD totals)
  const accruedInterestAccounts = allAccounts.filter((a) =>
    /accrued.interest/i.test(a.accountName)
  );

  // Bank accounts: under a "Bank" parent section, exclude credit cards, FDs, accrued interest
  const bankAccounts = allAccounts.filter((a) =>
    /\bBank\b/i.test(a.section) &&
    !/credit.?card/i.test(a.accountName) &&
    !/\bfd\b|fixed.?dep/i.test(a.accountName) &&
    !/accrued.interest/i.test(a.accountName)
  );

  // FD accounts: name contains "fd" or "fixed deposit", but NOT accrued interest
  const fdAccounts = allAccounts.filter((a) =>
    /\bfd\b|fixed.?dep/i.test(a.accountName) &&
    !/accrued.interest/i.test(a.accountName)
  );

  // GST Receivable — Input CGST/IGST/SGST accounts on the Assets side only
  const gstAccounts = allAccounts.filter((a) =>
    isAsset(a) &&
    /igst|cgst|sgst/i.test(a.accountName) &&
    !/output/i.test(a.accountName)
  );

  // GST Payable — Output CGST/IGST/SGST accounts on the Liabilities side
  const gstPayableAccounts = allAccounts.filter((a) =>
    !isAsset(a) &&
    /igst|cgst|sgst/i.test(a.accountName) &&
    /output/i.test(a.accountName)
  );

  // TDS Receivable — only accounts named "TDS Receivable" on the Assets side
  const tdsAccounts = allAccounts.filter((a) =>
    isAsset(a) &&
    /tds.+receivable|receivable.+tds/i.test(a.accountName)
  );

  // Security Deposit — any "Security Deposit" account on the Assets side
  const securityDepositAccounts = allAccounts.filter((a) =>
    isAsset(a) &&
    /security.{0,2}deposit/i.test(a.accountName)
  );

  // Other investment accounts — gratuity insurance policies, provident funds, etc.
  const otherInvestmentAccounts = allAccounts.filter((a) =>
    isAsset(a) &&
    /gratuity.{0,10}insurance|insurance.{0,10}gratuity/i.test(a.accountName)
  );

  const totalBankBalance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const totalFdBalance = fdAccounts.reduce((s, a) => s + a.balance, 0);
  const totalAccruedInterest = accruedInterestAccounts.reduce((s, a) => s + a.balance, 0);
  const totalGst = gstAccounts.reduce((s, a) => s + a.balance, 0);
  const totalGstPayable = gstPayableAccounts.reduce((s, a) => s + Math.abs(a.balance), 0);
  const totalTds = tdsAccounts.reduce((s, a) => s + a.balance, 0);
  const totalSecurityDeposits = securityDepositAccounts.reduce((s, a) => s + a.balance, 0);
  const totalOtherInvestments = otherInvestmentAccounts.reduce((s, a) => s + a.balance, 0);

  return {
    asOfDate,
    bankAccounts,
    fdAccounts,
    accruedInterestAccounts,
    gstAccounts,
    gstPayableAccounts,
    tdsAccounts,
    securityDepositAccounts,
    otherInvestmentAccounts,
    totalBankBalance: Math.round(totalBankBalance * 100) / 100,
    totalFdBalance: Math.round(totalFdBalance * 100) / 100,
    totalAccruedInterest: Math.round(totalAccruedInterest * 100) / 100,
    totalGst: Math.round(totalGst * 100) / 100,
    totalGstPayable: Math.round(totalGstPayable * 100) / 100,
    netGst: Math.round((totalGst - totalGstPayable) * 100) / 100,
    totalTds: Math.round(totalTds * 100) / 100,
    totalSecurityDeposits: Math.round(totalSecurityDeposits * 100) / 100,
    totalOtherInvestments: Math.round(totalOtherInvestments * 100) / 100,
  };
}

module.exports = {
  fetchBankAccounts,
  fetchCustomerPayments,
  fetchSalesReceipts,
  fetchVendorPayments,
  fetchExpenses,
  fetchBankTransactions,
  fetchJournals,
  fetchCreditNoteRefunds,
  fetchBalanceSheet,
};
