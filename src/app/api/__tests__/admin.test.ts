// Mock the redis module first
jest.mock('@/lib/redis', () => ({
  redisClient: {
    isOpen: true,
    keys: jest.fn(),
    ttl: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    memoryUsage: jest.fn(),
    info: jest.fn(),
  },
  deleteCachedData: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { GET as getCacheKeys } from '../admin/cache/keys/route';
import { POST as invalidateCache } from '../admin/cache/invalidate/route';

// Get the mocked redis client
const { redisClient: mockRedisClient, deleteCachedData } = require('@/lib/redis');

// Mock environment variables
const originalEnv = process.env;

describe('/api/admin/cache/keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Reset mock implementations
    mockRedisClient.keys.mockReset();
    mockRedisClient.ttl.mockReset();
    mockRedisClient.get.mockReset();
    mockRedisClient.del.mockReset();
    mockRedisClient.exists.mockReset();
    mockRedisClient.isOpen = true;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return cache keys when Redis is available', async () => {
    // Mock Redis response
    mockRedisClient.keys.mockResolvedValue(['key1', 'key2', 'key3']);
    mockRedisClient.ttl.mockResolvedValue(120);
    mockRedisClient.get.mockResolvedValue('{"data": "test"}');
    mockRedisClient.exists.mockResolvedValue(1);

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=test-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(3);
    expect(data.data[0]).toHaveProperty('key');
    expect(data.data[0]).toHaveProperty('ttl');
    expect(data.data[0]).toHaveProperty('size');
  });

  it('should return empty array when Redis is not available', async () => {
    mockRedisClient.isOpen = false;

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=test-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual([]);
    expect(data.message).toBe('Redis not available, using memory cache');
  });

  it('should limit results to 100 keys', async () => {
    const manyKeys = Array.from({ length: 150 }, (_, i) => `key${i}`);
    mockRedisClient.keys.mockResolvedValue(manyKeys);
    mockRedisClient.ttl.mockResolvedValue(120);
    mockRedisClient.get.mockResolvedValue('{"data": "test"}');

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=test-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(data.data).toHaveLength(100);
    expect(data.total).toBe(150);
  });

  it('should handle Redis errors gracefully', async () => {
    // Mock the keys method to throw an error
    mockRedisClient.keys.mockImplementation(() => {
      throw new Error('Redis connection failed');
    });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=test-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Internal server error');
  });
});

describe('/api/admin/cache/invalidate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Reset mock implementations
    mockRedisClient.keys.mockReset();
    mockRedisClient.ttl.mockReset();
    mockRedisClient.get.mockReset();
    mockRedisClient.del.mockReset();
    mockRedisClient.exists.mockReset();
    mockRedisClient.isOpen = true;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should invalidate specific cache key', async () => {
    const { deleteCachedData } = require('@/lib/redis');
    deleteCachedData.mockResolvedValue(true);

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate?admin_key=test-key', {
      method: 'POST',
      body: JSON.stringify({ key: 'test-key' }),
    });

    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Key "test-key" invalidated');
    expect(data.deletedCount).toBe(1);
  });

  it('should clear all cache keys when no specific key provided', async () => {
    mockRedisClient.keys.mockResolvedValue(['key1', 'key2', 'key3']);
    mockRedisClient.del.mockResolvedValue(3);

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate?admin_key=test-key', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('All cache keys invalidated');
    expect(data.deletedCount).toBe(3);
    
    // Verify that del was called with the correct keys
    expect(mockRedisClient.del).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
  });

  it('should handle empty cache gracefully', async () => {
    mockRedisClient.keys.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate?admin_key=test-key', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deletedCount).toBe(0);
  });

  it('should handle Redis errors gracefully', async () => {
    // Mock the keys method to throw an error
    mockRedisClient.keys.mockImplementation(() => {
      throw new Error('Redis connection failed');
    });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate?admin_key=test-key', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Internal server error');
  });
});

describe('Admin Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('should require admin key in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAdminKey = process.env.ADMIN_SECRET_KEY;
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_SECRET_KEY = 'correct-key';

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=wrong-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    
    // Restore original environment
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ADMIN_SECRET_KEY = originalAdminKey;
  });

  it('should allow access with correct admin key in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAdminKey = process.env.ADMIN_SECRET_KEY;
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_SECRET_KEY = 'correct-key';
    mockRedisClient.keys.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=correct-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    
    // Restore original environment
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ADMIN_SECRET_KEY = originalAdminKey;
  });

  it('should allow access without admin key in development', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    mockRedisClient.keys.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    
    // Restore original environment
    process.env.NODE_ENV = originalNodeEnv;
  });
}); 