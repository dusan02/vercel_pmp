import * as fs from 'fs';
import * as path from 'path';

const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw/sec');

// SEC EDGAR requires a User-Agent in the format: "AppName UserEmail"
const USER_AGENT = 'PreMarketPrice quant@premarketprice.com';

const CANARY_CIKS = {
    'AAPL': '0000320193',
    'MSFT': '0000078901',
    'META': '0001326801',
    'NVDA': '0001045810',
    'BBBYQ': '0000886158' // Bed Bath & Beyond (Bankrupt 2023 - better death canary for 2020-2024 range)
};

// Key GAAP concepts we need for our basic signals
const CONCEPTS = [
    'Revenues',
    'NetIncomeLoss',
    'EarningsPerShareDiluted'
];

async function fetchSecConcept(cik: string, concept: string) {
    const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`;
    console.log(`[GET] ${url}`);
    
    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!res.ok) {
        if (res.status === 404) {
            console.warn(`Concept ${concept} not found for CIK ${cik}`);
            return null;
        }
        throw new Error(`SEC API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

async function main() {
    console.log("=== R2-A.1.2 RAW SEC INGEST ===");
    
    for (const [ticker, cik] of Object.entries(CANARY_CIKS)) {
        console.log(`\nIngesting SEC Fundamentals for ${ticker} (CIK: ${cik})...`);
        for (const concept of CONCEPTS) {
            try {
                const data = await fetchSecConcept(cik, concept);
                if (data) {
                    const filePath = path.join(RAW_DIR, `fundamentals/${cik}_${concept}.json`);
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                    console.log(`Saved ${concept} for ${ticker} to ${filePath}`);
                }
                
                // SEC limits to 10 requests per second. We'll sleep 200ms to be perfectly safe.
                await new Promise(r => setTimeout(r, 200));
            } catch (e: any) {
                console.error(`Failed to ingest ${concept} for ${ticker}: ${e.message}`);
            }
        }
    }
    
    console.log("\n=== SEC CANARY INGESTION COMPLETE ===");
}

main();
