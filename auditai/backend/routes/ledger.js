const express = require('express');
const router = express.Router();
const http = require('http');

const ZOHO_SERVER = 'http://localhost:3001';

function fetchZoho(fromDate, toDate) {
  return new Promise((resolve, reject) => {
    http.get(`${ZOHO_SERVER}/api/dashboard?fromDate=${fromDate}&toDate=${toDate}`, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (j.ok) resolve(j.data);
          else reject(new Error(j.error || 'Zoho API error'));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(','))
  ].join('\n');
}

// GET /api/ledger/export?type=monthly|clients|vendors|banks&company=all|Univest|...&fromDate=&toDate=
router.get('/export', async (req, res) => {
  const { type = 'monthly', company = 'all', fromDate = '2024-04-01', toDate = '2025-03-31' } = req.query;

  try {
    const data = await fetchZoho(fromDate, toDate);
    const companies = company === 'all'
      ? data.companies
      : data.companies.filter(c => c.companyName.toLowerCase() === company.toLowerCase());

    if (!companies.length) return res.status(404).json({ error: 'Company not found' });

    let rows = [];
    let filename = `${company}_${type}_${fromDate}_${toDate}.csv`;

    if (type === 'monthly') {
      companies.forEach(co => {
        (co.report.monthlyBreakdown || []).forEach(m => {
          rows.push({
            Company: co.companyName,
            Month: m.monthName,
            Inflow: m.inflow || 0,
            Outflow: m.outflow || 0,
            CustomerPayments: m.customerPayments || 0,
            VendorPayments: m.vendorPayments || 0,
            Expenses: m.expenses || 0,
            OtherInflows: m.otherInflows || 0,
            OtherOutflows: m.otherOutflows || 0,
            Net: m.net || 0,
          });
        });
      });
    } else if (type === 'clients') {
      companies.forEach(co => {
        (co.report.clientBreakdown || []).forEach(c => {
          if (!c.name || c.name === 'Unknown') return;
          rows.push({
            Company: co.companyName,
            Client: c.name,
            TotalInflow: c.totalInflow || 0,
            CustomerPayments: c.customerPayments || 0,
            SalesReceipts: c.salesReceipts || 0,
            OtherInflows: c.otherInflows || 0,
            TransactionCount: c.count || 0,
          });
        });
      });
    } else if (type === 'vendors') {
      companies.forEach(co => {
        (co.report.vendorBreakdown || []).forEach(v => {
          if (!v.name || v.name === 'Unknown') return;
          rows.push({
            Company: co.companyName,
            Vendor: v.name,
            TotalOutflow: v.totalOutflow || 0,
            VendorPayments: v.vendorPayments || 0,
            Expenses: v.expenses || 0,
            OtherOutflows: v.otherOutflows || 0,
            TransactionCount: v.count || 0,
          });
        });
      });
    } else if (type === 'banks') {
      companies.forEach(co => {
        (co.report.bankWiseBreakdown || []).forEach(b => {
          rows.push({
            Company: co.companyName,
            Bank: b.bankName || b.name,
            AccountName: b.accountName || '',
            Inflow: b.inflow || 0,
            Outflow: b.outflow || 0,
            Net: (b.inflow || 0) - (b.outflow || 0),
          });
        });
      });
    } else {
      return res.status(400).json({ error: 'Invalid type. Use: monthly, clients, vendors, banks' });
    }

    const csv = toCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ledger/summary - returns summary stats for the AI
router.get('/summary', async (req, res) => {
  const { fromDate = '2024-04-01', toDate = '2025-03-31' } = req.query;
  try {
    const data = await fetchZoho(fromDate, toDate);
    const summary = data.companies.map(co => ({
      company: co.companyName,
      totalInflow: co.report.summary?.totalInflow || 0,
      totalOutflow: co.report.summary?.totalOutflow || 0,
      netCashFlow: co.report.summary?.netCashFlow || 0,
      topClients: (co.report.clientBreakdown || []).filter(c => c.name && c.name !== 'Unknown').slice(0, 5).map(c => ({ name: c.name, amount: c.totalInflow })),
      topVendors: (co.report.vendorBreakdown || []).filter(v => v.name && v.name !== 'Unknown').slice(0, 5).map(v => ({ name: v.name, amount: v.totalOutflow })),
    }));
    res.json({ summary, fromDate, toDate });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
