/**
 * Trigger earnings-calendar cron endpoint (VPS single source of truth)
 * Run: npx tsx scripts/trigger-earnings-calendar.ts [--date=YYYY-MM-DD]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
import { fetchWithRetry } from './_utils/fetchWithRetry';

loadEnvFromFiles();

async function main() {
  const cronSecretKey = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET;
  const baseUrl =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000');

  if (!cronSecretKey) {
    console.error('❌ CRON_SECRET_KEY/CRON_SECRET not configured');
    process.exit(1);
  }

  const dateArg = process.argv.find(a => a.startsWith('--date='));
  const dateVal = dateArg?.split('=')[1];
  const qs = dateVal ? `?date=${encodeURIComponent(dateVal)}` : '';
  const url = `${baseUrl}/api/cron/earnings-calendar${qs}`;

  console.log('🚀 Triggering earnings-calendar update...');
  console.log(`📍 URL: ${url}`);

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cronSecretKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ Error: ${response.status} ${response.statusText}`);
    console.error(text);
    process.exit(1);
  }

  const json = await response.json();
  console.log('✅ earnings-calendar update completed');
  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error('❌ trigger-earnings-calendar failed:', e);
  process.exit(1);
});
