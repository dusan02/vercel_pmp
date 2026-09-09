import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../p4-engine/db/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.PIT_DATABASE_URL || "postgresql://postgres:postgres@localhost:54320/postgres?schema=public" } } });
const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw');

const SYSTEM_LATENCY_MS = 2 * 60 * 60 * 1000; // 2 hours latency for System PIT policy

async function processPrices(ticker: string, securityId: string) {
    console.log(`Normalizing Prices for ${ticker}...`);
    const files = fs.readdirSync(path.join(RAW_DIR, 'polygon/prices')).filter(f => f.startsWith(ticker));
    
    for (const file of files) {
        const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'polygon/prices', file), 'utf-8'));
        if (!raw.results) continue;

        for (const bar of raw.results) {
            const tradeDate = new Date(bar.t);
            // End of Day + 4 hours for market data availability
            const availableAt = new Date(bar.t + (4 * 60 * 60 * 1000)); 
            
            await prisma.pitPriceFact.create({
                data: {
                    securityId,
                    tradeDate,
                    availableAt,
                    open: bar.o,
                    high: bar.h,
                    low: bar.l,
                    close: bar.c,
                    volume: BigInt(bar.v)
                }
            });
        }
        console.log(`Inserted ${raw.results.length} price facts for ${ticker}.`);
    }
}

async function processFundamentals(cik: string, securityId: string) {
    console.log(`Normalizing SEC Fundamentals for CIK ${cik}...`);
    const concepts = ['Revenues', 'NetIncomeLoss', 'EarningsPerShareDiluted'];
    
    // Group all facts by fiscal period to resolve bitemporal chains
    const periods = new Map<string, any[]>(); // Key: 'FY-FP-END', Value: Array of facts

    for (const concept of concepts) {
        const p = path.join(RAW_DIR, `sec/fundamentals/${cik}_${concept}.json`);
        if (!fs.existsSync(p)) continue;
        
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const units = Object.keys(raw.units || {})[0];
        if (!units) continue;

        for (const fact of raw.units[units]) {
            if (!fact.fy || !fact.fp || !fact.end) continue;
            // SEC files 10-K with fp='FY'. We only care about quarterly ('Q1','Q2','Q3') and annual ('FY').
            const key = `${fact.fy}-${fact.fp}-${fact.end}`;
            if (!periods.has(key)) periods.set(key, []);
            
            periods.get(key)!.push({
                concept,
                val: fact.val,
                filed: new Date(fact.filed),
                accn: fact.accn
            });
        }
    }

    // Now process bitemporal restatements per period
    let inserted = 0;
    for (const [key, facts] of periods.entries()) {
        const [fy, fp, end] = key.split('-');
        
        // Group facts by accession number (i.e. by filing)
        const filings = new Map<string, any>();
        for (const f of facts) {
            if (!filings.has(f.accn)) {
                filings.set(f.accn, { filed: f.filed, accn: f.accn, metrics: {} });
            }
            filings.get(f.accn)!.metrics[f.concept] = f.val;
        }

        // Sort filings chronologically to build the supersededAt chain
        const sortedFilings = Array.from(filings.values()).sort((a, b) => a.filed.getTime() - b.filed.getTime());

        for (let i = 0; i < sortedFilings.length; i++) {
            const filing = sortedFilings[i];
            const publishedAt = filing.filed;
            const availableAt = new Date(publishedAt.getTime() + SYSTEM_LATENCY_MS);
            
            // Superseded by the NEXT filing's availableAt time (if any)
            let supersededAt = new Date('9999-12-31 23:59:59');
            if (i < sortedFilings.length - 1) {
                const nextFiling = sortedFilings[i + 1];
                supersededAt = new Date(nextFiling.filed.getTime() + SYSTEM_LATENCY_MS);
            }

            try {
                await prisma.pitFundamentalFact.create({
                    data: {
                        securityId,
                        fiscalYear: parseInt(fy),
                        fiscalPeriod: fp,
                        periodEndDate: new Date(end),
                        publishedAt,
                        availableAt,
                        supersededAt,
                        accessionNum: filing.accn,
                        isRestatement: i > 0, // True if not the first version
                        revenue: filing.metrics['Revenues'] || null,
                        netIncome: filing.metrics['NetIncomeLoss'] || null,
                        epsDiluted: filing.metrics['EarningsPerShareDiluted'] || null
                    }
                });
                inserted++;
            } catch (e: any) {
                if (!e.message.includes('no_overlap_fundamentals')) {
                    console.error(`Failed to insert filing ${filing.accn}:`, e.message);
                }
            }
        }
    }
    console.log(`Inserted ${inserted} bitemporal fundamental versions for CIK ${cik}.`);
}

async function main() {
    console.log("=== R2-A.1.4 NORMALIZATION & PIT WRITE ===");
    
    // Clear DB
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "PitEntity" CASCADE;`);

    const CANARY = [
        { ticker: 'AAPL', cik: '0000320193' },
        { ticker: 'META', cik: '0001326801' },
        { ticker: 'NVDA', cik: '0001045810' },
        { ticker: 'BBBYQ', cik: '0000886158' }
        // Skipping MSFT because SEC uses different GAAP tags for them!
    ];

    for (const c of CANARY) {
        // Create Identity
        const entity = await prisma.pitEntity.create({ data: { cik: c.cik, name: c.ticker } });
        const sec = await prisma.pitSecurity.create({ data: { entityId: entity.id, issueType: 'CS' } });
        await prisma.pitTickerHistory.create({ data: { securityId: sec.id, ticker: c.ticker, startDate: new Date('2000-01-01') } });
        
        await processFundamentals(c.cik, sec.id);
        await processPrices(c.ticker, sec.id);
    }
    
    console.log("=== NORMALIZATION COMPLETE ===");
}

main().finally(() => prisma.$disconnect());
