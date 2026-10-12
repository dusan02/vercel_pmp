import { chromium } from 'playwright';
const PORT = process.env.PORT || 3111;
function candles() {
  const out = []; const t0 = Date.UTC(2021, 0, 4); let price = 140;
  for (let i = 0; i < 290; i++) {
    const t = t0 + i * 7 * 86400000;
    // JPM underperforms early, outperforms late → exercises BOTH bands
    price = price * (1 + 0.002 + Math.sin(i / 9) * 0.03) + Math.sin(i / 4) * 3;
    const c = Math.max(50, price);
    out.push({ t, o: c * 0.99, h: c * 1.03, l: c * 0.97, c, v: 4e6 + (i % 9) * 8e5,
      pe: 11 + Math.sin(i / 8) * 3, ps: 3.2, pb: 1.6, evEbit: 12, fcfYield: 0.05, mcap: c * 3e9 });
  }
  return out;
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
await page.route('**/api/analysis/**/candles', r => r.fulfill({ contentType: 'application/json',
  body: JSON.stringify({ candles: candles(), valuationStats: { pe: { median: 11.5, p25: 9.8, p75: 13.9, n: 1400 } },
    evNetDebt: null, sector: 'Financial Services', sectorEtf: 'XLF' }) }));
await page.route('**/api/indices/weekly**', r => r.fulfill({ contentType: 'application/json',
  // benchmark: steady +0.55%/week — JPM fixture crosses it several times
  body: JSON.stringify({ symbol: 'SPY', points: candles().map((c, i) => ({ t: c.t, c: 400 * (1 + i * 0.0055) })) }) }));
await page.goto(`http://localhost:${PORT}/val-test-tmp`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1800);
await page.getByRole('button', { name: 'SPY', exact: true }).click();
await page.waitForTimeout(1300);
console.log('legend:', await page.evaluate(() => (document.body.textContent.match(/JPM [+-]?[\d.]+% vs SPY [+-]?[\d.]+%[^H]*/) || ['NO'])[0].slice(0, 70)));
console.log('axis %?', await page.evaluate(() => /%/.test(document.querySelector('.recharts-yAxis')?.textContent || '')));
console.log('candles gone?', await page.evaluate(() => document.querySelectorAll('.recharts-bar-rectangle').length));
await page.screenshot({ path: '/tmp/bm-compare.png', clip: { x: 60, y: 30, width: 1300, height: 640 } });
await browser.close();
