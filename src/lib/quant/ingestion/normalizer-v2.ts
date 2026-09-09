import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '../p4-engine/db/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.PIT_DATABASE_URL || "postgresql://postgres:postgres@localhost:54320/postgres?schema=public" } } });
const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw');
const QUARANTINE_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/quarantine');

// Ensure quarantine dir exists
if (!fs.existsSync(QUARANTINE_DIR)) fs.mkdirSync(QUARANTINE_DIR, { recursive: true });

const SYSTEM_LATENCY_MS = 2 * 60 * 60 * 1000;

function hashRecord(record: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

// ---------------------------------------------------------
// TICKER RESOLUTION ENGINE
// ---------------------------------------------------------
async function buildTickerHistory(securityId: string, cik: string, defaultTicker: string) {
    if (cik === '0001326801') { // META
        // The real economic ticker change happened on June 9, 2022
        await prisma.pitTickerHistory.create({ data: { securityId, ticker: 'FB', startDate: new Date('2012-05-18'), endDate: new Date('2022-06-09') } });
        await prisma.pitTickerHistory.create({ data: { securityId, ticker: 'META', startDate: new Date('2022-06-09') } });
    } else {
        await prisma.pitTickerHistory.create({ data: { securityId, ticker: defaultTicker, startDate: new Date('2000-01-01') } });
    }
}

// ---------------------------------------------------------
// METRIC ALIAS TREE & MAPPING ENGINE
// ---------------------------------------------------------
const ALIAS_TREE: Record<string, { aliases: string[], unit: string }> = {
    'Revenues': {
        aliases: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet'],
        unit: 'USD'
    },
    'NetIncomeLoss': {
        aliases: ['NetIncomeLoss'],
        unit: 'USD'
    },
    'EarningsPerShareDiluted': {
        aliases: ['EarningsPerShareDiluted'],
        unit: 'USD/shares'
    }
};

const quarantine: any[] = [];

function resolveMetric(rawConcept: string, rawUnit: string, rawRecord: any): { canonical?: string, error?: string } {
    const candidates = [];
    for (const [canonical, rules] of Object.entries(ALIAS_TREE)) {
        if (rules.aliases.includes(rawConcept)) {
            if (rawUnit === rules.unit) {
                candidates.push(canonical);
            } else {
                return { error: `UNIT_UNSUPPORTED: expected ${rules.unit}, got ${rawUnit}` };
            }
        }
    }
    
    if (candidates.length === 0) return { error: `MAPPING_UNRESOLVED: Concept ${rawConcept} unknown` };
    if (candidates.length > 1) return { error: `MAPPING_AMBIGUOUS: Concept ${rawConcept} matches multiple canonical metrics` };
    
    return { canonical: candidates[0] };
}

// ---------------------------------------------------------
// PROCESSORS
// ---------------------------------------------------------
async function processPrices(ticker: string, securityId: string) {
    const files = fs.readdirSync(path.join(RAW_DIR, 'polygon/prices')).filter(f => f.startsWith(ticker));
    
    for (const file of files) {
        const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'polygon/prices', file), 'utf-8'));
        if (!raw.results) continue;

        const dataRows = raw.results.map((bar: any) => ({
            securityId,
            tradeDate: new Date(bar.t),
            availableAt: new Date(bar.t + (4 * 60 * 60 * 1000)),
            open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: BigInt(bar.v),
            sourceRecordHash: hashRecord(bar),
            sourceProvider: 'POLYGON',
            sourceType: 'DAILY_BAR'
        }));
        await prisma.pitPriceFact.createMany({ data: dataRows });
    }
}

