/**
 * Trigger the weekly earnings blog generation API.
 * Called by PM2 cron — runs every Monday at 09:00 UTC (before market open).
 */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const CRON_SECRET = process.env.CRON_SECRET || process.env.CRON_SECRET_KEY || '';

async function main() {
  const url = `${BASE_URL}/api/cron/generate-earnings-blog`;
  console.log(`[Earnings Blog] Triggering ${url}...`);

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: CRON_SECRET ? { 'x-api-key': CRON_SECRET } : {},
      signal: AbortSignal.timeout(60_000),
    });

    const elapsed = Date.now() - start;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Earnings Blog] ❌ HTTP ${res.status} (${elapsed}ms): ${body}`);
      process.exit(1);
    }

    const json = await res.json();
    console.log(`[Earnings Blog] ✅ ${json.totalEarnings} earnings, ${json.withEstimates} with estimates (${elapsed}ms)`);
  } catch (err: any) {
    console.error(`[Earnings Blog] ❌ ${err.message}`);
    process.exit(1);
  }
}

main();
