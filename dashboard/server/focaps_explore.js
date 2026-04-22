/**
 * Focaps explorer: login, save cookies, explore Manage_Favorite and Balance Sheet
 */
const { chromium } = require('playwright');
const { createWorker } = require('tesseract.js');
const Jimp = require('jimp').default || require('jimp');
const fs = require('fs');

const BASE = 'https://backoffice.univest.in:1443/Focaps';
const LOGIN_URL = BASE + '/Sessions/Login.cfm?StartNewSession=true';
const RPTS = BASE + '/FOCAPS_REPORTS/REPORTS_TEMPLATES';

async function solveCaptcha(page) {
  const el = await page.$('img[src*="graph.cfm"]');
  const raw = await el.screenshot();
  const img = await Jimp.read(raw);
  img.resize(img.getWidth()*4, img.getHeight()*4, Jimp.RESIZE_NEAREST_NEIGHBOR).greyscale().contrast(1).normalize().posterize(2);
  const buf = await img.getBufferAsync(Jimp.MIME_PNG);
  const worker = await createWorker('eng', 1, { logger: ()=>{}, errorHandler: ()=>{} });
  await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', tessedit_pageseg_mode: '7' });
  const { data: { text } } = await worker.recognize(buf);
  await worker.terminate();
  return text.replace(/\s+/g,'').replace(/[^A-Za-z0-9]/g,'').toLowerCase();
}

