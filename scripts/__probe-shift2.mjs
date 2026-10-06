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
      ps: 8, pb: 12, evEbit: 30, fcfYield: 0.018, mcap: c * 4.3e8,
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
for (const w of [1400, 1000]) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 } });
  await page.route('**/api/analysis/**/candles', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture()) }));
  await page.goto(`http://localhost:${PORT}/val-test-tmp`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const m = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'All');
    const plot = document.querySelector('.recharts-cartesian-grid');
    const r1 = all?.getBoundingClientRect(), r2 = plot?.getBoundingClientRect();
    return { allX: r1?.x.toFixed(1), allY: r1?.y.toFixed(0), plotL: r2?.left.toFixed(1), plotR: r2?.right.toFixed(1) };
  });
  const p1 = await m();
  await page.getByRole('button', { name: 'Valuation', exact: true }).click();
  await page.waitForTimeout(900);
  const v = await m();
  await page.getByRole('button', { name: 'Price', exact: true }).click();
  await page.waitForTimeout(900);
  const p2 = await m();
  console.log(`w=${w} PRICE`, JSON.stringify(p1), '→ VAL', JSON.stringify(v), '→ PRICE2', JSON.stringify(p2));
  // hover → dots
  await page.getByRole('button', { name: 'Valuation', exact: true }).click();
  await page.waitForTimeout(700);
  const box = await page.locator('.recharts-responsive-container').first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await page.waitForTimeout(400);
  const dots = await page.evaluate(() => [...document.querySelectorAll('.recharts-active-dot circle')].length);
  const tip = await page.evaluate(() => document.querySelector('.recharts-tooltip-wrapper')?.textContent);
  console.log(`w=${w} dots:`, dots, '| tip:', tip);
  await page.close();
}
await browser.close();