async function processFundamentals(cik: string, securityId: string) {
    const rawConcepts = ['Revenues', 'NetIncomeLoss', 'EarningsPerShareDiluted', 'RevenueFromContractWithCustomerExcludingAssessedTax'];
    const periods = new Map<string, any[]>();

    for (const concept of rawConcepts) {
        const p = path.join(RAW_DIR, `sec/fundamentals/${cik}_${concept}.json`);
        if (!fs.existsSync(p)) continue;
        
        const rawFile = JSON.parse(fs.readFileSync(p, 'utf-8'));
        for (const [unit, facts] of Object.entries(rawFile.units || {})) {
            for (const fact of (facts as any[])) {
                if (!fact.fy || !fact.fp || !fact.end || !['Q1','Q2','Q3','FY'].includes(fact.fp)) continue;
                
                // MAPPING GATE
                const resolution = resolveMetric(concept, unit, fact);
                if (resolution.error) {
                    quarantine.push({ reason: resolution.error, rawConcept: concept, unit, rawRecord: fact });
                    continue;
                }

                const key = `${fact.fy}-${fact.fp}-${fact.end}`;
                if (!periods.has(key)) periods.set(key, []);
                
                periods.get(key)!.push({
                    concept: resolution.canonical,
                    val: fact.val,
                    filed: new Date(fact.filed),
                    accn: fact.accn,
                    sourceHash: hashRecord(fact) // atomic lineage
                });
            }
        }
    }

    for (const [key, facts] of periods.entries()) {
        const [fy, fp, end] = key.split('-');
        
        const filings = new Map<string, any>();
        for (const f of facts) {
            if (!filings.has(f.accn)) {
                filings.set(f.accn, { filed: f.filed, accn: f.accn, metrics: {}, sourceHash: f.sourceHash });
            }
            filings.get(f.accn)!.metrics[f.concept] = f.val;
        }

        const sortedFilings = Array.from(filings.values()).sort((a, b) => a.filed.getTime() - b.filed.getTime());

        for (let i = 0; i < sortedFilings.length; i++) {
            const filing = sortedFilings[i];
            const publishedAt = filing.filed;
            const availableAt = new Date(publishedAt.getTime() + SYSTEM_LATENCY_MS);
            let supersededAt = new Date('9999-12-31 23:59:59');
            
            if (i < sortedFilings.length - 1) {
                supersededAt = new Date(sortedFilings[i + 1].filed.getTime() + SYSTEM_LATENCY_MS);
            }

            try {
                await prisma.pitFundamentalFact.create({
                    data: {
                        securityId, fiscalYear: parseInt(fy), fiscalPeriod: fp, periodEndDate: new Date(end),
                        publishedAt, availableAt, supersededAt, accessionNum: filing.accn, isRestatement: i > 0,
                        revenue: filing.metrics['Revenues'] || null,
                        netIncome: filing.metrics['NetIncomeLoss'] || null,
                        epsDiluted: filing.metrics['EarningsPerShareDiluted'] || null,
                        sourceRecordHash: filing.sourceHash, sourceProvider: 'SEC_EDGAR', sourceType: '10Q/10K'
                    }
                });
            } catch (e: any) {
                if (!e.message.includes('no_overlap_fundamentals')) {
                    quarantine.push({ reason: 'DB_INSERT_FAIL', message: e.message, record: filing });
                }
            }
        }
    }
}

async function main() {
    console.log("=== NORMALIZER V2 ===");
    
    // We already truncated the DB in the previous bash script (force-reset)
    
    const CANARY = [
        { ticker: 'AAPL', cik: '0000320193' },
        { ticker: 'META', cik: '0001326801' },
        { ticker: 'NVDA', cik: '0001045810' },
        { ticker: 'BBBYQ', cik: '0000886158' },
        { ticker: 'MSFT', cik: '0000078901' } // MSFT IS BACK IN!
    ];

    for (const c of CANARY) {
        const entity = await prisma.pitEntity.create({ data: { cik: c.cik, name: c.ticker } });
        const sec = await prisma.pitSecurity.create({ data: { entityId: entity.id, issueType: 'CS' } });
        
        await buildTickerHistory(sec.id, c.cik, c.ticker);
        
        // Let's also insert the lifecycle fact
        await prisma.pitSecurityLifecycleFact.create({
            data: {
                securityId: sec.id, eventType: 'LISTED', effectiveDate: new Date('2000-01-01'), availableAt: new Date('2000-01-01'),
                sourceRecordHash: 'SYNTHETIC_FOR_TEST', sourceProvider: 'SYSTEM', sourceType: 'LIFECYCLE'
            }
        });

        await processFundamentals(c.cik, sec.id);
        if (c.ticker !== 'MSFT') { // We didn't fetch MSFT polygon data in the very first script if it crashed, wait, we did!
            await processPrices(c.ticker, sec.id);
        } else {
            await processPrices('MSFT', sec.id);
        }
    }
    
    if (quarantine.length > 0) {
        fs.writeFileSync(path.join(QUARANTINE_DIR, 'rejected_facts.json'), JSON.stringify(quarantine, null, 2));
        console.log(`[WARN] ${quarantine.length} facts sent to Quarantine. Check data/quarantine/rejected_facts.json`);
    }

    console.log("=== NORMALIZATION V2 COMPLETE ===");
}

main().finally(() => prisma.$disconnect());
