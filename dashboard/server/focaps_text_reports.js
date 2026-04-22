/**
 * Test Text_Reports URLs directly via authenticated browser fetch
 * Also tries iframe src manipulation to load REPORT_PARAMETERS
 */
const { chromium } = require('playwright');
const { createWorker } = require('tesseract.js');
const Jimp = require('jimp').default || require('jimp');
const fs = require('fs');

const BASE = 'https://backoffice.univest.in:1443/Focaps';
const LOGIN_URL = BASE + '/Sessions/Login.cfm?StartNewSession=true';
const TEXT = BASE + '/Text_Reports';
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

  // Log all frames
  const frames = page.frames();
  console.log('\nFrames after login:', frames.length);
  frames.forEach(f => console.log('  [' + f.name() + '] ' + f.url().split('?')[0]));

  // Test Text_Reports URLs via browser fetch (same session)
  const textUrls = [
    'BalanceSheet.cfm',
    'ProfitLoss.cfm',
    'TradingSummary.cfm',
    'BrokerageSummary.cfm',
    'TurnoverSummary.cfm',
    'LedgerSummary.cfm',
    'TrialBalance.cfm',
    'ClientLedger.cfm',
    'CashFlowStatement.cfm',
    'IncomeStatement.cfm',
    'ExpenseSummary.cfm',
    'SettlementSummary.cfm',
    'MTMSummary.cfm',
    'TradeReport.cfm',
    'FinancialSummary.cfm',
  ];

  const params = 'COCD=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&COGROUP=GRP01&FINSTART=2025&FIN_YEAR=2025&FinEnd=2026&MARKET=CAPS&EXCHANGE=BSE&Segment=TRADING';

  console.log('\n--- Testing Text_Reports ---');
  for (const cfm of textUrls) {
    const url = TEXT + '/' + cfm + '?' + params;
    const result = await page.evaluate(async (u) => {
      try {
        const res = await fetch(u, { credentials: 'include' });
        const text = await res.text();
        const hasTable = text.includes('<table') || text.includes('<TABLE');
        const noData = text.includes('No Data') || text.includes('No Record');
        const error500 = res.status >= 500;
        const isLogin = text.includes('txt_loginname') || text.includes('Login.cfm');
        // Extract any meaningful content
        const preview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
        return { status: res.status, size: text.length, hasTable, noData, error500, isLogin, preview };
      } catch(e) { return { error: e.message }; }
    }, url);
    const flag = result.hasTable && !result.isLogin ? '*** TABLE ***' : result.error500 ? '500' : result.isLogin ? 'REDIRECT' : 'empty';
    console.log(cfm + ': ' + flag + ' size=' + result.size + (result.preview && result.hasTable ? '\n  ' + result.preview.substring(0, 150) : ''));
  }

  // Also try POST with date range for ExpenseSummary to see actual columns
  console.log('\n--- ExpenseSummary POST (full response) ---');
  const expHtml = await page.evaluate(async ({ base, params }) => {
    const url = base + '/Text_Reports/ExpenseSummary.cfm?' + params;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'COMPANY_CODE=BSE_CASH&market1=CAPS&' + params
    });
    return res.text();
  }, { base: BASE, params });

  if (expHtml.includes('<table')) {
    fs.writeFileSync('/tmp/focaps_expense_summary.html', expHtml);
    console.log('ExpenseSummary saved to /tmp/focaps_expense_summary.html');
    // Show column names
    const cols = expHtml.match(/<th[^>]*>([^<]+)<\/th>/gi) || [];
    console.log('Columns:', cols.map(c => c.replace(/<[^>]+>/g, '').trim()).join(' | '));
  }

  // Try iframe src approach to load REPORT_PARAMETERS.cfm
  console.log('\n--- Iframe src approach for REPORT_PARAMETERS.cfm ---');
  const rptParamsUrl = RPTS + '/REPORT_PARAMETERS.cfm?Segment=TRADING&cocd=BSE_CASH&CoName=UNIVEST+STOCK+BROKING+PVT+LTD&COGROUP=GRP01&FINSTART=2025&FIN_YEAR=2025&MARKET=CAPS&EXCHANGE=BSE&REPORT_ID=892&FinEnd=2026&MyList=false';

  // Set the RPTMenu frame src from page context
  await page.evaluate((url) => {
    // Try to find the RPTMenu frame element
    const frameEl = document.querySelector('frame[name="RPTMenu"], iframe[name="RPTMenu"]');
    if (frameEl) {
      frameEl.src = url;
      console.log('Set RPTMenu src to:', url.substring(0, 80));
    } else {
      console.log('RPTMenu frame element not found in main document');
    }
  }, rptParamsUrl);

  await page.waitForTimeout(4000);

  // Check frames again
  const frames2 = page.frames();
  console.log('Frames after src change:', frames2.length);
  frames2.forEach(f => console.log('  [' + f.name() + '] ' + f.url().split('?')[0]));

  // Check if REPORT_PARAMETERS loaded
  const rptFrame = frames2.find(f => f.url().includes('REPORT_PARAMETERS.cfm'));
  if (rptFrame) {
    console.log('REPORT_PARAMETERS.cfm loaded!');
    const formInfo = await rptFrame.evaluate(() => {
      const form = document.REPORT_PARAMETER;
      if (!form) return { forms: document.forms.length, formNames: [...document.forms].map(f => f.name) };
      return {
        hasForm: true,
        action: form.action,
        target: form.target,
        fields: [...form.elements].map(e => ({ name: e.name, value: (e.value||'').substring(0,50) })).filter(e => e.name)
      };
    });
    console.log('Form info:', JSON.stringify(formInfo, null, 2));

    if (formInfo.hasForm) {
      // Submit the form
      const submitResult = await rptFrame.evaluate(({ reportId, finStart, finEnd }) => {
        const form = document.REPORT_PARAMETER;
        try {
          let mi = decodeURIComponent(form.MainInput.value);
          mi = mi.replace(/REPORT_ID=\d+/, 'REPORT_ID=' + reportId);
          mi = mi.replace(/FINSTART=\d+/, 'FINSTART=' + finStart);
          mi = mi.replace(/FIN_YEAR=\d+/, 'FIN_YEAR=' + finStart);
          mi = mi.replace(/FinEnd=\d+/, 'FinEnd=' + finEnd);
          form.MainInput.value = encodeURIComponent(mi);
        } catch(e) {}
        try { form.FINSTART.value = finStart; } catch(e) {}
        try { form.FIN_YEAR.value = finStart; } catch(e) {}
        try { form.FinEnd.value = finEnd; } catch(e) {}
        try { form.START_DATE.value = '01/04/2025'; } catch(e) {}
        try { form.END_DATE.value = '31/03/2026'; } catch(e) {}
        try { form.FIRSTTIME.value = 'false'; } catch(e) {}
        form.submit();
        return { ok: true };
      }, { reportId: 892, finStart: 2025, finEnd: 2026 });

      console.log('Submit result:', submitResult);
      await page.waitForTimeout(6000);

      const dispFrame = page.frames().find(f => f.name() === 'Display');
      if (dispFrame) {
        const dispUrl = dispFrame.url();
        console.log('Display frame URL after submit:', dispUrl.split('?')[0]);
        const content = await dispFrame.content().catch(() => '');
        const hasTable = content.includes('<table') || content.includes('<TABLE');
        const noData = content.includes('No Data Found');
        const alerts = (content.match(/alert\('([^']+)'\)/g)||[]).map(a => a.match(/alert\('([^']+)'\)/)[1].substring(0,80));
        console.log('Display: hasTable=' + hasTable + ' noData=' + noData + ' alerts=' + JSON.stringify(alerts.slice(0,3)));
        if (hasTable) {
          fs.writeFileSync('/tmp/focaps_display_892.html', content);
          console.log('*** SAVED Display content to /tmp/focaps_display_892.html ***');
        }
      }
    }
  } else {
    console.log('REPORT_PARAMETERS.cfm did not load - RPTMenu frame may be in a sub-frameset');
    // Try to find it in nested frames
    for (const f of frames2) {
      const subFrames = f.childFrames ? f.childFrames() : [];
      for (const sf of subFrames) {
        console.log('  Sub-frame:', sf.name(), sf.url().split('?')[0]);
      }
    }
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
