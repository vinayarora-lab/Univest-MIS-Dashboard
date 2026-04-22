/**
 * Anthropic AI Service — Treasury Advisor
 * Uses Claude claude-opus-4-6 with streaming to generate financial suggestions
 */
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Build a structured financial context string from dashboard data
 */
function buildFinancialContext(data) {
  const { consolidated, companies } = data;
  const s = consolidated.summary;

  const fmt = (n) => {
    if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
  };

  const companyLines = companies.map(({ companyName, report: r }) => {
    const totalInvested = r.investmentBreakdown
      ? r.investmentBreakdown.reduce((a, iv) => a + iv.invested, 0)
      : 0;
    const totalBankBalance = r.bankWiseBreakdown
      ? r.bankWiseBreakdown.reduce((a, b) => a + b.closingBalance, 0)
      : r.summary.closingBalance;

    return `
  ${companyName}:
    - Opening Balance: ${fmt(r.summary.openingBalance)}
    - Closing Balance: ${fmt(r.summary.closingBalance)}
    - Total Inflows: ${fmt(r.summary.totalInflow)}
    - Total Outflows: ${fmt(r.summary.totalOutflow)}
    - Net Cash Flow: ${fmt(r.summary.netCashFlow)}
    - Funds Invested (FD/MF): ${fmt(totalInvested)}
    - Current Bank Balance: ${fmt(totalBankBalance)}
    - Operating Cash Flow: ${fmt(r.summary.netOperatingCashFlow)}
    - Top Client: ${r.clientBreakdown?.[0]?.name || 'N/A'} (${fmt(r.clientBreakdown?.[0]?.totalInflow || 0)})
    - Top Vendor: ${r.vendorBreakdown?.[0]?.name || 'N/A'} (${fmt(r.vendorBreakdown?.[0]?.totalOutflow || 0)})`;
  }).join('\n');

  return `
CONSOLIDATED GROUP FINANCIALS (${consolidated.reportMeta.fromDate} to ${consolidated.reportMeta.toDate}):
  Total Inflows:  ${fmt(s.totalInflow)}
  Total Outflows: ${fmt(s.totalOutflow)}
  Net Cash Flow:  ${fmt(s.netCashFlow)}
  Opening Balance: ${fmt(s.openingBalance)}
  Closing Balance: ${fmt(s.closingBalance)}
  Operating Cash Flow: ${fmt(s.netOperatingCashFlow)}
  Investing Cash Flow: ${fmt(s.netInvestingCashFlow)}
  Financing Cash Flow: ${fmt(s.netFinancingCashFlow)}

COMPANY-WISE BREAKDOWN:
${companyLines}
`.trim();
}

/**
 * Generate AI treasury suggestions — returns a streaming response
 * Caller is responsible for piping the stream to the HTTP response
 */
async function generateSuggestions(data, res) {
  const financialContext = buildFinancialContext(data);

  const systemPrompt = `You are an expert CFO and treasury advisor for an Indian conglomerate with multiple subsidiaries.
You analyze financial data and provide actionable, specific treasury management suggestions in INR terms.
Always structure your response with exactly 5 prioritized suggestions.
Format each suggestion as:
PRIORITY [1-5]: [TITLE]
CATEGORY: [one of: Cash Optimization | Investment Strategy | Risk Management | Cost Reduction | Revenue Growth]
IMPACT: [High/Medium/Low] | TIMEFRAME: [Immediate/Short-term (1-3 months)/Medium-term (3-6 months)]
RECOMMENDATION: [2-3 specific, actionable sentences with INR figures where applicable]
RATIONALE: [1-2 sentences explaining why this is important based on the data]
---`;

  const userMessage = `Based on the following real financial data from my group companies, provide 5 prioritized treasury management suggestions:

${financialContext}

Focus on:
1. Optimizing idle cash and working capital
2. FD/investment portfolio rebalancing
3. Inter-company fund transfers to maximize returns
4. Cash flow timing mismatches
5. Expense optimization opportunities

Provide specific, actionable advice with exact INR figures where possible.`;

  // Stream the response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
      }
    }

    const finalMsg = await stream.finalMessage();
    res.write(`data: ${JSON.stringify({ type: 'done', usage: finalMsg.usage })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
}

/**
 * Non-streaming version — returns full text for caching
 */
async function generateSuggestionsText(data) {
  const financialContext = buildFinancialContext(data);

  const systemPrompt = `You are an expert CFO and treasury advisor for an Indian conglomerate with multiple subsidiaries.
Provide actionable, specific treasury management suggestions in INR terms.
Structure your response with exactly 5 prioritized suggestions using this format:
PRIORITY [1-5]: [TITLE]
CATEGORY: [Cash Optimization | Investment Strategy | Risk Management | Cost Reduction | Revenue Growth]
IMPACT: [High/Medium/Low] | TIMEFRAME: [Immediate/Short-term/Medium-term]
RECOMMENDATION: [2-3 specific actionable sentences]
RATIONALE: [1-2 sentences]
---`;

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Based on this financial data, provide 5 prioritized treasury suggestions:\n\n${financialContext}`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : 'Unable to generate suggestions.';
}

/**
 * Parse AI suggestion text into structured cards
 */
function parseSuggestions(text) {
  const suggestions = [];
  const blocks = text.split('---').filter((b) => b.trim());

  for (const block of blocks) {
    const priorityMatch = block.match(/PRIORITY\s*\[?(\d)\]?:\s*(.+)/i);
    const categoryMatch = block.match(/CATEGORY:\s*(.+)/i);
    const impactMatch = block.match(/IMPACT:\s*(High|Medium|Low)/i);
    const timeframeMatch = block.match(/TIMEFRAME:\s*(.+?)(?:\n|$)/i);
    const recMatch = block.match(/RECOMMENDATION:\s*([\s\S]+?)(?=RATIONALE:|$)/i);
    const ratMatch = block.match(/RATIONALE:\s*([\s\S]+?)(?=---|$)/i);

    if (priorityMatch) {
      suggestions.push({
        priority: parseInt(priorityMatch[1]),
        title: priorityMatch[2].trim(),
        category: categoryMatch?.[1]?.trim() || 'General',
        impact: impactMatch?.[1]?.trim() || 'Medium',
        timeframe: timeframeMatch?.[1]?.trim() || 'Short-term',
        recommendation: recMatch?.[1]?.trim() || '',
        rationale: ratMatch?.[1]?.trim() || '',
      });
    }
  }

  return suggestions.sort((a, b) => a.priority - b.priority);
}

module.exports = { generateSuggestions, generateSuggestionsText, parseSuggestions };
