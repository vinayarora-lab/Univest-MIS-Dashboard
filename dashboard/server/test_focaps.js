require('dotenv').config({ path: '/Users/vinay/Documents/zoho-cashflow/.env' });
const { chromium } = require('playwright');
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

  // Screenshot the captcha
  const captchaEl = await page.$('img[src*="graph.cfm"]');
  const captchaShot = await captchaEl.screenshot();
  fs.writeFileSync('/tmp/captcha_live.png', captchaShot);
  console.log('2. CAPTCHA saved to /tmp/captcha_live.png');

  // Also get full page screenshot for debugging
  await page.screenshot({ path: '/tmp/login_page.png', fullPage: true });
  console.log('3. Full login page saved to /tmp/login_page.png');

  // Print available form fields
  const fields = await page.evaluate(() => {
    return [...document.querySelectorAll('input, select')].map(el => ({
      name: el.name, type: el.type, value: el.value
    }));
  });
  console.log('4. Form fields:', JSON.stringify(fields, null, 2));

  await browser.close();
  console.log('Done. Check /tmp/captcha_live.png');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
