const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await page.goto('https://backoffice.univest.in:1443/Focaps/Sessions/Login.cfm?StartNewSession=true', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const el = await page.$('img[src*="graph.cfm"]');
  fs.writeFileSync('/tmp/captcha_live.png', await el.screenshot());
  console.log('Saved to /tmp/captcha_live.png');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
