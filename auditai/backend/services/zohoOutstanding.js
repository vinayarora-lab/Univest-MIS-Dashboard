/**
 * Zoho Outstanding Vendor Balances
 * Fetches unpaid/overdue bills directly from Zoho Books API for each company.
 * Credentials are read from ZOHO_COMPANIES env var (same as main dashboard).
 */
const axios = require('axios');

// Token cache per orgId
const tokenCache = {};

async function getAccessToken(company) {
  const now = Date.now();
  const cached = tokenCache[company.orgId];
  if (cached && now < cached.expiresAt - 60000) return cached.token;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: company.clientId,
    client_secret: company.clientSecret,
    refresh_token: company.refreshToken,
  });

  const region = process.env.ZOHO_REGION || 'in';
  const res = await axios.post(
    `https://accounts.zoho.${region}/oauth/v2/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (res.data.error) throw new Error(`Zoho OAuth error: ${res.data.error}`);

  tokenCache[company.orgId] = {
    token: res.data.access_token,
    expiresAt: now + (res.data.expires_in || 3600) * 1000,
  };
  return res.data.access_token;
}

async function zohoGet(company, endpoint, params = {}) {
  const token = await getAccessToken(company);
  const region = process.env.ZOHO_REGION || 'in';
  const res = await axios.get(`https://www.zohoapis.${region}/books/v3${endpoint}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    params: { organization_id: company.orgId, per_page: 200, ...params },
  });
  if (res.data.code !== 0) throw new Error(`Zoho API [${res.data.code}]: ${res.data.message}`);
  return res.data;
}

async function fetchUnpaidBills(company) {
  const vendors = {};

  for (const status of ['unpaid', 'overdue', 'partially_paid']) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      let data;
      try {
        data = await zohoGet(company, '/bills', { status, page });
      } catch (e) {
        break;
      }

      const bills = data.bills || [];
      for (const bill of bills) {
        const name = bill.vendor_name || 'Unknown';
        if (!name || name === 'Unknown') continue;

        if (!vendors[name]) {
          vendors[name] = { vendor: name, outstanding_L: 0, totalBilled_L: 0, billCount: 0, oldestDue: null };
        }

        const balance = parseFloat(bill.balance || 0);
        const total   = parseFloat(bill.total   || 0);
        vendors[name].outstanding_L  += balance;
        vendors[name].totalBilled_L  += total;
        vendors[name].billCount      += 1;

        if (bill.due_date) {
          const due = new Date(bill.due_date);
          if (!vendors[name].oldestDue || due < new Date(vendors[name].oldestDue)) {
            vendors[name].oldestDue = bill.due_date;
          }
        }
      }

      hasMore = data.page_context?.has_more_page === true;
      page++;
      if (bills.length === 0) break;
    }
  }

  // Convert to Lakhs and format
  const fmt = v => Math.round((v || 0) / 100000) / 10;
  return Object.values(vendors).map(v => ({
    ...v,
    outstanding_L: fmt(v.outstanding_L),
    totalBilled_L: fmt(v.totalBilled_L),
  })).filter(v => v.outstanding_L > 0).sort((a, b) => b.outstanding_L - a.outstanding_L);
}

// Intercompany filter (same as vendor-payouts)
const INTERCOMPANY = [
  'univest communication', 'uniresearch global', 'uniapps global',
  'uniapps investment adviser', 'univest stock broking', 'univest securities',
];
const isIntercompany = name => {
  const n = (name || '').toLowerCase();
  return INTERCOMPANY.some(kw => n.includes(kw));
};

async function getVendorOutstanding() {
  const companies = JSON.parse(process.env.ZOHO_COMPANIES || '[]');
  if (!companies.length) throw new Error('ZOHO_COMPANIES not configured');

  const results = await Promise.allSettled(
    companies.map(async co => {
      const vendors = await fetchUnpaidBills(co);
      return { name: co.name, vendors: vendors.filter(v => !isIntercompany(v.vendor)) };
    })
  );

  const allVendors = [];
  const companiesOut = results.map((r, i) => {
    if (r.status === 'rejected') {
      return { name: companies[i].name, error: r.reason.message, vendors: [] };
    }
    const { name, vendors } = r.value;
    vendors.forEach(v => allVendors.push({ ...v, company: name }));
    const totalOutstanding = Math.round(vendors.reduce((s, v) => s + v.outstanding_L, 0) * 10) / 10;
    return { name, totalOutstanding_L: totalOutstanding, vendors };
  });

  allVendors.sort((a, b) => b.outstanding_L - a.outstanding_L);

  const topVendors = allVendors.slice(0, 100).map((v, i) => ({ rank: i + 1, ...v }));
  const totalOutstanding = Math.round(allVendors.reduce((s, v) => s + v.outstanding_L, 0) * 10) / 10;
  const totalVendors = new Set(allVendors.map(v => v.vendor)).size;

  return {
    asOf: new Date().toISOString().slice(0, 10),
    summary: { totalOutstanding_L: totalOutstanding, totalVendors },
    companies: companiesOut,
    topVendors,
  };
}

module.exports = { getVendorOutstanding };
