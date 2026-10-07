import { chromium } from 'playwright';
const PORT = process.env.PORT || 3111;

function fixture() {
  const candles = [];
  const t0 = Date.UTC(2021, 0, 4);
  let price = 500;
  for (let i = 0; i < 290; i++) {
    const t = t0 + i * 7 * 86400000;
    price = price * (1 + 0.004 + Math.sin(i / 13) * 0.02) + Math.sin(i / 5) * 6;
    const c = Math.max(50, price);
    candles.push({
      t, o: c * 0.99, h: c * 1.03, l: c * 0.97, c,
      v: 4e6 + (i % 9) * 8e5,
      pe: 45 - i * 0.07 + Math.sin(i / 8) * 9,
      ps: 8 + Math.sin(i / 9) * 2, pb: 12, evEbit: 30, fcfYield: 0.018, mcap: c * 4.3e8,
    });
  }
  return {
    candles,
    valuationStats: {
      pe: { median: 38.2, p25: 30.1, p75: 52.4, n: 1250 },
      ps: { median: 7.4, p25: 6.1, p75: 9.0, n: 1250 },
      pb: { median: 11.2, p25: 9.4, p75: 13.8, n: 1250 },
      evEbit: { median: 27.6, p25: 23.0, p75: 34.1, n: 1250 },
      fcfYield: { median: 0.019, p25: 0.014, p75: 0.026, n: 1250 },
    },
    peStats: { median: 38.2, p25: 30.1, p75: 52.4, n: 1250 },
    evNetDebt: 9.4e9,
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
await page.route('**/api/analysis/**/candles', r =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture()) }));
await page.goto(`http://localhost:${PORT}/val-test-tmp`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1800);

// Sample wrapper opacity + main-area path `d` while switching modes.
const probe = async (clickName) => {
  const samples = [];
  const clicks = page.getByRole('button', { name: clickName, exact: true }).click();
  for (let i = 0; i < 24; i++) {
    samples.push(await page.evaluate(() => {
      const w = document.querySelector('.pmp-chart-swap');
      const cs = w ? getComputedStyle(w) : null;
      const path = document.querySelector('.recharts-area-curve, .recharts-area-area');
      return {
        o: cs ? +cs.opacity : null,
        ty: cs?.transform || '',
        d: path?.getAttribute('d')?.length || 0,
      };
    }));
    await page.waitForTimeout(45);
  }
  await clicks;
  return samples;
};

const s1 = await probe('Valuation');
console.log('PRICE→VAL opacity:', s1.map(s => s.o).join(','));
console.log('           pathLen:', s1.map(s => s.d).join(','));

const s2 = await probe('P/S');
console.log('P/E→P/S  opacity:', s2.map(s => s.o).join(','));
console.log('           pathLen:', s2.map(s => s.d).join(','));

await page.screenshot({ path: '/tmp/swap-val.png' });
await page.close();
await browser.close();
