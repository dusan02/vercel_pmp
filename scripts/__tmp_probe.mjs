import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
p.on('pageerror', e => console.log('PAGE-ERR:', String(e).slice(0, 300)));

// --- 1) Heatmap header search ---
await p.goto('https://premarketprice.com/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(7000);
const headerInput = p.locator('input[placeholder="Search stocks..."]');
console.log('header search inputs:', await headerInput.count());
await headerInput.first().fill('LRCX');
await p.waitForTimeout(800);
const dd = p.locator('div').filter({ hasText: 'LRCX' });
console.log('heatmap dd items w/ LRCX:', await p.locator('button:has-text("LRCX")').count());
await p.screenshot({ path: '/tmp/s1-heatmap-search.png' });

// --- 2) /analysis page search ---
await p.goto('https://premarketprice.com/analysis', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
const aInput = p.locator('input[placeholder*="ticker"]');
console.log('analysis inputs:', await aInput.count());
await aInput.first().fill('LRCX');
await p.waitForTimeout(1000);
const items = p.locator('button:has-text("LRCX")');
console.log('analysis dd items:', await items.count());
await p.screenshot({ path: '/tmp/s2-analysis-search.png' });
if (await items.count()) {
  await items.first().dispatchEvent('mousedown');
  await p.waitForTimeout(4000);
  console.log('after click URL:', p.url());
  await p.screenshot({ path: '/tmp/s3-after-click.png' });
}
await b.close();
