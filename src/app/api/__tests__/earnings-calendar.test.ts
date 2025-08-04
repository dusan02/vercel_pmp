import { NextRequest } from 'next/server';
import { GET } from '../earnings-calendar/route';

// Mock fetch globally
global.fetch = jest.fn();

describe('Earnings Calendar API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockRequest = (date?: string): NextRequest => {
    const url = date 
      ? `http://localhost:3000/api/earnings-calendar?date=${date}`
      : 'http://localhost:3000/api/earnings-calendar';
    return new NextRequest(url);
  };

  describe('Date validation', () => {
    it('should use current date when no date provided', async () => {
      const request = createMockRequest();
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.date).toBeDefined();
    });

    it('should accept valid date format', async () => {
      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
    });

    it('should reject invalid date format', async () => {
      const request = createMockRequest('2024/01/15');
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid date format');
    });
  });

  describe('API integration', () => {
    it('should fetch and process earnings data correctly', async () => {
      const mockPolygonResponse = {
        results: [
          {
            ticker: 'AAPL',
            company_name: 'Apple Inc.',
            market_cap: 3000000000000,
            fiscal_period: 'Q1 2024',
            report_date: '2024-01-15',
            report_time: 'AMC',
            estimate: {
              eps: 2.10,
              revenue: 120000000000
            },
            actual: {
              eps: 2.15,
              revenue: 125000000000
            }
          },
          {
            ticker: 'MSFT',
            company_name: 'Microsoft Corporation',
            market_cap: 2800000000000,
            fiscal_period: 'Q1 2024',
            report_date: '2024-01-15',
            report_time: 'BMO',
            estimate: {
              eps: 2.80,
              revenue: 55000000000
            },
            actual: null
          }
        ],
        status: 'OK'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolygonResponse
      });

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.preMarket).toHaveLength(1);
      expect(data.afterMarket).toHaveLength(1);
      expect(data.preMarket[0].ticker).toBe('MSFT');
      expect(data.afterMarket[0].ticker).toBe('AAPL');
    });

    it('should filter to tracked tickers only', async () => {
      const mockPolygonResponse = {
        results: [
          {
            ticker: 'AAPL', // Tracked
            company_name: 'Apple Inc.',
            market_cap: 3000000000000,
            fiscal_period: 'Q1 2024',
            report_date: '2024-01-15',
            report_time: 'AMC',
            estimate: { eps: 2.10, revenue: 120000000000 },
            actual: { eps: 2.15, revenue: 125000000000 }
          },
          {
            ticker: 'UNTRACKED', // Not tracked
            company_name: 'Untracked Company',
            market_cap: 1000000000,
            fiscal_period: 'Q1 2024',
            report_date: '2024-01-15',
            report_time: 'AMC',
            estimate: { eps: 1.00, revenue: 1000000000 },
            actual: { eps: 1.05, revenue: 1100000000 }
          }
        ],
        status: 'OK'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolygonResponse
      });

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.afterMarket).toHaveLength(1);
      expect(data.afterMarket[0].ticker).toBe('AAPL');
    });

    it('should handle empty results', async () => {
      const mockPolygonResponse = {
        results: [],
        status: 'OK'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolygonResponse
      });

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.preMarket).toHaveLength(0);
      expect(data.afterMarket).toHaveLength(0);
      expect(data.message).toContain('No earnings data available');
    });
  });

  describe('Error handling', () => {
    it('should handle API key errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain('API key invalid');
    });

    it('should handle rate limit errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429
      });

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toContain('API rate limit exceeded');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('Internal server error');
    });

    it('should handle timeout errors', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(500);
    });
  });

  describe('Data processing', () => {
    it('should correctly classify BMO vs AMC earnings', async () => {
      const mockPolygonResponse = {
        results: [
          {
            ticker: 'AAPL',
            company_name: 'Apple Inc.',
            market_cap: 3000000000000,
            fiscal_period: 'Q1 2024',
            report_date: '2024-01-15',
            report_time: 'BMO',
            estimate: { eps: 2.10, revenue: 120000000000 },
            actual: { eps: 2.15, revenue: 125000000000 }
          },
          {
            ticker: 'MSFT',
            company_name: 'Microsoft Corporation',
            market_cap: 2800000000000,
            fiscal_period: 'Q1 2024',
            report_date: '2024-01-15',
            report_time: 'AMC',
            estimate: { eps: 2.80, revenue: 55000000000 },
            actual: { eps: 2.85, revenue: 56000000000 }
          }
        ],
        status: 'OK'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolygonResponse
      });

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.preMarket).toHaveLength(1);
      expect(data.preMarket[0].reportTime).toBe('BMO');
      expect(data.afterMarket).toHaveLength(1);
      expect(data.afterMarket[0].reportTime).toBe('AMC');
    });

    it('should handle null estimates and actuals', async () => {
      const mockPolygonResponse = {
        results: [
          {
            ticker: 'AAPL',
            company_name: 'Apple Inc.',
            market_cap: 3000000000000,
            fiscal_period: 'Q1 2024',
            report_date: '2024-01-15',
            report_time: 'AMC',
            estimate: null,
            actual: null
          }
        ],
        status: 'OK'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolygonResponse
      });

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.afterMarket[0].epsEstimate).toBeNull();
      expect(data.afterMarket[0].epsActual).toBeNull();
      expect(data.afterMarket[0].revenueEstimate).toBeNull();
      expect(data.afterMarket[0].revenueActual).toBeNull();
    });
  });

  describe('Response format', () => {
    it('should return correct data structure', async () => {
      const mockPolygonResponse = {
        results: [
          {
            ticker: 'AAPL',
            company_name: 'Apple Inc.',
            market_cap: 3000000000000,
            fiscal_period: 'Q1 2024',
            report_date: '2024-01-15',
            report_time: 'AMC',
            estimate: { eps: 2.10, revenue: 120000000000 },
            actual: { eps: 2.15, revenue: 125000000000 }
          }
        ],
        status: 'OK'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolygonResponse
      });

      const request = createMockRequest('2024-01-15');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      // Check structure
      expect(data).toHaveProperty('date');
      expect(data).toHaveProperty('preMarket');
      expect(data).toHaveProperty('afterMarket');
      expect(Array.isArray(data.preMarket)).toBe(true);
      expect(Array.isArray(data.afterMarket)).toBe(true);
      
      // Check earnings row structure
      if (data.afterMarket.length > 0) {
        const row = data.afterMarket[0];
        expect(row).toHaveProperty('ticker');
        expect(row).toHaveProperty('companyName');
        expect(row).toHaveProperty('logo');
        expect(row).toHaveProperty('marketCap');
        expect(row).toHaveProperty('epsEstimate');
        expect(row).toHaveProperty('epsActual');
        expect(row).toHaveProperty('revenueEstimate');
        expect(row).toHaveProperty('revenueActual');
        expect(row).toHaveProperty('percentChange');
        expect(row).toHaveProperty('marketCapDiff');
        expect(row).toHaveProperty('reportTime');
        expect(row).toHaveProperty('fiscalPeriod');
        expect(row).toHaveProperty('reportDate');
      }
    });
  });
}); 