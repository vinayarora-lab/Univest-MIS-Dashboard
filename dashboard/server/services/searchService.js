/**
 * Financial Search Service
 * Uses Claude to answer any natural language question about financial data.
 */
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '0';
  const abs = Math.abs(n);
  let str;
  if (abs >= 1e7) str = (abs / 1e7).toFixed(2) + ' Cr';
  else if (abs >= 1e5) str = (abs / 1e5).toFixed(2) + ' L';
  else str = abs.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return (n < 0 ? '-₹' : '₹') + str;
}

function buildContext(data) {
  const companies = data.companies || [];
  const cons = data.consolidated || {};
  const meta = cons.reportMeta || {};
  const consSummary = cons.summary || {};

  const lines = [];
  lines.push('══════════════════════════════════════════════════════');
  lines.push('UNIVEST GROUP OF COMPANIES — COMPLETE FINANCIAL DATA');
  lines.push('══════════════════════════════════════════════════════');
  lines.push(`Period: ${meta.fromDate || '?'} to ${meta.toDate || '?'}`);
  lines.push(`Companies: ${companies.map(c => c.companyName).join(', ')}`);
  lines.push(`Total Transactions: ${meta.totalTransactions || 0}`);
  lines.push('');

  // ── CONSOLIDATED BALANCE SHEET ──────────────────────────────────────────
  lines.push('=== CONSOLIDATED BALANCE SHEET (Group Total) ===');
  lines.push(`Cash in Bank (all companies):     ${fmt(consSummary.bsTotalBankBalance)}`);
  lines.push(`Fixed Deposits (all companies):   ${fmt(consSummary.bsTotalFdBalance)}`);
  lines.push(`Accrued FD Interest:              ${fmt(consSummary.bsTotalAccruedInterest)}`);
  lines.push('');

  // ── CONSOLIDATED CASH FLOW ─────────────────────────────────────────────
  lines.push('=== CONSOLIDATED CASH FLOW STATEMENT ===');
  lines.push(`Total Inflow:              ${fmt(consSummary.totalInflow)}`);
  lines.push(`Total Outflow:             ${fmt(consSummary.totalOutflow)}`);
  lines.push(`Net Cash Flow:             ${fmt(consSummary.netCashFlow)}`);
  lines.push(`Net Operating Cash Flow:   ${fmt(consSummary.netOperatingCashFlow)}`);
  lines.push(`Net Investing Cash Flow:   ${fmt(consSummary.netInvestingCashFlow)}`);
  lines.push(`Net Financing Cash Flow:   ${fmt(consSummary.netFinancingCashFlow)}`);
  lines.push('');

  // ── COMPANY-WISE BALANCE SHEET DETAILS ─────────────────────────────────
  lines.push('=== COMPANY-WISE BALANCE SHEET DETAILS ===');
  companies.forEach((c) => {
    const bs = c.balanceSheet || {};
    lines.push(`\n── ${c.companyName} ──`);

    lines.push(`  Total Bank Balance: ${fmt(bs.totalBankBalance)}`);
    if ((bs.bankAccounts || []).length) {
      lines.push('  Bank Accounts:');
      bs.bankAccounts.forEach(a => lines.push(`    ${a.accountName}: ${fmt(a.balance)}`));
    }

    lines.push(`  Total FD Balance: ${fmt(bs.totalFdBalance)}`);
    if ((bs.fdAccounts || []).length) {
      lines.push('  FD Accounts:');
      bs.fdAccounts.forEach(a => lines.push(`    ${a.accountName}: ${fmt(a.balance)}`));
    }

    if ((bs.otherInvestmentAccounts || []).length) {
      lines.push('  Other Investments (Gratuity Insurance etc.):');
      bs.otherInvestmentAccounts.forEach(a => lines.push(`    ${a.accountName}: ${fmt(a.balance)}`));
    }

    if ((bs.gstAccounts || []).length) {
      const gstRec = bs.gstAccounts.reduce((s, a) => s + a.balance, 0);
      const gstPay = (bs.gstPayableAccounts || []).reduce((s, a) => s + Math.abs(a.balance), 0);
      lines.push(`  GST Receivable (Input): ${fmt(gstRec)}`);
      bs.gstAccounts.forEach(a => lines.push(`    ${a.accountName}: ${fmt(a.balance)}`));
      if ((bs.gstPayableAccounts || []).length) {
        lines.push(`  GST Payable (Output): ${fmt(gstPay)}`);
        bs.gstPayableAccounts.forEach(a => lines.push(`    ${a.accountName}: ${fmt(Math.abs(a.balance))}`));
        lines.push(`  Net GST Receivable: ${fmt(gstRec - gstPay)}`);
      }
    }

    if ((bs.tdsAccounts || []).length) {
      const total = bs.tdsAccounts.reduce((s, a) => s + a.balance, 0);
      lines.push(`  TDS Receivable: ${fmt(total)}`);
      bs.tdsAccounts.forEach(a => lines.push(`    ${a.accountName}: ${fmt(a.balance)}`));
    }

    if ((bs.securityDepositAccounts || []).length) {
      const total = bs.securityDepositAccounts.reduce((s, a) => s + a.balance, 0);
      lines.push(`  Security Deposits: ${fmt(total)}`);
      bs.securityDepositAccounts.forEach(a => lines.push(`    ${a.accountName}: ${fmt(a.balance)}`));
    }

    if ((bs.accruedInterestAccounts || []).length) {
      const total = bs.accruedInterestAccounts.reduce((s, a) => s + a.balance, 0);
      lines.push(`  Accrued FD Interest: ${fmt(total)}`);
    }
  });

  // ── COMPANY-WISE CASH FLOW ─────────────────────────────────────────────
  lines.push('\n=== COMPANY-WISE CASH FLOW STATEMENT ===');
  companies.forEach((c) => {
    const s = c.report?.summary || {};
    lines.push(`\n── ${c.companyName} ──`);
    lines.push(`  Opening Balance:         ${fmt(s.openingBalance)}`);
    lines.push(`  Total Inflow:            ${fmt(s.totalInflow)}`);
    lines.push(`  Total Outflow:           ${fmt(s.totalOutflow)}`);
    lines.push(`  Net Cash Flow:           ${fmt(s.netCashFlow)}`);
    lines.push(`  Closing Balance:         ${fmt(s.closingBalance)}`);
    lines.push(`  Net Operating CF:        ${fmt(s.netOperatingCashFlow)}`);
    lines.push(`  Net Investing CF:        ${fmt(s.netInvestingCashFlow)}`);
    lines.push(`  Net Financing CF:        ${fmt(s.netFinancingCashFlow)}`);

    // Category breakdown
    const cats = c.report?.categories || {};
    if (Object.keys(cats).length) {
      lines.push('  Category Breakdown:');
      Object.entries(cats).forEach(([cat, val]) => {
        lines.push(`    ${cat}: ${fmt(val)}`);
      });
    }
  });

  // ── ALL TRANSACTIONS (LEDGER) ──────────────────────────────────────────
  lines.push('\n=== ALL TRANSACTIONS / LEDGER ===');
  lines.push('Date | Company | Type | Party | Description | Amount | Category | Activity | Account');
  companies.forEach((c) => {
    (c.transactions || []).forEach((t) => {
      lines.push([
        t.date || '',
        c.companyName,
        t.type || '',
        t.partyName || '',
        (t.description || '').slice(0, 80),
        fmt(t.amount),
        t.category || '',
        t.activity || '',
        t.accountName || '',
      ].join(' | '));
    });
  });

  return lines.join('\n');
}

