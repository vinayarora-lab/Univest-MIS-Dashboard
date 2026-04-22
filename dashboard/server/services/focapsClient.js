/**
 * Focaps Back Office Scraper (Univest)
 * Uses Playwright to login and extract bank/investment/ledger data
 * CAPTCHA solved via: Tesseract OCR with jimp preprocessing (no API needed)
 */
const { chromium } = require('playwright');
const path = require('path');
const { createWorker } = require('tesseract.js');
const Jimp = require('jimp').default || require('jimp');
const https = require('https');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

const BASE_URL = 'https://backoffice.univest.in:1443/Focaps';
const LOGIN_URL = `${BASE_URL}/Sessions/Login.cfm?StartNewSession=true`;

const CREDENTIALS = {
  username: process.env.FOCAPS_USERNAME || 'VINAY',
  password: process.env.FOCAPS_PASSWORD || 'Growth@2027',
  year:     process.env.FOCAPS_YEAR     || 'CAPSFO,2025',
};

let _browser = null;
let _page    = null;
let _loggedIn = false;
let _lastLogin = null;
const SESSION_TTL_MS = 25 * 60 * 1000; // 25 minutes

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return _browser;
}

let _captchaAttempt = 0;

async function preprocessCaptcha(rawBuffer) {
  const img = await Jimp.read(rawBuffer);
  const w = img.getWidth();
  const h = img.getHeight();

  img
    .resize(w * 4, h * 4, Jimp.RESIZE_NEAREST_NEIGHBOR)
    .greyscale()
    .contrast(1)
    .normalize()
    .posterize(2);   // binarize to black/white

  return img.getBufferAsync(Jimp.MIME_PNG);
}

async function solveCaptcha(page) {
  const captchaEl = await page.$('img[src*="graph.cfm"]');
  if (!captchaEl) throw new Error('CAPTCHA image not found on page');

  const raw = await captchaEl.screenshot();
  // Save for debugging
  const fs = require('fs');
  _captchaAttempt++;
  fs.writeFileSync(`/tmp/captcha_attempt_${_captchaAttempt}_raw.png`, raw);
  const processed = await preprocessCaptcha(raw);
  fs.writeFileSync(`/tmp/captcha_attempt_${_captchaAttempt}_proc.png`, processed);

  // OEM 1 = LSTM, must be set at init not via setParameters
  const worker = await createWorker('eng', 1, { logger: () => {}, errorHandler: () => {} });
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    tessedit_pageseg_mode: '7',   // single line of text (handles spaced characters)
  });

  // Try preprocessed first, fall back to raw if result is empty
  let { data: { text } } = await worker.recognize(processed);
  if (!text.replace(/\s/g, '').trim()) {
    ({ data: { text } } = await worker.recognize(raw));
  }
  await worker.terminate();

  // Strip spaces and lowercase — server comparison is case-insensitive
  const result = text.replace(/\s+/g, '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  console.log('[focaps] CAPTCHA solved via Tesseract+jimp:', result);
  return result;
}

async function attemptLogin(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Select year
  await page.selectOption('select[name="txt_year1"]', { value: CREDENTIALS.year });

  // Fill credentials
  await page.fill('input[name="txt_loginname"]', CREDENTIALS.username);
  await page.fill('input[name="txt_password"]', CREDENTIALS.password);

  // Solve CAPTCHA
  const captchaText = await solveCaptcha(page);
  console.log(`[focaps] CAPTCHA: "${captchaText}"`);
  await page.fill('input[name="txt_CaptaText1"]', captchaText);

  // Check agree checkbox
  const agreeBox = await page.$('input[name="agree"]');
  if (agreeBox) {
    const checked = await agreeBox.isChecked();
    if (!checked) await agreeBox.check();
    await page.waitForTimeout(400);
  }

  // Skip submission if CAPTCHA looks wrong length (saves an attempt)
  if (captchaText.length < 2 || captchaText.length > 8) {
    return { success: false, reason: 'captcha_length', captcha: captchaText };
  }

  // Encrypt password with AES (same as check_values() on the page) and submit
  // Key/IV are hardcoded in the page JS — no validation, no Bootstrap tooltip crash
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
    page.evaluate((pwd) => {
      const key = CryptoJS.enc.Base64.parse('MTIzNDU2NzgxMjM0NTY3OA==');
      const iv  = CryptoJS.enc.Base64.parse('EBESExQVFhcYGRobHB0eHw==');
      const encrypted = CryptoJS.AES.encrypt(pwd, key, { iv });
      AddForm.txt_password.value = encrypted.toString();
      AddForm.Action.value = 'Login';
      AddForm.submit();
    }, CREDENTIALS.password).catch(() => {}),
  ]);

  // Wait for page to settle after navigation
  await page.waitForTimeout(1500);
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const url = page.url();
  const content = await page.content().catch(() => '');

  if (
    content.toLowerCase().includes('invalid captcha') ||
    content.toLowerCase().includes('wrong captcha') ||
    content.toLowerCase().includes('page not in')
  ) {
    return { success: false, reason: 'captcha' };
  }
  if (url.includes('Login.cfm') && !content.toLowerCase().includes('logout')) {
    return { success: false, reason: 'login_page', url };
  }

  return { success: true, url };
}

