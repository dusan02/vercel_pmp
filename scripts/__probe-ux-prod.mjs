// Prod verification of the UX pass on live /analysis/JPM.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('https://premarketprice.com/analysis/JPM', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('.recharts-wrapper', { timeout: 30000 }).catch(() => null);
await page.waitForTimeout(1500);

const heading = page.getByRole('heading', { name: 'Price History', exact: true });
const card = heading.locator('xpath=ancestor::*[.//div[contains(@class,"recharts-wrapper")]][1]');
const subtitle = () => card.locator('p').first().textContent().catch(() => '?');

console.log('subtitle (price):', (await subtitle())?.trim());

// valuation headline
await card.getByRole('button', { name: 'Valuation', exact: true }).click();
await page.waitForTimeout(900);
const hl = await card.evaluate(el => {
  const big = el.querySelector('span.text-2xl');
  return big?.parentElement?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 90);
});
console.log('valuation headline:', hl);
await card.getByRole('button', { name: 'Price', exact: true }).click();
await page.waitForTimeout(900);

// compare
await card.getByRole('button', { name: 'SPY', exact: true }).click();
await page.waitForTimeout(1400);
console.log('subtitle (compare):', (await subtitle())?.trim());
console.log('chip:', await card.evaluate(el => [...el.querySelectorAll('button')].map(b => b.textContent.trim()).find(t => t.includes('×'))));

const svg = card.locator('.recharts-wrapper').first();
const texts = await svg.evaluate(el =>
  [...el.querySelectorAll('text')].map(t => t.textContent).filter(t => ['JPM', 'SPY'].includes(t ?? '')));
console.log('end labels:', JSON.stringify(texts));

const box = await svg.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.45);
  await page.waitForTimeout(500);
}
console.log('tooltip:', await card.evaluate(el =>
  el.querySelector('.recharts-tooltip-wrapper')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200)));
await svg.screenshot({ path: '/tmp/prod-ux-compare.png' });

// toggle off
await card.locator('button', { hasText: 'SPY ×' }).click();
await page.waitForTimeout(900);
console.log('subtitle (off):', (await subtitle())?.trim());
await browser.close();
