
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

const apiKey = process.env.POLYGON_API_KEY;

async function main() {
    console.log('Fetching NVDA snapshot...');
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=NVDA&apiKey=${apiKey}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const ticker = data.tickers?.[0];
        console.log('Day:', ticker?.day);
        console.log('PrevDay:', ticker?.prevDay);
        console.log('Min:', ticker?.min);
    } catch (e) {
        console.error(e);
    }
}

main();
