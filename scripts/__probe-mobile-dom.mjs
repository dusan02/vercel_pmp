import { chromium, devices } from '@playwright/test';
const browser = await browser_launch();
async function browser_launch(){ return chromium.launch(); }
const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
await page.goto('https://premarketprice.com/', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2500);
const res = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('[data-heatmap-tile="1"]')];
  const ge = tiles.find(t => t.textContent?.includes('GE'));
  if (!ge) return { err: 'no GE' };
  const r = ge.getBoundingClientRect();
  const cs = getComputedStyle(ge);
  return {
    declaredStyle: ge.getAttribute('style'),
    rect: { x: r.x|0, y: r.y|0, w: r.width|0, h: r.height|0 },
    computed: {
      height: cs.height, minHeight: cs.minHeight, boxSizing: cs.boxSizing,
      padding: cs.padding, border: cs.borderWidth, transform: cs.transform,
      display: cs.display, zoom: cs.zoom, fontSize: cs.fontSize,
      webkitTextSizeAdjust: cs.webkitTextSizeAdjust,
    },
  };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
