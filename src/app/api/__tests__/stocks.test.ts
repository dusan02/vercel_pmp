import { NextRequest } from 'next/server';
import { GET } from '../stocks/route';

// Mock the Redis cache functions
jest.mock('@/lib/redis', () => ({
  getCachedData: jest.fn(),
  setCachedData: jest.fn(),
  getCacheKey: jest.fn((ticker: string, project: string) => `${project}:${ticker}`)
}));

// Mock the market cap utilities
jest.mock('@/lib/marketCapUtils', () => ({
  getCurrentPrice: jest.fn((data: any) => data?.results?.value || 150.0),
  getPreviousClose: jest.fn(() => 145.0),
  getSharesOutstanding: jest.fn(() => 1000000000),
  computeMarketCap: jest.fn((price: number, shares: number) => price * shares),
  computeMarketCapDiff: jest.fn((current: number, previous: number, shares: number) => (current - previous) * shares),
  computePercentChange: jest.fn((current: number, previous: number) => ((current - previous) / previous) * 100)
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('/api/stocks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.POLYGON_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.POLYGON_API_KEY;
  });

  const mockPolygonResponse = {
    results: {
      ticker: 'AAPL',
      value: 150.0,
      last_quote: {
        bid: 149.5,
        ask: 150.5,
        timestamp: new Date().toISOString()
      }
    }
  };

  it('should return 400 when tickers parameter is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/stocks');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Tickers parameter is required');
  });

  it('should return 500 when Polygon API key is not configured', async () => {
    delete process.env.POLYGON_API_KEY;
    
    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=AAPL');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Polygon API key not configured');
  });

  it('should successfully fetch stock data from Polygon', async () => {
    // Mock successful Polygon API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPolygonResponse
    });

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=AAPL&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0]).toMatchObject({
      ticker: 'AAPL',
      currentPrice: 150.0,
      closePrice: 145.0,
      percentChange: expect.any(Number),
      marketCap: expect.any(Number),
      marketCapDiff: expect.any(Number),
      lastUpdated: expect.any(String)
    });
    expect(data.source).toBe('polygon');
    expect(data.project).toBe('pmp');
    expect(data.count).toBe(1);
    expect(data.timestamp).toBeDefined();
  });

  it('should apply limit parameter correctly', async () => {
    // Mock successful Polygon API response for multiple tickers
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPolygonResponse, results: { ...mockPolygonResponse.results, ticker: 'AAPL' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPolygonResponse, results: { ...mockPolygonResponse.results, ticker: 'MSFT' } })
      });

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=AAPL,MSFT,GOOGL&project=pmp&limit=2');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.count).toBe(2);
  });

  it('should handle Polygon API errors gracefully', async () => {
    // Mock failed Polygon API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      statusText: 'API Error'
    });

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=AAPL&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(0);
    expect(data.count).toBe(0);
  });

  it('should handle individual ticker errors without failing entire request', async () => {
    // Mock one successful and one failed response
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolygonResponse
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=AAPL,INVALID&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].ticker).toBe('AAPL');
    expect(data.count).toBe(1);
  });

  it('should use default project when not specified', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPolygonResponse
    });

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=AAPL');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.project).toBe('pmp');
  });

  it('should handle timeout errors', async () => {
    // Mock timeout error
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Timeout'));

    const request = new NextRequest('http://localhost:3000/api/stocks?tickers=AAPL&project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(0);
  });
}); 