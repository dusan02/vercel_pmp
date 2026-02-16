
import { createClient } from 'redis';
// Removed: import { RESTClient } from '@polygon.io/client-js';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function check() {
    const client = createClient({ url: REDIS_URL });
    await client.connect();

    const ticker = 'NVDA';
    const priceKey = `price:${ticker}`;
    const prevCloseKey = `prevClose:${ticker}`;
    const sessionKey = 'market:session';

    const price = await client.get(priceKey);
    const prevClose = await client.get(prevCloseKey);
    const session = await client.get(sessionKey);

    console.log('--- Redis Data ---');
    console.log(`Ticker: ${ticker}`);
    console.log(`Current Price (Redis): ${price}`);
    console.log(`Previous Close (Redis): ${prevClose}`);
    console.log(`Market Session: ${session}`);

    if (price && prevClose) {
        const change = ((parseFloat(price) - parseFloat(prevClose)) / parseFloat(prevClose)) * 100;
        console.log(`Calculated Change: ${change.toFixed(2)}%`);
    }

    console.log('\n--- Polygon API Check ---');
    if (POLYGON_API_KEY) {
        try {
            const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`;
            const snapshotRes = await fetch(snapshotUrl);
            const snapshot = await snapshotRes.json();
            if (snapshot.ticker) {
                console.log('Snapshot:', {
                    price: snapshot.ticker.min?.c,
                    todaysChange: snapshot.ticker.todaysChangePerc,
                    updated: snapshot.ticker.updated
                });
            } else {
                console.log('Snapshot: No data', snapshot);
            }
        } catch (e) {
            console.log('Polygon API Error:', e.message);
        }

        try {
            const statusUrl = `https://api.polygon.io/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`;
            const statusRes = await fetch(statusUrl);
            const status = await statusRes.json();
            console.log('Market Status:', status);
        } catch (e) {
            console.log('Market Status Error:', e.message);
        }
    } else {
        console.log('POLYGON_API_KEY not set');
    }

    await client.disconnect();
}

check().catch(console.error);
