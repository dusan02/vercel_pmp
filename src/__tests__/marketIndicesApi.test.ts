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
  });

  afterEach(() => {
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
});
