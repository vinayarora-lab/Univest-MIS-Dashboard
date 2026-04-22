/**
 * Stock Broking Balance Sheet Service
 * Parses Excel balance sheet (Tally format) from a local file or Google Drive.
 *
 * Configure in .env:
 *   STOCK_BROKING_GDRIVE_ID=<Google Drive file ID>
 *   or
 *   STOCK_BROKING_SHEET_PATH=<absolute local path to .xls/.xlsx file>
 */

const XLSX = require('xlsx');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../.cache');
const CACHED_FILE = path.join(CACHE_DIR, 'stock_broking_bs.xls');

// ── Parse the Excel balance sheet ───────────────────────────────────────────
function parseBalanceSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const bankAccounts = [];
  const fdAccounts = [];
  const accruedInterestAccounts = [];

  rows.slice(4).forEach((r) => {
    if (r[0] !== 'APPLICATION OF FUND') return;
    const schedule = String(r[2] || '').trim();
    const name     = String(r[6] || '').trim();
    const closing  = parseFloat(r[10] || 0);

    if (!name) return;

    // In Tally exports: negative closing = debit balance = asset deployed
    const balance = Math.round(Math.abs(closing) * 100) / 100;

    if (schedule === 'CASH AND BANK BALANCES') {
      // Only include proprietary accounts (not client/gateway accounts)
      if (balance > 0 && /proprietary/i.test(name)) {
        bankAccounts.push({
          accountId: `sb_bank_${bankAccounts.length}`,
          accountName: name,
          balance,
          section: 'Cash and Bank Balances',
        });
      }
    } else if (schedule === 'EXCHANGE DEPOSIT FD' || schedule === 'FDR WITH BANK') {
      // Exclude ICCL margin FDs (exchange margin pledges, not regular FDs)
      if (balance > 0 && !/iccl\s+margin/i.test(name)) {
        fdAccounts.push({
          accountId: `sb_fd_${fdAccounts.length}`,
          accountName: name,
          balance,
          section: schedule,
        });
      }
    }

    // Accrued interest
    if (/accrued.interest/i.test(name) && balance > 0) {
      accruedInterestAccounts.push({
        accountId: `sb_ai_${accruedInterestAccounts.length}`,
        accountName: name,
        balance,
        section: schedule,
      });
    }
  });

  // Also capture the standalone accrued interest receivable row (no schedule tag)
  rows.slice(4).forEach((r) => {
    const name    = String(r[6] || '').trim();
    const closing = parseFloat(r[10] || 0);
    if (/accrued.interest/i.test(name) && Math.abs(closing) > 0) {
      const already = accruedInterestAccounts.some((a) => a.accountName === name);
      if (!already) {
        accruedInterestAccounts.push({
          accountId: `sb_ai_standalone`,
          accountName: name,
          balance: Math.round(Math.abs(closing) * 100) / 100,
          section: 'Other Current Assets',
        });
      }
    }
  });

  const totalBankBalance       = Math.round(bankAccounts.reduce((s, a) => s + a.balance, 0) * 100) / 100;
  const totalFdBalance         = Math.round(fdAccounts.reduce((s, a) => s + a.balance, 0) * 100) / 100;
  const totalAccruedInterest   = Math.round(accruedInterestAccounts.reduce((s, a) => s + a.balance, 0) * 100) / 100;

  // Try to extract the date from row 3 (e.g. "From Date :01/04/2025 To Date :24/03/2026")
  let asOfDate = new Date().toISOString().slice(0, 10);
  const dateRow = String((rows[2] || [])[0] || '');
  const toDateMatch = dateRow.match(/To Date\s*:(\d{2}\/\d{2}\/\d{4})/i);
  if (toDateMatch) {
    const [d, m, y] = toDateMatch[1].split('/');
    asOfDate = `${y}-${m}-${d}`;
  }

  return {
    asOfDate,
    bankAccounts,
    fdAccounts,
    accruedInterestAccounts,
    totalBankBalance,
    totalFdBalance,
    totalAccruedInterest,
  };
}

// ── Download file from Google Drive ─────────────────────────────────────────
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    const get = (u) => {
      protocol.get(u, (res) => {
        // Follow redirects (Google Drive does this)
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
          file.close();
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
    };

    get(url);
  });
}

// ── Main exported function ───────────────────────────────────────────────────
async function fetchStockBrokingBalanceSheet() {
  const gdriveId  = process.env.STOCK_BROKING_GDRIVE_ID;
  const localPath = process.env.STOCK_BROKING_SHEET_PATH;

  if (gdriveId) {
    console.log('  [StockBroking] Downloading balance sheet from Google Drive...');
    const url = `https://drive.google.com/uc?export=download&id=${gdriveId}&confirm=1`;
    await downloadFile(url, CACHED_FILE);
    console.log('  [StockBroking] Downloaded. Parsing...');
    return parseBalanceSheet(CACHED_FILE);
  }

  if (localPath && fs.existsSync(localPath)) {
    console.log(`  [StockBroking] Reading balance sheet from ${localPath}`);
    return parseBalanceSheet(localPath);
  }

  // Fall back to last cached file if available
  if (fs.existsSync(CACHED_FILE)) {
    console.log('  [StockBroking] Using cached balance sheet file.');
    return parseBalanceSheet(CACHED_FILE);
  }

  throw new Error(
    'Stock Broking balance sheet not configured. ' +
    'Set STOCK_BROKING_GDRIVE_ID or STOCK_BROKING_SHEET_PATH in .env'
  );
}

module.exports = { fetchStockBrokingBalanceSheet, parseBalanceSheet };
