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
        { 
          symbol: 'AAPL', 
          name: 'Apple Inc', 
          sector: 'Technology', 
          industry: 'Consumer Electronics',
          logoUrl: '/logos/aapl-32.webp',
          sharesOutstanding: 2_000_000_000,
          latestPrevClose: 195.0,
          lastPrice: 200.0,
          lastChangePct: 2.56,
          lastMarketCap: 400_000_000_000,
          lastMarketCapDiff: 10_000_000_000,
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
        { symbol: 'AAPL', lastPrice: 200.0, changePct: 2.56, lastTs: new Date() },
      ]),
    },
  },
}));

import { NextRequest } from 'next/server';
import { getSharesOutstanding, getPreviousClose, getCurrentPrice } from '@/lib/utils/marketCapUtils';
import { prisma } from '@/lib/db/prisma';

// Mock redis module for testing
jest.mock('@/lib/redis', () => {
  const actual = jest.requireActual('@/lib/redis');
  return {
    ...actual,
    __resetCache: jest.fn(() => {
      // Reset cache implementation for tests
    })
  };
});

// Import after mock
const { __resetCache } = require('@/lib/redis');

describe('/api/stocks', () => {

  // Až tu, vnútri describe, importujeme naše mocky a typy, ktoré budeme potrebovať.
  // const { getSharesOutstanding, getPreviousClose, getCurrentPrice } = require('@/lib/marketCapUtils');
  // const { __resetCache } = require('@/lib/redis');

  // Helper funkcia pre dynamické nastavenie mockov pred každým testom
  const setupMocks = () => {
    // 2. Nastavíme implementácie pre každý test znova.
    (getSharesOutstanding as jest.Mock).mockResolvedValue(1_000_000_000);
    (getPreviousClose as jest.Mock).mockImplementation((ticker: string) => {
        const prices: { [key: string]: number } = { NVDA: 780, MCD: 315, AAPL: 195, MSFT: 395 };
        return Promise.resolve(prices[ticker] || 145);
    });
    (getCurrentPrice as jest.Mock).mockImplementation((snapshotData: any) => snapshotData?.lastTrade?.p || null);
    
    // Mock computation functions
    const { computeMarketCap, computeMarketCapDiff, computePercentChange } = require('@/lib/utils/marketCapUtils');
    (computeMarketCap as jest.Mock).mockImplementation((price, shares) => price * shares);
    (computeMarketCapDiff as jest.Mock).mockImplementation((price, prev, shares) => (price - prev) * shares);
    (computePercentChange as jest.Mock).mockImplementation((price, prev) => ((price - prev) / prev) * 100);

    // 3. Nastavíme mock pre fetch
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
        const ticker = url.split('tickers/')[1]?.split('?')[0] || 'UNKNOWN';
        const prices: { [key: string]: number } = { NVDA: 800, MCD: 320, AAPL: 200, MSFT: 400 };
        
        // Snapshot endpoint
        if (url.includes('/v2/snapshot/')) {
            // Error cases
            if (ticker === 'ERROR') {
                return Promise.resolve({ ok: false, status: 401, statusText: 'Unauthorized' });
            }
            if (ticker === 'FAKE') {
                return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
            }
            
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
            const sectors = {
                'NVDA': { sector: 'Technology', industry: 'Semiconductors' },
                'MCD': { sector: 'Consumer Discretionary', industry: 'Restaurants' },
                'AAPL': { sector: 'Technology', industry: 'Consumer Electronics' },
                'MSFT': { sector: 'Technology', industry: 'Software' }
            };
            
            const sectorData = sectors[ticker as keyof typeof sectors] || { sector: 'Technology', industry: 'General' };
            
            return Promise.resolve({
                ok: true,
                json: async () => ({ results: sectorData }),
            });
        }
        
        // Všetky ostatné volania
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    });
  };

  beforeEach(() => {
    // 4. Toto sú dva najdôležitejšie príkazy pre izoláciu testov:
    jest.resetModules(); // Zmaže module cache
    setupMocks(); // Znovu nastaví všetky implementácie mockov
    __resetCache(); // Vyčistí našu vlastnú Redis cache
  });

  it('should return stock data for valid tickers', async () => {
    const { GET } = await import('../stocks/route');

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
      lastUpdated: expect.any(String)
    });
    expect(data.source).toBe('database');
    expect(data.project).toBe('pmp');
    expect(data.count).toBe(1);
    expect(data.timestamp).toBeDefined();
  });

  it('should apply limit parameter correctly', async () => {
    const { GET } = await import('../stocks/route');

    // Limit = 2, tickers = NVDA,MCD,AAPL
    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA,MCD,AAPL&project=pmp&limit=2');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2); // Limit should be applied
    expect(data.count).toBe(2);
    
    // Should get first 2 tickers in order
    expect(data.data[0].ticker).toBe('NVDA');
    expect(data.data[1].ticker).toBe('MCD');
    expect(data.data[0].currentPrice).toBe(800.0);
    expect(data.data[1].currentPrice).toBe(320.0);
  });

  it('should handle Polygon API errors gracefully', async () => {
    const { GET } = await import('../stocks/route');

    // Mock empty result for ERROR ticker
    const prismaMock = require('@/lib/db/prisma').prisma;
    prismaMock.ticker.findMany.mockResolvedValueOnce([]);

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=ERROR&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(0);
    // DB-first architecture returns empty array without warnings if ticker not found
    expect(data.count).toBe(0);
  });

  it('should handle individual ticker errors without failing entire request', async () => {
    const { GET } = await import('../stocks/route');

    // Mock result with only NVDA (FAKE not in DB)
    const prismaMock = require('@/lib/db/prisma').prisma;
    prismaMock.ticker.findMany.mockImplementationOnce((query: any) => {
      if (query?.where?.symbol?.in?.includes('FAKE')) {
        // Return only NVDA, not FAKE
        return Promise.resolve([
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
          }
        ]);
      }
      return Promise.resolve([]);
    });

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA,FAKE&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].ticker).toBe('NVDA');
    expect(data.count).toBe(1);
    // DB-first architecture: missing tickers are simply not returned, no warnings
  });

  it('should use default project when not specified', async () => {
    const { GET } = await import('../stocks/route');

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.project).toBe('pmp'); // Default project
    expect(data.data).toHaveLength(1);
    expect(data.data[0].ticker).toBe('NVDA');
  });

  it('should handle multiple valid tickers', async () => {
    const { GET } = await import('../stocks/route');

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA,MCD&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.count).toBe(2);
    
    // Check both tickers are returned with correct data
    const nvdaData = data.data.find((item: any) => item.ticker === 'NVDA');
    const mcdData = data.data.find((item: any) => item.ticker === 'MCD');
    
    expect(nvdaData).toBeDefined();
    expect(mcdData).toBeDefined();
    expect(nvdaData.currentPrice).toBe(800.0);
    expect(mcdData.currentPrice).toBe(320.0);
  });
}); 