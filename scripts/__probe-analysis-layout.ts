import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from '@playwright/test';
import config from '../tailwind.config';
import { KeyMetricsTable } from '../src/components/company/analysis/KeyMetricsTable';
import { InsiderTransactionsSection } from '../src/components/company/analysis/sections/InsiderTransactionsSection';
import { computePillars } from '../src/services/analysis/pillars';
import type { AnalysisData } from '../src/components/company/analysis/types';

Object.assign(globalThis, { React });
const data = {
  metrics: { currentPe: 24.6, currentEps: 12.1, psRatio: 13.58, evEbit: 20.4, fcfYield: 0.021, fcfMargin: 0.29, fcfConversion: 0.52,
    altmanZ: 25.64, currentRatio: 3.42, forwardPe: 6.5, forwardImpliedGrowth: 45, interestCoverage: 8.1 },
  revenueCagr: 7.8, netIncomeCagr: 9.9, epsCagr5y: 10.3, piotroskiScore: 7, beneishScore: -2.91, marginStability: 0.05,
  ttm: { netIncome: 50e9, revenue: 90e9, grossProfit: 60e9, ebit: 59e9, operatingCashFlow: 29e9, capex: 3e9, sbc: 1.2e9 },
  ticker: { lastMarketCap: 1200 },
  balanceSheet: { totalEquity: 100e9, totalDebt: 7e9, netDebt: -13e9, cash: 20e9, currentRatio: 3.42, netDebtToEbit: -0.2, dilution5y: 1.3, sbcRatio: 2.4 },
  finnhub: { forwardPe: 6.5, peRatio: 24.6, priceFreeCashFlow: 46.5, beta: 1.9, quickRatio: 1.79, dividendYield: 0.05, payoutRatio: 6.1 },
  valuationHistoryStats: { pe: { current: 24.6, min: 10, max: 60, percentile: 71, years: 10, sampleSize: 2200 } },
  statements: [
    { fiscalPeriod: 'FY', fiscalYear: 2025, endDate: '2025-12-31', netIncome: 100 },
    { fiscalPeriod: 'FY', fiscalYear: 2024, endDate: '2024-12-31', netIncome: -100 },
  ],
  pillars: computePillars({ pePercentile: 71, fcfYield: 0.021, psRatio: 13.58, evEbit: 20.4, revenueCagr: 7.8, netIncomeCagr: 9.9,
    epsCagr5y: 10.3, forwardImpliedGrowth: 45, roic: 0.58, roe: 0.5, netMargin: 0.55, operatingMargin: 0.65,
    altmanZ: 25.64, currentRatio: 3.42, interestCoverage: 8.1, netCash: true, debtRatio: null,
    piotroski: 7, beneish: -2.91, fcfConversion: 0.52, marginStability: 0.05 }),
} as unknown as AnalysisData;
const transactions = Array.from({ length: 8 }, (_, i) => ({
  name: i === 0 ? 'Alexandra Montgomery-Wellington' : i === 1 ? null : 'Morgan Shareholder',
  change: i === 0 ? 1285000 : -351 - i, transactionDate: '2026-08-21', filingDate: '2026-08-25', transactionCode: i === 0 ? 'P' : 'S',
}));
const markup = renderToStaticMarkup(React.createElement('main', { className: 'max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4' },
  React.createElement(KeyMetricsTable, { data }), React.createElement(InsiderTransactionsSection, { transactions })));
const globals = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');
const { css } = await postcss([tailwind({ ...config, content: [{ raw: markup, extension: 'html' }] })]).process(globals, { from: undefined });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const dark of [false, true]) {
    for (const width of [320, 390, 640, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(`<html class="${dark ? 'dark' : ''}"><head><style>${css}</style></head><body>${markup}</body></html>`);
      const overflow = await page.locator('main').evaluate(el => el.scrollWidth > el.clientWidth);
      assert.equal(overflow, false, `Page overflow at ${width}, dark=${dark}`);
      const rows = page.locator('section[aria-label="Insider transactions"] tbody tr:visible');
      assert.equal(await rows.count(), 5);
      await page.getByText('Show 3 more filings', { exact: true }).click();
      assert.equal(await rows.count(), 8);
      await page.getByText('Show fewer filings', { exact: true }).click();
      const pe = page.locator('details').filter({ has: page.locator('summary', { hasText: 'P/E (TTM)' }) }).first();
      await pe.locator('summary').click();
      assert.equal(await pe.getAttribute('open'), '');
      await pe.locator('summary').click();
      if ([390, 1440].includes(width)) await page.screenshot({ path: `/tmp/pmp-analysis-${dark ? 'dark' : 'light'}-${width}.png`, fullPage: true });
      const clipped = await page.locator('summary:visible, td:visible').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent?.trim()));
      console.log(JSON.stringify({ width, dark, clipped }));
      assert.deepEqual(clipped, [], `Clipped cells at ${width}, dark=${dark}`);
    }
  }
} finally {
  await browser.close();
}
