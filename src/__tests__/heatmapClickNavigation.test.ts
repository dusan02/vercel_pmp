import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompanyNode, TreemapLeaf } from '@/lib/heatmap/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const prefetchMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    prefetch: prefetchMock,
    push: jest.fn(),
  }),
}));

jest.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ preferences: { theme: 'dark' } }),
}));

jest.mock('@/lib/utils/heatmapColors', () => ({
  getMetricNeutralPoint: () => 0,
}));

jest.mock('@/lib/analysis/newsService', () => ({
  getTickerNews: jest.fn(),
  isAboutTicker: () => true,
}));

import { CanvasHeatmap, findLeafAtCanvasPoint } from '@/components/CanvasHeatmap';
import { useAnalysisPrefetch } from '@/hooks/useAnalysisPrefetch';
import { prefetchTopNews, raceWithTimeout } from '@/lib/analysis/pageData';
import AnalysisTickerLoading from '@/app/analysis/[ticker]/loading';
import { getTickerNews } from '@/lib/analysis/newsService';

function makeLeaf(symbol: string, x0: number, y0: number, x1: number, y1: number): TreemapLeaf {
  const companyData: CompanyNode = {
    symbol,
    name: `${symbol} Inc.`,
    sector: 'Technology',
    industry: 'Semiconductors',
    marketCap: 1000,
    changePercent: 1.5,
    marketCapDiff: 15,
    marketCapDiffAbs: 15,
    currentPrice: 120,
  };
  return {
    x0,
    y0,
    x1,
    y1,
    data: {
      name: symbol,
      value: 1000,
      meta: { type: 'company', symbol, companyData },
    },
    children: undefined,
    parent: null,
    depth: 2,
    height: 0,
    value: 1000,
  } as unknown as TreemapLeaf;
}

describe('Heatmap to /analysis click speed & reliability', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    prefetchMock.mockReset();
    (getTickerNews as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('CanvasHeatmap handles instant click without prior mousemove hover', async () => {
    const leaves = [
      makeLeaf('NVDA', 0, 0, 100, 100),
      makeLeaf('AMD', 100, 0, 200, 100),
    ];

    expect(findLeafAtCanvasPoint(150, 50, leaves, 1, { x: 0, y: 0 })?.data.meta.symbol).toBe('AMD');
    expect(findLeafAtCanvasPoint(250, 50, leaves, 1, { x: 0, y: 0 })).toBeNull();

    // Stub minimal 2D context for jsdom canvas
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
      scale: jest.fn(),
      fillRect: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      arcTo: jest.fn(),
      closePath: jest.fn(),
      fill: jest.fn(),
      stroke: jest.fn(),
      measureText: () => ({ width: 20 }),
      strokeText: jest.fn(),
      fillText: jest.fn(),
    }) as unknown as typeof originalGetContext;

    const onTileClick = jest.fn();
    const onHover = jest.fn();
    const container = document.createElement('div');
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(CanvasHeatmap, {
            leaves,
            width: 200,
            height: 100,
            scale: 1,
            offset: { x: 0, y: 0 },
            metric: 'percent',
            timeframe: 'day',
            colorScale: () => '#16a34a',
            onTileClick,
            onHover,
          }),
        );
      });

      const canvas = container.querySelector('canvas')!;
      canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      // Instant click without any preceding mousemove must hit AMD immediately
      await act(async () => {
        canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 150, clientY: 50 }));
      });
      expect(onTileClick).toHaveBeenCalledTimes(1);
      expect(onTileClick.mock.calls[0][0].symbol).toBe('AMD');

      // Pointerdown warms hover/prefetch immediately before mouseup/click
      await act(async () => {
        canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50 }));
      });
      expect(onHover).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'NVDA' }), 50, 50);

      // Clicking outside tiles does not trigger navigation
      await act(async () => {
        canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 250, clientY: 50 }));
      });
      expect(onTileClick).toHaveBeenCalledTimes(1);

      act(() => root.unmount());
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test('useAnalysisPrefetch calls router.prefetch on hover, cancels on leave, and dedupes', async () => {
    let hoverFn: (target: CompanyNode | string | null) => void = () => {};

    function Harness() {
      hoverFn = useAnalysisPrefetch(80);
      return React.createElement('div');
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Harness));
    });

    // Cursor sweeps across AAPL and leaves within 40ms -> canceled
    act(() => {
      hoverFn('aapl');
      jest.advanceTimersByTime(40);
      hoverFn(null);
      jest.advanceTimersByTime(100);
    });
    expect(prefetchMock).not.toHaveBeenCalled();

    // Hover lingers >= 80ms -> calls router.prefetch once, dedupes repeats
    act(() => {
      hoverFn(makeLeaf('nvda', 0, 0, 10, 10).data.meta.companyData!);
      jest.advanceTimersByTime(85);
    });
    expect(prefetchMock).toHaveBeenCalledTimes(1);
    expect(prefetchMock).toHaveBeenCalledWith('/analysis/NVDA');

    act(() => {
      hoverFn('NVDA');
      jest.advanceTimersByTime(100);
    });
    expect(prefetchMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test('prefetchTopNews and raceWithTimeout return null within budget without stalling SSR', async () => {
    // Slow news call rejects after 2000ms -> SSR stops waiting at 350ms with no unhandled rejection
    (getTickerNews as jest.Mock).mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('late timeout')), 2000);
        }),
    );

    const p = prefetchTopNews('CEG', 'Constellation Energy');
    await act(async () => {
      jest.advanceTimersByTime(360);
    });
    await expect(p).resolves.toBeNull();

    // Let late rejection fire to ensure no unhandled rejection escapes
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // Fast resolution returns value cleanly
    await expect(raceWithTimeout(Promise.resolve('ok'), 350)).resolves.toBe('ok');
  });

  test('AnalysisTickerLoading renders instant skeleton shell', () => {
    const html = renderToStaticMarkup(React.createElement(AnalysisTickerLoading));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('animate-pulse');
  });
});
