/**
 * Earnings architecture regression tests (post 2026-10-09 cleanup).
 *
 * Verifies:
 *   1. Time vocabulary normalization (`classifyEarningsTime` and `earningsSSR`):
 *      `bmo`/`before` -> preMarket, `amc`/`after` -> afterMarket, and
 *      `dmh`/`dmt` (during market hours) + `tbd` -> timeTbd (NEVER afterMarket).
 *   2. `getEarningsRange` & `getEarningsWeekMap` batch enrichment from DB
 *      (Ticker, DailyValuationHistory, AnalysisCache, EwScoreSnapshot, DailyRef)
 *      and earnings-day reaction matching (same-day DailyRef for BMO, next
 *      trading session DailyRef for AMC).
 */

const findManyCalendar = jest.fn();
const findManyTicker = jest.fn();
const findManyDvh = jest.fn();
const findManyCache = jest.fn();
const findManyEw = jest.fn();
const findManyDailyRef = jest.fn();
const findManyFhMetrics = jest.fn();
const findManyFhRec = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    earningsCalendar: { findMany: (...args: unknown[]) => findManyCalendar(...args) },
    ticker: { findMany: (...args: unknown[]) => findManyTicker(...args) },
    dailyValuationHistory: { findMany: (...args: unknown[]) => findManyDvh(...args) },
    analysisCache: { findMany: (...args: unknown[]) => findManyCache(...args) },
    ewScoreSnapshot: { findMany: (...args: unknown[]) => findManyEw(...args) },
    dailyRef: { findMany: (...args: unknown[]) => findManyDailyRef(...args) },
    finnhubMetrics: { findMany: (...args: unknown[]) => findManyFhMetrics(...args) },
    finnhubRecommendation: { findMany: (...args: unknown[]) => findManyFhRec(...args) },
  },
}));

jest.mock('@/lib/redis/operations', () => ({
  getCachedData: jest.fn().mockResolvedValue(null),
  setCachedData: jest.fn().mockResolvedValue(true),
}));

import { classifyEarningsTime } from '@/lib/utils/earningsTime';
import { getEarningsRange, getEarningsWeekMap } from '@/lib/seo/earningsSSR';

