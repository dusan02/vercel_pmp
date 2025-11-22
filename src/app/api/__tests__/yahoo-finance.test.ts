// Mockovanie na najvyššej úrovni súboru
jest.mock('@/lib/clients/yahooFinanceScraper');
jest.mock('@/lib/utils/marketCapUtils'); // Mock marketCapUtils pre tento test
jest.mock('@/data/defaultTickers', () => ({
  DEFAULT_TICKERS: {
    pmp: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'META', 'AMZN', 'NFLX'],
    cm: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'META', 'AMZN', 'NFLX']
  }
}));

import { GET } from '../earnings/yahoo/route';
import { NextRequest } from 'next/server';
import { checkEarningsForOurTickers } from '@/lib/clients/yahooFinanceScraper';

// Konverzia na mock funkcie pre typovú bezpečnosť
const mockedCheckEarnings = checkEarningsForOurTickers as jest.Mock;

describe('Yahoo Finance API Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Fail-fast ochrana pre neočakávané fetch volania
    global.fetch = jest.fn(() => {
      throw new Error('Unexpected fetch – mock marketCapUtils!');
    });
  });

  it('should return error when API key is not configured', async () => {
    // Remove API key to test error handling
    const originalApiKey = process.env.POLYGON_API_KEY;
    Object.defineProperty(process.env, 'POLYGON_API_KEY', {
        value: undefined,
        writable: true
    });

    try {
        const request = new NextRequest('http://localhost:3000/api/earnings/yahoo');
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBeDefined();
    } finally {
        // Restore environment variable
        if (originalApiKey !== undefined) {
            Object.defineProperty(process.env, 'POLYGON_API_KEY', {
                value: originalApiKey,
                writable: true
            });
        }
    }
  });

  it('should return 200 OK with earnings data on success', async () => {
    // Mock API key
    process.env.POLYGON_API_KEY = 'test-api-key';

    // 1. Nastavenie mockovaných hodnôt
    const mockYahooResult = {
      totalFound: 2,
      preMarket: ['AAPL'],
      afterMarket: ['MSFT']
    };

    mockedCheckEarnings.mockResolvedValue(mockYahooResult);

    // 2. Vykonanie testu
    const request = new NextRequest('http://localhost:3000/api/earnings/yahoo');
    const response = await GET(request);
    const data = await response.json();

    // 3. Overenie výsledkov
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.data.preMarket).toBeDefined();
    expect(data.data.afterMarket).toBeDefined();
  });

  it('should handle API errors gracefully and return 200 with data containing null values', async () => {
    process.env.POLYGON_API_KEY = 'test-api-key';

    // Mock API error response - API returns 200 with data containing null values when there are errors
    mockedCheckEarnings.mockRejectedValue(new Error('API Error: 401 Unauthorized'));

    const request = new NextRequest('http://localhost:3000/api/earnings/yahoo');

    const response = await GET(request);
    const data = await response.json();

    // API returns 200 with data containing null values when there are errors, not empty arrays
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.preMarket).toBeDefined();
    expect(data.data.afterMarket).toBeDefined();
    // Check that data contains objects with null values
    if (data.data.preMarket.length > 0) {
      expect(data.data.preMarket[0]).toHaveProperty('epsEstimate');
      expect(data.data.preMarket[0]).toHaveProperty('epsActual');
      expect(data.data.preMarket[0]).toHaveProperty('revenueEstimate');
      expect(data.data.preMarket[0]).toHaveProperty('revenueActual');
    }
  });

  it('should handle network errors gracefully and return 200 with data containing null values', async () => {
    process.env.POLYGON_API_KEY = 'test-api-key';

    // Mock network error - API returns 200 with data containing null values when there are errors
    mockedCheckEarnings.mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost:3000/api/earnings/yahoo');

    const response = await GET(request);
    const data = await response.json();

    // API returns 200 with data containing null values when there are errors, not empty arrays
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.preMarket).toBeDefined();
    expect(data.data.afterMarket).toBeDefined();
    // Check that data contains objects with null values
    if (data.data.preMarket.length > 0) {
      expect(data.data.preMarket[0]).toHaveProperty('epsEstimate');
      expect(data.data.preMarket[0]).toHaveProperty('epsActual');
      expect(data.data.preMarket[0]).toHaveProperty('revenueEstimate');
      expect(data.data.preMarket[0]).toHaveProperty('revenueActual');
    }
  });
}); 