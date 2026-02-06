/**
 * Script to manually trigger the daily refresh cron job
 * Run: npx tsx scripts/trigger-daily-refresh.ts [--hard-reset]
 * 
 * This script calls the /api/cron/update-static-data endpoint
 * with optional hard reset flag
 */

// Load environment variables
try {
  const { config } = require('dotenv');
  const { resolve } = require('path');
  // Server typically uses `.env`, local dev often uses `.env.local`.
  // Load `.env` first, then `.env.local` to override if present.
  config({ path: resolve(process.cwd(), '.env') });
  config({ path: resolve(process.cwd(), '.env.local') });
} catch (e) {
  // dotenv not available, continue without it
}

async function main() {
  const hardReset = process.argv.includes('--hard-reset');
  const cronSecretKey = process.env.CRON_SECRET_KEY;
  // IMPORTANT: avoid `a || b ? c : d` precedence bugs; explicitly handle VERCEL_URL.
  const baseUrl =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  if (!cronSecretKey) {
    console.error('❌ CRON_SECRET_KEY not configured');
    process.exit(1);
  }

  const url = `${baseUrl}/api/cron/update-static-data${hardReset ? '?hardReset=true' : ''}`;
  
  console.log(`🚀 Triggering daily refresh${hardReset ? ' (HARD RESET MODE)' : ''}...`);
  console.log(`📍 URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      process.exit(1);
    }

    const result = await response.json();
    console.log('\n✅ Daily refresh completed successfully!');
    console.log('\n📊 Results:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error triggering daily refresh:', error);
    process.exit(1);
  }
}

main();
