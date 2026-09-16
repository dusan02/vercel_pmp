import { loadEnvFromFiles } from './_utils/loadEnv';
import { fetchWithRetry } from './_utils/fetchWithRetry';

loadEnvFromFiles();

const API_BASE_URL =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:3001';
const CRON_SECRET = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET;

async function triggerRefreshAll() {
    console.log(`[${new Date().toISOString()}] Triggering Refresh-All (weekly analysis + financial gap fill)...`);
    console.log(`Target URL: ${API_BASE_URL}/api/cron/refresh-all`);

    try {
        const response = await fetchWithRetry(`${API_BASE_URL}/api/cron/refresh-all`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${CRON_SECRET}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`[${new Date().toISOString()}] ✅ Refresh-All completed successfully`);
            console.log(`  Step 1 (analysis refresh): ${data.step1?.succeeded}/${data.step1?.total} ok, ${data.step1?.failed} failed`);
            console.log(`  Step 2 (gap fill): ${data.step2_gaps?.succeeded}/${data.step2_gaps?.total} ok, ${data.step2_gaps?.failed} failed`);
            console.log(`  Total time: ${data.totalMs}ms`);
        } else {
            console.error(`[${new Date().toISOString()}] ❌ Refresh-All failed with status ${response.status}`);
            console.error(JSON.stringify(data, null, 2));
        }
    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] ❌ Error triggering Refresh-All:`, error.message);
    }
}

triggerRefreshAll();
