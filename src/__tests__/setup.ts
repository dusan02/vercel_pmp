import { jest } from '@jest/globals';

// Mock Redis for tests
jest.mock('@/lib/redis/client', () => ({
  redisClient: {
    isOpen: false,
    ping: jest.fn().mockRejectedValue(new Error('Redis not available')),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    zAdd: jest.fn().mockResolvedValue(1),
    zRange: jest.fn().mockResolvedValue([]),
    multi: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(['OK', 'OK']),
      setEx: jest.fn(),
      zAdd: jest.fn()
    }),
    flushDb: jest.fn().mockResolvedValue('OK')
  }
}));

// Mock fetch for API tests
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock navigator.vibrate
Object.defineProperty(navigator, 'vibrate', {
  value: jest.fn(),
  writable: true
});

// Mock window.visualViewport
Object.defineProperty(window, 'visualViewport', {
  value: {
    height: window.innerHeight,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  },
  writable: true
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Setup test environment
beforeEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset localStorage
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  
  // Reset fetch mock
  if (global.fetch) {
    (global.fetch as jest.Mock).mockClear();
  }
});

// Global test utilities
export const mockStockData = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  price: 150.25,
  changePct: 2.5,
  marketCap: 2500.5,
  marketCapDiff: 50.25,
  sector: 'Technology',
  industry: 'Consumer Electronics'
};

export const mockPriceData = {
  p: 150.25,
  change: 2.5,
  volume: 1000000,
  timestamp: Date.now(),
  quality: 'high'
};

export const createMockRequest = (overrides: Partial<Request> = {}) => {
  return {
    url: 'http://localhost:3000/api/test',
    method: 'GET',
    headers: new Headers(),
    ...overrides
  } as Request;
};

export const createMockResponse = (data: any, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

// Test helpers
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const flushPromises = () => new Promise(resolve => setImmediate(resolve));

export const mockConsoleError = () => {
  const originalError = console.error;
  console.error = jest.fn();
  return () => {
    console.error = originalError;
  };
};

// Database test utilities
export const setupTestDatabase = async () => {
  const { prisma } = await import('@/lib/db/prisma');
  
  // Clean up test data
  await prisma.ticker.deleteMany();
  await prisma.portfolioItem.deleteMany();
  await prisma.userFavorite.deleteMany();
  
  return prisma;
};

export const cleanupTestDatabase = async () => {
  const { prisma } = await import('@/lib/db/prisma');
  await prisma.$disconnect();
};

// Performance test utilities
export const measurePerformance = async (fn: () => Promise<any> | any, iterations = 100) => {
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }
  
  const average = times.reduce((sum, time) => sum + time, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  return { average, min, max, times };
};

// Component test utilities
export const renderWithProviders = (component: React.ReactElement, providers = {}) => {
  const { render } = require('@testing-library/react');
  
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return (
      <div>
        {children}
      </div>
    );
  };
  
  return render(component, { wrapper: Wrapper });
};

// API test utilities
export const testAPIEndpoint = async (
  handler: (req: Request) => Promise<Response>,
  method: string = 'GET',
  body?: any,
  headers: Record<string, string> = {}
) => {
  const request = new Request('http://localhost:3000/api/test', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  const response = await handler(request);
  const data = await response.json();
  
  return { response, data };
};

// Error test utilities
export const expectError = async (fn: () => Promise<any>, expectedError: string) => {
  try {
    await fn();
    throw new Error('Expected function to throw an error');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(expectedError);
  }
};

// Mock data generators
export const generateMockStocks = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    ticker: `STOCK${i + 1}`,
    name: `Stock ${i + 1} Inc.`,
    price: 100 + Math.random() * 900,
    changePct: (Math.random() - 0.5) * 10,
    marketCap: Math.random() * 5000,
    marketCapDiff: (Math.random() - 0.5) * 100,
    sector: ['Technology', 'Finance', 'Healthcare', 'Energy'][Math.floor(Math.random() * 4)],
    industry: 'Test Industry'
  }));
};

export const generateMockPortfolio = (tickers: string[]) => {
  const holdings: Record<string, number> = {};
  tickers.forEach(ticker => {
    holdings[ticker] = Math.floor(Math.random() * 1000) + 1;
  });
  return holdings;
};

// Environment setup for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';

// Global test timeout
jest.setTimeout(10000);