const COOKIE_FILE = '/tmp/focaps_session_cookies.json';
const fs = require('fs');

async function saveCookies(context) {
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies));
    console.log('[focaps] Session cookies saved.');
  } catch {}
}

async function tryRestoredSession() {
  if (!fs.existsSync(COOKIE_FILE)) return false;
  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    if (!cookies.length) return false;

    const browser = await getBrowser();
    if (_page) { try { await _page.close(); } catch {} }
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    await context.addCookies(cookies);
    _page = await context.newPage();

    // Test if session is still valid
    await _page.goto(`${BASE_URL}/Common/Admin_Frame.cfm`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await _page.waitForTimeout(1000);
    const url = _page.url();
    if (!url.includes('Login.cfm') && !url.includes('Error.cfm')) {
      _loggedIn = true;
      _lastLogin = Date.now();
      console.log('[focaps] Restored session from cookies. URL:', url);
      return true;
    }
    console.log('[focaps] Saved cookies expired, doing fresh login...');
    fs.unlinkSync(COOKIE_FILE);
    return false;
  } catch {
    return false;
  }
}

async function login() {
  const browser = await getBrowser();

  // Try to restore from saved cookies first (avoids CAPTCHA)
  const restored = await tryRestoredSession();
  if (restored) return _page;

  if (_page) { try { await _page.close(); } catch {} }
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  _page = await context.newPage();

  console.log('[focaps] Navigating to login page...');

  // Retry up to 15 times — each attempt gets a fresh CAPTCHA
  for (let attempt = 1; attempt <= 15; attempt++) {
    const result = await attemptLogin(_page);
    if (result.success) {
      _loggedIn = true;
      _lastLogin = Date.now();
      console.log('[focaps] Logged in successfully. URL:', result.url);
      await saveCookies(_page.context()); // Save for next time
      return _page;
    }
    console.warn(`[focaps] Login attempt ${attempt} failed (${result.reason})`);
    await _page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }

  throw new Error('Login failed after 15 attempts — check credentials or CAPTCHA');
}

async function getPage() {
  const expired = !_lastLogin || (Date.now() - _lastLogin > SESSION_TTL_MS);
  if (!_loggedIn || expired) {
    await login();
  }
  return _page;
}

// ── Extract company params from the ReportMenu frame URL ─────────────────────
function getCompanyParams(page) {
  const frames = page.frames();
  for (const f of frames) {
    const url = f.url();
    if (url.includes('ReportMenu.cfm')) {
      const u = new URL(url);
      return u.search; // ?COCD=BSE_CASH&CoName=...
    }
  }
  return '';
}

// ── Extract tables from a frame's content ────────────────────────────────────
async function extractTablesFromFrame(frame) {
  const content = await frame.content().catch(() => '');
  if (!content.includes('<table') || content.toLowerCase().includes('logged out')) return [];
  return frame.evaluate(() => {
    const result = [];
    document.querySelectorAll('table').forEach((tbl) => {
      const ths = [...tbl.querySelectorAll('thead th, tr:first-child th, tr:first-child td')]
        .map((h) => h.innerText.trim());
      tbl.querySelectorAll('tbody tr, tr:not(:first-child)').forEach((tr) => {
        const cells = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
        if (cells.length && cells.some((c) => c)) {
          const row = {};
          cells.forEach((c, i) => { row[ths[i] || `col_${i}`] = c; });
          result.push(row);
        }
      });
    });
    return result;
  }).catch(() => []);
}

