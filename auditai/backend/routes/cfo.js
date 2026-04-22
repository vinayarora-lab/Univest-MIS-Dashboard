/**
 * CFO AI Route
 * Conversational CFO assistant powered by GPT-4o with tool use.
 * Streams responses via SSE.
 *
 * POST /api/cfo/chat   — streaming chat with tool use
 * POST /api/cfo/report — generate and download a PDF report
 * GET  /api/cfo/kpis   — quick KPI snapshot (JSON)
 */
const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const zoho = require('../services/cfoZohoService');
const pdf = require('../services/pdfGenerator');
const { loadAllMISData } = require('../services/misDatapack');
const { getCashMISSummary } = require('../services/cashMisService');

let openai = null;
function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder' });
  return openai;
}

// ─── Default date range helpers ──────────────────────────────────────────────
function fiscalYear() {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: `${y}-04-01`, end: `${y + 1}-03-31` };
}

// Returns the last COMPLETED fiscal year.
// If we are in April (first month of a new FY) use the just-finished FY, because
// only a few days of data exist for the current FY — using it gives misleading KPIs.
function lastCompletedFiscalYear() {
  const now = new Date();
  let y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  // If still in April (new FY just started), step back to previous completed FY
  if (now.getMonth() === 3) y = y - 1;
  return { start: `${y}-04-01`, end: `${y + 1}-03-31` };
}

