import { chromium } from 'playwright';
const PORT = process.env.PORT || 3111;

function candles() {
  const out = [];
  const t0 = Date.UTC(2021, 0, 4);
  let price = 140; // JPM-ish
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
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
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
  // benchmark outperforms: steady +0.9%/week
  const points = candles().map((c, i) => ({ t: c.t, c: 400 * (1 + i * 0.009) }));
  return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ symbol: sym, points }) });
});

await page.goto(`http://localhost:${PORT}/val-test-tmp`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1800);

console.log('chips:', await page.evaluate(() =>
  [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => ['SPY', 'QQQ', 'XLF'].includes(t)).join(',')
));

await page.getByRole('button', { name: 'SPY', exact: true }).click();
await page.waitForTimeout(900);
console.log('legend:', await page.evaluate(() => {
  const m = document.body.textContent.match(/JPM [+-]?[\d.]+% vs SPY [+-]?[\d.]+%[^J]*/);
  return m ? m[0].slice(0, 80) : 'NO LEGEND';
}));
const bmPaths = await page.evaluate(() =>
  [...document.querySelectorAll('path[stroke-dasharray]')].filter(p => p.getAttribute('stroke') === '#78716c').length
);
console.log('dashed bm paths:', bmPaths);
await page.screenshot({ path: '/tmp/bm-spy.png' });

await page.getByRole('button', { name: 'XLF', exact: true }).click();
await page.waitForTimeout(700);
console.log('after XLF:', await page.evaluate(() => {
  const m = document.body.textContent.match(/vs XLF [+-]?[\d.]+%/);
  return m ? m[0] : 'no xlf legend';
}));

await browser.close();
