/**
 * Trigger the daily blog snapshot API.
 * Called by PM2 cron — runs daily at 22:30 UTC (after post-market sync),
 * saving the day's movers into dailyBlogSnapshot for /blog archive pages.
 */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const CRON_SECRET = process.env.CRON_SECRET || process.env.CRON_SECRET_KEY || '';

async function main() {
  const url = `${BASE_URL}/api/cron/save-blog-snapshot`;
  console.log(`[Blog Snapshot] Triggering ${url}...`);

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: CRON_SECRET ? { 'x-api-key': CRON_SECRET } : {},
      signal: AbortSignal.timeout(120_000),
    });

    const elapsed = Date.now() - start;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Blog Snapshot] ❌ HTTP ${res.status} (${elapsed}ms): ${body}`);
      process.exit(1);
    }

    const json = await res.json();
    console.log(`[Blog Snapshot] ✅ date=${json.date}, ${json.stocks} stocks, ${json.earnings} earnings (${elapsed}ms)`);
  } catch (err: any) {
    console.error(`[Blog Snapshot] ❌ ${err.message}`);
    process.exit(1);
  }
}

main();
