import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('https://premarketprice.com/analysis/JPM', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByRole('button', { name: 'Valuation', exact: true }).waitFor({ timeout: 30000 });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: 'SPY', exact: true }).click();
await page.waitForTimeout(1500);
console.log('legend:', await page.evaluate(() => {
  const m = document.body.textContent.match(/JPM [+-]?[\d.]+% vs SPY [+-]?[\d.]+%[^H]*/);
  return m ? m[0].slice(0, 70) : 'NO LEGEND';
}));
const r = await page.evaluate(() => {
  const yTicks = [...document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick tspan')].map(t => t.textContent);
  return {
    yPct: yTicks.filter(t => /%/.test(t)).length,
    yTicksSample: yTicks.slice(0, 6).join(','),
    candleRects: document.querySelectorAll('.recharts-bar-rectangle').length,
    // solid strokes of the two % lines (green/red ticker segments + gray bm)
    linePaths: [...document.querySelectorAll('.recharts-line path.recharts-curve')].map(p => p.getAttribute('stroke')),
    dashedCurves: [...document.querySelectorAll('.recharts-line path')].filter(p => p.getAttribute('stroke-dasharray')).length,
    areaFills: [...document.querySelectorAll('.recharts-area path.recharts-curve, .recharts-area .recharts-area-area')].map(p => p.getAttribute('fill')),
  };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: '/tmp/bm-prod-jpm.png' });
await browser.close();