async function main() {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  console.log('Logging in...');
  let loggedIn = false;
  for (let attempt = 1; attempt <= 15; attempt++) {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.selectOption('select[name="txt_year1"]', { value: 'CAPSFO,2025' });
    await page.fill('input[name="txt_loginname"]', 'VINAY');
    await page.fill('input[name="txt_password"]', 'Growth@2027');
    const captcha = await solveCaptcha(page);
    console.log('Attempt ' + attempt + ' captcha:', captcha);
    await page.fill('input[name="txt_CaptaText1"]', captcha);
    const agreeBox = await page.$('input[name="agree"]');
    if (agreeBox && !(await agreeBox.isChecked())) await agreeBox.check();
    if (captcha.length < 2 || captcha.length > 8) continue;

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{}),
      page.evaluate((pwd) => {
        const key = CryptoJS.enc.Base64.parse('MTIzNDU2NzgxMjM0NTY3OA==');
        const iv = CryptoJS.enc.Base64.parse('EBESExQVFhcYGRobHB0eHw==');
        AddForm.txt_password.value = CryptoJS.AES.encrypt(pwd, key, { iv }).toString();
        AddForm.Action.value = 'Login';
        AddForm.submit();
      }, 'Growth@2027').catch(()=>{})
    ]);
    await page.waitForTimeout(2000);
    const url = page.url();
    if (!url.includes('Login.cfm')) {
      console.log('Logged in! URL:', url.substring(0, 80));
      loggedIn = true;
      break;
    }
  }

  if (!loggedIn) { console.log('Login failed'); await browser.close(); return; }

  // Save cookies
  const cookies = await ctx.cookies();
  fs.writeFileSync('/tmp/focaps_session_cookies.json', JSON.stringify(cookies));
  console.log('Cookies saved:', cookies.length);

  // Wait for frames to load
  await page.waitForTimeout(3000);

  // Log all frames
  const frames = page.frames();
  console.log('Frames loaded:', frames.length);
  frames.forEach(f => console.log('  Frame:', f.name(), '|', f.url().substring(0, 80)));

  // Use browser fetch (same session context) to access pages
  const testUrls = [
    // Manage Favorite with MyList=false to see all available reports
    BASE + '/FOCAPS_REPORTS/REPORTS_TEMPLATES/Manage_Favorite.cfm?Segment=TRADING&cocd=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&COGROUP=GRP01&FINSTART=2025&FIN_YEAR=2025&MARKET=CAPS&EXCHANGE=BSE&REPORT_ID=0&FinEnd=2026&MyList=false',
    // Balance sheet related - try common URLs
    BASE + '/Text_Reports/BalanceSheet.cfm?COCD=BSE_CASH&COGROUP=GRP01&FINSTART=2025&FIN_YEAR=2025&FinEnd=2026&MARKET=CAPS&EXCHANGE=BSE',
    BASE + '/FOCAPS_REPORTS/REPORTS_TEMPLATES/BalanceSheet.cfm?COCD=BSE_CASH&COGROUP=GRP01&FINSTART=2025&FIN_YEAR=2025&FinEnd=2026&MARKET=CAPS&EXCHANGE=BSE',
    // Try the REPORT_PARAMETERS page via browser fetch (not HTTP)
    BASE + '/FOCAPS_REPORTS/REPORTS_TEMPLATES/REPORT_PARAMETERS.cfm?Segment=TRADING&cocd=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&COGROUP=GRP01&FINSTART=2025&FIN_YEAR=2025&MARKET=CAPS&EXCHANGE=BSE&REPORT_ID=0&FinEnd=2026&MyList=false',
  ];

  for (const url of testUrls) {
    const name = url.split('/').pop().split('?')[0];
    const result = await page.evaluate(async (u) => {
      try {
        const res = await fetch(u, { credentials: 'include' });
        const text = await res.text();
        const hasTable = text.includes('<table') || text.includes('<TABLE');
        const noReport = text.includes('No report To View');
        const data1 = (text.match(/id="Data1"[^>]*>([\s\S]{0,300})/i) || [])[1] || '';
        return { status: res.status, size: text.length, hasTable, noReport, data1: data1.substring(0, 200) };
      } catch(e) { return { error: e.message }; }
    }, url);
    console.log(name + ':', JSON.stringify(result));
    if (result.size > 2000 && result.hasTable && !result.noReport) {
      const html = await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: 'include' });
        return res.text();
      }, url);
      fs.writeFileSync('/tmp/focaps_browser_' + name + '.html', html);
      console.log('  SAVED: /tmp/focaps_browser_' + name + '.html');
    }
  }

  // Try submitting REPORT_VIEWER.cfm from browser context for report IDs that generated files
  console.log('\n--- Testing REPORT_VIEWER from browser context ---');
  for (const reportId of [16, 18, 20, 26, 29]) {
    const mainInput = encodeURIComponent('Segment=TRADING&cocd=BSE_CASH&CoName=UNIVEST STOCK BROKING PVT LTD&COGROUP=GRP01&FINSTART=2025&FIN_YEAR=2025&MARKET=CAPS&EXCHANGE=BSE&REPORT_ID=' + reportId + '&FinEnd=2026&MyList=false');
    const body = 'COCD=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&COGROUP=GRP01&FINSTART=2025&FIN_YEAR=2025&FinEnd=2026&MARKET=CAPS&Segment=TRADING&EXCHANGE=BSE&FIRSTTIME=false&MyList=false&MainInput=' + mainInput + '&START_DATE=01%2F04%2F2025&END_DATE=23%2F03%2F2026&PORTNAME=prn&BackValue=';

    const rv = await page.evaluate(async (url, body) => {
      try {
        const res = await fetch(url, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        const text = await res.text();
        const alerts = (text.match(/alert\('([^']+)'\)/g)||[]).map(a => a.match(/alert\('([^']+)'\)/)[1].substring(0, 80));
        const noData = text.includes('No Data Found');
        const hasTable = text.includes('<table') || text.includes('<TABLE');
        return { status: res.status, size: text.length, alerts, noData, hasTable };
      } catch(e) { return { error: e.message }; }
    }, RPTS + '/REPORT_VIEWER.cfm?REPORT_ID=' + reportId, body);

    console.log('REPORT_ID=' + reportId + ':', JSON.stringify(rv));
  }

  await browser.close();
  console.log('Done.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