// ── Navigate the Display frame directly to a report URL ──────────────────────
async function navigateDisplayFrameAndExtract(page, reportUrl) {
  // Find the Display frame by name or by its URL (BlankPage.html / about:blank)
  let displayFrame = page.frames().find(
    (f) => f.name() === 'Display' || f.url().includes('BlankPage') || f.url().includes('Blank.htm')
  );
  if (!displayFrame) {
    displayFrame = page.frames().find((f) => f.url() === 'about:blank');
  }
  if (!displayFrame) {
    console.log('[focaps] Display frame not found. Frames:', page.frames().map((f) => `${f.name()}|${f.url().split('?')[0]}`));
    return null;
  }

  console.log(`[focaps] Navigating Display frame to: ${reportUrl.split('?')[0]}`);
  try {
    await displayFrame.goto(reportUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1000);
  } catch (e) {
    console.log('[focaps] Frame goto error (continuing):', e.message.slice(0, 80));
  }

  const currentUrl = displayFrame.url();
  if (currentUrl.includes('Error.cfm') || currentUrl.includes('Login.cfm')) {
    console.log('[focaps] Blocked — redirected to:', currentUrl.split('?')[0]);
    return null;
  }

  const rows = await extractTablesFromFrame(displayFrame);
  if (rows.length) {
    console.log(`[focaps] Got ${rows.length} rows from Display frame`);
    return { source: currentUrl, data: rows };
  }
  console.log('[focaps] No table rows in Display frame at:', currentUrl.split('?')[0]);
  return null;
}

// ── Click a link in the ReportMenu frame to load report in content frame ──────
async function clickMenuLinkAndExtract(page, linkText) {
  const frames = page.frames();
  const menuFrame = frames.find((f) => f.url().includes('ReportMenu.cfm'));
  if (!menuFrame) return null;

  const link = await menuFrame.$(`a:has-text("${linkText}")`).catch(() => null);
  if (!link) { console.log(`[focaps] Link not found: ${linkText}`); return null; }

  // Get the absolute href — use el.href (absolute) not getAttribute (may be relative)
  const href = await link.evaluate((el) => el.href).catch(() => null);
  console.log(`[focaps] Found link "${linkText}" → href: ${(href || '').split('?')[0]}`);

  if (href && href.startsWith('http')) {
    const result = await navigateDisplayFrameAndExtract(page, href);
    if (result) return result;
  }

  // Fallback: click and wait
  console.log(`[focaps] Direct nav failed, trying click for: ${linkText}`);
  await link.click().catch(() => {});
  await page.waitForTimeout(4000);

  const contentFrame = page.frames().find((f) => {
    const u = f.url();
    return u && u.includes('.cfm') &&
      !u.includes('Admin_Frame') && !u.includes('TopFrame') &&
      !u.includes('ReportMenu') && !u.includes('Fra_Hide') &&
      !u.includes('Queries') && !u.includes('SpList') &&
      !u.includes('Login') && !u.includes('Error');
  });
  if (contentFrame) {
    const rows = await extractTablesFromFrame(contentFrame);
    if (rows.length) return { source: contentFrame.url(), data: rows };
  }
  return null;
}

// ── Explore all menu links across all frames ───────────────────────────────────
async function exploreMenus() {
  const page = await getPage();
  const allLinks = [];
  for (const f of page.frames()) {
    const links = await f.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((a) => ({ text: a.innerText.trim(), href: a.href }))
        .filter((l) => l.text && l.href && !l.href.startsWith('javascript'))
    ).catch(() => []);
    allLinks.push(...links);
  }
  return allLinks;
}

// ── Direct HTTP fetch with session cookies ────────────────────────────────────
const _httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function httpGet(url, extraHeaders = {}) {
  const cookies = fs.existsSync(COOKIE_FILE)
    ? JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'))
    : [];
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await fetch(url, {
    agent: _httpsAgent,
    headers: {
      Cookie: cookieStr,
      Referer: `${BASE_URL}/Text_Reports/ReportMenu.cfm`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      ...extraHeaders,
    },
    redirect: 'follow',
  });
  return res.text();
}

