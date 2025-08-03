import { NextRequest } from 'next/server';
import { GET } from '../tickers/default/route';

// Mock the default tickers data
jest.mock('@/data/defaultTickers', () => ({
  getDefaultTickers: jest.fn(() => ['AAPL', 'MSFT', 'GOOGL', 'NVDA']),
  getProjectTickers: jest.fn((project: string, limit?: number) => {
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'META', 'AMZN', 'NFLX'];
    if (limit === undefined || limit === null) {
      return tickers;
    }
    // Handle negative or zero limits
    if (limit <= 0) {
      return [];
    }
    return tickers.slice(0, limit);
  })
}));

describe('/api/tickers/default', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return default tickers for PMP project', async () => {
    const request = new NextRequest('http://localhost:3000/api/tickers/default?project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'META', 'AMZN', 'NFLX']);
    expect(data.project).toBe('pmp');
    expect(data.count).toBe(8);
    expect(data.limit).toBeNull();
    expect(data.timestamp).toBeDefined();
  });

  it('should return default tickers for CM project', async () => {
    const request = new NextRequest('http://localhost:3000/api/tickers/default?project=cm');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'META', 'AMZN', 'NFLX']);
    expect(data.project).toBe('cm');
    expect(data.count).toBe(8);
  });

  it('should apply limit parameter correctly', async () => {
    const request = new NextRequest('http://localhost:3000/api/tickers/default?project=pmp&limit=3');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(['AAPL', 'MSFT', 'GOOGL']);
    expect(data.count).toBe(3);
    expect(data.limit).toBe(3);
  });

  it('should use PMP as default project when not specified', async () => {
    const request = new NextRequest('http://localhost:3000/api/tickers/default');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.project).toBe('pmp');
    expect(data.data).toEqual(['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'META', 'AMZN', 'NFLX']);
  });

  it('should handle invalid limit parameter gracefully', async () => {
    const request = new NextRequest('http://localhost:3000/api/tickers/default?project=pmp&limit=invalid');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.limit).toBeNull();
    expect(data.data).toEqual(['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'META', 'AMZN', 'NFLX']);
  });

  it('should handle negative limit parameter', async () => {
    const request = new NextRequest('http://localhost:3000/api/tickers/default?project=pmp&limit=-5');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.limit).toBe(-5);
    expect(data.data).toEqual([]);
    expect(data.count).toBe(0);
  });

  it('should handle zero limit parameter', async () => {
    const request = new NextRequest('http://localhost:3000/api/tickers/default?project=pmp&limit=0');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.limit).toBe(0);
    expect(data.data).toEqual([]);
    expect(data.count).toBe(0);
  });

  it('should return error response on internal error', async () => {
    // Mock the getProjectTickers to throw an error
    const { getProjectTickers } = require('@/data/defaultTickers');
    (getProjectTickers as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Database connection failed');
    });

    const request = new NextRequest('http://localhost:3000/api/tickers/default?project=pmp');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Internal server error');
    expect(data.details).toBe('Database connection failed');
    expect(data.timestamp).toBeDefined();
  });

  it('should handle all project types', async () => {
    const projects = ['pmp', 'cm', 'gl', 'cv'];
    
    for (const project of projects) {
      const request = new NextRequest(`http://localhost:3000/api/tickers/default?project=${project}`);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.project).toBe(project);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.count).toBeGreaterThan(0);
    }
  });
}); 