describe('Earnings architecture — time vocab & SSR batch enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findManyTicker.mockResolvedValue([]);
    findManyDvh.mockResolvedValue([]);
    findManyCache.mockResolvedValue([]);
    findManyEw.mockResolvedValue([]);
    findManyDailyRef.mockResolvedValue([]);
    findManyFhMetrics.mockResolvedValue([]);
    findManyFhRec.mockResolvedValue([]);
  });

  test('classifyEarningsTime buckets dmh/dmt into timeTbd and never afterMarket', () => {
    expect(classifyEarningsTime('bmo')).toBe('preMarket');
    expect(classifyEarningsTime('before')).toBe('preMarket');
    expect(classifyEarningsTime('amc')).toBe('afterMarket');
    expect(classifyEarningsTime('after')).toBe('afterMarket');
    expect(classifyEarningsTime('dmh')).toBe('timeTbd');
    expect(classifyEarningsTime('dmt')).toBe('timeTbd');
    expect(classifyEarningsTime('tbd')).toBe('timeTbd');
    expect(classifyEarningsTime(null)).toBe('timeTbd');
    expect(classifyEarningsTime(undefined)).toBe('timeTbd');
  });

  test('getEarningsRange normalizes bmo/amc/dmh/dmt/tbd and computes BMO vs AMC reaction move', async () => {
    findManyCalendar.mockResolvedValueOnce([
      {
        ticker: 'UNH',
        companyName: 'UNH',
        date: new Date('2026-10-15T00:00:00Z'),
        time: 'bmo',
        epsEstimate: 6.5,
        epsActual: 7.0,
        revenueEstimate: 100e9,
        revenueActual: 102e9,
        epsSurprisePercent: 7.69,
        revenueSurprisePercent: 2.0,
        marketCap: null,
        percentChange: null,
      },
      {
        ticker: 'NFLX',
        companyName: 'NFLX',
        date: new Date('2026-10-15T00:00:00Z'),
        time: 'amc',
        epsEstimate: 5.1,
        epsActual: 5.4,
        revenueEstimate: 9.8e9,
        revenueActual: 9.9e9,
        epsSurprisePercent: 5.88,
        revenueSurprisePercent: 1.02,
        marketCap: null,
        percentChange: null,
      },
      {
        ticker: 'ASML',
        companyName: 'ASML Holding',
        date: new Date('2026-10-15T00:00:00Z'),
        time: 'dmt',
        epsEstimate: 4.9,
        epsActual: null,
        revenueEstimate: null,
        revenueActual: null,
        epsSurprisePercent: null,
        revenueSurprisePercent: null,
        marketCap: null,
        percentChange: null,
      },
    ]);

    findManyTicker.mockResolvedValueOnce([
      {
        symbol: 'UNH',
        name: 'UnitedHealth Group',
        sector: 'Healthcare',
        stdDevReturn20d: 1.8,
        lastPrice: 550,
        lastChangePct: 1.2,
        lastMarketCap: 500,
        lastMarketCapDiff: 6.0,
        moversReason: null,
        moversCategory: null,
        latestMoversRVOL: 1.4,
      },
      {
        symbol: 'NFLX',
        name: 'Netflix Inc.',
        sector: 'Communication Services',
        stdDevReturn20d: 2.2,
        lastPrice: 770,
        lastChangePct: -0.5,
        lastMarketCap: 330,
        lastMarketCapDiff: -1.65,
        moversReason: null,
        moversCategory: null,
        latestMoversRVOL: 2.1,
      },
      {
        symbol: 'ASML',
        name: 'ASML Holding N.V.',
        sector: 'Technology',
        stdDevReturn20d: 2.5,
        lastPrice: 700,
        lastChangePct: 0.8,
        lastMarketCap: 280,
        lastMarketCapDiff: 2.2,
        moversReason: null,
        moversCategory: null,
        latestMoversRVOL: 1.1,
      },
    ]);

    // DailyRef: Oct 15 (report day) and Oct 16 (next trading day)
    findManyDailyRef.mockResolvedValueOnce([
      {
        symbol: 'UNH',
        date: new Date('2026-10-15T04:00:00Z'),
        previousClose: 500,
        regularClose: 525, // +5% on report day (BMO)
      },
      {
        symbol: 'NFLX',
        date: new Date('2026-10-15T04:00:00Z'),
        previousClose: 700,
        regularClose: 700,
      },
      {
        symbol: 'NFLX',
        date: new Date('2026-10-16T04:00:00Z'),
        previousClose: 700,
        regularClose: 770, // +10% on NEXT session (AMC)
      },
    ]);

    const groups = await getEarningsRange('2026-10-15', '2026-10-15', { enrich: true });
    expect(groups).toHaveLength(1);
    const day = groups[0]!;

    expect(day.preMarket.map((r) => r.ticker)).toEqual(['UNH']);
    expect(day.afterMarket.map((r) => r.ticker)).toEqual(['NFLX']);
    // dmt must land in timeTbd, never afterMarket
    expect(day.timeTbd.map((r) => r.ticker)).toEqual(['ASML']);

    // BMO uses same-day move (+5%), AMC uses next-session move (+10%)
    expect(day.preMarket[0]!.companyName).toBe('UnitedHealth Group');
    expect(day.preMarket[0]!.earningsDayMovePct).toBeCloseTo(5.0, 2);
    expect(day.afterMarket[0]!.earningsDayMovePct).toBeCloseTo(10.0, 2);
  });

  test('getEarningsWeekMap returns all 7 days with normalized buckets', async () => {
    findManyCalendar.mockResolvedValueOnce([
      {
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        date: new Date('2026-10-14T00:00:00Z'),
        time: 'dmh',
        epsEstimate: 1.6,
        epsActual: null,
        revenueEstimate: null,
        revenueActual: null,
        epsSurprisePercent: null,
        revenueSurprisePercent: null,
        marketCap: 3500e9,
        percentChange: null,
      },
    ]);

    const weekMap = await getEarningsWeekMap('2026-10-12');
    expect(Object.keys(weekMap)).toHaveLength(7);
    expect(weekMap['2026-10-14']?.timeTbd.map((r) => r.ticker)).toEqual(['AAPL']);
    expect(weekMap['2026-10-14']?.afterMarket).toEqual([]);
  });
});
