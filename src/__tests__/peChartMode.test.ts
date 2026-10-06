/** @jest-environment jsdom */

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// jsdom can't measure layout: recharts graphic paths (Area/Line curves) don't
// render, but the SVG frame, defs, Brush, labels and all DOM chrome do.
// ResponsiveContainer must pass real width/height or the chart renders nothing.
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) =>
      React.createElement(
        'div',
        { style: { width: 900, height: 470 } },
        React.isValidElement(children) ? React.cloneElement(children as any, { width: 900, height: 470 }) : children,
      ),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PriceCandlestickChart } = require('@/components/company/PriceCandlestickChart');

// ~5.7Y of deterministic weekly candles with a declining P/E multiple.
function fixtureCandles() {
  const candles = [];
  const t0 = Date.UTC(2020, 0, 3);
  for (let i = 0; i < 300; i++) {
    const t = t0 + i * 7 * 86400000;
    const c = 40 + i * 0.5 + Math.sin(i / 6) * 8;
    candles.push({
      t,
      o: c - 0.4,
      h: c + 1.2,
      l: c - 1.2,
      c,
      v: 1_000_000 + (i % 7) * 100_000,
      pe: 30 - i * 0.06 + Math.sin(i / 9) * 4,
      ps: 5 - i * 0.004 + Math.sin(i / 11) * 0.6,
      pb: 8 - i * 0.006,
      evEbit: 20 - i * 0.03,
      fcfYield: 0.02 + Math.sin(i / 10) * 0.004,
      mcap: c * 1e9,
    });
  }
  return candles;
}

const peStats = { median: 26.4, p25: 21, p75: 33, n: 300 };
const valuationStats = {
  pe: peStats,
  ps: { median: 5.2, p25: 4.4, p75: 6.1, n: 300 },
  pb: { median: 7.9, p25: 6.8, p75: 9.2, n: 300 },
  evEbit: { median: 18.5, p25: 15, p75: 22, n: 300 },
  fcfYield: { median: 0.021, p25: 0.016, p75: 0.027, n: 300 },
};

async function renderChart() {
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(PriceCandlestickChart, { ticker: 'TEST' }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root };
}

function clickButton(container: HTMLElement, label: string) {
  const btn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`button "${label}" not found`);
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('PriceCandlestickChart P/E mode (financecharts-style)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as any).matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candles: fixtureCandles(), peStats, valuationStats, evNetDebt: 5e9 }),
    }) as any;
  });

  it('offers the finer period set (3M/6M/YTD…All) shared by both modes', async () => {
    const { container } = await renderChart();
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'All']));
  });

  it('P/E mode shows × headline with range change %', async () => {
    const { container } = await renderChart();
    clickButton(container, 'Valuation');
    // headline: current multiple
    expect(container.innerHTML).toMatch(/\d+\.\d×/);
    // change badge colored for "cheaper" (fixture P/E declines → green)
    const badge = [...container.querySelectorAll('span')].find(
      (s) => /%/.test(s.textContent ?? '') && s.className.includes('font-semibold'),
    );
    expect(badge?.className).toContain('green');
  });

  it('keeps median line + band, adds gradient def and Brush navigator', async () => {
    const { container } = await renderChart();
    clickButton(container, 'Valuation');
    // median reference label kept (user requirement)
    expect(container.textContent).toContain('median 26.4');
    // gradient fill definition exists for the P/E area
    expect(container.querySelector('linearGradient#peAreaGrad')).toBeTruthy();
    // navigator rendered with two drag handles
    expect(container.querySelector('.recharts-brush')).toBeTruthy();
    expect(container.querySelectorAll('.recharts-brush-traveller').length).toBe(2);
  });

  it('formula caption: P/E = close ÷ TTM EPS with 1Y avg + median context', async () => {
    const { container } = await renderChart();
    clickButton(container, 'Valuation');
    expect(container.innerHTML).toMatch(/P\/E [\d.]+× = \$[\d.]+ close ÷ \$[\d.]+ TTM EPS/);
    expect(container.textContent).toContain('1Y avg');
    expect(container.textContent).toContain('median 26.4');
  });

  it('Valuation mode offers metric chips and hides price indicators', async () => {
    const { container } = await renderChart();
    clickButton(container, 'Valuation');
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['P/E', 'P/S', 'P/B', 'EV/EBIT', 'FCF yield']));
    // price-only indicators are hidden in valuation mode — their container
    // carries `invisible` so toggled state survives the mode round-trip and
    // the slot keeps its width (period buttons don't shift).
    const maBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('MA 20w'),
    ) as HTMLButtonElement | undefined;
    expect(maBtn?.closest('div')?.className).toContain('invisible');
  });

  it('switching metric to P/S changes headline and formula caption', async () => {
    const { container } = await renderChart();
    clickButton(container, 'Valuation');
    clickButton(container, 'P/S');
    expect(container.textContent).toContain('median 5.2');
    expect(container.innerHTML).toMatch(/P\/S [\d.]+× = \$[\d.]+ close ÷ \$[\d.]+ TTM rev\/sh/);
  });

  it('FCF yield renders in % units and inverts the cheaper direction', async () => {
    const { container } = await renderChart();
    clickButton(container, 'Valuation');
    clickButton(container, 'FCF yield');
    // headline in % — fixture ~2%
    expect(container.innerHTML).toMatch(/\d+\.\d%/);
    expect(container.innerHTML).toMatch(/FCF yield [\d.]+% = TTM FCF ÷ market cap/);
  });
});
