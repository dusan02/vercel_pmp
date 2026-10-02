import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
await page.goto('https://premarketprice.com/', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2500);
// scroll the heatmap a bit so dense sectors are rendered
const res = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('[data-heatmap-tile="1"]')];
  const rects = tiles.map(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, el };
  });
  let overlaps = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const A = rects[i], B = rects[j];
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ox > 0.5 && oy > 0.5) {
        overlaps.push({ i, j, ox: +ox.toFixed(1), oy: +oy.toFixed(1),
          a: A.el.textContent?.trim().slice(0,12), b: B.el.textContent?.trim().slice(0,12),
          ar: `${A.x|0},${A.y|0},${A.w|0}x${A.h|0}`, br: `${B.x|0},${B.y|0},${B.w|0}x${B.h|0}` });
      }
    }
  }
  return { tiles: tiles.length, overlaps: overlaps.length, sample: overlaps.slice(0, 15) };
});
console.log(JSON.stringify(res, null, 1));
await page.screenshot({ path: '/tmp/mobile-heatmap.png' });
await browser.close();
