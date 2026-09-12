/**
 * Analysis cache pre-warm script.
 *
 * Iterates all tickers with AnalysisCache and calls:
 *   - /api/analysis/[ticker]        (analysis data)
 *   - /api/analysis/[ticker]/history (chart data)
 *
 * This populates the Redis cache so the SSR page's internal fetch
 * (5s timeout) hits cache instead of computing from scratch.
 *
 * Run as PM2 cron: every 4 minutes
 */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;

async function fetchTickerList(): Promise<string[]> {
  // Fetch the ticker list from the API (uses Redis cache internally)
  const res = await fetch(`${BASE_URL}/api/stocks`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Failed to fetch ticker list: ${res.status}`);
  const data = await res.json();
  const stocks = data.data ?? data.stocks ?? (Array.isArray(data) ? data : []);
  // Extract ticker symbol from each stock entry
  return stocks
    .map((s: any) => (typeof s === 'string' ? s : s.ticker ?? s.symbol))
    .filter((s: string | undefined): s is string => !!s);
}

async function warmTicker(symbol: string): Promise<{ ok: boolean; cached: boolean; ms: number }> {
  const start = Date.now();
  try {
    // Fetch both endpoints in parallel
    const [analysisRes, historyRes] = await Promise.all([
      fetch(`${BASE_URL}/api/analysis/${symbol}`, {
        signal: AbortSignal.timeout(15000),
      }),
      fetch(`${BASE_URL}/api/analysis/${symbol}/history`, {
        signal: AbortSignal.timeout(15000),
      }).catch(() => null),
    ]);

    const ms = Date.now() - start;
    const ok = analysisRes.ok;
    const cached = analysisRes.headers.get('x-cache-status') === 'HIT';
    return { ok, cached, ms };
  } catch {
    const ms = Date.now() - start;
    return { ok: false, cached: false, ms };
  }
}

async function main() {
  const startTotal = Date.now();
  let tickers: string[];

  try {
    tickers = await fetchTickerList();
  } catch (err) {
    console.error(`❌ Analysis keep-warm: failed to fetch ticker list:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (tickers.length === 0) {
    console.log('⚠️ Analysis keep-warm: no eligible tickers found');
    process.exit(0);
  }

  let warmed = 0;
  let failed = 0;
  let cachedHits = 0;

  // Process in batches to avoid overwhelming the server
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((t) => warmTicker(t)));

    for (const r of results) {
      if (r.ok) {
        warmed++;
        if (r.cached) cachedHits++;
      } else {
        failed++;
      }
    }

    // Small delay between batches
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  const totalMs = Date.now() - startTotal;
  console.log(
    `✅ Analysis keep-warm: ${warmed} tickers warmed (${cachedHits} cache hits, ${failed} failed) in ${totalMs}ms`
  );
}

main();
