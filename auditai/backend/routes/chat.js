const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const { fetchFullZohoData, buildZohoAIContext } = require('../services/dataService');
const { loadAllMISData } = require('../services/misDatapack');

let openai = null;
function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder' });
  return openai;
}

// Load both Zoho cash flow data + full MIS Datapack
async function loadAllContext() {
  const [zoho, mis] = await Promise.allSettled([
    fetchFullZohoData().then(d => buildZohoAIContext(d)),
    loadAllMISData(),
  ]);

  return {
    zoho: zoho.status === 'fulfilled' ? zoho.value : null,
    mis: mis.status === 'fulfilled' ? mis.value : null,
  };
}

function buildSystemPrompt(context, { zoho, mis }) {
  const misSection = mis ? `
## MIS DATAPACK — LIVE DATA FROM GOOGLE SHEETS

### Consolidated IS (Accrued) — Last 12 Months
Dates: ${mis.consolidatedIS?.dates?.join(', ') || 'N/A'}
${(mis.consolidatedIS?.items || []).map(i => `${i.label}: ${i.values.join(', ')}`).join('\n')}

### Revenue Mix — Last 12 Months
Dates: ${mis.revenueMix?.dates?.join(', ') || 'N/A'}
${(mis.revenueMix?.plans || []).map(p => `${p.plan}: ${p.values.join(', ')}`).join('\n')}

### Retention Improvements — Last 6 Months (%, M0–M5)
${(mis.retention?.data || []).map(r => `${r.month}: M0=${r.M0}% M1=${r.M1}% M2=${r.M2}% M3=${r.M3}%`).join('\n')}

### Subscription Cohorts — Last 6 Cohorts (INR Mn)
${(mis.subscriptionCohorts?.data || []).map(r => `${r.cohort}: New=₹${r.newRevenue}Mn, Repeat=₹${r.repeatRevenue}Mn, RepeatM0=${r['Repeat M0']}% M1=${r.M1}% M2=${r.M2}%`).join('\n')}

### Overall Cohorts — Last 6 Cohorts (INR Mn, M0 absolute, M1+ % of M0)
${(mis.overallCohorts?.data || []).map(r => `${r.cohort}: M0=₹${r.m0Revenue}Mn M1=${r.M1}% M2=${r.M2}% M3=${r.M3}%`).join('\n')}

### Signup → Conversion — Last 6 Cohorts
${(mis.signupConversion?.data || []).map(r => `${r.cohort}: Signups=${r.totalSignups}, M0=${r.M0}% M1=${r.M1}% M3=${r.M3}%`).join('\n')}

### Channel CAC — Last 3 Months
${(mis.channelCAC || []).map(m => `${m.month}: Total Conversions=${m.grandTotal?.conversions}, Total Spends=₹${m.grandTotal?.spends}, Blended CAC=₹${m.grandTotal?.cac}`).join('\n')}

### Key Initiatives
${(mis.keyInitiatives || []).map((k, i) => `${i+1}. ${k.problem}\n   Action: ${k.actions}\n   Impact: ${k.presentImpact}`).join('\n\n')}
` : '⚠️ MIS Datapack unavailable';

  const zohoSection = zoho ? `
## ZOHO BOOKS — LIVE DATA (${zoho.period}, all values in ${zoho.unit})

### Consolidated Summary
Total Inflow: ₹${zoho.consolidated.totalInflow_L}L | Total Outflow: ₹${zoho.consolidated.totalOutflow_L}L | Net: ₹${zoho.consolidated.netCashFlow_L}L
Bank Balance: ₹${zoho.consolidated.bankBalance_L}L | FD Balance: ₹${zoho.consolidated.fdBalance_L}L

${zoho.companies.map(co => `
### ${co.company}
Summary: Inflow ₹${co.summary.totalInflow_L}L | Outflow ₹${co.summary.totalOutflow_L}L | Net ₹${co.summary.netCashFlow_L}L | Customer Payments ₹${co.summary.customerPayments_L}L
Balance Sheet: Bank ₹${co.balanceSheet.bankBalance_L}L | FD ₹${co.balanceSheet.fdBalance_L}L | Net GST ₹${co.balanceSheet.netGst_L}L | TDS ₹${co.balanceSheet.tds_L}L

Monthly Cash Flow (last 12 months):
${co.monthly_cashflow_last12.map(m => `  ${m.month}: In=₹${m.inflow}L Out=₹${m.outflow}L CustPay=₹${m.customerPayments}L Net=₹${m.net}L`).join('\n')}

Top Clients:
${co.top10_clients.map(c => `  ${c.name}: ₹${c.totalInflow_L}L (${c.txns} txns)`).join('\n')}

Top Vendors:
${co.top10_vendors.map(v => `  ${v.name}: ₹${v.totalOutflow_L}L (${v.txns} txns)`).join('\n')}

Bank Accounts:
${co.bank_accounts.map(b => `  ${b.bank}: In=₹${b.inflow_L}L Out=₹${b.outflow_L}L Net=₹${b.net_L}L`).join('\n')}
`).join('\n')}
` : '⚠️ Zoho data unavailable';

  return `You are **Univest AI** — the intelligent financial and business assistant for Univest Group, a FinTech/NBFC with four entities: Uniresearch, Univest, Uniapps, and Stock Broking.

You have DIRECT ACCESS to all the data below. Never say you don't have access to the MIS Datapack — all sheets are loaded below.

Current page: ${context}

${misSection}

${zohoSection}

LEDGER DOWNLOAD CAPABILITY:
When a user asks to download or export a ledger — respond with:
[DOWNLOAD: <label>](http://localhost:4000/api/ledger/export?type=<type>&company=<company>&fromDate=<from>&toDate=<to>)

Types: monthly | clients | vendors | banks
Companies: Uniresearch, Univest, Uniapps, "Stock Broking", all
Date format: YYYY-MM-DD

RESPONSE GUIDELINES:
- Be concise and data-driven. Use bullet points and markdown tables.
- Format monetary values in INR with ₹ (e.g. ₹12,50,000 or ₹1.2 Mn).
- All numbers above are from live data — cite them confidently.
- For % values in cohorts/retention, they represent retention rates.
- Never fabricate numbers beyond what is in the data above.`;
}

router.post('/', async (req, res) => {
  const { messages = [], context = 'overview' } = req.body;

  if (!messages.length) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const contextData = await loadAllContext();
    const systemPrompt = buildSystemPrompt(context, contextData);

    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    ];

    const stream = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: openaiMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
