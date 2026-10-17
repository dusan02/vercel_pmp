import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', e => console.log('PAGE-ERR:', String(e).slice(0, 300)));

for (const url of ['https://premarketprice.com/analysis', 'https://premarketprice.com/analysis/NVDA']) {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  const inp = p.locator('input[placeholder*="ticker"], input[placeholder*="Analyze"]').first();
  await inp.click();
  await inp.pressSequentially('LRCX', { delay: 60 });
  await p.waitForTimeout(900);
  const item = p.locator('button:has-text("LRCX")').first();
  const n = await item.count();
  console.log(url, '-> items:', n);
  if (n) {
    try {
      await item.click({ timeout: 3000 });
    } catch (e) { console.log('  click FAILED:', String(e).slice(0, 200)); }
    await p.waitForTimeout(4000);
    console.log('  URL after real click:', p.url());
  }
}
await b.close();
