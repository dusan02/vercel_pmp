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
      ps: 8 - i * 0.004 + Math.sin(i / 11) * 1.2,
      pb: 12 - i * 0.01,
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
await page.route('**/api/analysis/**/candles', r =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture()) }));
await page.goto(`http://localhost:${PORT}/val-test-tmp`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

// Measure toolbar + chart right edge in both modes
const measure = () => page.evaluate(() => {
  const periodBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'All');
  const chart = document.querySelector('.recharts-responsive-container');
  const yTicks = [...document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick tspan')];
  const lastTick = yTicks[yTicks.length - 1];
  const plot = document.querySelector('.recharts-cartesian-grid');
  return {
    allBtnX: periodBtn?.getBoundingClientRect().x?.toFixed(1),
    plotRight: plot?.getBoundingClientRect().right?.toFixed(1),
    plotLeft: plot?.getBoundingClientRect().left?.toFixed(1),
    chartH: chart?.getBoundingClientRect().height?.toFixed(0),
  };
});

const price = await measure();
console.log('PRICE     ', JSON.stringify(price));

await page.getByRole('button', { name: 'Valuation', exact: true }).click();
await page.waitForTimeout(900);
const val = await measure();
console.log('VALUATION ', JSON.stringify(val));
console.log('ΔAllBtnX =', (val.allBtnX - price.allBtnX).toFixed(1), 'ΔplotR =', (val.plotRight - price.plotRight).toFixed(1), 'ΔplotL =', (val.plotLeft - price.plotLeft).toFixed(1));

// hover mid-chart → count visible dots + tooltip content
const box = await page.locator('.recharts-responsive-container').first().boundingBox();
await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.4);
await page.waitForTimeout(400);
const dots = await page.evaluate(() => {
  const active = [...document.querySelectorAll('.recharts-active-dot circle, circle.recharts-dot.recharts-active-dot')];
  const allDots = [...document.querySelectorAll('circle.recharts-dot')].filter(c => c.getAttribute('r') !== '0' && c.getBBox && (() => { try { return c.getBBox().width > 0 } catch { return false } })());
  const visible = [...document.querySelectorAll('circle')].filter(c => {
    const r = parseFloat(c.getAttribute('r') || '0');
    return r >= 2 && r <= 8;
  });
  return { allDots: allDots.length, visibleDots: visible.length };
});
console.log('hover dots:', JSON.stringify(dots));
const tip = await page.evaluate(() => document.querySelector('.recharts-tooltip-wrapper')?.textContent);
console.log('tooltip:', tip);
await page.screenshot({ path: '/tmp/shift-val-hover.png' });
await browser.close();
