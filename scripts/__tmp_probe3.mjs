import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGE-ERR:', String(e).slice(0, 300)));

// Mobile /analysis page
await p.goto('https://premarketprice.com/analysis', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
const inp = p.locator('input[placeholder*="ticker"], input[placeholder*="Analyze"]').first();
console.log('mobile inputs:', await p.locator('input').count());
await inp.tap();
await inp.pressSequentially('LRCX', { delay: 80 });
await p.waitForTimeout(900);
const item = p.locator('button:has-text("LRCX")').first();
console.log('items:', await item.count(), 'visible:', await item.isVisible().catch(() => false));
await p.screenshot({ path: '/tmp/m1-search.png' });
if (await item.count()) {
  await item.tap();
  await p.waitForTimeout(4000);
  console.log('URL after tap:', p.url());
}
await b.close();
