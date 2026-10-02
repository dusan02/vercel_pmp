import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('https://premarketprice.com/', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2000);
const accept = page.locator('button:has-text("Accept")').first();
if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {});
for (const tab of ['movers', 'earnings', 'screener', 'portfolio', 'favorites', 'analysis', 'blog']) {
  await page.evaluate((t) => window.dispatchEvent(new CustomEvent('mobile-nav-change', { detail: { tab: t } })), tab);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `/tmp/tab-${tab}.png` });
}
await browser.close();
console.log('done');
