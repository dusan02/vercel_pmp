/**
 * Trigger script for the earnings-calendar cron.
 * Called by PM2 (cron_restart: "0 8 * * *") to refresh the earnings calendar.
 */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const CRON_SECRET_KEY = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET;

if (!CRON_SECRET_KEY) {
  console.error('❌ CRON_SECRET_KEY (or CRON_SECRET) is required');
  process.exit(1);
}

const url = `${BASE_URL}/api/cron/earnings-calendar`;

console.log(`🚀 Triggering earnings-calendar update...`);
console.log(`📍 URL: ${url}`);

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${CRON_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
})
  .then(async (res) => {
    const body = await res.text();
    console.log(`✅ Status: ${res.status}`);
    console.log(`📦 Response: ${body}`);
    process.exit(res.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error(`❌ Error:`, err);
    process.exit(1);
  });
