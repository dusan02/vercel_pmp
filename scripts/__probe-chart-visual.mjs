/**
 * Visual probe: Price History chart redesign on live prod.
 * Captures V + SPGI at desktop/mobile widths, Price mode with Med-P/E
 * overlay enabled, and the P/E-multiple view.
 * Usage: node scripts/__probe-chart-visual.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'https://premarketprice.com';
const OUT = '/tmp/pmp-chart-shots';
mkdirSync(OUT, { recursive: true });

const CASES = [
  { ticker: 'V', widths: [1440, 1024, 768, 390] },
  { ticker: 'SPGI', widths: [1440, 390] },
];

const browser = await chromium.launch();
for (const { ticker, widths } of CASES) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(`${BASE}/analysis/${ticker}`, { waitUntil: 'networkidle', timeout: 60000 });
      // wait for the candles fetch + chart render
      await page.waitForSelector('.recharts-wrapper', { timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(1200);

      // locate the Price History card via its heading (page has ~10 recharts wrappers)
      const heading = page.getByRole('heading', { name: 'Price History', exact: true });
      const chartCard = heading.locator('xpath=ancestor::*[.//div[contains(@class,"recharts-wrapper")]][1]');
      const chartArea = chartCard.locator('.recharts-wrapper').first();

      // 1) Price mode + Med P/E overlay ON
      const medBtn = chartCard.getByRole('button', { name: 'Med P/E', exact: true });
      if (await medBtn.count()) {
        await medBtn.click();
        await page.waitForTimeout(600);
      }
      await chartArea.screenshot({ path: `${OUT}/${ticker}-${width}-price-medpe.png` });

      // 2) P/E-multiple view
      const peBtn = chartCard.getByRole('button', { name: 'P/E', exact: true });
      if (await peBtn.count()) {
        await peBtn.click();
        await page.waitForTimeout(600);
        await chartArea.screenshot({ path: `${OUT}/${ticker}-${width}-pemode.png` });
        // back to price for next iteration hygiene
        await chartCard.getByRole('button', { name: 'Price', exact: true }).click();
      } else {
        console.log(`${ticker}@${width}: P/E button not found`);
      }

      // 3) full-area context shot (chart + toggles + footnote)
      await page.evaluate(() => document.querySelector('.recharts-wrapper')?.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${ticker}-${width}-context.png` });

      console.log(`${ticker}@${width}: done`);
    } catch (e) {
      console.log(`${ticker}@${width}: FAIL`, e.message?.slice(0, 120));
    }
    await page.close();
  }
}
await browser.close();
console.log('shots →', OUT);
