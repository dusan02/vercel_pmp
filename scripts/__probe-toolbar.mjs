import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('https://premarketprice.com/analysis/NFLX', { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(3000);
const dump = () => p.evaluate(() => {
  const val = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Valuation');
  if (!val) return 'no btn';
  const toolbar = val.parentElement.parentElement; // flex container
  const items = [...toolbar.children].map(el => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName + '.' + (el.className.split(' ')[0]||''), x: r.x.toFixed(0), w: r.width.toFixed(0), y: r.y.toFixed(0), text: el.textContent?.slice(0, 40) };
  });
  const head = toolbar.parentElement?.getBoundingClientRect();
  return { headW: head?.width.toFixed(0), items };
});
console.log('PRICE:', JSON.stringify(await dump(), null, 1));
await p.getByRole('button', { name: 'Valuation', exact: true }).click();
await p.waitForTimeout(900);
console.log('VAL:', JSON.stringify(await dump(), null, 1));
await b.close();
