import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('https://premarketprice.com/analysis/JPM', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByRole('button', { name: 'SPY', exact: true }).click();
await page.waitForTimeout(1600);
const box = await page.evaluate(() => {
  const t = [...document.querySelectorAll('tspan')].find(e => /%$/.test(e.textContent));
  const svg = t?.closest('svg');
  const r = svg?.getBoundingClientRect();
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
});
// sweep across the chart to trigger tooltip
for (let i = 0; i <= 10; i++) {
  await page.mouse.move(box.x + box.w * (0.3 + i * 0.05), box.y + box.h * 0.4);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/bm-prod-tip.png', clip: { x: box.x - 20, y: box.y - 20, width: box.w + 40, height: box.h + 40 } });
console.log('tip html:', await page.evaluate(() => {
  const w = [...document.querySelectorAll('div')].filter(d => d.className.includes('recharts-tooltip-wrapper'));
  return w.map(e => `${e.offsetHeight}px:${e.textContent.replace(/\s+/g,' ').slice(0,120)}`).join(' | ') || 'none visible';
}));
await browser.close();
