import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('https://premarketprice.com/analysis/NFLX', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);

await page.locator('button', { hasText: /^P\/E$/ }).first().click();
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const grad = document.querySelector('linearGradient#peAreaGrad');
  const svg = grad?.closest('svg');
  if (!svg) return { err: 'no svg' };
  const tickTexts = [...svg.querySelectorAll('.recharts-cartesian-axis-tick')].map((t) => t.textContent);
  const xAxisGroups = [...svg.querySelectorAll('.recharts-xAxis')].map((g) => ({
    ticks: g.querySelectorAll('.recharts-cartesian-axis-tick').length,
    html: g.innerHTML.slice(0, 300),
  }));
  return {
    allTickTexts: tickTexts.slice(0, 15),
    tickCount: tickTexts.length,
    xAxisGroups,
    wrapperHTMLlen: svg.innerHTML.length,
    layers: svg.querySelectorAll('.recharts-layer').length,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
