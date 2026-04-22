/**
 * Test financial reports via Playwright browser context (authenticated session)
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
    if (!page.url().includes('Login.cfm')) {
      console.log('Logged in!');
      loggedIn = true;
      break;
    }
  }

  if (!loggedIn) { console.log('Login failed'); await browser.close(); return; }
  await page.waitForTimeout(3000); // Let frames settle

  // Key financial report IDs from the Manage_Favorite list
  const testReports = [
    { id: 978,  name: 'Settlement PayIn/Payout' },
    { id: 892,  name: 'Annual P&L' },
    { id: 853,  name: 'Branch Wise Incm/Exp' },
    { id: 699,  name: 'Annual P&L(IncomeTax)' },
    { id: 1006, name: 'Bill JV Data' },
    { id: 145,  name: 'Client Wise P&L' },
    { id: 20,   name: 'Stock Confirmation (known)' },
    { id: 16,   name: 'Report 16 (prev generated)' },
    { id: 519,  name: 'Annual P&L II' },
    { id: 890,  name: 'G.Date Wise Summary' },
    { id: 954,  name: 'Global Turn Over Datewise' },
    { id: 90,   name: 'Global Turn Summary' },
  ];

  console.log('\n--- Testing reports via browser context ---');
  for (const rep of testReports) {
    const result = await page.evaluate(({ rpts, reportId, finStart, finEnd }) => {
      const mainInput = encodeURIComponent(
        'Segment=TRADING&cocd=BSE_CASH&CoName=UNIVEST STOCK BROKING PVT LTD&COGROUP=GRP01' +
        '&FINSTART=' + finStart + '&FIN_YEAR=' + finStart + '&MARKET=CAPS&EXCHANGE=BSE' +
        '&REPORT_ID=' + reportId + '&FinEnd=' + finEnd + '&MyList=false'
      );
      const body = 'COCD=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&COGROUP=GRP01' +
        '&FINSTART=' + finStart + '&FIN_YEAR=' + finStart + '&FinEnd=' + finEnd +
        '&MARKET=CAPS&Segment=TRADING&EXCHANGE=BSE&FIRSTTIME=false&MyList=false' +
        '&MainInput=' + mainInput +
        '&START_DATE=01%2F04%2F2025&END_DATE=23%2F03%2F2026&PORTNAME=prn&BackValue=';
      return fetch(rpts + '/REPORT_VIEWER.cfm?REPORT_ID=' + reportId, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      }).then(r => r.text()).then(text => {
        const alerts = (text.match(/alert\('([^']+)'\)/g)||[]).map(a => a.match(/alert\('([^']+)'\)/)[1].substring(0,80));
        const noData = text.includes('No Data Found');
        const hasTable = text.includes('<table') || text.includes('<TABLE');
        const generating = text.includes('Wait Report Is Generating');
        // Extract file path from alerts
        const filePath = alerts.find(a => a.includes('\\\\') || a.includes('Generated At') || a.includes('.XLS') || a.includes('.CSV'));
        return { size: text.length, alerts, noData, hasTable, generating, filePath };
      });
    }, { rpts: RPTS, reportId: rep.id, finStart: 2025, finEnd: 2026 }).catch(e => ({ error: e.message }));

    const status = result.noData ? 'NO_DATA' : result.hasTable && !result.alerts.some(a => a.includes('permission')) ? 'HAS_DATA' : result.generating ? 'GENERATING' : 'OTHER';
    console.log('ID=' + rep.id + ' [' + rep.name + '] => ' + status + ' size=' + result.size);
    if (result.alerts && result.alerts.length) console.log('  Alerts:', result.alerts.slice(0,2).join(' | '));

    if (result.filePath) {
      console.log('  ** FILE GENERATED:', result.filePath);
    }
    if (status === 'HAS_DATA') {
      console.log('  ** HAS TABLE DATA **');
    }
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
