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
      // Realized NTM P/E — ends ~40 candles early (unreported quarters) so
      // the consensus dot has room at the right edge.
      peFwd: i < 260 ? 27 - i * 0.05 + Math.sin(i / 8) * 3 : null,
      peCons: i === 299 ? 24.2 : null,
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
  peFwd: { median: 24.0, p25: 19.5, p75: 29.5, n: 260 },
  ps: { median: 5.2, p25: 4.4, p75: 6.1, n: 300 },
  pb: { median: 7.9, p25: 6.8, p75: 9.2, n: 300 },
  evEbit: { median: 18.5, p25: 15, p75: 22, n: 300 },
  fcfYield: { median: 0.021, p25: 0.016, p75: 0.027, n: 300 },
};

async function renderChart(props: Record<string, unknown> = {}) {
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(PriceCandlestickChart, { ticker: 'TEST', ...props }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root };
}

async function clickButton(container: HTMLElement, label: string) {
  const norm = (t: string | null | undefined) =>
    (t ?? '').replace(/[✓▾▴×]/g, '').trim();
  const btn = [...container.querySelectorAll('button')].find(
    (b) => norm(b.textContent) === label,
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`button "${label}" not found`);
  await act(async () => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // View swaps are two-phase (fade-out → commit after ~120ms) — flush it.
    await new Promise((r) => setTimeout(r, 150));
  });
}

async function enterValuationMode(container: HTMLElement) {
  await clickButton(container, 'Tools');
  await clickButton(container, 'Valuation Multiples (P/E)');
}

