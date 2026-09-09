import * as fs from 'fs';
import * as path from 'path';

// Load API key from environment — no hardcoded fallback (security)
const API_KEY = process.env.POLYGON_API_KEY;
if (!API_KEY) {
    throw new Error('POLYGON_API_KEY env variable is required. Set it in .env.local or export it before running ingestion.');
}
const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw/polygon');

const CANARY_UNIVERSE = ['AAPL', 'MSFT', 'META', 'NVDA', 'LEHMQ']; 
// Note: LEHMQ (Lehman) might not be in Polygon's active dataset depending on history depth, 
// but we include it as the death-cycle canary.

async function fetchPolygon(endpoint: string) {
    const url = `https://api.polygon.io${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${API_KEY}`;
    console.log(`[GET] ${url.replace(API_KEY, '***')}`);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Polygon API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

async function ingestPrices(ticker: string, start: string, end: string) {
    console.log(`Ingesting Prices for ${ticker} (${start} to ${end})...`);
    try {
        // MUST BE UNADJUSTED (adjusted=false)
        const endpoint = `/v2/aggs/ticker/${ticker}/range/1/day/${start}/${end}?adjusted=false&sort=asc&limit=50000`;
        const data = await fetchPolygon(endpoint);
        
        const filePath = path.join(RAW_DIR, `prices/${ticker}_${start}_${end}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`Saved ${data.resultsCount || 0} bars to ${filePath}`);
    } catch (e: any) {
        console.error(`Failed to ingest prices for ${ticker}: ${e.message}`);
    }
}

async function ingestCorporateActions(ticker: string) {
    console.log(`Ingesting Splits & Dividends for ${ticker}...`);
    try {
        // Fetch Splits
        const splitsEndpoint = `/v3/reference/splits?ticker=${ticker}&limit=1000`;
        const splitsData = await fetchPolygon(splitsEndpoint);
        
        // Fetch Dividends
        const divEndpoint = `/v3/reference/dividends?ticker=${ticker}&limit=1000`;
        const divData = await fetchPolygon(divEndpoint);
        
        const combined = {
            splits: splitsData.results || [],
            dividends: divData.results || []
        };

        const filePath = path.join(RAW_DIR, `actions/${ticker}.json`);
        fs.writeFileSync(filePath, JSON.stringify(combined, null, 2));
        console.log(`Saved ${combined.splits.length} splits and ${combined.dividends.length} dividends to ${filePath}`);
    } catch (e: any) {
        console.error(`Failed to ingest actions for ${ticker}: ${e.message}`);
    }
}

async function main() {
    console.log("=== R2-A.1.1 RAW POLYGON INGEST ===");
    const startDate = '2020-01-01';
    const endDate = '2024-12-31';

    for (const ticker of CANARY_UNIVERSE) {
        // 1. Fetch immutable raw unadjusted prices
        await ingestPrices(ticker, startDate, endDate);
        
        // 2. Fetch immutable raw corporate actions
        await ingestCorporateActions(ticker);
        
        // Respect Polygon Starter tier rate limits (5 req / min).
        // Since this script runs 2 requests per ticker, we need to pause to not get 429s.
        console.log("Sleeping 25s to respect rate limits...");
        await new Promise(r => setTimeout(r, 25000)); 
    }
    
    console.log("=== CANARY INGESTION COMPLETE ===");
}

main();
