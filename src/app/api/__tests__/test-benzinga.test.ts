import { GET } from '../test-benzinga/route';
import { NextRequest } from 'next/server';

// Mock fetch globally
global.fetch = jest.fn();

describe('Benzinga API Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    delete process.env.POLYGON_API_KEY;
  });

  it('should return error when API key is not configured', async () => {
    const request = new NextRequest('http://localhost:3000/api/test-benzinga');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(500);
    expect(data.error).toBe('POLYGON_API_KEY not configured');
  });

  it('should test API with valid key', async () => {
    // Mock API key
    process.env.POLYGON_API_KEY = 'test-api-key';
    
    // Mock successful API responses
    const mockTodayData = {
      status: 'OK',
      request_id: 'test-123',
      results: [
        {
          ticker: 'AAPL',
          company_name: 'Apple Inc.',
          date: '2024-01-15',
          time: '16:30:00',
          estimated_eps: 2.10,
          actual_eps: 2.15,
          eps_surprise_percent: 2.38,
          fiscal_period: 'Q1',
          fiscal_year: 2024,
          importance: 5
        }
      ]
    };

    const mockTomorrowData = {
      status: 'OK',
      request_id: 'test-456',
      results: []
    };

    const mockAaplData = {
      status: 'OK',
      request_id: 'test-789',
      results: [
        {
          ticker: 'AAPL',
          company_name: 'Apple Inc.',
          date: '2024-01-15',
          estimated_eps: 2.10,
          fiscal_period: 'Q1',
          fiscal_year: 2024
        }
      ]
    };

    // Mock fetch responses
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockTodayData)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockTomorrowData)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockAaplData)
      });

    const request = new NextRequest('http://localhost:3000/api/test-benzinga');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.api_key_configured).toBe(true);
    expect(data.summary.total_tests).toBe(3);
    expect(data.summary.successful_tests).toBe(3);
    expect(data.summary.api_working).toBe(true);
    
    // Check test results
    expect(data.tests.today.success).toBe(true);
    expect(data.tests.today.results_count).toBe(1);
    expect(data.tests.today.sample_data[0].ticker).toBe('AAPL');
    
    expect(data.tests.tomorrow.success).toBe(true);
    expect(data.tests.tomorrow.results_count).toBe(0);
    
    expect(data.tests.aapl.success).toBe(true);
    expect(data.tests.aapl.results_count).toBe(1);
  });

  it('should handle API errors gracefully', async () => {
    process.env.POLYGON_API_KEY = 'test-api-key';
    
    // Mock API error response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized - Invalid API key')
    });

    const request = new NextRequest('http://localhost:3000/api/test-benzinga');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(401);
    expect(data.error).toContain('API Error: 401');
    expect(data.details).toContain('Unauthorized');
  });

  it('should handle network errors', async () => {
    process.env.POLYGON_API_KEY = 'test-api-key';
    
    // Mock network error
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const request = new NextRequest('http://localhost:3000/api/test-benzinga');
    
    const response = await GET(request);
    const data = await response.json();
    
    expect(response.status).toBe(500);
    expect(data.error).toBe('Test failed');
    expect(data.details).toContain('Network error');
  });
}); 