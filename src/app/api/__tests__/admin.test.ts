/** @jest-environment node */

import { jest } from '@jest/globals';

const revalidatePathMock = jest.fn();

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

import { NextRequest } from 'next/server';
import { GET as getCacheKeys } from '../admin/cache/keys/route';
import { GET as getInvalidateInfo, POST as invalidateCache } from '../admin/cache/invalidate/route';

const originalEnv = process.env;

describe('/api/admin/cache/keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns empty array in development without requiring x-admin-key', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys');
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.timestamp).toBeDefined();
  });

  it('rejects requests without matching x-admin-key header in production', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'correct-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys', {
      headers: { 'x-admin-key': 'wrong-key' },
    });
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('allows access with matching x-admin-key header in production', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'correct-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/keys', {
      headers: { 'x-admin-key': 'correct-key' },
    });
    const response = await getCacheKeys(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe('/api/admin/cache/invalidate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    revalidatePathMock.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns endpoint info on GET', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate');
    const response = await getInvalidateInfo(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('requires x-admin-key header in production', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'secret-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'PSX' }),
    });
    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('expands { symbol } to all 4 ticker ISR page paths and calls revalidatePath', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    Object.defineProperty(process.env, 'ADMIN_SECRET_KEY', { value: 'secret-key', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate', {
      method: 'POST',
      headers: { 'x-admin-key': 'secret-key' },
      body: JSON.stringify({ symbol: 'psx' }),
    });
    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.revalidated).toEqual([
      '/analysis/PSX',
      '/valuation/PSX',
      '/financials/PSX',
      '/premarket/PSX',
    ]);
    expect(data.count).toBe(4);
    expect(revalidatePathMock).toHaveBeenCalledTimes(4);
  });

  it('deduplicates and filters unsafe paths in { paths }', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate', {
      method: 'POST',
      body: JSON.stringify({
        paths: ['/analysis/NVDA', '/analysis/NVDA', 'https://evil.com/x', '/../etc/passwd', '/heatmap/pe-ratio'],
      }),
    });
    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.revalidated).toEqual(['/analysis/NVDA', '/heatmap/pe-ratio']);
    expect(data.count).toBe(2);
  });

  it('handles invalid JSON body gracefully without crashing', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });

    const request = new NextRequest('http://localhost:3000/api/admin/cache/invalidate', {
      method: 'POST',
      body: 'not-json',
    });
    const response = await invalidateCache(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.revalidated).toEqual([]);
  });
});
