/**
 * Submit REPORT_PARAMETER form FROM WITHIN the frameset via Playwright
 * This uses the actual Display frame targeting (target="Display")
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

async function waitForDisplay(page, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await page.waitForTimeout(1000);
    const displayFrame = page.frames().find(f => f.name() === 'Display');
    if (displayFrame) {
      const url = displayFrame.url();
      if (url.includes('REPORT_VIEWER.cfm') || url.includes('.cfm') && !url.includes('BlankPage')) {
        return displayFrame;
      }
    }
  }
  return null;
}

async function submitReportFromFrame(page, reportId, finStart, finEnd, startDate, endDate) {
  // Find the RPTMenu frame (REPORT_PARAMETERS.cfm)
  let rptFrame = page.frames().find(f => f.url().includes('REPORT_PARAMETERS.cfm'));

  if (!rptFrame) {
    // Navigate RPTMenu to REPORT_PARAMETERS.cfm
    const rptMenuFrame = page.frames().find(f => f.name() === 'RPTMenu');
    if (rptMenuFrame) {
      const params = `Segment=TRADING&cocd=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&COGROUP=GRP01&FINSTART=${finStart}&FIN_YEAR=${finStart}&MARKET=CAPS&EXCHANGE=BSE&REPORT_ID=${reportId}&FinEnd=${finEnd}&MyList=false`;
      await rptMenuFrame.goto(RPTS + '/REPORT_PARAMETERS.cfm?' + params, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log('goto err:', e.message.slice(0,50)));
      await page.waitForTimeout(2000);
      rptFrame = page.frames().find(f => f.url().includes('REPORT_PARAMETERS.cfm'));
    }
  }

  if (!rptFrame) {
    console.log('RPTMenu/REPORT_PARAMETERS frame not found');
    return null;
  }

  console.log('RPTMenu frame URL:', rptFrame.url().split('?')[0]);

  // Modify form fields and submit
  const formResult = await rptFrame.evaluate(({ reportId, finStart, finEnd, startDate, endDate }) => {
    const form = document.REPORT_PARAMETER;
    if (!form) return { error: 'No REPORT_PARAMETER form', forms: document.forms.length };

    // Update MainInput - decode and replace REPORT_ID
    try {
      let mi = decodeURIComponent(form.MainInput.value);
      mi = mi.replace(/REPORT_ID=\d+/, 'REPORT_ID=' + reportId);
      mi = mi.replace(/FINSTART=\d+/, 'FINSTART=' + finStart);
      mi = mi.replace(/FIN_YEAR=\d+/, 'FIN_YEAR=' + finStart);
      mi = mi.replace(/FinEnd=\d+/, 'FinEnd=' + finEnd);
      mi = mi.replace(/MyList=\w+/, 'MyList=false');
      form.MainInput.value = encodeURIComponent(mi);
    } catch(e) {}

    // Update direct form fields
    try { form.FINSTART.value = finStart; } catch(e) {}
    try { form.FIN_YEAR.value = finStart; } catch(e) {}
    try { form.FinEnd.value = finEnd; } catch(e) {}
    try { form.MyList.value = 'false'; } catch(e) {}
    try { form.FIRSTTIME.value = 'false'; } catch(e) {}
    try { form.START_DATE.value = startDate; } catch(e) {}
    try { form.END_DATE.value = endDate; } catch(e) {}

    // Submit the form (bypasses onsubmit validation)
    form.submit();
    return { ok: true, mainInput: form.MainInput.value.substring(0, 100) };
  }, { reportId, finStart, finEnd, startDate, endDate }).catch(e => ({ error: e.message }));

  console.log('Form submit result:', formResult);

  // Wait for Display frame to navigate
  await page.waitForTimeout(5000);

  const displayFrame = page.frames().find(f => f.name() === 'Display');
  if (!displayFrame) { console.log('Display frame not found'); return null; }

  const displayUrl = displayFrame.url();
  console.log('Display frame URL:', displayUrl.split('?')[0]);

  // Wait for content to fully load
  await page.waitForTimeout(3000);
  const content = await displayFrame.content().catch(() => '');

  const alerts = (content.match(/alert\('([^']+)'\)/g)||[]).map(a => a.match(/alert\('([^']+)'\)/)[1].substring(0,80));
  const noData = content.includes('No Data Found');
  const hasTable = content.includes('<table') || content.includes('<TABLE');
  const generating = content.includes('Wait Report Is Generating');
  const filePath = alerts.find(a => a.includes('\\\\') || a.includes('.XLS') || a.includes('.CSV'));

  console.log('Display content: noData=' + noData + ' hasTable=' + hasTable + ' generating=' + generating + ' size=' + content.length);
  if (alerts.length) console.log('Alerts:', alerts.slice(0,3).join(' | '));
  if (filePath) console.log('FILE:', filePath);

  if (hasTable && !alerts.some(a => a.includes('permission'))) {
    fs.writeFileSync('/tmp/display_data_' + reportId + '.html', content);
    console.log('*** SAVED TABLE DATA ***');

    // Extract data via evaluate
    const rows = await displayFrame.evaluate(() => {
      const result = [];
      document.querySelectorAll('table').forEach(tbl => {
        const headers = [...tbl.querySelectorAll('tr:first-child th, tr:first-child td')].map(h => h.innerText.trim());
        tbl.querySelectorAll('tr').slice(1, 5).forEach(tr => {
          const cells = [...tr.querySelectorAll('td')].map(td => td.innerText.trim().substring(0, 30));
          if (cells.some(c => c)) result.push({ ...Object.fromEntries(cells.map((c, i) => [headers[i] || 'col_' + i, c])) });
        });
      });
      return result;
    }).catch(() => []);
    console.log('Sample rows:', JSON.stringify(rows.slice(0, 3), null, 2));
  }

  return { displayUrl, noData, hasTable, generating, alerts };
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
    console.log('Attempt ' + attempt + ':', captcha);
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
    if (!page.url().includes('Login.cfm')) { loggedIn = true; console.log('Logged in!'); break; }
  }

  if (!loggedIn) { console.log('Login failed'); await browser.close(); return; }
  await page.waitForTimeout(4000);

  // Test key financial report IDs using proper frameset submission
  const reports = [
    { id: 892, name: 'Annual P&L' },
    { id: 853, name: 'Branch Wise Incm/Exp' },
    { id: 978, name: 'Settlement PayIn/Payout' },
    { id: 84,  name: 'Annual P&L Summary' },
    { id: 699, name: 'Annual P&L(IncomeTax)' },
  ];

  for (const rep of reports) {
    console.log('\n=== Testing ID=' + rep.id + ' [' + rep.name + '] ===');
    await submitReportFromFrame(page, rep.id, 2025, 2026, '01/04/2025', '23/03/2026');
    await page.waitForTimeout(2000);
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
