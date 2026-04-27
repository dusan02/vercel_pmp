
const fs = require('fs');
const path = require('path');
const https = require('https');

// Custom env parser
function parseEnv(content) {
    const env = {};
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx === -1) return;
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        env[key] = val;
    });
    return env;
}

// Load env
let apiKey = process.env.POLYGON_API_KEY;

if (!apiKey) {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
        if (env.POLYGON_API_KEY) apiKey = env.POLYGON_API_KEY;
    }
}

if (!apiKey) {
    const envLocalPath = path.resolve(__dirname, '../.env.local');
    if (fs.existsSync(envLocalPath)) {
        const env = parseEnv(fs.readFileSync(envLocalPath, 'utf8'));
        if (env.POLYGON_API_KEY) apiKey = env.POLYGON_API_KEY;
    }
}

const ticker = process.argv[2] || 'VRT';

if (!apiKey) {
    console.error('Error: POLYGON_API_KEY not found in .env or .env.local');
    process.exit(1);
}

const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;

console.log(`Fetching ${ticker} from Polygon...`);

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.status !== 'OK') {
                console.error('API Error:', json);
                return;
            }
            const t = json.ticker;
            console.log('Ticker Data:', JSON.stringify(t, null, 2));
            if (t) {
                console.log(`\nPrice Summary for ${t.ticker}:`);
                console.log(`Last Trade: $${t.lastTrade?.p}`);
                console.log(`Day Close: $${t.day?.c}`);
                console.log(`Prev Day Close: $${t.prevDay?.c}`);
                console.log(`Min: $${t.min?.c}`);
                console.log(`Today Change: ${t.todaysChange}%`);
                console.log(`Updated: ${new Date(t.updated / 1000000).toISOString()}`);
            }
        } catch (e) {
            console.error('Error parsing JSON:', e);
            console.log('Raw data:', data);
        }
    });
}).on('error', (e) => {
    console.error('Request error:', e);
});
