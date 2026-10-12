// UX-pass probe: headline-vs-median, dynamic subtitle, compare tooltip,
// toggle-off, end labels, toolbar. Fixture: JPM-ish candles + SPY benchmark.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 3111;

function candles() {
  const out = [];
  const t0 = Date.UTC(2021, 0, 4);
  let price = 140;
  for (let i = 0; i < 290; i++) {
    const t = t0 + i * 7 * 86400000;
    price = price * (1 + 0.006 + Math.sin(i / 13) * 0.02) + Math.sin(i / 5) * 3;
    const c = Math.max(50, price);
    out.push({
      t, o: c * 0.99, h: c * 1.03, l: c * 0.97, c,
      v: 4e6 + (i % 9) * 8e5,
      pe: 11 + Math.sin(i / 8) * 3, ps: 3.2, pb: 1.6, evEbit: 12, fcfYield: 0.05, mcap: c * 3e9,
    });
  }
  return out;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
await page.route('**/api/analysis/**/candles', r => r.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({
    candles: candles(),
    valuationStats: {
      pe: { median: 11.5, p25: 9.8, p75: 13.9, n: 1400 },
      ps: { median: 3.1, p25: 2.7, p75: 3.6, n: 1400 },
    },
    evNetDebt: null,
    sector: 'Financial Services', sectorEtf: 'XLF',
  }),
}));
await page.route('**/api/indices/weekly**', r => {
  const sym = new URL(r.request().url()).searchParams.get('symbol');
  const points = candles().map((c, i) => ({ t: c.t, c: 400 * (1 + i * 0.004) }));
  return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ symbol: sym, points }) });
});

await page.goto(`http://localhost:${PORT}/val-test-tmp`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1600);

const subtitle = () => page.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find(x => x.textContent.includes('Price History'));
  return h?.parentElement?.querySelector('p')?.textContent?.trim() ?? 'NO SUBTITLE';
});
console.log('subtitle (price):', await subtitle());

// ── Valuation headline ──
await page.getByRole('button', { name: 'Valuation', exact: true }).click();
await page.waitForTimeout(800);
const headline = await page.evaluate(() => {
  const big = [...document.querySelectorAll('span.text-2xl')][0];
  return big?.parentElement?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 90);
});
console.log('valuation headline:', headline);
await page.screenshot({ path: '/tmp/ux-val-headline.png' });
await page.getByRole('button', { name: 'Price', exact: true }).click();
await page.waitForTimeout(800);

// ── Compare mode ──
await page.getByRole('button', { name: 'SPY', exact: true }).click();
await page.waitForTimeout(1200);
console.log('subtitle (compare):', await subtitle());
console.log('active chip text:', await page.evaluate(() =>
  [...document.querySelectorAll('button')].map(b => b.textContent.trim()).find(t => t.includes('×'))));

// end labels in the svg
const endLabels = await page.evaluate(() =>
  [...document.querySelectorAll('.recharts-wrapper text')].map(t => t.textContent).filter(t => t === 'JPM' || t === 'SPY'));
console.log('end labels:', JSON.stringify(endLabels));

// hover mid-chart → tooltip
const svg = await page.locator('.recharts-wrapper .recharts-surface').first().boundingBox();
if (svg) {
  await page.mouse.move(svg.x + svg.width * 0.7, svg.y + svg.height * 0.4);
  await page.waitForTimeout(500);
}
console.log('compare tooltip:', await page.evaluate(() =>
  document.querySelector('.recharts-tooltip-wrapper')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200)));
await page.screenshot({ path: '/tmp/ux-compare.png' });

// ── Toggle off ──
await page.getByRole('button', { name: 'SPY ×', exact: true }).click().catch(async () => {
  await page.locator('button', { hasText: 'SPY' }).first().click();
});
await page.waitForTimeout(900);
console.log('subtitle (off):', await subtitle());
console.log('legend after off:', await page.evaluate(() =>
  document.body.textContent.match(/vs SPY [+-]?[\d.]+%/) ? 'STILL VISIBLE' : 'gone'));

// toolbar at narrow width
await page.setViewportSize({ width: 900, height: 860 });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/ux-toolbar-900.png' });
console.log('done');
await browser.close();
