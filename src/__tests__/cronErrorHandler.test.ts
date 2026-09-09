import { describe, it, expect } from '@jest/globals';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      _status: init?.status ?? 200,
    }),
  },
}));

describe('handleCronError', () => {
  it('returns 500 with error message from Error instance', async () => {
    const { handleCronError } = await import('@/lib/utils/cronErrorHandler');
    const result = handleCronError(new Error('db timeout'), 'my-cron') as any;
    expect(result._status).toBe(500);
    expect(result._body.success).toBe(false);
    expect(result._body.message).toBe('db timeout');
  });

  it('returns 500 with "Unknown error" for non-Error throws', async () => {
    const { handleCronError } = await import('@/lib/utils/cronErrorHandler');
    const result = handleCronError('string error', 'my-cron') as any;
    expect(result._status).toBe(500);
    expect(result._body.message).toBe('Unknown error');
  });
});

describe('createCronSuccessResponse', () => {
  it('returns 200 with success=true and timestamp', async () => {
    const { createCronSuccessResponse } = await import('@/lib/utils/cronErrorHandler');
    const result = createCronSuccessResponse({ message: 'Done', results: { count: 5 } }) as any;
    expect(result._status).toBe(200);
    expect(result._body.success).toBe(true);
    expect(result._body.message).toBe('Done');
    expect(result._body.results).toEqual({ count: 5 });
    expect(typeof result._body.timestamp).toBe('string');
  });
});