// ─── Tool definitions for GPT-4o ─────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_pl_statement',
      description: 'Fetch the Profit & Loss / Income Statement from Zoho Books. Returns revenue, expenses, gross margin, and net cash flow by company and consolidated. Use this for any P&L, revenue, expense, or profitability questions.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD. Default: current fiscal year start (Apr 1).' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD. Default: today.' },
          cohort: { type: 'string', description: 'Optional cohort filter: uniresearch, univest, uniapps, broking, non-broking, all' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_balance_sheet',
      description: 'Fetch the Balance Sheet from Zoho Books. Returns bank balances, FD balances, accrued interest, GST, TDS, and net assets by entity. Use for any balance sheet, assets, or net worth questions.',
      parameters: {
        type: 'object',
        properties: {
          as_of_date: { type: 'string', description: 'Balance sheet date YYYY-MM-DD. Default: today.' },
        },
        required: ['as_of_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_flow',
      description: 'Fetch the Cash Flow Statement from Zoho Books. Returns operating, investing, financing cash flows by entity with bank-wise breakdown.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD.' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD.' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_aging_report',
      description: 'Fetch Accounts Receivable (AR) or Accounts Payable (AP) aging report. Returns top clients or vendors with payment amounts and transaction counts.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['AR', 'AP'], description: 'AR for receivables (clients), AP for payables (vendors).' },
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD.' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD.' },
        },
        required: ['type', 'start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_kpi_summary',
      description: 'Get a comprehensive KPI dashboard: total revenue, net cash flow, gross margin, burn rate, runway months, MoM growth, bank balance, FD balance, and entity-wise breakdown.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD.' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD.' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cohort_breakdown',
      description: 'Get financial breakdown by business cohort (entity/segment). Cohorts: uniresearch, univest, uniapps, broking, non-broking, all. Returns revenue, expenses, top clients, and monthly trend for the cohort.',
      parameters: {
        type: 'object',
        properties: {
          cohort_name: { type: 'string', description: 'Cohort name: uniresearch, univest, uniapps, broking, non-broking, all' },
          metric: { type: 'string', description: 'Metric to analyze: revenue, expenses, margin, growth' },
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD.' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD.' },
        },
        required: ['cohort_name', 'metric', 'start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_mis_data',
      description: `Fetch data from the MIS Google Sheet. Use this for: accrual-based P&L (EBITDA, gross margin, CM2), retention cohorts, subscription cohorts, signup-to-conversion rates, revenue mix by plan, channel-level CAC, and key initiatives. Prefer this over Zoho for profitability/margin questions since MIS has accrual accounting. Available sections: consolidated_is (monthly P&L with EBITDA, margins), retention (M0-M5 retention rates), subscription_cohorts (cohort revenue), overall_cohorts (overall subscription cohort), signup_conversion (signup to paid conversion), revenue_mix (plan-wise revenue), channel_cac (channel-wise CAC and spends), key_initiatives (strategic initiatives), all (everything).`,
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['consolidated_is', 'broking_is', 'retention', 'subscription_cohorts', 'overall_cohorts', 'signup_conversion', 'revenue_mix', 'channel_cac', 'key_initiatives', 'all'],
            description: 'Which section of the MIS sheet to fetch. Use "broking_is" for Stock Broking P&L (income, expenses, EBITDA, margins). Use "all" only when you need a broad overview.',
          },
        },
        required: ['section'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_mis',
      description: 'Fetch Cash MIS data from the Univest Cash MIS Google Sheet (Matrix Cash sheet). Returns monthly actuals for revenue, total expenses, net burn, closing FD balance, closing cash balance, and expense breakdown (employee, marketing, cashback, tech, legal, office) from Apr 2023 to present. Use this for: actual cash burn analysis, month-by-month expense trends, FD/cash balance history, liquidity position over time, and any cash-basis MIS questions. This is the most accurate source for actual cash burn rate and runway.',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['summary', 'trend', 'breakdown', 'all'],
            description: 'summary = latest month + KPIs only. trend = all monthly series. breakdown = latest month expense breakdown. all = everything.',
          },
        },
        required: ['section'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_report_pdf',
      description: 'Generate a PDF report and return a download URL. Use this when the user explicitly asks to download, export, or generate a report as PDF.',
      parameters: {
        type: 'object',
        properties: {
          report_type: {
            type: 'string',
            enum: ['executive_summary', 'pl_statement', 'balance_sheet', 'cash_flow', 'ar_aging', 'ap_aging', 'board_pack'],
            description: 'Type of report to generate.',
          },
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD.' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD.' },
        },
        required: ['report_type', 'start_date', 'end_date'],
      },
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────
async function executeTool(name, input) {
  const fy = lastCompletedFiscalYear();
  const sd = input.start_date || fy.start;
  const ed = input.end_date || fy.end;

  switch (name) {
    case 'get_pl_statement':
      return zoho.getPLStatement(sd, ed, input.cohort);
    case 'get_balance_sheet':
      return zoho.getBalanceSheet(input.as_of_date || ed);
    case 'get_cash_flow':
      return zoho.getCashFlow(sd, ed);
    case 'get_aging_report':
      return zoho.getAgingReport(input.type, sd, ed);
    case 'get_kpi_summary':
      return zoho.getKPISummary(sd, ed);
    case 'get_cohort_breakdown':
      return zoho.getCohortBreakdown(input.cohort_name, input.metric, sd, ed);
    case 'get_cash_mis': {
      const cashData = await getCashMISSummary();
      const section = input.section || 'all';
      if (section === 'summary') return { latest: cashData.latest, breakdown: cashData.breakdown };
      if (section === 'trend') return { months: cashData.months, series: cashData.series };
      if (section === 'breakdown') return { latest: cashData.latest, breakdown: cashData.breakdown };
      return cashData; // all
    }
    case 'get_mis_data': {
      const mis = await loadAllMISData();
      const section = input.section || 'all';
      if (section === 'all') return mis;
      const MAP = {
        consolidated_is: mis.consolidatedIS,
        broking_is: mis.brokingIS,
        retention: mis.retention,
        subscription_cohorts: mis.subscriptionCohorts,
        overall_cohorts: mis.overallCohorts,
        signup_conversion: mis.signupConversion,
        revenue_mix: mis.revenueMix,
        channel_cac: mis.channelCAC,
        key_initiatives: mis.keyInitiatives,
      };
      return { section, data: MAP[section] || null };
    }
    case 'generate_report_pdf':
      return { status: 'queued', reportType: input.report_type, startDate: sd, endDate: ed, message: 'Report generation queued.' };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  const fy = fiscalYear();
  const completedFY = lastCompletedFiscalYear();
  return `You are the AI CFO Assistant for Univest Group — a FinTech/NBFC with four entities:
- **Uniresearch** (research & advisory)
- **Univest** (subscription platform)
- **Uniapps** (technology)
- **Stock Broking** (brokerage)

Today's date: ${today}
Current fiscal year: ${fy.start} to ${fy.end} (Indian FY: Apr–Mar)
Last COMPLETED fiscal year: ${completedFY.start} to ${completedFY.end}

⚠️ DATE RULE — CRITICAL: The current FY started ${fy.start}. If today is in April (first month of new FY), there are only a few days of data — using current FY for KPIs, burn rate, or runway gives WRONG results.
ALWAYS default to the last completed FY (${completedFY.start} to ${completedFY.end}) for any KPI, burn rate, runway, P&L, or trend analysis UNLESS the user explicitly asks "this month" or "current FY". Never silently use partial-year data.

## YOUR ROLE
You are a seasoned CFO with deep expertise in:
- P&L analysis, EBITDA, gross margin, contribution margin
- Cash flow management, burn rate, runway
- Balance sheet strength, working capital
- Cohort-level performance (entity-wise and segment-wise)
- MoM/YoY trends, variance analysis
- Investor reporting and board packs

## DATA SOURCES
You have TWO live data sources — use the right one for each question:

**Zoho Books (cash-basis):** Use for treasury, bank balances, FD balances, actual cash flows, accounts receivable/payable aging, real-time cash position. Tools: get_pl_statement, get_balance_sheet, get_cash_flow, get_aging_report, get_kpi_summary, get_cohort_breakdown.

**MIS Google Sheet (accrual-basis):** Use for accrual P&L, EBITDA, gross margin %, CM2 %, retention cohorts, subscription cohorts, signup-to-conversion, revenue mix by plan, channel-level CAC, and key strategic initiatives. Tool: get_mis_data with the relevant section.

**Cash MIS Google Sheet (cash-basis actuals):** Use for actual monthly cash burn, expense category trends (employee/marketing/cashback/tech/legal/office), FD balance history, closing cash balance, and month-by-month cash MIS from Apr 2023 to present. Tool: get_cash_mis. This is the PRIMARY source for burn rate and cash expense analysis — prefer it over Zoho for burn/runway questions since it has cleaner month-by-month actuals.

**Stock Broking IMPORTANT:** Stock Broking data is NOT in Zoho Books — it is ONLY in the MIS Google Sheet. Whenever Stock Broking shows zero or "no activity" from Zoho, ALWAYS call get_mis_data with section="broking_is" to get the actual Stock Broking P&L (income, expenses, EBITDA, margins from the IS- Broking Accrued sheet).

**Fallback rule:** If Zoho data seems incomplete or zero for a metric, ALWAYS try get_mis_data before saying data is unavailable. The MIS sheet has the most complete accrual financials.

## HOW YOU WORK
1. When asked a financial question, ALWAYS call the relevant tool(s) to get live data
2. For profitability/margin/EBITDA questions → use get_mis_data (consolidated_is)
3. For burn rate, cash expenses, monthly cash trend → use get_cash_mis
4. For bank balance, FD, AR/AP aging → use Zoho tools
5. For cohort/retention/CAC questions → use get_mis_data
5. Analyze as a CFO — identify trends, risks, opportunities
6. Be specific: use actual numbers, flag anomalies
7. For PDF/report requests, use the generate_report_pdf tool

## RESPONSE STYLE
- Use markdown tables and bullet points
- Lead with the key insight, then support with data
- Format monetary values in INR Lakhs (L) or Crores (Cr) as appropriate
- For percentages, always show the direction (▲ increase / ▼ decrease)
- Keep responses crisp but complete — this is executive-level communication

## COHORT CONTEXT
Entities: Uniresearch, Univest, Uniapps, Stock Broking
Segments: non-broking (Uniresearch+Univest+Uniapps) vs broking (Stock Broking)

Never say you don't have access to data — always call the appropriate tool.`;
}

// ─── In-memory report store ───────────────────────────────────────────────────
const reportStore = new Map();

// ─── POST /api/cfo/chat — Streaming CFO chat with tool use ───────────────────
router.post('/chat', async (req, res) => {
  const { messages = [] } = req.body;
  if (!messages.length) return res.status(400).json({ error: 'messages required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const systemPrompt = buildSystemPrompt();
    const loopMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    ];

    let iteration = 0;
    const MAX_ITERATIONS = 5;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      // Stream the response
      const stream = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages: loopMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        stream: true,
      });

      let fullContent = '';
      const toolCallMap = {}; // id -> { name, arguments }

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Stream text content
        if (delta.content) {
          fullContent += delta.content;
          send({ text: delta.content });
        }

        // Accumulate tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallMap[idx]) {
              toolCallMap[idx] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' };
              // Notify client which tool is being called
              if (tc.function?.name) send({ toolCall: { name: tc.function.name, id: tc.id } });
            }
            if (tc.id) toolCallMap[idx].id = tc.id;
            if (tc.function?.arguments) toolCallMap[idx].arguments += tc.function.arguments;
          }
        }
      }

      const toolCalls = Object.values(toolCallMap);

      // No tool calls — we're done
      if (!toolCalls.length) break;

      // Add assistant message with tool calls to loop
      loopMessages.push({
        role: 'assistant',
        content: fullContent || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      // Execute each tool and append results
      for (const tc of toolCalls) {
        let result;
        try {
          const input = JSON.parse(tc.arguments || '{}');
          result = await executeTool(tc.name, input);

          // Handle PDF report
          if (tc.name === 'generate_report_pdf') {
            const reportId = `report_${Date.now()}`;
            reportStore.set(reportId, { type: result.reportType, startDate: result.startDate, endDate: result.endDate, createdAt: Date.now() });
            result = { ...result, reportId, downloadUrl: `/api/cfo/report/${reportId}` };
          }
        } catch (toolErr) {
          result = { error: toolErr.message };
        }

        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      // Continue loop — let GPT-4o process the tool results
    }

    send({ done: true });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    send({ error: err.message });
    res.end();
  }
});

