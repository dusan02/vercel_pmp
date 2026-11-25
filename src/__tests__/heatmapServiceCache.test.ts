/**
 * Verifies heatmapService in-memory L1/fallback resilience when Redis
 * returns null/throws (e.g. MISCONF or restart), and getInitialHeatmapRows
 * timeout/error safety for SSR routes.
 */
const mockGetCachedData = jest.fn();
const mockSetCachedData = jest.fn();
const mockFetchTickers = jest.fn();

jest.mock('@/lib/redis/operations', () => ({
  getCachedData: (...args: unknown[]) => mockGetCachedData(...args),
  setCachedData: (...args: unknown[]) => mockSetCachedData(...args),
}));

jest.mock('@/lib/utils/timeUtils', () => ({
  detectSession: () => 'live',
  getLastTradingDay: (d: Date) => d,
}));

jest.mock('@/lib/utils/dateET', () => ({
  nowET: () => new Date('2026-11-24T10:00:00Z'),
  getDateET: () => '2026-11-24',
  createETDate: (s: string) => new Date(`${s}T05:00:00Z`),
  toET: () => ({ year: 2026, month: 11, day: 24 }),
}));

jest.mock('@/lib/heatmap/heatmapFetcher', () => ({
  fetchTickers: (...args: unknown[]) => mockFetchTickers(...args),
  fetchPriceData: jest.fn(),
  fetchCachedStockData: jest.fn(),
  fetchPrevCloseOnDemand: jest.fn(),
  fetchWeekRefCloses: jest.fn(),
  fetchLastSessionRefs: jest.fn(),
  fetchPerfRefCloses: jest.fn(),
  computeDateBoundaries: jest.fn(),
  deduplicateSessionPrices: jest.fn(),
  deduplicateDailyRefs: jest.fn(),
}));

import { getHeatmapData, getInitialHeatmapRows } from '@/lib/heatmap/heatmapService';
import type { HeatmapPayloadRow } from '@/lib/heatmap/heatmapTransformer';

function makePayloadRow(ticker: string, marketCap: number): HeatmapPayloadRow & { _timestamp: string } {
  return {
    ticker,
    companyName: `${ticker} Corp`,
    sector: 'Technology',
    industry: 'Software',
    marketCap,
    percentChange: 1.5,
    marketCapDiff: 10,
    currentPrice: 100,
    _timestamp: new Date().toISOString(),
  };
}

describe('heatmapService L1/fallback cache & SSR helper', () => {
  beforeEach(() => {
    mockGetCachedData.mockReset();
    mockSetCachedData.mockReset();
    mockFetchTickers.mockReset();
  });

  test('populates in-memory L1 cache from Redis and serves subsequent hits even if Redis fails', async () => {
    const samplePayload = [makePayloadRow('AAPL', 3500), makePayloadRow('MSFT', 3200)];
    mockGetCachedData.mockResolvedValueOnce({
      fetchedAt: Date.now(),
      data: samplePayload,
    });

    // 1. Cold L1 → reads from Redis, populates L1
    const first = await getHeatmapData({ limit: 1 });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.fromCache).toBe(true);
      expect(first.count).toBe(1);
      expect(first.rows[0]?.t).toBe('AAPL');
    }
    expect(mockGetCachedData).toHaveBeenCalledTimes(1);

    // 2. Redis goes down (throws/returns null) → L1 still serves immediately without DB rebuild
    mockGetCachedData.mockRejectedValue(new Error('MISCONF'));
    const second = await getHeatmapData({ limit: 2 });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.fromCache).toBe(true);
      expect(second.count).toBe(2);
      expect(second.rows.map((r) => r.t)).toEqual(['AAPL', 'MSFT']);
    }
    expect(mockFetchTickers).not.toHaveBeenCalled();
  });

  test('getInitialHeatmapRows returns full universe in slim SSR format and preserves pinned metric', async () => {
    jest.resetModules();
    const bigUniverse = Array.from({ length: 350 }, (_, idx) => ({
      ...makePayloadRow(`T${idx}`, 5000 - idx),
      peRatio: 25.123456,
      healthScore: 80,
    }));
    jest.doMock('@/lib/redis/operations', () => ({
      getCachedData: jest.fn().mockResolvedValue({
        fetchedAt: Date.now(),
        data: bigUniverse,
      }),
      setCachedData: jest.fn(),
    }));
    const { getInitialHeatmapRows: freshHelper } = await import('@/lib/heatmap/heatmapService');

    // Default (limit = null): returns ALL 350 rows (no 300-row truncation) with slim keys only
    const defaultRows = await freshHelper(null, 500);
    expect(defaultRows).toHaveLength(350);
    expect(defaultRows[0]).toEqual({
      t: 'T0',
      n: 'T0 Corp',
      s: 'Technology',
      i: 'Software',
      m: 5000,
      c: 1.5,
      d: 10,
      p: 100,
    });
    expect(defaultRows[0]).not.toHaveProperty('pe');
    expect(defaultRows[0]).not.toHaveProperty('hs');

    // Pinned metric (e.g. /heatmap/pe-ratio): includes rounded `pe` key while keeping row slim
    const peRows = await freshHelper(null, 500, 'pe');
    expect(peRows).toHaveLength(350);
    expect(peRows[0]?.pe).toBe(25.1235);
    expect(peRows[0]).not.toHaveProperty('hs');
  });

  test('getInitialHeatmapRows returns [] on timeout without throwing', async () => {
    jest.resetModules();
    jest.doMock('@/lib/redis/operations', () => ({
      getCachedData: () => new Promise(() => { /* never resolves */ }),
      setCachedData: jest.fn(),
    }));
    const { getInitialHeatmapRows: freshHelper } = await import('@/lib/heatmap/heatmapService');
    const rows = await freshHelper(300, 20);
    expect(rows).toEqual([]);
  });

  test('resets single-flight inflightRebuild if a rebuild hangs past timeout', async () => {
    jest.resetModules();
    jest.useFakeTimers();

    const hangFetchTickers = jest.fn(() => new Promise(() => { /* never resolves */ }));
    jest.doMock('@/lib/redis/operations', () => ({
      getCachedData: jest.fn().mockResolvedValue(null),
      setCachedData: jest.fn(),
    }));
    jest.doMock('@/lib/heatmap/heatmapFetcher', () => ({
      fetchTickers: hangFetchTickers,
      fetchPriceData: jest.fn(),
      fetchCachedStockData: jest.fn(),
      fetchPrevCloseOnDemand: jest.fn(),
      fetchWeekRefCloses: jest.fn(),
      fetchLastSessionRefs: jest.fn(),
      fetchPerfRefCloses: jest.fn(),
      computeDateBoundaries: jest.fn(),
      deduplicateSessionPrices: jest.fn(),
      deduplicateDailyRefs: jest.fn(),
    }));

    const { getHeatmapData: freshGetHeatmapData } = await import('@/lib/heatmap/heatmapService');
    const firstPromise = freshGetHeatmapData({ limit: 5 });

    // Advance past 30s rebuild timeout
    await jest.advanceTimersByTimeAsync(30_000);
    const firstRes = await firstPromise;
    expect(firstRes.ok).toBe(false);
    expect(hangFetchTickers).toHaveBeenCalledTimes(1);

    // Next call must start a fresh rebuild rather than awaiting the wedged promise
    const secondPromise = freshGetHeatmapData({ limit: 5 });
    await jest.advanceTimersByTimeAsync(30_000);
    await secondPromise;
    expect(hangFetchTickers).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
