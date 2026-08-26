import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Load .env relative to the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(resolve(__dirname, '..'));

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.BASE_URL || 'http://localhost:3001';
const CRON_SECRET = process.env.CRON_SECRET_KEY;

/**
 * Trigger /api/cron/update-ticker-stats
 *
 * Calculates 20-day avgVolume / avgReturn / stdDevReturn for all tracked tickers
 * via Polygon aggregates and writes them to the Ticker table. These baselines are
 * required for RVOL and Z-score calculations in the polygon worker, which in turn
 * gate MoverEvent creation.
 *
 * Runs daily at 06:00 UTC (02:00 ET) via PM2 cron_restart.
 */
async function triggerUpdateTickerStats() {
    console.log(`[${new Date().toISOString()}] Triggering update-ticker-stats...`);
    console.log(`Target URL: ${API_BASE_URL}/api/cron/update-ticker-stats`);

    try {
        const response = await fetch(`${API_BASE_URL}/api/cron/update-ticker-stats`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${CRON_SECRET}`,
                'Content-Type': 'application/json',
            },
            // 713 tickers × 2s batch delay ≈ 2.5 min, plus Polygon latency.
            // Allow 20 min to be safe.
            signal: AbortSignal.timeout(20 * 60 * 1000),
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`[${new Date().toISOString()}] ✅ update-ticker-stats completed`);
            console.log(`  Success: ${data.results?.success ?? '?'}, Failed: ${data.results?.failed ?? '?'}`);
            console.log(`  Total tickers: ${data.summary?.totalTickers ?? '?'}`);
            console.log(`  Duration: ${data.summary?.duration ?? '?'}`);
        } else {
            console.error(`[${new Date().toISOString()}] ❌ update-ticker-stats failed with status ${response.status}`);
            console.error(JSON.stringify(data, null, 2));
        }
    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] ❌ Error triggering update-ticker-stats:`, error.message);
    }
}

triggerUpdateTickerStats();
