require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { chromium } = require('playwright');
const CryptoJS = require('crypto-js');
const fs = require('fs');

const BASE_URL = 'https://backoffice.univest.in:1443/Focaps';

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  console.log('1. Loading login page...');
  await page.goto(`${BASE_URL}/Sessions/Login.cfm?StartNewSession=true`, {
    waitUntil: 'domcontentloaded', timeout: 30000
  });

  // Save captcha
  const captchaEl = await page.$('img[src*="graph.cfm"]');
  fs.writeFileSync('/tmp/captcha_live.png', await captchaEl.screenshot());

  const captchaText = process.argv[2];
  if (!captchaText) {
    console.log('Captcha saved to /tmp/captcha_live.png — re-run with captcha text as argument');
    await browser.close(); return;
  }

  // AES encrypt password in Node (same as the browser JS does)
  const key = CryptoJS.enc.Base64.parse('MTIzNDU2NzgxMjM0NTY3OA==');
  const iv  = CryptoJS.enc.Base64.parse('EBESExQVFhcYGRobHB0eHw==');
  const encryptedPwd = CryptoJS.AES.encrypt('Growth@2027', key, { iv }).toString();
  console.log(`2. Encrypted password: ${encryptedPwd}`);

  // Fill form fields via Playwright
  await page.selectOption('select[name="txt_year1"]', { value: 'CAPSFO,2025' });
  await page.fill('input[name="txt_loginname"]', 'VINAY');
  await page.fill('input[name="txt_CaptaText1"]', captchaText);

  // Set password & action directly in DOM (bypasses jQuery validation)
  await page.evaluate((pwd) => {
    document.querySelector('input[name="txt_password"]').value = pwd;
    document.querySelector('input[name="Action"]').value = 'Login';
    document.querySelector('input[name="agree"]').checked = true;
  }, encryptedPwd);

  console.log('3. Submitting form...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
    page.evaluate(() => document.getElementById('AddForm').submit()),
  ]);

  const url = page.url();
  const content = await page.content();
  console.log('4. Post-login URL:', url);

  const failed = content.includes('invalid captcha') || content.includes('Page Not IN') || url.includes('Login.cfm');
  if (failed) {
    console.log('❌ Login failed. Content clues:');
    const lines = content.split('\n').filter(l => /error|invalid|captcha|sequen/i.test(l));
    lines.forEach(l => console.log('  ', l.trim()));
    await browser.close(); return;
  }

  console.log('\n✅ LOGGED IN!\n');
  await page.screenshot({ path: '/tmp/focaps_home.png' });

  // Extract all links / menu items
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map(a => ({ text: a.innerText.trim().replace(/\s+/g,' '), href: a.href }))
      .filter(l => l.text && l.href && !l.href.includes('javascript:') && !l.href.endsWith('#'))
  );
  console.log('Navigation links found:', links.length);
  links.forEach(l => console.log(`  [${l.text}] ${l.href}`));

  // Check for iframes — Focaps often uses a frameset
  const frames = page.frames();
  console.log('\nFrames:', frames.length);
  for (const f of frames) {
    const fu = f.url();
    if (fu && fu !== 'about:blank' && !fu.includes('Login')) {
      console.log('  Frame URL:', fu);
      const fLinks = await f.evaluate(() =>
        [...document.querySelectorAll('a[href]')]
          .map(a => ({ text: a.innerText.trim(), href: a.href }))
          .filter(l => l.text && l.href)
      ).catch(() => []);
      fLinks.forEach(l => console.log(`    [${l.text}] ${l.href}`));
    }
  }

  // Probe data endpoints
  const probes = [
    'Reports/Ledger.cfm', 'Reports/BankBook.cfm', 'Reports/FundSummary.cfm',
    'Reports/Portfolio.cfm', 'Reports/Holdings.cfm', 'Reports/PnL.cfm',
    'Client/Ledger.cfm', 'Accounts/Ledger.cfm', 'Accounts/BankBook.cfm',
    'Reports/NetPosition.cfm', 'Reports/TradeBook.cfm', 'Reports/MTM.cfm',
    'Reports/ClientLedger.cfm', 'Client/Portfolio.cfm', 'MIS/Summary.cfm',
  ];

  console.log('\nProbing data endpoints...');
  const found = [];
  for (const p of probes) {
    try {
      await page.goto(`${BASE_URL}/${p}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const c = await page.content();
      const loggedIn = !c.includes('Login.cfm') && !c.toLowerCase().includes('startNewsession');
      const hasContent = c.includes('<table') || c.includes('grid') || c.includes('No Record');
      const status = loggedIn ? (hasContent ? '✅ DATA' : '⚠ empty') : '❌ needs login';
      console.log(`  ${p}: ${status}`);
      if (loggedIn) found.push({ path: p, hasContent });
    } catch (e) {
      console.log(`  ${p}: ❌ ${e.message.slice(0, 60)}`);
    }
  }

  fs.writeFileSync('/tmp/focaps_found.json', JSON.stringify(found, null, 2));
  console.log('\nAccessible pages:', found.map(f => f.path));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
