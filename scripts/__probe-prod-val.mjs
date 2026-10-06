import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
await p.goto('https://premarketprice.com/analysis/NFLX', { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(3000);
const val = p.getByRole('button', { name: 'Valuation', exact: true });
await val.click();
await p.waitForTimeout(1200);
await p.screenshot({ path: '/tmp/prod-val-pe.png' });
for (const name of ['P/S', 'P/B', 'EV/EBIT', 'FCF yield']) {
  const btn = p.locator(`button[title^="${name} ="], button[title="${name} history not available"]`).first();
  const dis = await btn.getAttribute('disabled').catch(() => null);
  console.log(name, 'disabled:', dis !== null);
  if (dis === null) {
    await btn.click();
    await p.waitForTimeout(800);
    await p.screenshot({ path: `/tmp/prod-val-${name.replace(/[^a-z]/gi, '').toLowerCase()}.png` });
  }
}
console.log('ERRS:', errs.slice(0, 5));
await b.close();
