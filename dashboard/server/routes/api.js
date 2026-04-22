/**
 * API Routes
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { getDashboardData, invalidateCache, MOCK_MODE } = require('../services/financialDataService');
const { generateSuggestions, generateSuggestionsText, parseSuggestions } = require('../services/anthropicService');
const { searchFinancialData } = require('../services/searchService');

const FD_RATES_FILE = path.join(__dirname, '../.cache/fd_rates.json');

// ── GET /api/status ────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({ ok: true, mockMode: MOCK_MODE, timestamp: new Date().toISOString() });
});

// ── GET /api/dashboard ─────────────────────────────────────────────────────
// Query params: fromDate, toDate
router.get('/dashboard', async (req, res) => {
  try {
    const fromDate = req.query.fromDate || process.env.FROM_DATE || '2024-04-01';
    const toDate = req.query.toDate || process.env.TO_DATE || '2025-03-31';
    const data = await getDashboardData(fromDate, toDate);
    res.json({ ok: true, data, mockMode: MOCK_MODE });
  } catch (err) {
    console.error('[/api/dashboard]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/dashboard/company/:name ──────────────────────────────────────
router.get('/dashboard/company/:name', async (req, res) => {
  try {
    const fromDate = req.query.fromDate || process.env.FROM_DATE || '2024-04-01';
    const toDate = req.query.toDate || process.env.TO_DATE || '2025-03-31';
    const data = await getDashboardData(fromDate, toDate);
    const company = data.companies.find(
      (c) => c.companyName.toLowerCase() === req.params.name.toLowerCase()
    );
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found' });
    res.json({ ok: true, data: company, mockMode: MOCK_MODE });
  } catch (err) {
    console.error('[/api/dashboard/company]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/refresh ──────────────────────────────────────────────────────
router.post('/refresh', (req, res) => {
  invalidateCache();
  res.json({ ok: true, message: 'Cache cleared. Next request will fetch fresh data.' });
});

// ── GET /api/fd-rates ──────────────────────────────────────────────────────
router.get('/fd-rates', (req, res) => {
  try {
    if (fs.existsSync(FD_RATES_FILE)) {
      const rates = JSON.parse(fs.readFileSync(FD_RATES_FILE, 'utf8'));
      return res.json({ ok: true, rates });
    }
    res.json({ ok: true, rates: {} });
  } catch (err) {
    res.json({ ok: true, rates: {} });
  }
});

// ── POST /api/fd-rates ─────────────────────────────────────────────────────
router.post('/fd-rates', (req, res) => {
  try {
    const dir = path.dirname(FD_RATES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FD_RATES_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/search ───────────────────────────────────────────────────────
// Streaming natural language search over financial data
router.post('/search', async (req, res) => {
  try {
    const { query, fromDate, toDate } = req.body;
    if (!query) return res.status(400).json({ ok: false, error: 'query is required' });

    const fd = fromDate || process.env.FROM_DATE || '2024-04-01';
    const td = toDate   || process.env.TO_DATE   || '2025-03-31';
    const data = await getDashboardData(fd, td);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await searchFinancialData(query, data, (chunk) => {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    });

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[/api/search]', err.message);
    if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
    else res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ── GET /api/ai/suggestions/stream ────────────────────────────────────────
// Server-Sent Events stream of AI suggestions
router.get('/ai/suggestions/stream', async (req, res) => {
  try {
    const fromDate = req.query.fromDate || process.env.FROM_DATE || '2024-04-01';
    const toDate = req.query.toDate || process.env.TO_DATE || '2025-03-31';

    if (!process.env.ANTHROPIC_API_KEY) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'ANTHROPIC_API_KEY not configured' })}\n\n`);
      return res.end();
    }

    const data = await getDashboardData(fromDate, toDate);
    await generateSuggestions(data, res);
  } catch (err) {
    console.error('[/api/ai/suggestions/stream]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
});

// ── GET /api/ai/suggestions ────────────────────────────────────────────────
// Full AI suggestions (non-streaming, parsed into cards)
router.get('/ai/suggestions', async (req, res) => {
  try {
    const fromDate = req.query.fromDate || process.env.FROM_DATE || '2024-04-01';
    const toDate = req.query.toDate || process.env.TO_DATE || '2025-03-31';

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ ok: true, suggestions: getMockSuggestions(), mockAI: true });
    }

    const data = await getDashboardData(fromDate, toDate);
    const text = await generateSuggestionsText(data);
    const suggestions = parseSuggestions(text);
    res.json({ ok: true, suggestions, rawText: text });
  } catch (err) {
    console.error('[/api/ai/suggestions]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/export ─────────────────────────────────────────────────────────
// Download full financial data as Excel workbook (multi-sheet)
router.get('/export', async (req, res) => {
  try {
    const fromDate = req.query.fromDate || process.env.FROM_DATE || '2024-04-01';
    const toDate   = req.query.toDate   || process.env.TO_DATE   || '2025-03-31';
    const filterCo = req.query.company  || 'all';

    const data = await getDashboardData(fromDate, toDate);
    const allCompanies = data.companies || [];
    const companies = filterCo === 'all' ? allCompanies : allCompanies.filter(c => c.companyName === filterCo);
    const cons = data.consolidated?.summary || {};

    const wb = XLSX.utils.book_new();
    const fmt = (n) => n !== undefined && n !== null ? Math.round(n * 100) / 100 : 0;

    // ── Sheet 1: Consolidated Summary ────────────────────────────────────
    const summaryRows = [
      ['UNIVEST GROUP — CONSOLIDATED SUMMARY'],
      [`Period: ${fromDate} to ${toDate}`],
      [],
      ['Metric', 'Amount (₹)'],
      ['Cash in Bank (Balance Sheet)', fmt(cons.bsTotalBankBalance)],
      ['Fixed Deposits (Balance Sheet)', fmt(cons.bsTotalFdBalance)],
      ['Accrued FD Interest', fmt(cons.bsTotalAccruedInterest)],
      [],
      ['Total Inflow', fmt(cons.totalInflow)],
      ['Total Outflow', fmt(cons.totalOutflow)],
      ['Net Cash Flow', fmt(cons.netCashFlow)],
      ['Net Operating Cash Flow', fmt(cons.netOperatingCashFlow)],
      ['Net Investing Cash Flow', fmt(cons.netInvestingCashFlow)],
      ['Net Financing Cash Flow', fmt(cons.netFinancingCashFlow)],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Consolidated Summary');

    // ── Sheet 2: Balance Sheet ────────────────────────────────────────────
    const bsRows = [['Company', 'Category', 'Account Name', 'Balance (₹)']];
    companies.forEach((c) => {
      const bs = c.balanceSheet || {};
      const push = (cat, accounts) => (accounts || []).forEach(a => bsRows.push([c.companyName, cat, a.accountName, fmt(a.balance)]));
      push('Bank Account', bs.bankAccounts);
      push('Fixed Deposit', bs.fdAccounts);
      push('GST Receivable', bs.gstAccounts);
      push('GST Payable', (bs.gstPayableAccounts || []).map(a => ({ ...a, balance: -Math.abs(a.balance) })));
      push('TDS Receivable', bs.tdsAccounts);
      push('Security Deposit', bs.securityDepositAccounts);
      push('Other Investment', bs.otherInvestmentAccounts);
      push('Accrued FD Interest', bs.accruedInterestAccounts);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bsRows), 'Balance Sheet');

    // ── Sheet 3: Cash Flow Statement ─────────────────────────────────────
    const cfRows = [['Company', 'Metric', 'Amount (₹)']];
    companies.forEach((c) => {
      const s = c.report?.summary || {};
      cfRows.push([c.companyName, 'Opening Balance', fmt(s.openingBalance)]);
      cfRows.push([c.companyName, 'Total Inflow', fmt(s.totalInflow)]);
      cfRows.push([c.companyName, 'Total Outflow', fmt(s.totalOutflow)]);
      cfRows.push([c.companyName, 'Net Cash Flow', fmt(s.netCashFlow)]);
      cfRows.push([c.companyName, 'Closing Balance', fmt(s.closingBalance)]);
      cfRows.push([c.companyName, 'Net Operating CF', fmt(s.netOperatingCashFlow)]);
      cfRows.push([c.companyName, 'Net Investing CF', fmt(s.netInvestingCashFlow)]);
      cfRows.push([c.companyName, 'Net Financing CF', fmt(s.netFinancingCashFlow)]);
      cfRows.push([]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cfRows), 'Cash Flow');

    // ── Sheet 4: All Transactions (Ledger) ───────────────────────────────
    const txRows = [['Date', 'Company', 'Type', 'Party', 'Description', 'Amount (₹)', 'Category', 'Activity', 'Account']];
    companies.forEach((c) => {
      (c.transactions || []).forEach((t) => {
        txRows.push([
          t.date || '',
          c.companyName,
          t.type || '',
          t.partyName || '',
          t.description || '',
          fmt(t.amount),
          t.category || '',
          t.activity || '',
          t.accountName || '',
        ]);
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txRows), 'All Transactions');

    // ── Per-company transaction sheets ────────────────────────────────────
    companies.forEach((c) => {
      const sheetName = c.companyName.slice(0, 28); // Excel sheet name max 31 chars
      const rows = [['Date', 'Type', 'Party', 'Description', 'Amount (₹)', 'Category', 'Activity', 'Account']];
      (c.transactions || []).forEach((t) => {
        rows.push([
          t.date || '',
          t.type || '',
          t.partyName || '',
          t.description || '',
          fmt(t.amount),
          t.category || '',
          t.activity || '',
          t.accountName || '',
        ]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
    });

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Univest_Financial_${fromDate}_${toDate}${filterCo !== 'all' ? '_' + filterCo : ''}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('[/api/export]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function getMockSuggestions() {
  return [
    {
      priority: 1,
      title: 'Consolidate Idle Cash into Short-Duration FDs',
      category: 'Investment Strategy',
      impact: 'High',
      timeframe: 'Immediate',
      recommendation: 'Transfer excess current account balances above ₹50L operating threshold into 30-90 day FDs at 7.25% p.a. Estimated additional yield: ₹8-12L per quarter. Prioritize HDFC and Kotak for competitive rates.',
      rationale: 'Current account balances show significant idle funds that could be earning 7-7.5% in short-term deposits without liquidity risk.',
    },
    {
      priority: 2,
      title: 'Inter-Company Fund Optimization via Cash Pooling',
      category: 'Cash Optimization',
      impact: 'High',
      timeframe: 'Short-term (1-3 months)',
      recommendation: 'Implement notional cash pooling across Uniresearch, Univest, and Uniapps. Route surplus from high-balance entities to cover payables of others. Estimated savings: ₹15-20L in external borrowing costs annually.',
      rationale: 'Group entities have different cash cycles — pooling eliminates the need for individual entities to borrow while others hold idle cash.',
    },
    {
      priority: 3,
      title: 'Vendor Payment Timing Optimization',
      category: 'Cost Reduction',
      impact: 'Medium',
      timeframe: 'Immediate',
      recommendation: 'Negotiate 30-day extended payment terms with top 5 vendors. Current payment patterns show premature settlements. Re-deploy the ₹30-40L float for 30 days to earn ₹1.5-2L additional interest income.',
      rationale: 'Vendor payment analysis shows opportunities to align outflows with inflow cycles, improving working capital efficiency.',
    },
    {
      priority: 4,
      title: 'Ladder FD Portfolio for Maturity Coverage',
      category: 'Investment Strategy',
      impact: 'Medium',
      timeframe: 'Short-term (1-3 months)',
      recommendation: 'Restructure existing FD portfolio into a 3-month ladder (33% each in 1, 2, 3-month buckets). This ensures monthly liquidity without breaking deposits prematurely. Target rate: 7.0-7.5% blended.',
      rationale: 'Current FD concentration in single maturity dates creates liquidity cliffs and missed reinvestment opportunities.',
    },
    {
      priority: 5,
      title: 'Set Up Sweep Account for Automated Optimization',
      category: 'Cash Optimization',
      impact: 'Medium',
      timeframe: 'Medium-term (3-6 months)',
      recommendation: 'Configure auto-sweep accounts with ₹25L threshold — amounts above threshold auto-convert to overnight FDs at 6.5%. Estimated passive income: ₹4-6L quarterly with zero manual intervention.',
      rationale: 'Manual cash management is inefficient for high-volume accounts; automation ensures consistent optimization without treasury bandwidth.',
    },
  ];
}

module.exports = router;
