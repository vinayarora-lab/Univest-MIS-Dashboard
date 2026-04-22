/**
 * Explore ReportMenu and Admin_Frame structure, and try clicking report links
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
  await page.waitForTimeout(3000);

  // 1. Show Admin_Frame.cfm HTML structure (to understand frameset)
  const adminFrameHtml = await page.content();
  fs.writeFileSync('/tmp/focaps_admin_frame.html', adminFrameHtml);
  console.log('\nAdmin_Frame.cfm saved (', adminFrameHtml.length, 'bytes)');
  // Show frame/frameset tags
  const frameTags = adminFrameHtml.match(/<frame[^>]+>/gi) || [];
  console.log('Frame tags found:', frameTags.length);
  frameTags.forEach(t => console.log(' ', t.substring(0, 200)));

  // 2. Show ReportMenu.cfm content
  const rptMenuFrame = page.frames().find(f => f.name() === 'RPTMenu');
  if (rptMenuFrame) {
    const menuHtml = await rptMenuFrame.content();
    fs.writeFileSync('/tmp/focaps_report_menu.html', menuHtml);
    console.log('\nReportMenu.cfm saved (', menuHtml.length, 'bytes)');

    // Show all links in the menu
    const links = await rptMenuFrame.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map(a => ({ text: a.innerText.trim(), href: a.href, target: a.target }))
        .filter(l => l.text)
    );
    console.log('Report menu links (' + links.length + '):');
    links.forEach(l => console.log('  [target=' + l.target + '] ' + l.text.substring(0,50) + ' => ' + l.href.split('?')[0]));

    // Also check if there's a select/dropdown for reports
    const selects = await rptMenuFrame.evaluate(() =>
      [...document.querySelectorAll('select')].map(s => ({
        name: s.name,
        options: [...s.options].map(o => ({ value: o.value, text: o.text.trim() })).slice(0, 20)
      }))
    );
    if (selects.length) {
      console.log('\nDropdowns in ReportMenu:');
      selects.forEach(s => {
        console.log('  select[' + s.name + ']: ' + s.options.length + ' options');
        s.options.slice(0,10).forEach(o => console.log('    ' + o.value + ' => ' + o.text));
      });
    }
  }

  // 3. Try clicking first few report links to see if REPORT_PARAMETERS loads
  if (rptMenuFrame) {
    const links = await rptMenuFrame.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .filter(a => a.href.includes('REPORT') || a.href.includes('Report'))
        .map(a => ({ text: a.innerText.trim(), href: a.href }))
        .slice(0, 3)
    );

    for (const link of links) {
      console.log('\nClicking link:', link.text, '=>', link.href.split('?')[0]);
      // Navigate RPTMenu frame to that URL
      try {
        await rptMenuFrame.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        const newUrl = rptMenuFrame.url();
        console.log('RPTMenu now:', newUrl.split('?')[0]);
        if (newUrl.includes('REPORT_PARAMETERS')) {
          const formInfo = await rptMenuFrame.evaluate(() => {
            const form = document.REPORT_PARAMETER;
            if (!form) return { forms: document.forms.length };
            return { hasForm: true, action: form.action, target: form.target };
          });
          console.log('Form info:', JSON.stringify(formInfo));
        }
      } catch(e) {
        console.log('Error:', e.message.slice(0,80));
      }
    }
  }

  // 4. Try directly fetching Annual P&L (report 892) from within browser context
  // using the page.evaluate XHR approach that worked for report 20
  console.log('\n--- Testing Annual P&L (892) via XHR in browser context ---');
  const result892 = await page.evaluate(async ({ rpts, reportId }) => {
    const mainInput = encodeURIComponent(
      'Segment=TRADING&cocd=BSE_CASH&CoName=UNIVEST STOCK BROKING PVT LTD&COGROUP=GRP01' +
      '&FINSTART=2025&FIN_YEAR=2025&MARKET=CAPS&EXCHANGE=BSE' +
      '&REPORT_ID=' + reportId + '&FinEnd=2026&MyList=false'
    );
    const body = 'COCD=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&COGROUP=GRP01' +
      '&FINSTART=2025&FIN_YEAR=2025&FinEnd=2026' +
      '&MARKET=CAPS&Segment=TRADING&EXCHANGE=BSE&FIRSTTIME=false&MyList=false' +
      '&MainInput=' + mainInput +
      '&START_DATE=01%2F04%2F2025&END_DATE=31%2F03%2F2026&PORTNAME=prn&BackValue=';

    const res = await fetch(rpts + '/REPORT_VIEWER.cfm?REPORT_ID=' + reportId, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const text = await res.text();
    const alerts = (text.match(/alert\('([^']+)'\)/g)||[]).map(a => a.match(/alert\('([^']+)'\)/)[1].substring(0,100));
    const noData = text.includes('No Data Found');
    const hasTable = text.includes('<table') || text.includes('<TABLE');
    const generating = text.includes('Wait Report Is Generating');
    const preview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300);
    return { status: res.status, size: text.length, alerts, noData, hasTable, generating, preview };
  }, { rpts: RPTS, reportId: 892 }).catch(e => ({ error: e.message }));

  console.log('Report 892 result:', JSON.stringify(result892, null, 2));

  // 5. Try fetching Annual P&L but from RPTMenu frame context (same-origin)
  if (rptMenuFrame) {
    console.log('\n--- Testing report 892 from RPTMenu frame context ---');
    const rptResult = await rptMenuFrame.evaluate(async ({ rpts, reportId }) => {
      const mainInput = encodeURIComponent(
        'Segment=TRADING&cocd=BSE_CASH&CoName=UNIVEST STOCK BROKING PVT LTD&COGROUP=GRP01' +
        '&FINSTART=2025&FIN_YEAR=2025&MARKET=CAPS&EXCHANGE=BSE' +
        '&REPORT_ID=' + reportId + '&FinEnd=2026&MyList=false'
      );
      const body = 'COCD=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&COGROUP=GRP01' +
        '&FINSTART=2025&FIN_YEAR=2025&FinEnd=2026' +
        '&MARKET=CAPS&Segment=TRADING&EXCHANGE=BSE&FIRSTTIME=false&MyList=false' +
        '&MainInput=' + mainInput +
        '&START_DATE=01%2F04%2F2025&END_DATE=31%2F03%2F2026&PORTNAME=prn&BackValue=';

      try {
        const res = await fetch(rpts + '/REPORT_VIEWER.cfm?REPORT_ID=' + reportId, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        const text = await res.text();
        const alerts = (text.match(/alert\('([^']+)'\)/g)||[]).map(a => a.match(/alert\('([^']+)'\)/)[1].substring(0,100));
        const noData = text.includes('No Data Found');
        const hasTable = text.includes('<table') || text.includes('<TABLE');
        const generating = text.includes('Wait Report Is Generating');
        const preview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300);
        return { status: res.status, size: text.length, alerts, noData, hasTable, generating, preview };
      } catch(e) { return { error: e.message }; }
    }, { rpts: RPTS, reportId: 892 }).catch(e => ({ error: e.message }));
    console.log('Report 892 from RPTMenu context:', JSON.stringify(rptResult, null, 2));
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
