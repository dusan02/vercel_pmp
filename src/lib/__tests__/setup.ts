// Test setup file for Jest

// Mock environment variables using Object.defineProperty to avoid read-only errors
Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true });
Object.defineProperty(process.env, 'POLYGON_API_KEY', { value: 'test-api-key', writable: true });
Object.defineProperty(process.env, 'UPSTASH_REDIS_REST_URL', { value: 'https://test-redis.upstash.io', writable: true });
Object.defineProperty(process.env, 'UPSTASH_REDIS_REST_TOKEN', { value: 'test-token', writable: true });

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities
global.testUtils = {
  // Helper to create mock stock data
  createMockStockData: (ticker: string, overrides: any = {}) => ({
    ticker,
    currentPrice: 150.0,
    closePrice: 145.0,
    percentChange: 3.45,
    marketCap: 2500000000000,
    marketCapDiff: 12500000000,
    lastUpdated: new Date().toISOString(),
    ...overrides
  }),

  // Helper to create mock API response
  createMockApiResponse: (data: any, success: boolean = true) => ({
    success,
    data,
    timestamp: new Date().toISOString()
  }),

  // Helper to wait for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
};

// Custom matcher for stock data validation
expect.extend({
  toBeValidStockData(received: any) {
    const requiredFields = ['ticker', 'currentPrice', 'closePrice', 'percentChange', 'marketCap'];
    const missingFields = requiredFields.filter(field => !(field in received));
    
    if (missingFields.length > 0) {
      return {
        message: () => `Expected stock data to have fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
    
    return {
      message: () => 'Expected stock data to be valid',
      pass: true,
    };
  },
}); 