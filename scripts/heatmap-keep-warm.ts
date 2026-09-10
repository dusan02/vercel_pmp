/**
 * Heatmap cache pre-warm script.
 *
 * Calls /api/heatmap every 5 minutes to keep the Redis cache warm.
 * This ensures the API always serves from cache (fast) instead of
 * doing full DB queries on cache miss.
 *
 * Run as PM2 cron: every 5 minutes
 */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';

async function main() {
  const url = `${BASE_URL}/api/heatmap`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      // Short timeout — don't block if the server is busy
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`❌ Heatmap keep-warm failed: HTTP ${res.status}`);
      process.exit(1);
    }

    const data = await res.json();
    const duration = Date.now() - start;
    const count = data.count || (data.rows?.length) || 0;
    const cached = data.cached ? 'cached' : 'fresh';
    console.log(`✅ Heatmap keep-warm: ${count} companies (${cached}) in ${duration}ms`);
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`❌ Heatmap keep-warm failed (${duration}ms):`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
