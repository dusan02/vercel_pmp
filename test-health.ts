import { loadEnvFromFiles } from './scripts/_utils/loadEnv';
import { fetchWithRetry } from './scripts/_utils/fetchWithRetry';

loadEnvFromFiles();
const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.BASE_URL || 'https://premarketprice.com';

async function main() {
    const res = await fetchWithRetry(`${API_BASE}/api/admin/data-health`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
main();
