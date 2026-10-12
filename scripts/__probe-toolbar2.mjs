import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('https://premarketprice.com/analysis/NFLX', { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(6000);
const dump = (tag) => p.evaluate((t) => {
  const val = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Valuation');
  const toolbar = val?.closest('div.flex.flex-wrap') ?? val?.parentElement?.parentElement;
  if (!toolbar) return t + ': no toolbar';
  const items = [...toolbar.children].map(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x.toFixed(0), w: r.width.toFixed(0), y: r.y.toFixed(0), t: el.textContent?.slice(0, 30) };
  });
  return t + ': ' + JSON.stringify(items);
}, tag);
console.log(await dump('PRICE-1'));
await p.getByRole('button', { name: 'Valuation', exact: true }).click();
await p.waitForTimeout(1200);
console.log(await dump('VAL    '));
await p.getByRole('button', { name: 'Price', exact: true }).click();
await p.waitForTimeout(1200);
console.log(await dump('PRICE-2'));
await b.close();
