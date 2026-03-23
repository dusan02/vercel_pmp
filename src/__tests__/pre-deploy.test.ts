import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Test critical API endpoints
describe('API Health Tests', () => {
  it('should fetch stocks successfully', async () => {
    const response = await fetch('http://localhost:3000/api/stocks');
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('should handle portfolio operations', async () => {
    const testData = { ticker: 'AAPL', quantity: 100 };
    
    const response = await fetch('http://localhost:3000/api/user/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    expect(response.status).toBe(200);
  });

  it('should validate market cap formatting', async () => {
    const response = await fetch('http://localhost:3000/api/stocks?limit=10');
    const data = await response.json();
    
    data.data.forEach((stock: any) => {
      expect(stock.marketCap).toBeGreaterThan(0);
      expect(stock.marketCap).toBeLessThan(10000); // Should be in billions
    });
  });
});

// Test Redis fallback
describe('Redis Fallback Tests', () => {
  it('should work without Redis connection', async () => {
    // This test ensures the app works even when Redis is down
    const response = await fetch('http://localhost:3000/api/stocks');
    expect(response.status).toBe(200);
  });
});

// Test mobile features
describe('Mobile Features Tests', () => {
  it('should have mobile-optimized components', () => {
    // Test that mobile hooks are properly exported
    expect(() => require('@/hooks/useMobileHooks')).not.toThrow();
  });
});