async function httpPost(url, body, extraHeaders = {}) {
  const cookies = fs.existsSync(COOKIE_FILE)
    ? JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'))
    : [];
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await fetch(url, {
    method: 'POST',
    agent: _httpsAgent,
    headers: {
      Cookie: cookieStr,
      Referer: url,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...extraHeaders,
    },
    body,
    redirect: 'follow',
  });
  return res.text();
}

// ── Parse HTML tables using cheerio ──────────────────────────────────────────
function parseHtmlTables(html) {
  const $ = cheerio.load(html);
  const result = [];
  $('table').each((_, tbl) => {
    const headers = [];
    $(tbl).find('tr:first-child th, tr:first-child td').each((_, th) => {
      headers.push($(th).text().trim());
    });
    $(tbl).find('tr').slice(1).each((_, tr) => {
      const cells = [];
      $(tr).find('td').each((_, td) => cells.push($(td).text().trim()));
      if (cells.length && cells.some((c) => c)) {
        const row = {};
        cells.forEach((c, i) => { row[headers[i] || `col_${i}`] = c; });
        result.push(row);
      }
    });
  });
  return result;
}

// ── Get company params from saved menu URL ────────────────────────────────────
function getMenuCompanyParams() {
  // Returns query string from the ReportMenu URL saved during login
  // Fallback to known defaults if not available
  return 'COCD=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&CoGroup=GRP01&Market=CAPS&Exchange=BSE&Broker=MB&FinStart=2024&FinEnd=2025&Branch=&Segment=TRADING';
}

// ── Fetch financial reports via direct HTTP ───────────────────────────────────
async function fetchLedger() {
  const params = getMenuCompanyParams();

  // Expense Summary — POST with company code to get brokerage/expense data
  try {
    console.log('[focaps] HTTP fetching Expense Summary...');
    const html = await httpPost(
      `${BASE_URL}/text_reports/ExpenseSummary.cfm?${params}`,
      `COMPANY_CODE=BSE_CASH&market1=CAPS&${params}`
    );
    if (html && html.includes('<table')) {
      const rows = parseHtmlTables(html);
      const dataRows = rows.filter((r) => Object.values(r).some((v) => v && v !== '\u00a0'));
      if (dataRows.length > 0) {
        console.log(`[focaps] ExpenseSummary: ${dataRows.length} rows`);
        return { source: `${BASE_URL}/text_reports/ExpenseSummary.cfm`, data: dataRows };
      }
    }
  } catch (e) {
    console.log('[focaps] ExpenseSummary error:', e.message);
  }
  return null;
}

async function fetchPortfolio() {
  // No direct portfolio/holdings URL found in the menu system
  // Return null — portfolio data not available via Focaps menu
  return null;
}

// ── Main: login + explore + fetch all available data ─────────────────────────
async function fetchAllFocapsData() {
  console.log('[focaps] Starting data fetch...');

  await login();
  const page = _page;

  // Explore the home page
  const homeUrl = page.url();

  // Wait for the ReportMenu frame to fully load with its links
  console.log('[focaps] Waiting for menu frames to load...');
  let menuFrame = null;
  for (let w = 0; w < 15; w++) {
    await page.waitForTimeout(1000);
    menuFrame = page.frames().find((f) => f.url().includes('ReportMenu.cfm'));
    if (menuFrame) {
      const links = await menuFrame.$$('a[href]').catch(() => []);
      if (links.length > 2) break; // ReportMenu has multiple links
    }
  }
  console.log('[focaps] ReportMenu frame:', menuFrame ? menuFrame.url().split('?')[0] : 'not found');

  const menus = await exploreMenus();
  console.log('[focaps] Home URL:', homeUrl);
  console.log('[focaps] Available links count:', menus.length);

  const result = {
    loginSuccess: true,
    homeUrl,
    menus,
    ledger: null,
    portfolio: null,
    rawSections: {},
  };

  // Try to fetch key data pages
  result.ledger    = await fetchLedger().catch((e) => ({ error: e.message }));
  result.portfolio = await fetchPortfolio().catch((e) => ({ error: e.message }));

  return result;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
    _page = null;
    _loggedIn = false;
  }
}

module.exports = { fetchAllFocapsData, login, exploreMenus, closeBrowser };
