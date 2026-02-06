/**
 * Trigger verify-sector-industry cron locally (VPS single source of truth)
 * Run: npx tsx scripts/trigger-verify-sector-industry.ts
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
import { fetchWithRetry } from './_utils/fetchWithRetry';

// Load environment variables (no `dotenv` dependency; works even if devDeps are omitted)
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

  const url = `${baseUrl}/api/cron/verify-sector-industry`;
  console.log('🚀 Triggering verify-sector-industry...');
  console.log(`📍 URL: ${url}`);

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cronSecretKey}`,
      'Content-Type': 'application/json'
    }
  }, { retries: 8, retryDelayMs: 500 });

  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ Error: ${response.status} ${response.statusText}`);
    console.error(text);
    process.exit(1);
  }

  const json = await response.json();
  console.log('✅ verify-sector-industry completed');
  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error('❌ trigger-verify-sector-industry failed:', e);
  process.exit(1);
});

