import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { StockData } from '@/lib/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/hooks/usePriceStream', () => ({
  usePriceStream: () => ({ connected: false }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    ticker: {
      findMany: jest.fn(),
    },
    dailyRef: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock('@/lib/utils/freshPrice', () => ({
  fetchLatestSessionPrices: jest.fn().mockResolvedValue(new Map()),
  sessionPriceOverrides: new Map(),
}));

import { useTickerAutocomplete, TickerSearchResult } from '@/hooks/useTickerAutocomplete';
import { useStockData } from '@/hooks/useStockData';
import { getStocksList } from '@/services/stockService';
import { prisma } from '@/lib/db/prisma';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

describe('P0 performance regressions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockReset();
    ((prisma.ticker.findMany as unknown) as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('useTickerAutocomplete returns instant local matches and merges debounced /api/stocks/search results', async () => {
    const allStocks: StockData[] = [
      {
        ticker: 'NU',
        companyName: 'Nu Holdings Ltd.',
        currentPrice: 14.5,
        closePrice: 14.0,
        percentChange: 3.57,
        marketCap: 70_000_000_000,
        marketCapDiff: 0,
      },
    ];

    let captured: { results: TickerSearchResult[]; isSearching: boolean } = {
      results: [],
      isSearching: false,
    };

    function Harness({ q }: { q: string }) {
      captured = useTickerAutocomplete(q, allStocks, { limit: 10, debounceMs: 150 });
      return null;
    }

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { symbol: 'NVDA', name: 'NVIDIA Corporation', lastPrice: 185.0, lastChangePct: 1.5 },
          { symbol: 'NU', name: 'Nu Holdings Ltd.', lastPrice: 14.2, lastChangePct: 1.2 },
        ],
      }),
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Harness, { q: 'n' }));
    });

    // Local hit appears synchronously before the 150ms remote debounce fires
    expect(captured.results.map((r) => r.ticker)).toEqual(['NU']);
    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(150);
      await flushMicrotasks();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/stocks/search?q=n',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    // Remote NVDA merged + deduplicated NU retaining live local price (14.5)
    expect(captured.results.map((r) => r.ticker)).toEqual(['NVDA', 'NU']);
    expect(captured.results.find((r) => r.ticker === 'NU')?.currentPrice).toBe(14.5);

    act(() => root.unmount());
  });

  it('useTickerAutocomplete prevents stale remote results from leaking across fast query updates', async () => {
    let captured: TickerSearchResult[] = [];
    function Harness({ q }: { q: string }) {
      captured = useTickerAutocomplete(q, [], { limit: 8, debounceMs: 150 }).results;
      return null;
    }

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('q=aa')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [{ symbol: 'AAPL', name: 'Apple Inc.', lastPrice: 220, lastChangePct: 0.5 }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: [{ symbol: 'MSFT', name: 'Microsoft', lastPrice: 410, lastChangePct: 0.8 }] }),
      });
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Harness, { q: 'aa' }));
    });
    await act(async () => {
      root.render(React.createElement(Harness, { q: 'ms' }));
    });
    await act(async () => {
      jest.advanceTimersByTime(150);
      await flushMicrotasks();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(captured.map((r) => r.ticker)).toEqual(['MSFT']);

    act(() => root.unmount());
  });

  it('useStockData with skipTop50 never schedules the 2s Phase 3 top50Stocks fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    let top50LoadingObserved = false;
    function Harness() {
      const { loadingStates } = useStockData({
        initialData: [],
        favorites: [],
        skipTop50: true,
      });
      if (loadingStates.top50Stocks) top50LoadingObserved = true;
      return null;
    }

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Harness));
      await flushMicrotasks();
    });

    await act(async () => {
      jest.advanceTimersByTime(35_000);
      await flushMicrotasks();
    });

    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('limit=50'))).toBe(false);
    expect(urls.some((u) => u.includes('/api/background/status'))).toBe(false);
    expect(top50LoadingObserved).toBe(false);

    act(() => root.unmount());
  });

  it('getStocksList uses a 7-day freshness cutoff so weekend getAll=true returns Friday close stocks', async () => {
    const fridayClose = new Date(Date.now() - 48 * 60 * 60 * 1000);
    ((prisma.ticker.findMany as unknown) as jest.Mock).mockResolvedValueOnce([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        sector: 'Technology',
        industry: 'Consumer Electronics',
        lastMarketCap: 3_400_000_000_000,
        lastPrice: 225.0,
        lastChangePct: 1.2,
        lastMarketCapDiff: 0,
        latestPrevClose: 222.3,
        updatedAt: fridayClose,
        lastPriceUpdated: fridayClose,
        lastVolume: 10_000_000,
        sharesOutstanding: 15_000_000_000,
      },
    ]);

    const beforeMs = Date.now();
    const res = await getStocksList({ limit: 50, getAll: true });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]?.ticker).toBe('AAPL');

    const callArg = ((prisma.ticker.findMany as unknown) as jest.Mock).mock.calls[0]?.[0];
    const cutoff = callArg?.where?.lastPriceUpdated?.gte as Date;
    expect(cutoff).toBeInstanceOf(Date);
    const windowHours = (beforeMs - cutoff.getTime()) / (60 * 60 * 1000);
    expect(windowHours).toBeGreaterThan(72); // Survived weekends + 3-day market holidays
  });
});
