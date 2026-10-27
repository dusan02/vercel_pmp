/**
 * Heatmap & core ISR page cache pre-warm script.
 *
 * Calls /api/heatmap every 5 minutes to keep the Redis cache warm, then touches
 * the main ISR pages (/brief, /premarket-movers, /gainers, /losers, /earnings,
 * /unusual-volume, /) so their on-disk .next/server/app/*.html snapshots never
 * go stale across sessions or overnight.
 *
 * Run as PM2 cron: every 5 minutes
 */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';

const ISR_WARM_PATHS = [
  '/brief',
  '/premarket-movers',
  '/gainers',
  '/losers',
  '/earnings',
  '/unusual-volume',
  '/',
];

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

    // Touch core ISR pages sequentially so stale disk snapshots trigger
    // background revalidation before a human visitor hits them.
    for (const p of ISR_WARM_PATHS) {
      try {
        await fetch(`${BASE_URL}${p}`, {
          headers: { 'Accept': 'text/html' },
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // Best-effort warmup — never fail the cron on a single page timeout
      }
    }
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`❌ Heatmap keep-warm failed (${duration}ms):`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
