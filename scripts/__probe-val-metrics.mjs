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
    const pe = 45 - i * 0.07 + Math.sin(i / 8) * 9;
    const ps = 8 - i * 0.004 + Math.sin(i / 11) * 1.2;
    candles.push({
      t, o: c * 0.99, h: c * 1.03, l: c * 0.97, c,
      v: 4e6 + (i % 9) * 8e5,
      pe: i > 8 ? pe : null,
      ps, pb: 12 - i * 0.01,
      evEbit: 30 - i * 0.04 + Math.sin(i / 9) * 3,
      fcfYield: 0.018 + Math.sin(i / 12) * 0.006,
      mcap: c * 4.3e8,
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 300)));
await page.route('**/api/analysis/**/candles', r =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture()) }));
await page.goto(`http://localhost:${PORT}/val-test-tmp`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

const probe = async (label) => {
  const r = await page.evaluate(() => {
    const ticks = [...document.querySelectorAll('.recharts-cartesian-axis-tick tspan')].map(e => e.textContent).filter(Boolean);
    return {
      areas: document.querySelectorAll('.recharts-area-area').length,
      yTicks: ticks.filter(t => /[×%]/.test(t)).slice(0, 6),
      headline: [...document.querySelectorAll('span')].find(s => /^\d+\.\d[×%]$/.test((s.textContent ?? '').trim()))?.textContent?.trim(),
    };
  });
  console.log(label, JSON.stringify(r));
};

await page.getByRole('button', { name: 'Valuation', exact: true }).click();
await page.waitForTimeout(900);
await probe('PE');
await page.screenshot({ path: '/tmp/val-pe.png' });

for (const [name, label] of [['P/S', 'ps'], ['P/B', 'pb'], ['EV/EBIT', 'evebit'], ['FCF yield', 'fcf']]) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(700);
  await probe(label.toUpperCase());
  await page.screenshot({ path: `/tmp/val-${label}.png` });
}
console.log('ERRS:', errs.slice(0, 5));
await browser.close();