// ─── POST /api/cfo/report — Generate PDF and stream it ───────────────────────
router.post('/report', async (req, res) => {
  const { report_type, start_date, end_date, ai_analysis } = req.body;
  const fy = fiscalYear();
  const sd = start_date || fy.start;
  const ed = end_date || fy.end;
  const period = `${sd} to ${ed}`;

  try {
    let pdfBuffer;
    const filename = `univest_${report_type}_${sd}_${ed}.pdf`;

    if (report_type === 'executive_summary') {
      const kpis = await zoho.getKPISummary(sd, ed);
      pdfBuffer = await pdf.generateExecutiveSummary(kpis, ai_analysis || null, period);
    } else if (report_type === 'pl_statement') {
      const pl = await zoho.getPLStatement(sd, ed);
      pdfBuffer = await pdf.generatePLReport(pl, ai_analysis || null, period);
    } else if (report_type === 'balance_sheet') {
      const bs = await zoho.getBalanceSheet(ed);
      pdfBuffer = await pdf.generateBalanceSheetReport(bs, ai_analysis || null);
    } else if (report_type === 'cash_flow') {
      const cf = await zoho.getCashFlow(sd, ed);
      pdfBuffer = await pdf.generateCashFlowReport(cf, ai_analysis || null, period);
    } else if (report_type === 'ar_aging') {
      const aging = await zoho.getAgingReport('AR', sd, ed);
      pdfBuffer = await pdf.generateAgingReport(aging, ai_analysis || null);
    } else if (report_type === 'ap_aging') {
      const aging = await zoho.getAgingReport('AP', sd, ed);
      pdfBuffer = await pdf.generateAgingReport(aging, ai_analysis || null);
    } else if (report_type === 'board_pack') {
      const [kpis, pl, bs, cf] = await Promise.all([
        zoho.getKPISummary(sd, ed),
        zoho.getPLStatement(sd, ed),
        zoho.getBalanceSheet(ed),
        zoho.getCashFlow(sd, ed),
      ]);
      pdfBuffer = await pdf.generateBoardPack(kpis, pl, bs, cf, ai_analysis || null, period);
    } else {
      return res.status(400).json({ error: `Unknown report type: ${report_type}` });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/cfo/report/:id — Download previously queued report ──────────────
router.get('/report/:id', async (req, res) => {
  const job = reportStore.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Report not found or expired' });
  req.body = { report_type: job.type, start_date: job.startDate, end_date: job.endDate };
  return router.handle({ ...req, method: 'POST', url: '/report' }, res, () => {});
});

// ─── GET /api/cfo/kpis — Quick KPI JSON snapshot ────────────────────────────
router.get('/kpis', async (req, res) => {
  const { from, to } = req.query;
  const fy = lastCompletedFiscalYear();
  try {
    const data = await zoho.getKPISummary(from || fy.start, to || fy.end);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/cfo/treasury-excel — Download Treasury Overview as Excel ────────
router.get('/treasury-excel', async (req, res) => {
  const ExcelJS = require('exceljs');
  const axios   = require('axios');

  // ── helpers ────────────────────────────────────────────────────────────────
  const toCr  = v => +(Math.round((v || 0) / 1e7 * 100) / 100).toFixed(2);   // → Crores
  const toL   = v => +(Math.round((v || 0) / 1e5 * 100) / 100).toFixed(2);   // → Lakhs
  const smartFmt = v => {
    const abs = Math.abs(v || 0);
    if (abs >= 1e7) return `${toCr(v)} Cr`;
    if (abs >= 1e5) return `${toL(v)} L`;
    return `₹${Math.round(v || 0).toLocaleString('en-IN')}`;
  };

  // colours matching the dashboard
  const NAVY   = '0F1F3D';
  const BLUE   = '185FA5';
  const GREEN  = '16A34A';
  const RED    = 'DC2626';
  const GRAY   = 'F8FAFC';
  const WHITE  = 'FFFFFF';
  const BORDER_COLOR = 'E2E8F0';

  const styleHeader = (cell, bgHex, fgHex = WHITE, sz = 11, bold = true) => {
    cell.font  = { bold, size: sz, color: { argb: 'FF' + fgHex }, name: 'Calibri' };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgHex } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
  };
  const styleData = (cell, bold = false, color = '374151', align = 'left') => {
    cell.font  = { bold, size: 10, color: { argb: 'FF' + color }, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: align };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
    };
  };
  const styleAmount = (cell, v) => {
    const color = (v || 0) < 0 ? RED : '1E3A5F';
    cell.font  = { bold: true, size: 10, color: { argb: 'FF' + color }, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } } };
  };
  const setColWidths = (ws, widths) => {
    ws.columns = widths.map(w => ({ width: w }));
  };

  try {
    const r = await axios.get('http://localhost:3001/api/dashboard');
    const dashData  = r.data.data || r.data;
    const companies = dashData.companies || [];
    const consSummary = (dashData.consolidated || {}).summary || {};
    const today = new Date().toISOString().slice(0, 10);

    // ── consolidated totals ──────────────────────────────────────────────────
    let totalGst = 0, totalTds = 0, totalSecurity = 0, totalOther = 0;
    companies.forEach(co => {
      const bs = co.balanceSheet || {};
      totalGst      += bs.netGst               || 0;
      totalTds      += bs.totalTds             || 0;
      totalSecurity += bs.totalSecurityDeposits|| 0;
      totalOther    += bs.totalOtherInvestments|| 0;
    });
    const totalAssets = (consSummary.bsTotalBankBalance || 0)
      + (consSummary.bsTotalFdBalance || 0)
      + (consSummary.bsTotalAccruedInterest || 0)
      + totalGst + totalTds + totalSecurity + totalOther;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Univest MIS';
    wb.created = new Date();

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 1 — Treasury Overview
    // ════════════════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet('Treasury Overview');
    setColWidths(ws1, [28, 18, 18, 18, 18, 18]);

    // Title row
    ws1.mergeCells('A1:F1');
    const titleCell = ws1.getCell('A1');
    titleCell.value = 'UNIVEST GROUP — TREASURY OVERVIEW';
    styleHeader(titleCell, NAVY, WHITE, 14, true);
    ws1.getRow(1).height = 32;

    // Subtitle
    ws1.mergeCells('A2:F2');
    const subCell = ws1.getCell('A2');
    subCell.value = `As of ${today}   |   Live data from Zoho Books`;
    styleHeader(subCell, BLUE, WHITE, 10, false);
    ws1.getRow(2).height = 20;

    ws1.addRow([]);

    // ── Total Assets banner ─────────────────────────────────────────────────
    ws1.mergeCells('A4:C4');
    const taLabel = ws1.getCell('A4');
    taLabel.value = 'TOTAL ASSETS (TREASURY VIEW)';
    styleHeader(taLabel, '1E3A5F', 'CBD5E1', 9, true);

    ws1.mergeCells('D4:F4');
    const taValue = ws1.getCell('D4');
    taValue.value = smartFmt(totalAssets);
    taValue.font  = { bold: true, size: 16, color: { argb: 'FF185FA5' }, name: 'Calibri' };
    taValue.alignment = { horizontal: 'right', vertical: 'middle' };
    taValue.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } };
    ws1.getRow(4).height = 28;

    ws1.addRow([]);

    // ── Summary cards row ───────────────────────────────────────────────────
    const cardLabels = ['Cash in Bank', 'Fixed Deposits', 'Net GST', 'TDS Receivable', 'Security Deposits', 'Other Investments'];
    const cardValues = [
      consSummary.bsTotalBankBalance,
      consSummary.bsTotalFdBalance,
      totalGst, totalTds, totalSecurity, totalOther,
    ];

    const labelRow = ws1.addRow(cardLabels);
    labelRow.height = 20;
    cardLabels.forEach((_, i) => {
      const cell = labelRow.getCell(i + 1);
      cell.font  = { bold: true, size: 8, color: { argb: 'FF94A3B8' }, name: 'Calibri' };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const valueRow = ws1.addRow(cardValues.map(v => smartFmt(v)));
    valueRow.height = 26;
    cardValues.forEach((v, i) => {
      const cell = valueRow.getCell(i + 1);
      const isNeg = (v || 0) < 0;
      cell.font  = { bold: true, size: 12, color: { argb: isNeg ? 'FFDC2626' : 'FF0F1F3D' }, name: 'Calibri' };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top:    { style: 'medium', color: { argb: isNeg ? 'FFDC2626' : 'FF185FA5' } },
        bottom: { style: 'thin',   color: { argb: 'FFE2E8F0' } },
        left:   { style: 'thin',   color: { argb: 'FFE2E8F0' } },
        right:  { style: 'thin',   color: { argb: 'FFE2E8F0' } },
      };
    });

    ws1.addRow([]);

    // ── Per-company breakdown ───────────────────────────────────────────────
    const breakdownHeader = ws1.addRow(['Company', 'Cash in Bank', 'Fixed Deposits', 'Net GST', 'TDS Receivable', 'Security Deposits']);
    breakdownHeader.height = 22;
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
      styleHeader(ws1.getCell(`${col}${breakdownHeader.number}`), BLUE);
    });

    companies.forEach((co, idx) => {
      const bs  = co.balanceSheet || {};
      const row = ws1.addRow([
        co.companyName,
        smartFmt(bs.totalBankBalance || 0),
        smartFmt(bs.totalFdBalance   || 0),
        smartFmt(bs.netGst           || 0),
        smartFmt(bs.totalTds         || 0),
        smartFmt(bs.totalSecurityDeposits || 0),
      ]);
      row.height = 20;
      const bg = idx % 2 === 0 ? WHITE : 'F8FAFC';
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
        cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF1E293B' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        cell.alignment = { vertical: 'middle', horizontal: cell.col === 1 ? 'left' : 'right' };
      });
      row.getCell(1).font = { bold: true, size: 10, name: 'Calibri' };
    });

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 2 — Cash in Bank
    // ════════════════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('Cash in Bank');
    setColWidths(ws2, [24, 38, 20]);

    ws2.mergeCells('A1:C1');
    styleHeader(ws2.getCell('A1'), NAVY, WHITE, 13);
    ws2.getCell('A1').value = 'CASH IN BANK — All Entities';
    ws2.getRow(1).height = 28;

    ws2.mergeCells('A2:C2');
    styleHeader(ws2.getCell('A2'), BLUE, WHITE, 9, false);
    ws2.getCell('A2').value = `As of ${today}   |   All values in INR`;
    ws2.getRow(2).height = 18;

    ws2.addRow([]);

    const bankHeader = ws2.addRow(['Company', 'Account', 'Balance']);
    bankHeader.height = 22;
    ['A', 'B', 'C'].forEach(col => styleHeader(ws2.getCell(`${col}${bankHeader.number}`), BLUE));

    let bankRowIdx = 0;
    companies.forEach(co => {
      const bs = co.balanceSheet || {};
      (bs.bankAccounts || []).forEach(a => {
        const row = ws2.addRow([co.companyName, a.accountName, a.balance || 0]);
        row.height = 19;
        const bg = bankRowIdx % 2 === 0 ? WHITE : 'F8FAFC';
        styleData(row.getCell(1), true,  '1E293B');
        styleData(row.getCell(2), false, '374151');
        styleAmount(row.getCell(3), a.balance);
        row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }; });
        row.getCell(3).numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
        bankRowIdx++;
      });
    });

    // Total row
    const bankTotal = companies.reduce((s, co) => s + ((co.balanceSheet || {}).totalBankBalance || 0), 0);
    const bankTotalRow = ws2.addRow(['TOTAL', '', bankTotal]);
    bankTotalRow.height = 22;
    styleHeader(bankTotalRow.getCell(1), NAVY);
    bankTotalRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } };
    bankTotalRow.getCell(3).value  = bankTotal;
    bankTotalRow.getCell(3).numFmt = '₹#,##0.00;[Red]-₹#,##0.00';
    bankTotalRow.getCell(3).font   = { bold: true, size: 11, color: { argb: bankTotal < 0 ? 'FFFFAAAA' : 'FF90EE90' }, name: 'Calibri' };
    bankTotalRow.getCell(3).fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } };
    bankTotalRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 3 — Fixed Deposits
    // ════════════════════════════════════════════════════════════════════════
    const ws3 = wb.addWorksheet('Fixed Deposits');
    setColWidths(ws3, [24, 44, 20]);

    ws3.mergeCells('A1:C1');
    styleHeader(ws3.getCell('A1'), NAVY, WHITE, 13);
    ws3.getCell('A1').value = 'FIXED DEPOSITS — All Entities';
    ws3.getRow(1).height = 28;

    ws3.mergeCells('A2:C2');
    styleHeader(ws3.getCell('A2'), BLUE, WHITE, 9, false);
    ws3.getCell('A2').value = `As of ${today}   |   All values in INR`;
    ws3.getRow(2).height = 18;

    ws3.addRow([]);

    const fdHeader = ws3.addRow(['Company', 'FD Account', 'Balance']);
    fdHeader.height = 22;
    ['A', 'B', 'C'].forEach(col => styleHeader(ws3.getCell(`${col}${fdHeader.number}`), BLUE));

    let fdRowIdx = 0;
    companies.forEach(co => {
      const bs = co.balanceSheet || {};
      (bs.fdAccounts || []).forEach(a => {
        const row = ws3.addRow([co.companyName, a.accountName, a.balance || 0]);
        row.height = 19;
        const bg = fdRowIdx % 2 === 0 ? WHITE : 'F8FAFC';
        styleData(row.getCell(1), true,  '1E293B');
        styleData(row.getCell(2), false, '374151');
        styleAmount(row.getCell(3), a.balance);
        row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }; });
        row.getCell(3).numFmt = '₹#,##0.00';
        fdRowIdx++;
      });
    });

    // FD Total
    const fdTotal = companies.reduce((s, co) => s + ((co.balanceSheet || {}).totalFdBalance || 0), 0);
    const fdTotalRow = ws3.addRow(['TOTAL', '', fdTotal]);
    fdTotalRow.height = 22;
    styleHeader(fdTotalRow.getCell(1), NAVY);
    fdTotalRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } };
    fdTotalRow.getCell(3).value  = fdTotal;
    fdTotalRow.getCell(3).numFmt = '₹#,##0.00';
    fdTotalRow.getCell(3).font   = { bold: true, size: 11, color: { argb: 'FF90EE90' }, name: 'Calibri' };
    fdTotalRow.getCell(3).fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } };
    fdTotalRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 4 — Cash Flow by Entity
    // ════════════════════════════════════════════════════════════════════════
    const ws4 = wb.addWorksheet('Cash Flow by Entity');
    setColWidths(ws4, [24, 20, 20, 20, 20]);

    ws4.mergeCells('A1:E1');
    styleHeader(ws4.getCell('A1'), NAVY, WHITE, 13);
    ws4.getCell('A1').value = 'CASH FLOW — By Entity';
    ws4.getRow(1).height = 28;

    ws4.mergeCells('A2:E2');
    styleHeader(ws4.getCell('A2'), BLUE, WHITE, 9, false);
    ws4.getCell('A2').value = `Period covered by date range   |   All values in INR`;
    ws4.getRow(2).height = 18;

    ws4.addRow([]);

    const cfHeader = ws4.addRow(['Company', 'Total Inflow', 'Total Outflow', 'Net Cash Flow', 'Closing Balance']);
    cfHeader.height = 22;
    ['A','B','C','D','E'].forEach(col => styleHeader(ws4.getCell(`${col}${cfHeader.number}`), BLUE));

    companies.forEach((co, idx) => {
      const s   = co.report?.summary || {};
      const row = ws4.addRow([
        co.companyName,
        s.totalInflow   || 0,
        s.totalOutflow  || 0,
        s.netCashFlow   || 0,
        s.closingBalance|| 0,
      ]);
      row.height = 20;
      const bg = idx % 2 === 0 ? WHITE : 'F8FAFC';
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }; });
      styleData(row.getCell(1), true, '1E293B');
      [2, 3, 4, 5].forEach(i => {
        const v = row.getCell(i).value;
        styleAmount(row.getCell(i), v);
        row.getCell(i).numFmt = '₹#,##0;[Red]-₹#,##0';
        row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
      });
    });

    // ── Send ──────────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="univest_treasury_${today}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[treasury-excel]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/cfo/health ──────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  const checks = { openai: false, zoho: false };
  try {
    await zoho.getDashboardData('2025-01-01', '2025-03-31');
    checks.zoho = true;
  } catch {}
  checks.openai = !!process.env.OPENAI_API_KEY;
  res.json({ ok: checks.openai && checks.zoho, checks });
});

module.exports = router;
