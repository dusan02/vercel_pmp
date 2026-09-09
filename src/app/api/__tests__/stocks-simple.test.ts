import { jest } from '@jest/globals';

// 1. Mockujeme závislosti na najvyššej úrovni.
// Tieto mocky sa aktivujú pre všetky testy v tomto súbore.
jest.mock('@/lib/utils/marketCapUtils');
jest.mock('@/lib/redis', () => ({
    __esModule: true,
    __resetCache: jest.fn(),
    getCachedData: jest.fn().mockResolvedValue(null),
    setCachedData: jest.fn().mockResolvedValue(undefined),
    getCacheKey: jest.fn((project: string, ticker: string, type: string) => `test-cache-${project}-${ticker}-${type}`)
}));
import { NextRequest } from 'next/server';
import { getSharesOutstanding, getPreviousClose, getCurrentPrice } from '@/lib/utils/marketCapUtils';
import * as redis from '@/lib/redis';
import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    ticker: {
      findMany: jest.fn((query: any) => {
        const allTickers = [
          { 
            symbol: 'NVDA', 
            name: 'NVIDIA Corp', 
            sector: 'Technology', 
            industry: 'Semiconductors', 
            logoUrl: '/logos/nvda-32.webp',
            sharesOutstanding: 1_000_000_000,
            latestPrevClose: 780.0,
            lastPrice: 800.0,
            lastChangePct: 2.56,
            lastMarketCap: 800_000_000_000,
            lastMarketCapDiff: 20_000_000_000,
            updatedAt: new Date()
          },
          { 
            symbol: 'MCD', 
            name: 'McDonalds', 
            sector: 'Consumer Discretionary', 
            industry: 'Restaurants',
            logoUrl: '/logos/mcd-32.webp',
            sharesOutstanding: 500_000_000,
            latestPrevClose: 315.0,
            lastPrice: 320.0,
            lastChangePct: 1.58,
            lastMarketCap: 160_000_000_000,
            lastMarketCapDiff: 2_500_000_000,
            updatedAt: new Date()
          }
        ];
        
        if (query?.where?.symbol?.in) {
          const requestedTickers = query.where.symbol.in;
          return Promise.resolve(allTickers.filter((t: any) => requestedTickers.includes(t.symbol)));
        }
        return Promise.resolve(allTickers);
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    dailyRef: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    sessionPrice: {
      findMany: jest.fn().mockResolvedValue([]),
    }
  },
}));

describe('/api/stocks - Robust Tests', () => {

  // Až tu, vnútri describe, importujeme naše mocky a typy, ktoré budeme potrebovať.
  // const { getSharesOutstanding, getPreviousClose, getCurrentPrice } = require('@/lib/marketCapUtils');
  // const { __resetCache } = require('@/lib/redis');

  // Updated setup function that accepts mocked dependencies
  const setupMocksWithDeps = async (marketCapUtils: any) => {
    marketCapUtils.getSharesOutstanding.mockResolvedValue(1_000_000_000);
    marketCapUtils.getPreviousClose.mockImplementation((ticker: any) => {
        const prices: { [key: string]: number } = { NVDA: 780, MCD: 315 };
        return Promise.resolve(prices[ticker as string] || 145);
    });
    marketCapUtils.getCurrentPrice.mockImplementation((snapshotData: any) => snapshotData?.lastTrade?.p || null);

    // Nastavíme mock pre fetch
    (global.fetch as jest.Mock).mockImplementation((url: any) => {
        const ticker = url.split('tickers/')[1]?.split('?')[0] || 'UNKNOWN';
        const prices: { [key: string]: number } = { NVDA: 800, MCD: 320 };
        
        // Snapshot endpoint
        if (url.includes('/v2/snapshot/')) {
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    ticker,
                    lastTrade: { p: prices[ticker] || 150 },
                    min: { c: prices[ticker] || 150 },
                    day: { c: prices[ticker] || 150 },
                    prevDay: { c: (prices[ticker] || 150) - 5 }
                }),
            });
        }
        
        // Sector endpoint
        if (url.includes('/v3/reference/tickers/')) {
            return Promise.resolve({
                ok: true,
                json: async () => ({ 
                    results: { 
                        [ticker]: {
                            t: prices[ticker] || 150,
                            v: {
                                vw: prices[ticker] || 150
                            }
                        }
                    }
                }),
            });
        }
        
        // Všetky ostatné volania
        return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as jest.Mock;
  };

  beforeEach(async () => {
    // 4. Toto sú dva najdôležitejšie príkazy pre izoláciu testov:
    jest.resetModules(); // Zmaže module cache
    
    const marketCapUtils = await import('@/lib/utils/marketCapUtils');
    const redisMock = await import('@/lib/redis');
    
    await setupMocksWithDeps(marketCapUtils);
    
    // Clear redis mocks instead of resetCache
    (redisMock.getCachedData as jest.Mock).mockClear();
    (redisMock.setCachedData as jest.Mock).mockClear();
  });

  it('should return correct data for NVDA', async () => {
    // 5. Importujeme API route AŽ TU, vnútri testu.
    // Tým zabezpečíme, že sa načíta čerstvá, nem cachovaná verzia.
    const { GET } = await import('../stocks/route');
    
    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].ticker).toBe('NVDA');
    expect(data.data[0].currentPrice).toBe(800);
  });

  it('should return correct data for MCD', async () => {
    // A znova importujeme, aby sme dostali čerstvú verziu
    const { GET } = await import('../stocks/route');

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=MCD');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].ticker).toBe('MCD');
    expect(data.data[0].currentPrice).toBe(320);
  });

   it('should handle multiple tickers correctly', async () => {
    const { GET } = await import('../stocks/route');

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA,MCD');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(data.data[0].ticker).toBe('NVDA');
    expect(data.data[1].ticker).toBe('MCD');
  });

}); 