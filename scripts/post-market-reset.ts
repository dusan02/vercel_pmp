import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env relative to the project root
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../.env.local'), override: true });

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET_KEY;

async function triggerPostMarketReset() {
    console.log(`[${new Date().toISOString()}] Triggering Post-Market Reset...`);
    console.log(`Target URL: ${API_BASE_URL}/api/cron/post-market-reset`);

    try {
        const response = await fetch(`${API_BASE_URL}/api/cron/post-market-reset`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CRON_SECRET}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error(`❌ Post-Market Reset failed with status ${response.status}:`, data);
            process.exit(1);
        }

        console.log(`✅ Post-Market Reset completed successfully!`);
        console.log(JSON.stringify(data, null, 2));

    } catch (error) {
        console.error(`❌ Error triggering Post-Market Reset:`, error);
        process.exit(1);
    }
}

triggerPostMarketReset();
