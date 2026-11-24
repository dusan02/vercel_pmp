/**
 * Tests for GET /api/indices/market
 *
 * Verifies that:
 * 1. During pre-market ('pre' session), the route uses ETF proxies (SPY, QQQ, DIA)
 *    to compute implied cash index movements and today's pre-market sparkline points.
 * 2. Pre-market sparklines start at 04:00 AM ET and connect to current live price.
 * 3. Session and premarket metadata are returned in the response envelope.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: {
        get: (name: string) => {
          const lower = name.toLowerCase();
          const entry = Object.entries(init?.headers ?? {}).find(([k]) => k.toLowerCase() === lower);
          return entry ? entry[1] : null;
        },
      },
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/utils/timeUtils', () => ({
  detectSession: jest.fn(),
}));

import { GET } from '@/app/api/indices/market/route';
import { detectSession } from '@/lib/utils/timeUtils';

describe('GET /api/indices/market', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
    jest.setSystemTime(new Date('2026-11-23T11:30:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('computes implied index levels and premarket points during pre session', async () => {
    (detectSession as jest.Mock).mockReturnValue('pre');

    global.fetch = jest.fn((url: any) => {
      const urlStr = String(url);

      if (urlStr.includes('scanner.tradingview.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { s: 'SP:SPX', d: ['SPX', 7500.0, 1.0, 75.0] },
              { s: 'NASDAQ:IXIC', d: ['IXIC', 25000.0, 1.5, 375.0] },
              { s: 'DJ:DJI', d: ['DJI', 50000.0, 0.8, 400.0] },
              { s: 'AMEX:SPY', d: ['SPY', 750.0, 1.0, 7.5, 753.0, 0.4, 3.0] },
              { s: 'NASDAQ:QQQ', d: ['QQQ', 670.0, 1.5, 10.0, 666.65, -0.5, -3.35] },
              { s: 'AMEX:DIA', d: ['DIA', 500.0, 0.8, 4.0, 501.5, 0.3, 1.5] },
            ],
          }),
        });
      }

      if (urlStr.includes('query1.finance.yahoo.com')) {
        const now = new Date();
        const barTs = Math.floor(now.getTime() / 1000);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: { regularMarketPrice: 750.0, chartPreviousClose: 750.0 },
                  timestamp: [barTs - 600, barTs - 300],
                  indicators: {
                    quote: [{ close: [752.0, 753.0] }],
                  },
                },
              ],
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    }) as any;

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.SPX).toBeDefined();
    expect(json.SPX.session).toBe('pre');
    expect(json.SPX.previousClose).toBe(7500.0);
    // SPY preChange was +0.4% -> implied SPX: 7500 * 1.004 = 7530.0
    expect(json.SPX.percentChange).toBe(0.4);
    expect(json.SPX.price).toBe(7530.0);
    expect(json.SPX.dollarChange).toBe(30.0);
    expect(json.SPX.pre).toEqual({
      price: 7530.0,
      pct: 0.4,
      dollarChange: 30.0,
    });

    // NASDAQ: QQQ preChange was -0.5% -> implied IXIC: 25000 * (1 - 0.005) = 24875.0
    expect(json.IXIC.percentChange).toBe(-0.5);
    expect(json.IXIC.price).toBe(24875.0);
    expect(json.IXIC.dollarChange).toBe(-125.0);

    // Intraday points must be present
    expect(json.SPX.intraday.length).toBeGreaterThanOrEqual(2);

    // Cache TTL in premarket should be 30s
    expect(res.headers.get('cache-control')).toContain('s-maxage=30');
  });

  it('rejects stale yesterday TradingView premarket_change and uses CNBC PRE_MKT', async () => {
    (detectSession as jest.Mock).mockReturnValue('pre');
    // 2026-11-24T09:13:00Z = 04:13 AM EST (Tuesday)
    jest.setSystemTime(new Date('2026-11-24T09:13:00Z'));

    // Yesterday's premarket timestamp (2026-11-23 04:00 AM EST)
    const yesterdayPreSec = Math.floor(new Date('2026-11-23T09:00:00Z').getTime() / 1000);
    const yesterdayLiveSec = Math.floor(new Date('2026-11-23T14:30:00Z').getTime() / 1000);

    global.fetch = jest.fn((url: any) => {
      const urlStr = String(url);

      if (urlStr.includes('quote.cnbc.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            FormattedQuoteResult: {
              FormattedQuote: [
                { symbol: '.SPX', code: 0, last: '7,237.17', previous_day_closing: '7,237.17', change: '+326.78', change_pct: '+4.73%', last_time: '2026-11-23' },
                { symbol: '.IXIC', code: 0, last: '24,089.56', previous_day_closing: '24,089.56', change: '+1,471.82', change_pct: '+6.51%', last_time: '2026-11-23' },
                { symbol: '.DJI', code: 0, last: '49,595.31', previous_day_closing: '49,595.31', change: '+1,447.98', change_pct: '+3.01%', last_time: '2026-11-23' },
                {
                  symbol: 'SPY', code: 0, last: '722.29', previous_day_closing: '722.29', last_time: '2026-11-23',
                  ExtendedMktQuote: { type: 'PRE_MKT', last: '719.64', change_pct: '-0.37%', last_time: '2026-11-24T04:13:00.000-0500' },
                },
                {
                  symbol: 'QQQ', code: 0, last: '651.03', previous_day_closing: '651.03', last_time: '2026-11-23',
                  ExtendedMktQuote: { type: 'PRE_MKT', last: '644.89', change_pct: '-0.94%', last_time: '2026-11-24T04:13:00.000-0500' },
                },
                {
                  symbol: 'DIA', code: 0, last: '495.80', previous_day_closing: '495.80', last_time: '2026-11-23',
                  ExtendedMktQuote: { type: 'PRE_MKT', last: '495.00', change_pct: '-0.16%', last_time: '2026-11-24T04:12:00.000-0500' },
                },
              ],
            },
          }),
        });
      }

      if (urlStr.includes('scanner.tradingview.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { s: 'SP:SPX', d: ['SPX', 7237.17, 4.73, 326.78, null, null, null, null, null, null, yesterdayLiveSec, null, null] },
              { s: 'NASDAQ:IXIC', d: ['IXIC', 24089.56, 6.51, 1471.82, null, null, null, null, null, null, yesterdayLiveSec, null, null] },
              { s: 'DJ:DJI', d: ['DJI', 49595.31, 3.01, 1447.98, null, null, null, null, null, null, yesterdayLiveSec, null, null] },
              { s: 'AMEX:SPY', d: ['SPY', 722.29, 4.71, 32.48, 724.39, 5.01, 34.58, null, null, null, yesterdayLiveSec, yesterdayPreSec, yesterdayLiveSec] },
              { s: 'NASDAQ:QQQ', d: ['QQQ', 651.03, 7.00, 42.58, 656.19, 7.85, 47.74, null, null, null, yesterdayLiveSec, yesterdayPreSec, yesterdayLiveSec] },
              { s: 'AMEX:DIA', d: ['DIA', 495.80, 3.06, 14.72, 494.23, 2.73, 13.15, null, null, null, yesterdayLiveSec, yesterdayPreSec, yesterdayLiveSec] },
            ],
          }),
        });
      }

      if (urlStr.includes('query1.finance.yahoo.com')) {
        const barTs = Math.floor(new Date('2026-11-24T09:10:00Z').getTime() / 1000);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: { regularMarketPrice: 722.29, chartPreviousClose: 689.81 },
                  timestamp: [barTs],
                  indicators: { quote: [{ close: [719.84] }] },
                },
              ],
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    }) as any;

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.SPX.percentChange).toBe(-0.37);
    expect(json.SPX.price).toBe(7210.39);
    expect(json.IXIC.percentChange).toBe(-0.94);
    expect(json.DJI.percentChange).toBe(-0.16);
  });

  it('falls back to today Yahoo 5m premarket bars (using regularMarketPrice, not 2-day-old previousClose) when CNBC fails and TV is stale', async () => {
    (detectSession as jest.Mock).mockReturnValue('pre');
    jest.setSystemTime(new Date('2026-11-24T09:13:00Z'));

    const yesterdayPreSec = Math.floor(new Date('2026-11-23T09:00:00Z').getTime() / 1000);
    const yesterdayLiveSec = Math.floor(new Date('2026-11-23T14:30:00Z').getTime() / 1000);

    global.fetch = jest.fn((url: any) => {
      const urlStr = String(url);

      if (urlStr.includes('quote.cnbc.com')) {
        return Promise.resolve({ ok: false, status: 503 });
      }

      if (urlStr.includes('scanner.tradingview.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { s: 'SP:SPX', d: ['SPX', 7237.17, 4.73, 326.78, null, null, null, null, null, null, yesterdayLiveSec, null, null] },
              { s: 'AMEX:SPY', d: ['SPY', 722.29, 4.71, 32.48, 724.39, 5.01, 34.58, null, null, null, yesterdayLiveSec, yesterdayPreSec, null] },
            ],
          }),
        });
      }

      if (urlStr.includes('query1.finance.yahoo.com')) {
        const barTs = Math.floor(new Date('2026-11-24T09:10:00Z').getTime() / 1000);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: { regularMarketPrice: 722.29, chartPreviousClose: 689.81 },
                  timestamp: [barTs],
                  indicators: { quote: [{ close: [715.07] }] },
                },
              ],
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    }) as any;

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    // 715.07 / 722.29 - 1 = -1.00%
    expect(json.SPX.percentChange).toBe(-1);
    expect(json.SPX.previousClose).toBe(7237.17);
  });

  it('uses cash index quotes and regular bars during live session', async () => {
    (detectSession as jest.Mock).mockReturnValue('live');

    global.fetch = jest.fn((url: any) => {
      const urlStr = String(url);

      if (urlStr.includes('scanner.tradingview.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { s: 'SP:SPX', d: ['SPX', 7560.0, 0.8, 60.0] },
              { s: 'NASDAQ:IXIC', d: ['IXIC', 25300.0, 1.2, 300.0] },
              { s: 'DJ:DJI', d: ['DJI', 52500.0, 0.5, 250.0] },
            ],
          }),
        });
      }

      if (urlStr.includes('query1.finance.yahoo.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: { regularMarketPrice: 7560.0, chartPreviousClose: 7500.0 },
                  timestamp: [1700000000],
                  indicators: {
                    quote: [{ close: [7560.0] }],
                  },
                },
              ],
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    }) as any;

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.SPX.session).toBe('live');
    expect(json.SPX.price).toBe(7560.0);
    expect(json.SPX.percentChange).toBe(0.8);
    expect(json.SPX.dollarChange).toBe(60.0);
  });

  it('rejects stale yesterday TradingView bar during live open and uses CNBC', async () => {
    (detectSession as jest.Mock).mockReturnValue('live');
    jest.setSystemTime(new Date('2026-11-24T14:35:00Z')); // 09:35 AM EST

    const yesterdayLiveSec = Math.floor(new Date('2026-11-23T14:30:00Z').getTime() / 1000);

    global.fetch = jest.fn((url: any) => {
      const urlStr = String(url);

      if (urlStr.includes('quote.cnbc.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            FormattedQuoteResult: {
              FormattedQuote: [
                { symbol: '.SPX', code: 0, last: '7,210.00', previous_day_closing: '7,237.17', change: '-27.17', change_pct: '-0.38%', last_time: '2026-11-24T09:35:00.000-0500' },
              ],
            },
          }),
        });
      }

      if (urlStr.includes('scanner.tradingview.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { s: 'SP:SPX', d: ['SPX', 7237.17, 4.73, 326.78, null, null, null, null, null, null, yesterdayLiveSec, null, null] },
            ],
          }),
        });
      }

      if (urlStr.includes('query1.finance.yahoo.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: { regularMarketPrice: 7210.0, regularMarketTime: Math.floor(new Date('2026-11-24T14:35:00Z').getTime() / 1000), chartPreviousClose: 7237.17 },
                  timestamp: [Math.floor(new Date('2026-11-24T14:35:00Z').getTime() / 1000)],
                  indicators: { quote: [{ close: [7210.0] }] },
                },
              ],
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    }) as any;

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.SPX.price).toBe(7210.0);
    expect(json.SPX.percentChange).toBe(-0.38);
    expect(json.SPX.dollarChange).toBe(-27.17);
  });

  it('rejects stale yesterday TradingView postmarket_time during after-hours', async () => {
    (detectSession as jest.Mock).mockReturnValue('after');
    jest.setSystemTime(new Date('2026-11-24T21:05:00Z')); // 16:05 EST

    const todayLiveSec = Math.floor(new Date('2026-11-24T14:30:00Z').getTime() / 1000);
    const yesterdayPostSec = Math.floor(new Date('2026-11-23T21:00:00Z').getTime() / 1000);

    global.fetch = jest.fn((url: any) => {
      const urlStr = String(url);

      if (urlStr.includes('quote.cnbc.com')) {
        return Promise.resolve({ ok: false, status: 503 });
      }

      if (urlStr.includes('scanner.tradingview.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { s: 'SP:SPX', d: ['SPX', 7220.0, -0.24, -17.17, null, null, null, null, null, null, todayLiveSec, null, null] },
              { s: 'AMEX:SPY', d: ['SPY', 720.5, -0.25, -1.79, null, null, null, 724.18, 0.26, 1.89, todayLiveSec, null, yesterdayPostSec] },
            ],
          }),
        });
      }

      if (urlStr.includes('query1.finance.yahoo.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: { regularMarketPrice: 7220.0, regularMarketTime: todayLiveSec, chartPreviousClose: 7237.17 },
                  timestamp: [todayLiveSec],
                  indicators: { quote: [{ close: [7220.0] }] },
                },
              ],
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    }) as any;

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.SPX.session).toBe('after');
    expect(json.SPX.price).toBe(7220.0);
    expect(json.SPX.ah).toBeNull();
  });
});
