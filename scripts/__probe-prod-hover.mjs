import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('https://premarketprice.com/analysis/NFLX', { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(3000);
// Scope everything to the "Price History" card (last big chart on the page)
const card = p.locator('div').filter({ hasText: /Weekly Candlestick Chart/ }).last();
const allX = async () => {
  const btns = await p.getByRole('button', { name: 'All', exact: true }).all();
  const boxes = [];
  for (const bt of btns) { const bb = await bt.boundingBox(); if (bb) boxes.push(bb.x); }
  return boxes;
};
console.log('All-btn Xs (price):', await allX());
await p.getByRole('button', { name: 'Valuation', exact: true }).click();
await p.waitForTimeout(1000);
console.log('All-btn Xs (val):  ', await allX());
// hover the LAST chart container on the page (Price History, not intraday)
const containers = await p.locator('.recharts-responsive-container').all();
const box = await containers[containers.length - 1].boundingBox();
await p.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
await p.waitForTimeout(500);
const dots = await p.evaluate(() => [...document.querySelectorAll('.recharts-active-dot circle')].length);
const tip = await p.evaluate(() => document.querySelector('.recharts-tooltip-wrapper')?.textContent);
console.log('active dots:', dots, '| tooltip:', tip);
await p.screenshot({ path: '/tmp/prod-hover.png' });
await b.close();
