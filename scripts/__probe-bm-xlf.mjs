import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('https://premarketprice.com/analysis/JPM', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByRole('button', { name: 'SPY', exact: true }).waitFor({ timeout: 30000 });
// rapid switch SPY→XLF — stale SPY must never render under XLF label
await page.getByRole('button', { name: 'SPY', exact: true }).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: 'XLF', exact: true }).click();
await page.waitForTimeout(1600);
console.log('legend:', await page.evaluate(() => (document.body.textContent.match(/JPM [+-]?[\d.]+% vs XLF [+-]?[\d.]+%[^H]*/) || ['NO LEGEND — wrong label or stale?'])[0].slice(0, 70)));
// hover mid-chart → compare tooltip rows
const chart = page.locator('.recharts-wrapper').last();
const bb = await chart.boundingBox();
await page.mouse.move(bb.x + bb.width * 0.55, bb.y + bb.height * 0.4);
await page.waitForTimeout(400);
console.log('tooltip:', await page.evaluate(() => {
  const t = document.querySelector('.recharts-tooltip-wrapper');
  return t && t.offsetParent !== null ? t.textContent.replace(/\s+/g, ' ').slice(0, 160) : 'NO TOOLTIP';
}));
await page.screenshot({ path: '/tmp/bm-prod-xlf.png', clip: { x: 20, y: 380, width: 1360, height: 560 } });
await browser.close();
