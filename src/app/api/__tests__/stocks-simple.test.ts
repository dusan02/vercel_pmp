// 1. Mockujeme závislosti na najvyššej úrovni.
// Tieto mocky sa aktivujú pre všetky testy v tomto súbore.
jest.mock('@/lib/utils/marketCapUtils');
jest.mock('@/lib/redis', () => {
  return {
    __esModule: true,
    __resetCache: jest.fn(),
    getCachedData: jest.fn().mockResolvedValue(null),
    setCachedData: jest.fn().mockResolvedValue(undefined),
    getCacheKey: jest.fn((project, ticker, type) => `test-cache-${project}-${ticker}-${type}`)
  };
});
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
            sector: 'Consumer Cyclical', 
            industry: 'Restaurants',
            logoUrl: '/logos/mcd-32.webp',
            sharesOutstanding: 500_000_000,
            latestPrevClose: 315.0,
            lastPrice: 320.0,
            lastChangePct: 1.58,
            lastMarketCap: 160_000_000_000,
            lastMarketCapDiff: 2_500_000_000,
            updatedAt: new Date()
          },
        ];
        
        // Filter by tickers if specified in where clause
        if (query?.where?.symbol?.in) {
          const requestedTickers = query.where.symbol.in;
          const filtered = allTickers.filter((t: any) => requestedTickers.includes(t.symbol));
          // Apply limit if specified
          if (query.take) {
            return Promise.resolve(filtered.slice(0, query.take));
          }
          return Promise.resolve(filtered);
        }
        
        // Apply limit if specified
        if (query?.take) {
          return Promise.resolve(allTickers.slice(0, query.take));
        }
        
        return Promise.resolve(allTickers);
      }),
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
      ]),
    },
  },
}));

import { NextRequest } from 'next/server';
import { getSharesOutstanding, getPreviousClose, getCurrentPrice } from '@/lib/utils/marketCapUtils';
import { __resetCache } from '@/lib/redis';

describe('/api/stocks - Robust Tests', () => {

  // Až tu, vnútri describe, importujeme naše mocky a typy, ktoré budeme potrebovať.
  // const { getSharesOutstanding, getPreviousClose, getCurrentPrice } = require('@/lib/marketCapUtils');
  // const { __resetCache } = require('@/lib/redis');

  // Helper funkcia pre dynamické nastavenie mockov pred každým testom
  const setupMocks = () => {
    // 2. Nastavíme implementácie pre každý test znova.
    // Toto je kľúčové, pretože `resetModules` ich vymaže.
    (getSharesOutstanding as jest.Mock).mockResolvedValue(1_000_000_000);
    (getPreviousClose as jest.Mock).mockImplementation((ticker: string) => {
        const prices: { [key: string]: number } = { NVDA: 780, MCD: 315 };
        return Promise.resolve(prices[ticker] || 145);
    });
    (getCurrentPrice as jest.Mock).mockImplementation((snapshotData: any) => snapshotData?.lastTrade?.p || null);

    // 3. Nastavíme mock pre fetch
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
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
                        sector: 'Technology', 
                        industry: 'Semiconductors' 
                    } 
                }),
            });
        }
        
        // Všetky ostatné volania
        return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  };

  beforeEach(() => {
    // 4. Toto sú dva najdôležitejšie príkazy pre izoláciu testov:
    jest.resetModules(); // Zmaže module cache
    setupMocks(); // Znovu nastaví všetky implementácie mockov
    __resetCache(); // Vyčistí našu vlastnú Redis cache
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