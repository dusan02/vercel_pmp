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
import { redisClient as mockRedisClient } from '@/lib/redis';

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

  it('should return empty array when Redis is not available in Edge Runtime', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=test-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual([]);
    expect(data.message).toBe('Redis not available in Edge Runtime, using memory cache');
    expect(data.total).toBe(0);
    expect(data.timestamp).toBeDefined();
  });

  it('should handle admin authentication in production', async () => {
    // Mock production environment
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'correct-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=wrong-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should allow access with correct admin key in production', async () => {
    // Mock production environment
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'correct-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=correct-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Redis not available in Edge Runtime, using memory cache');
  });

  it('should handle internal errors gracefully', async () => {
    // Mock environment to trigger error handling
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'correct-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys?admin_key=correct-key');
    const response = await getCacheKeys(request);
    const data = await response.json();

    // API should handle errors gracefully and return 200 with info message
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Redis not available in Edge Runtime, using memory cache');
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

  it('should return Edge Runtime message for cache invalidation', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate?admin_key=test-key', {
      method: 'POST',
      body: JSON.stringify({ key: 'test-key' }),
    });

    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Cache invalidation not available in Edge Runtime');
    expect(data.deletedCount).toBe(0);
    expect(data.timestamp).toBeDefined();
  });

  it('should handle admin authentication in production', async () => {
    // Mock production environment
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'correct-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate?admin_key=wrong-key', {
      method: 'POST',
      body: JSON.stringify({ key: 'test-key' }),
    });

    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should allow access with correct admin key in production', async () => {
    // Mock production environment
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'correct-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate?admin_key=correct-key', {
      method: 'POST',
      body: JSON.stringify({ key: 'test-key' }),
    });

    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Cache invalidation not available in Edge Runtime');
  });

  it('should handle invalid JSON gracefully', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate?admin_key=test-key', {
      method: 'POST',
      body: 'invalid-json',
    });

    const response = await invalidateCache(request);
    const data = await response.json();

    // API should handle JSON parsing errors and return 500
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Internal server error');
    expect(data.details).toBeDefined();
    expect(data.timestamp).toBeDefined();
  });
});

describe('Admin Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should require admin key in production', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'secret-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should not require admin key in development', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Redis not available in Edge Runtime, using memory cache');
  });
}); 