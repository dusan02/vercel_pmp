import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock next/server before importing the module under test
jest.mock('next/server', () => ({
  NextRequest: class {
    headers: Map<string, string>;
    constructor(_url: string, init?: { headers?: Record<string, string> }) {
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    get(name: string) { return this.headers.get(name) ?? null; }
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      _status: init?.status ?? 200,
    }),
  },
}));

// Helper: create a minimal NextRequest-like object
function makeRequest(authHeader?: string) {
  return {
    headers: {
      get: (name: string) => (name === 'authorization' ? authHeader ?? null : null),
    },
  } as any;
}

describe('verifyCronAuth', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('returns null (authorized) when header matches CRON_SECRET_KEY', async () => {
    process.env.CRON_SECRET_KEY = 'test-secret';
    const { verifyCronAuth } = await import('@/lib/utils/cronAuth');
    const result = verifyCronAuth(makeRequest('Bearer test-secret'));
    expect(result).toBeNull();
  });

  it('returns null (authorized) when header matches CRON_SECRET fallback', async () => {
    delete process.env.CRON_SECRET_KEY;
    process.env.CRON_SECRET = 'fallback-secret';
    const { verifyCronAuth } = await import('@/lib/utils/cronAuth');
    const result = verifyCronAuth(makeRequest('Bearer fallback-secret'));
    expect(result).toBeNull();
  });

  it('returns 401 when header is missing', async () => {
    process.env.CRON_SECRET_KEY = 'test-secret';
    const { verifyCronAuth } = await import('@/lib/utils/cronAuth');
    const result = verifyCronAuth(makeRequest()) as any;
    expect(result).not.toBeNull();
    expect(result._status).toBe(401);
  });

  it('returns 401 when header is wrong', async () => {
    process.env.CRON_SECRET_KEY = 'test-secret';
    const { verifyCronAuth } = await import('@/lib/utils/cronAuth');
    const result = verifyCronAuth(makeRequest('Bearer wrong-secret')) as any;
    expect(result).not.toBeNull();
    expect(result._status).toBe(401);
  });

  it('returns 401 when secret is missing from env', async () => {
    delete process.env.CRON_SECRET_KEY;
    delete process.env.CRON_SECRET;
    const { verifyCronAuth } = await import('@/lib/utils/cronAuth');
    const result = verifyCronAuth(makeRequest('Bearer anything')) as any;
    expect(result).not.toBeNull();
    expect(result._status).toBe(401);
  });
});

describe('withCronHandler', () => {
  it('calls handler when auth passes', async () => {
    process.env.CRON_SECRET_KEY = 'secret';
    const { withCronHandler } = await import('@/lib/utils/cronAuth');
    const mockResponse = { _body: { success: true }, _status: 200 } as any;
    const handler = jest.fn().mockResolvedValue(mockResponse);
    const wrapped = withCronHandler('test-job', handler);
    const result = await wrapped(makeRequest('Bearer secret'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockResponse);
  });

  it('returns 401 without calling handler when auth fails', async () => {
    process.env.CRON_SECRET_KEY = 'secret';
    const { withCronHandler } = await import('@/lib/utils/cronAuth');
    const handler = jest.fn();
    const wrapped = withCronHandler('test-job', handler);
    const result = await wrapped(makeRequest('Bearer wrong')) as any;
    expect(handler).not.toHaveBeenCalled();
    expect(result._status).toBe(401);
  });

  it('returns 500 when handler throws', async () => {
    process.env.CRON_SECRET_KEY = 'secret';
    const { withCronHandler } = await import('@/lib/utils/cronAuth');
    const handler = jest.fn().mockRejectedValue(new Error('boom'));
    const wrapped = withCronHandler('test-job', handler);
    const result = await wrapped(makeRequest('Bearer secret')) as any;
    expect(result._status).toBe(500);
    expect(result._body.success).toBe(false);
    expect(result._body.message).toBe('boom');
  });
});
