import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('https://premarketprice.com/analysis/NFLX', { waitUntil: 'domcontentloaded', timeout: 60000 });
// Price History chart is the 2nd+ section — wait for the Valuation button
await page.getByRole('button', { name: 'Valuation', exact: true }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

const probe = async (clickName) => {
  const samples = [];
  const clicks = page.getByRole('button', { name: clickName, exact: true }).first().click();
  for (let i = 0; i < 22; i++) {
    samples.push(await page.evaluate(() => {
      const w = document.querySelector('.pmp-chart-swap');
      return w ? +getComputedStyle(w).opacity : null;
    }));
    await page.waitForTimeout(45);
  }
  await clicks;
  return samples;
};

console.log('PRICE→VAL :', (await probe('Valuation')).join(','));
await page.waitForTimeout(400);
console.log('P/E→P/S   :', (await probe('P/S')).join(','));
await page.waitForTimeout(400);
console.log('P/S→PRICE :', (await probe('Price')).join(','));
const headline = await page.evaluate(() => {
  const el = document.querySelector('.pmp-fade-up');
  return el?.textContent?.slice(0, 60);
});
console.log('headline after Price:', headline);
await browser.close();
