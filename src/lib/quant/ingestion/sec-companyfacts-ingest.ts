import * as fs from 'fs';
import * as path from 'path';

const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw/sec/companyfacts');
const USER_AGENT = 'PreMarketPrice quant@premarketprice.com';

const CANARY_CIKS = {
    'AAPL': '0000320193',
    'MSFT': '0000789019',
    'META': '0001326801',
    'NVDA': '0001045810',
    'BBBYQ': '0000886158'
};

async function fetchCompanyFacts(cik: string) {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    console.log(`[GET] ${url}`);
    
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`SEC API error: ${res.status} ${res.statusText}`);
    return res.json();
}

async function main() {
    console.log("=== SEC BULK COMPANYFACTS INGEST ===");
    for (const [ticker, cik] of Object.entries(CANARY_CIKS)) {
        try {
            const data = await fetchCompanyFacts(cik);
            const filePath = path.join(RAW_DIR, `${cik}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`Saved Bulk Facts for ${ticker} to ${filePath}`);
            await new Promise(r => setTimeout(r, 200)); 
        } catch (e: any) {
            console.error(`Failed to ingest Bulk Facts for ${ticker}: ${e.message}`);
        }
    }
}
main();
