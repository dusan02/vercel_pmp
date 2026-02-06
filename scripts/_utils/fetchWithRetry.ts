type FetchWithRetryOptions = {
  retries?: number;
  retryDelayMs?: number;
};

function isConnRefused(err: unknown): boolean {
  // Node/undici can throw AggregateError with nested errors
  const anyErr = err as any;
  if (!anyErr) return false;

  if (anyErr.code === 'ECONNREFUSED') return true;
  if (Array.isArray(anyErr.errors) && anyErr.errors.some((e: any) => e?.code === 'ECONNREFUSED')) return true;
  if (anyErr.cause?.code === 'ECONNREFUSED') return true;
  if (Array.isArray(anyErr.cause?.errors) && anyErr.cause.errors.some((e: any) => e?.code === 'ECONNREFUSED')) return true;
  return false;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Small helper for local cron triggers: after `pm2 reload`, the server may not
 * accept connections immediately. We retry a couple times on ECONNREFUSED.
 */
export async function fetchWithRetry(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  opts: FetchWithRetryOptions = {}
): Promise<Response> {
  const retries = opts.retries ?? 6;
  const retryDelayMs = opts.retryDelayMs ?? 500;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      lastErr = e;
      if (attempt >= retries || !isConnRefused(e)) {
        throw e;
      }
      await sleep(retryDelayMs);
    }
  }
  throw lastErr;
}

