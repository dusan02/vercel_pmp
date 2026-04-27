
import { loadEnvFromFiles } from './_utils/loadEnv';
// Load env before imports
loadEnvFromFiles();

import { bootstrapPreviousCloses } from '../src/workers/polygonWorker';
import { getDateET } from '../src/lib/utils/dateET';

async function main() {
    console.log('Testing bootstrap for NVDA...');
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) throw new Error('No API Key');

    const today = getDateET(); // Should be 2026-02-15 or similar
    console.log(`Date: ${today}`);

    await bootstrapPreviousCloses(['NVDA'], apiKey, today);
    console.log('Bootstrap done.');
}

main().catch(console.error);
