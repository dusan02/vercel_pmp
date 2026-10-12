import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('https://premarketprice.com/analysis/META', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByRole('button', { name: 'SPY', exact: true }).click();
await page.waitForTimeout(1800);
console.log('legend:', await page.evaluate(() => (document.body.textContent.match(/META [+-]?[\d.]+% vs SPY [+-]?[\d.]+%[^H]*/) || ['NO'])[0].slice(0, 70)));
await page.screenshot({ path: '/tmp/meta-prod.png', clip: { x: 30, y: 420, width: 1340, height: 520 } });
await browser.close();
