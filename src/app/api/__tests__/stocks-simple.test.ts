/** @jest-environment node */

import { jest } from '@jest/globals';

const getStocksListMock = jest.fn();
const getStocksDataMock = jest.fn();

jest.mock('@/services/stockService', () => ({
  getStocksList: (...args: unknown[]) => getStocksListMock(...args),
  getStocksData: (...args: unknown[]) => getStocksDataMock(...args),
}));

import { NextRequest } from 'next/server';
import { GET } from '../stocks/route';

const originalApiKey = process.env.POLYGON_API_KEY;

describe('/api/stocks - list, sort & error guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.POLYGON_API_KEY = 'test-polygon-key';
    getStocksListMock.mockResolvedValue({
      data: [
        { ticker: 'NVDA', currentPrice: 800, closePrice: 780, percentChange: 2.56, marketCap: 2000, marketCapDiff: 50 },
        { ticker: 'MCD', currentPrice: 320, closePrice: 315, percentChange: 1.58, marketCap: 230, marketCapDiff: 3.5 },
      ],
      errors: [],
    });
    getStocksDataMock.mockResolvedValue({
      data: [
        { ticker: 'NVDA', currentPrice: 800, closePrice: 780, percentChange: 2.56, marketCap: 2000, marketCapDiff: 50 },
      ],
      errors: [],
    });
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.POLYGON_API_KEY;
    } else {
      process.env.POLYGON_API_KEY = originalApiKey;
    }
  });

  it('returns sorted list for getAll=true and sanitizes invalid sort/order params', async () => {
    const request = new NextRequest('http://localhost:3000/api/stocks?getAll=true&sort=invalidSort&order=invalidOrder&limit=10&offset=5');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sort).toBe('marketCapDiff');
    expect(body.order).toBe('desc');
    expect(body.count).toBe(2);
    expect(getStocksListMock).toHaveBeenCalledWith({
      limit: 10,
      offset: 5,
      sort: 'marketCapDiff',
      order: 'desc',
    });
  });

  it('falls back to getStocksList when neither tickers nor getAll is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/stocks');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(getStocksListMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when POLYGON_API_KEY is missing on ticker-specific query', async () => {
    delete process.env.POLYGON_API_KEY;

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=NVDA');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Polygon API key not configured');
  });
});
