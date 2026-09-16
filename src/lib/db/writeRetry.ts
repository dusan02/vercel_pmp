const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Retry a DB write on SQLite lock contention (SQLITE_BUSY / pool timeout).
 * Returns null after maxAttempts so callers can degrade gracefully instead
 * of crashing a batch loop.
 */
export async function dbWriteRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 10
): Promise<T | null> {
  let delayMs = 100;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code ?? '';
      const isDbBusy =
        code === 'P1008' ||
        msg.includes('SQLITE_BUSY') ||
        msg.includes('database is locked') ||
        msg.includes('failed to respond to a query within the configured timeout');

      if (!isDbBusy || attempt === maxAttempts) {
        console.warn(`⚠️ DB write failed (${label}) after ${attempt}/${maxAttempts}:`, msg);
        return null;
      }
      await sleep(delayMs);
      delayMs = Math.min(2000, Math.floor(delayMs * 2));
    }
  }
  return null;
}
