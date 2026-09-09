import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '../p4-engine/db/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.PIT_DATABASE_URL || "postgresql://postgres:postgres@localhost:54320/postgres?schema=public" } } });
const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw/polygon/prices');

function hashRecord(record: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

async function processPrices(ticker: string, securityId: string) {
    const files = fs.readdirSync(RAW_DIR).filter(f => f.startsWith(ticker));
    if (files.length === 0) return;
    
    const p = path.join(RAW_DIR, files[0]);
    const rawFile = JSON.parse(fs.readFileSync(p, 'utf-8'));
    
    // We only process a small subset (e.g., first 100 days) to keep ingest fast for testing
    const results = rawFile.results.slice(0, 100);

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        
        // r.t is midnight ET in ms (e.g., 4:00 AM UTC). 
        // tradeDate is the actual midnight ET time.
        const tradeDate = new Date(r.t); 
        
        // Assume price becomes available 20 hours after midnight ET (8 PM ET on the same day).
        const availableAt = new Date(r.t + 20 * 60 * 60 * 1000); 
        let supersededAt = new Date('9999-12-31 23:59:59');
        let closeVal = r.c;
        
        // ADVERSARIAL MUTATION (Restatement) for testing
        // Let's restate the very first price fact of AAPL exactly 2 days later.
        if (ticker === 'AAPL' && i === 0) {
            supersededAt = new Date(availableAt.getTime() + 48 * 60 * 60 * 1000);
        }

        await prisma.pitPriceFact.create({
            data: {
                securityId,
                tradeDate,
                availableAt,
                supersededAt,
                open: r.o,
                high: r.h,
                low: r.l,
                close: closeVal,
                volume: BigInt(r.v),
                sourceRecordHash: hashRecord(r),
                sourceProvider: 'POLYGON',
                sourceType: 'DAILY_OHLCV'
            }
        });

        // Insert V2 for AAPL
        if (ticker === 'AAPL' && i === 0) {
            const v2AvailableAt = supersededAt;
            await prisma.pitPriceFact.create({
                data: {
                    securityId,
                    tradeDate,
                    availableAt: v2AvailableAt,
                    supersededAt: new Date('9999-12-31 23:59:59'),
                    open: r.o,
                    high: r.h,
                    low: r.l,
                    close: 999.99, // Mutated price
                    volume: BigInt(r.v),
                    sourceRecordHash: hashRecord({ ...r, c: 999.99 }),
                    sourceProvider: 'POLYGON',
                    sourceType: 'DAILY_OHLCV_RESTATEMENT'
                }
            });
        }
    }
}

async function main() {
    console.log("=== R2-A.2 PRICE INGESTION ===");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "PitPriceFact" CASCADE;`);

    const securities = await prisma.pitSecurity.findMany({ include: { entity: true, tickers: true } });

    for (const sec of securities) {
        // Find latest ticker
        const ticker = sec.tickers.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0].ticker;
        console.log(`Processing Prices for ${ticker}...`);
        await processPrices(ticker, sec.id);
    }
}

main().finally(() => prisma.$disconnect());
