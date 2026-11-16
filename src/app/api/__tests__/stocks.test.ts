/** @jest-environment node */

import { jest } from '@jest/globals';

jest.mock('@/lib/utils/marketCapUtils');
jest.mock('@/lib/utils/freshPrice', () => ({
  fetchLatestSessionPrices: jest.fn().mockResolvedValue(new Map()),
  sessionPriceOverrides: new Map(),
}));
jest.mock('@/lib/clients/polygonClient', () => ({
  getPolygonClient: () => ({
    fetchBatchSnapshot: jest.fn().mockResolvedValue([]),
    fetchTickerDetails: jest.fn().mockResolvedValue(null),
  }),
}));
jest.mock('@/lib/clients/finnhubClient', () => ({
  getFinnhubClient: () => ({
    fetchQuote: jest.fn().mockResolvedValue(null),
  }),
}));
jest.mock('@/lib/redis', () => ({
  __esModule: true,
  __resetCache: jest.fn(),
  getCachedData: jest.fn().mockResolvedValue(null),
  setCachedData: jest.fn().mockResolvedValue(undefined),
  getCacheKey: jest.fn((project: string, ticker: string, type: string) => `test-cache-${project}-${ticker}-${type}`),
}));

const defaultAllTickers = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp',
    sector: 'Technology',
    industry: 'Semiconductors',
    logoUrl: '/logos/nvda-32.webp',
    sharesOutstanding: 1_000_000_000,
    latestPrevClose: 780.0,
    latestPrevCloseDate: new Date(),
    lastPrice: 800.0,
    lastChangePct: 2.56,
    lastMarketCap: 800_000_000_000,
    lastMarketCapDiff: 20_000_000_000,
    updatedAt: new Date(),
  },
  {
    symbol: 'MCD',
    name: 'McDonalds',
    sector: 'Consumer Cyclical',
    industry: 'Restaurants',
    logoUrl: '/logos/mcd-32.webp',
    sharesOutstanding: 500_000_000,
    latestPrevClose: 315.0,
    latestPrevCloseDate: new Date(),
    lastPrice: 320.0,
    lastChangePct: 1.58,
    lastMarketCap: 160_000_000_000,
    lastMarketCapDiff: 2_500_000_000,
    updatedAt: new Date(),
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    logoUrl: '/logos/aapl-32.webp',
    sharesOutstanding: 2_000_000_000,
    latestPrevClose: 195.0,
    latestPrevCloseDate: new Date(),
    lastPrice: 200.0,
    lastChangePct: 2.56,
    lastMarketCap: 400_000_000_000,
    lastMarketCapDiff: 10_000_000_000,
    updatedAt: new Date(),
  },
];

function defaultTickerFindMany(query?: { where?: { symbol?: { in?: string[] } }; take?: number }) {
  if (query?.where?.symbol?.in) {
    const requestedTickers = query.where.symbol.in;
    const filtered = defaultAllTickers.filter((t) => requestedTickers.includes(t.symbol));
    return Promise.resolve(query.take ? filtered.slice(0, query.take) : filtered);
  }
  return Promise.resolve(query?.take ? defaultAllTickers.slice(0, query.take) : defaultAllTickers);
}

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    ticker: {
      findMany: jest.fn((query: any) => defaultTickerFindMany(query)),
      update: jest.fn().mockResolvedValue({}),
    },
    dailyRef: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    sessionPrice: {
      findMany: jest.fn().mockResolvedValue([
        { symbol: 'NVDA', lastPrice: 800.0, changePct: 2.56, lastTs: new Date() },
        { symbol: 'MCD', lastPrice: 320.0, changePct: 1.58, lastTs: new Date() },
        { symbol: 'AAPL', lastPrice: 200.0, changePct: 2.56, lastTs: new Date() },
      ]),
    },
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../stocks/route';
import { prisma } from '@/lib/db/prisma';
import * as marketCapUtils from '@/lib/utils/marketCapUtils';
import * as redis from '@/lib/redis';

const originalApiKey = process.env.POLYGON_API_KEY;

describe('/api/stocks', () => {
  beforeEach(() => {
    process.env.POLYGON_API_KEY = 'test-polygon-key';
    (prisma.ticker.findMany as jest.Mock).mockImplementation((query: any) => defaultTickerFindMany(query));
    (marketCapUtils.getSharesOutstanding as jest.Mock).mockResolvedValue(1_000_000_000);
    (marketCapUtils.getPreviousClose as jest.Mock).mockImplementation((ticker: unknown) => {
      const prices: Record<string, number> = { NVDA: 780, MCD: 315, AAPL: 195, MSFT: 395 };
      return Promise.resolve(prices[String(ticker)] || 145);
    });
    (marketCapUtils.getCurrentPrice as jest.Mock).mockImplementation((snapshotData: any) => snapshotData?.lastTrade?.p || null);
    (marketCapUtils.computeMarketCap as jest.Mock).mockImplementation((price: any, shares: any) => (Number(price) * Number(shares)) / 1_000_000_000);
    (marketCapUtils.computeMarketCapDiff as jest.Mock).mockImplementation(
      (price: any, prev: any, shares: any) => ((Number(price) - Number(prev)) * Number(shares)) / 1_000_000_000,
    );
    (marketCapUtils.computePercentChange as jest.Mock).mockImplementation(
      (price: any, prev: any) => ((Number(price) - Number(prev)) / Number(prev)) * 100,
    );
    (redis.getCachedData as jest.Mock).mockClear();
    (redis.setCachedData as jest.Mock).mockClear();
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.POLYGON_API_KEY;
    } else {
      process.env.POLYGON_API_KEY = originalApiKey;
    }
  });

  it('should return stock data for valid tickers', async () => {
    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0]).toMatchObject({
      ticker: 'NVDA',
      currentPrice: 800.0,
      closePrice: 780.0,
      percentChange: expect.any(Number),
      marketCap: expect.any(Number),
      marketCapDiff: expect.any(Number),
      lastUpdated: expect.any(String),
    });
    expect(data.source).toBe('database');
    expect(data.project).toBe('pmp');
    expect(data.count).toBe(1);
    expect(data.timestamp).toBeDefined();
  });

  it('should apply limit parameter correctly', async () => {
    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA,MCD,AAPL&project=pmp&limit=2');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.count).toBe(2);
    expect(data.data[0].ticker).toBe('NVDA');
    expect(data.data[1].ticker).toBe('MCD');
    expect(data.data[0].currentPrice).toBe(800.0);
    expect(data.data[1].currentPrice).toBe(320.0);
  });

  it('should handle missing tickers gracefully', async () => {
    (prisma.ticker.findMany as jest.Mock).mockResolvedValueOnce([]);

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=ERROR&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(0);
    expect(data.count).toBe(0);
  });

  it('should handle individual missing tickers without failing entire request', async () => {
    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA,FAKE&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].ticker).toBe('NVDA');
    expect(data.count).toBe(1);
  });

  it('should use default project when not specified', async () => {
    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.project).toBe('pmp');
    expect(data.data).toHaveLength(1);
    expect(data.data[0].ticker).toBe('NVDA');
  });

  it('should handle multiple valid tickers', async () => {
    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA,MCD&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.count).toBe(2);

    const nvdaData = data.data.find((item: any) => item.ticker === 'NVDA');
    const mcdData = data.data.find((item: any) => item.ticker === 'MCD');

    expect(nvdaData).toBeDefined();
    expect(mcdData).toBeDefined();
    expect(nvdaData.currentPrice).toBe(800.0);
    expect(mcdData.currentPrice).toBe(320.0);
  });
});
