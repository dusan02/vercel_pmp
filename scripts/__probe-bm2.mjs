import { chromium } from 'playwright';
const PORT = process.env.PORT || 3111;
function candles() {
  const out = []; const t0 = Date.UTC(2021, 0, 4); let price = 140;
  for (let i = 0; i < 290; i++) {
    const t = t0 + i * 7 * 86400000;
    price = price * (1 + 0.006 + Math.sin(i / 13) * 0.02) + Math.sin(i / 5) * 3;
    const c = Math.max(50, price);
    out.push({ t, o: c * 0.99, h: c * 1.03, l: c * 0.97, c, v: 4e6 + (i % 9) * 8e5,
      pe: 11 + Math.sin(i / 8) * 3, ps: 3.2, pb: 1.6, evEbit: 12, fcfYield: 0.05, mcap: c * 3e9 });
  }
  return out;
}
const browser = await chromium.launch();
for (const w of [1400, 1100, 900]) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 } });
  await page.route('**/api/analysis/**/candles', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ candles: candles(), valuationStats: { pe: { median: 11.5, p25: 9.8, p75: 13.9, n: 1400 } },
      evNetDebt: null, sector: 'Financial Services', sectorEtf: 'XLF' }) }));
  await page.route('**/api/indices/weekly**', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ symbol: 'SPY', points: candles().map((c, i) => ({ t: c.t, c: 400 * (1 + i * 0.009) })) }) }));
  await page.goto(`http://localhost:${PORT}/val-test-tmp`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1800);
  const m = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'All');
    const hdr = document.querySelector('.pmp-chart-swap')?.previousElementSibling;
    const r1 = all?.getBoundingClientRect(), r2 = hdr?.getBoundingClientRect();
    return { allX: r1?.x.toFixed(0), allY: r1?.y.toFixed(0), hdrH: r2?.height.toFixed(0), hdrRows: r2 ? Math.round(r2.height / 30) : 0 };
  });
  const p1 = await m();
  await page.getByRole('button', { name: 'Valuation', exact: true }).click();
  await page.waitForTimeout(700);
  const v = await m();
  await page.getByRole('button', { name: 'Price', exact: true }).click();
  await page.waitForTimeout(700);
  const p2 = await m();
  console.log(`w=${w}`, 'PRICE', JSON.stringify(p1), 'VAL', JSON.stringify(v), 'PRICE2', JSON.stringify(p2));
  if (w === 1400) {
    await page.getByRole('button', { name: 'SPY', exact: true }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/bm-toolbar.png', clip: { x: 0, y: 0, width: 1400, height: 700 } });
  }
  await page.close();
}
await browser.close();