async function searchFinancialData(query, data, onChunk) {
  const context = buildContext(data);

  const systemPrompt = `You are a senior financial analyst and CFO assistant for Univest Group of Companies.
You have been given COMPLETE financial data — every transaction, every bank account, every FD, every balance sheet line item including GST, TDS, security deposits, and other investments.

You can answer ANY question about this data, including but not limited to:
- Balance sheets (consolidated or company-wise)
- Cash flow statements (operating / investing / financing)
- Ledger / statement of account for any party or account
- Bank statements for any bank account
- Vendor-wise or customer-wise payment summaries
- Company-wise or combined summaries
- GST receivable/payable analysis
- TDS receivable details
- FD portfolio and interest projections
- Security deposits
- Month-wise or period-wise breakdowns
- Top vendors, customers, expenses
- Any drill-down or comparative analysis

Response guidelines:
- Use markdown tables for any tabular data (always include a header row and separator row)
- Format amounts in Indian system: ₹X.XX Cr or ₹X.XX L (never use raw numbers)
- When showing a statement, include ALL relevant rows — do not truncate
- Always clarify which company the data is from
- For company-wise questions, show each company separately AND a consolidated total
- If the question is ambiguous, answer comprehensively covering all interpretations
- Never say "I don't have access" — all data is provided above`;

  const userMessage = `FINANCIAL DATA:\n${context}\n\n${'─'.repeat(60)}\nQUESTION: ${query}`;

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      onChunk(chunk.delta.text);
    }
  }
}

module.exports = { searchFinancialData };