describe('PriceCandlestickChart P/E mode (financecharts-style)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (window as any).matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/indices/weekly')) {
        // Benchmark weekly closes aligned to the fixture's weekly buckets —
        // steady +0.2%/week growth (≈ +82% over the ~5.7Y fixture span).
        const points = fixtureCandles().map((c, i) => ({ t: c.t, c: 100 * (1 + i * 0.002) }));
        return Promise.resolve({ ok: true, json: async () => ({ symbol: 'SPY', points }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          candles: fixtureCandles(), peStats, valuationStats, evNetDebt: 5e9,
          sector: 'Financial Services', sectorEtf: 'XLF',
          fwdPeNow: 24.2, fwdPeAsOf: '2026-10-07',
        }),
      });
    }) as any;
  });

  it('offers the finer period set (3M/6M/YTD…All) shared by both modes', async () => {
    const { container } = await renderChart();
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'All']));
  });

  it('P/E mode shows × headline with premium vs median', async () => {
    const { container } = await renderChart();
    await enterValuationMode(container);
    // headline: current multiple + premium/discount vs its own median
    expect(container.innerHTML).toMatch(/\d+\.\d×/);
    const badge = [...container.querySelectorAll('span')].find(
      (s) => /vs median/.test(s.textContent ?? ''),
    );
    expect(badge).toBeTruthy();
    // fixture P/E declines below its median → "cheaper" reads green
    expect(badge?.textContent).toMatch(/^[+-][\d.]+%/);
    expect(badge?.className).toContain('green');
  });

  it('keeps median line + band, adds gradient def and Brush navigator', async () => {
    const { container } = await renderChart();
    await enterValuationMode(container);
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
    await enterValuationMode(container);
    expect(container.innerHTML).toMatch(/P\/E [\d.]+× = \$[\d.]+ close ÷ \$[\d.]+ TTM EPS/);
    expect(container.textContent).toContain('1Y avg');
    expect(container.textContent).toContain('median 26.4');
  });

  it('Valuation mode offers a metric menu and hides price overlays', async () => {
    const { container } = await renderChart();
    await enterValuationMode(container);
    // the metric selector is a dropdown — trigger shows the active metric
    await clickButton(container, 'P/E'); // opens the metric menu
    const labels = [...container.querySelectorAll('button')].map((b) =>
      b.textContent?.replace(/[✓▾▴]/g, '').trim());
    expect(labels).toEqual(expect.arrayContaining(['P/E', 'P/E NTM', 'P/S', 'P/B', 'EV/EBIT', 'FCF yield']));
    // price-only overlays dropdown is hidden in valuation mode
    const ovBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Overlays'),
    );
    expect(ovBtn).toBeFalsy();
  });

  it('switching metric to P/S changes headline and formula caption', async () => {
    const { container } = await renderChart();
    await enterValuationMode(container);
    await clickButton(container, 'P/E'); // open metric menu
    await clickButton(container, 'P/S');
    expect(container.textContent).toContain('median 5.2');
    expect(container.innerHTML).toMatch(/P\/S [\d.]+× = \$[\d.]+ close ÷ \$[\d.]+ TTM rev\/sh/);
  });

  it('P/E NTM: realized series label + consensus headline, never "Fwd P/E"', async () => {
    const { container } = await renderChart();
    await enterValuationMode(container);
    await clickButton(container, 'P/E'); // open metric menu
    await clickButton(container, 'P/E NTM');
    // Headline = today's consensus (24.2×) flagged as such.
    expect(container.textContent).toContain('24.2×');
    const tag = [...container.querySelectorAll('span')].find(
      (s) => s.textContent?.trim().toLowerCase() === 'consensus',
    );
    expect(tag).toBeTruthy();
    // Caption names the realized method and the consensus source/date.
    expect(container.textContent).toContain("NTM P/E (realized) = close ÷ next 4 quarters' reported EPS");
    expect(container.textContent).toContain('(Finnhub, 2026-10-07)');
    // vs-median badge compares consensus to the realized median.
    expect(container.textContent).toMatch(/vs median/);
    expect(container.textContent).toContain('median 24.0');
  });

  it('P/E NTM still renders headline without a consensus snapshot', async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          candles: fixtureCandles(), peStats, valuationStats, evNetDebt: 5e9,
          fwdPeNow: null, fwdPeAsOf: null,
        }),
      }),
    );
    const { container } = await renderChart();
    await enterValuationMode(container);
    await clickButton(container, 'P/E'); // open metric menu
    await clickButton(container, 'P/E NTM');
    // Falls back to the last realized point — no consensus tag.
    const tag = [...container.querySelectorAll('span')].find(
      (s) => s.textContent?.trim().toLowerCase() === 'consensus',
    );
    expect(tag).toBeFalsy();
    expect(container.textContent).toContain('NTM P/E (realized)');
  });

  it('FCF yield renders in % units and inverts the cheaper direction', async () => {
    const { container } = await renderChart();
    await enterValuationMode(container);
    await clickButton(container, 'P/E'); // open metric menu
    await clickButton(container, 'FCF yield');
    // headline in % — fixture ~2%
    expect(container.innerHTML).toMatch(/\d+\.\d%/);
    expect(container.innerHTML).toMatch(/FCF yield [\d.]+% = TTM FCF ÷ market cap/);
  });

  it('offers SPY/QQQ/sector-ETF in the Tools compare section; select fetches benchmark weekly series', async () => {
    const { container } = await renderChart();
    await clickButton(container, 'Tools'); // open consolidated Tools menu
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['SPY', 'QQQ', 'XLF']));

    await clickButton(container, 'SPY');
    // benchmark fetch went out to the shared weekly endpoint
    const calls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/api/indices/weekly?symbol=SPY'))).toBe(true);
    // legend shows the window-end delta: TEST +x% vs SPY +y% (pp)
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toMatch(/TEST [+-]?[\d.]+% vs SPY [+-]?[\d.]+%/);
    expect(container.textContent).toMatch(/[+-][\d.]+pp/);
  });

  it('back-to-price exit button appears in valuation mode and returns cleanly', async () => {
    const { container } = await renderChart();
    await enterValuationMode(container);
    await clickButton(container, '← Price');
    const ovBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Overlays'),
    );
    expect(ovBtn).toBeTruthy();
  });

  it('clicking the active benchmark chip exits compare and reports it', async () => {
    const onCompareChange = jest.fn();
    document.body.innerHTML = '';
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PriceCandlestickChart, { ticker: 'TEST', onCompareChange }));
      await Promise.resolve();
    });
    onCompareChange.mockClear();

    await clickButton(container, 'Tools');
    await clickButton(container, 'SPY');
    await act(async () => { await Promise.resolve(); });
    expect(onCompareChange).toHaveBeenLastCalledWith('SPY');
    // active chip appears in toolbar and clicking it clears compare in one click
    const trig = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.replace(/[✓▾▴×]/g, '').trim() === '⇄ SPY');
    expect(trig).toBeTruthy();

    await clickButton(container, '⇄ SPY');
    await act(async () => { await Promise.resolve(); });
    expect(onCompareChange).toHaveBeenLastCalledWith(null);
    // back in price mode — the compare legend is gone
    expect(container.textContent).not.toMatch(/vs SPY [+-]?[\d.]+%/);
  });

  it('Fair value overlay is ON by default, renders header badge + bear/bull legend, and toggles off cleanly', async () => {
    localStorage.clear();
    const fvCandles = fixtureCandles().map((c, i) => ({
      ...c,
      fv: i >= 52 ? 213 : null,
      fvBear: i >= 52 ? 159 : null,
      fvBull: i >= 52 ? 324 : null,
      fvMethod: i >= 52 ? 'pe+dcf' : null,
    }));
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          candles: fvCandles,
          fairValue: {
            method: 'pe+dcf',
            asOf: '2025-09-26',
            components: {
              rel: 280,
              relKind: 'pe',
              relMultiple: 35.0,
              relMedian: 55.7,
              relPerShare: 8.0,
              dcf: 146,
              fcfPerShare: 5.26,
              growth: 0.2,
            },
          },
          peStats,
          valuationStats,
          evNetDebt: 5e9,
        }),
      }),
    );

    const { container } = await renderChart();
    // Header badge + below-chart buy/sell zone legend + checked Fair value checkbox appear by default
    expect(container.textContent).toMatch(/Fair \$213/);
    expect(container.textContent).toContain('P/E + FCF DCF');
    expect(container.textContent).toMatch(/bear \$159/);
    expect(container.textContent).toMatch(/bull \$324/);
    expect(container.textContent).toContain('Below = Buy');
    expect(container.textContent).toContain('Above = Sell');

    // Clicking the header valuation pill expands above the chart; clicking P/E + FCF DCF expands right below the legend
    expect(container.textContent).not.toContain('How Fair Value is calculated');
    const hdrBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Fair $213'));
    const methodBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('P/E + FCF DCF'));
    const chartSwap = container.querySelector('.pmp-chart-swap');
    expect(hdrBtn).toBeTruthy();
    expect(methodBtn).toBeTruthy();
    expect(chartSwap).toBeTruthy();
    expect(hdrBtn!.getAttribute('aria-expanded')).toBe('false');
    expect(methodBtn!.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      methodBtn!.click();
      await Promise.resolve();
    });
    expect(methodBtn!.getAttribute('aria-expanded')).toBe('true');
    expect(hdrBtn!.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain('How Fair Value is calculated');
    const bottomRegion = container.querySelector('[role="region"][aria-label="Fair value calculation breakdown"]');
    expect(bottomRegion).toBeTruthy();
    expect(Boolean(methodBtn!.compareDocumentPosition(bottomRegion!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    await act(async () => {
      methodBtn!.click();
      await Promise.resolve();
    });
    expect(methodBtn!.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('How Fair Value is calculated');

    await act(async () => {
      hdrBtn!.click();
      await Promise.resolve();
    });
    expect(hdrBtn!.getAttribute('aria-expanded')).toBe('true');
    expect(methodBtn!.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain('How Fair Value is calculated');
    expect(container.textContent).toContain('$280');
    expect(container.textContent).toContain('$146');
    expect(container.textContent).toContain('capped at 15 + 20.0%');
    const topRegion = container.querySelector('[role="region"][aria-label="Fair value calculation breakdown"]');
    expect(Boolean(topRegion!.compareDocumentPosition(chartSwap!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    // Clicking bottom method button while top is open moves the panel down beside P/E + FCF DCF instead of closing offscreen
    await act(async () => {
      methodBtn!.click();
      await Promise.resolve();
    });
    expect(methodBtn!.getAttribute('aria-expanded')).toBe('true');
    expect(hdrBtn!.getAttribute('aria-expanded')).toBe('false');
    const movedRegion = container.querySelector('[role="region"][aria-label="Fair value calculation breakdown"]');
    expect(Boolean(methodBtn!.compareDocumentPosition(movedRegion!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    const cb = container.querySelector('input[type="checkbox"][aria-label="Fair value"]') as HTMLInputElement | null;
    expect(cb).toBeTruthy();
    expect(cb!.checked).toBe(true);
    expect(cb!.parentElement?.innerHTML).toMatch(/rgb\(37,\s*99,\s*235\)|#2563eb/i);

    // Wait — verify breakdown closes automatically when Fair value checkbox is unchecked
    await act(async () => {
      cb!.click();
      await Promise.resolve();
    });
    expect(cb!.checked).toBe(false);
    expect(container.textContent).not.toMatch(/bear \$159/);
    expect(container.textContent).not.toContain('How Fair Value is calculated');
    expect(JSON.parse(localStorage.getItem('pmp:pricechart:indicators') ?? '[]')).not.toContain('fair');
  });

  it('shows honest gated note without falling back to stale earlier fair value', async () => {
    localStorage.clear();
    const fvCandles = fixtureCandles().map((c, i, arr) => ({
      ...c,
      fv: i >= 52 && i < arr.length - 2 ? 213 : null,
      fvBear: i >= 52 && i < arr.length - 2 ? 159 : null,
      fvBull: i >= 52 && i < arr.length - 2 ? 324 : null,
      fvMethod: i >= 52 && i < arr.length - 2 ? 'pe+dcf' : null,
    }));
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          candles: fvCandles,
          fairValue: { method: 'pe+dcf', asOf: '2025-09-26', gated: true },
          peStats,
          valuationStats,
          evNetDebt: 5e9,
        }),
      }),
    );

    const { container } = await renderChart();
    expect(container.textContent).toContain('Fair value hidden');
    expect(container.textContent).not.toMatch(/Fair \$213/);
  });

  it('shows gated note when live quote pushes ratio outside gate range even if last candle was inside gate', async () => {
    localStorage.clear();
    const fvCandles = fixtureCandles().map((c, i) => ({
      ...c,
      fv: i >= 52 ? 213 : null,
      fvBear: i >= 52 ? 159 : null,
      fvBull: i >= 52 ? 324 : null,
      fvMethod: i >= 52 ? 'pe+dcf' : null,
    }));
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          candles: fvCandles,
          fairValue: { method: 'pe+dcf', asOf: '2025-09-26' },
          peStats,
          valuationStats,
          evNetDebt: 5e9,
        }),
      }),
    );

    // Live quote collapses to $50 while fv is $213 (ratio 4.26 > 2.5 gate)
    const { container } = await renderChart({ currentPrice: 50 });
    expect(container.textContent).toContain('Fair value hidden');
    const calcBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes("How it's calculated"));
    expect(calcBtn).toBeTruthy();
    await act(async () => {
      calcBtn!.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Sanity gate active');
  });
});
