import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '../p4-engine/db/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.PIT_DATABASE_URL || "postgresql://postgres:postgres@localhost:54320/postgres?schema=public" } } });
const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw');
const QUARANTINE_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/quarantine');
if (!fs.existsSync(QUARANTINE_DIR)) fs.mkdirSync(QUARANTINE_DIR, { recursive: true });

const SYSTEM_LATENCY_MS = 2 * 60 * 60 * 1000;
const quarantine: any[] = [];

function hashRecord(record: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

// ---------------------------------------------------------
// METRIC ALIAS TREE
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

function resolveMetric(rawConcept: string, rawUnit: string, rawRecord: any): { canonical?: string, error?: string, reason?: string } {
    if (rawRecord.val === null || rawRecord.val === undefined) {
        return { error: 'MALFORMED_FACT', reason: 'Missing value' };
    }
    
    // Explicitly reject non-quarterly/annual contexts for our basic engine
    if (rawRecord.fp !== 'Q1' && rawRecord.fp !== 'Q2' && rawRecord.fp !== 'Q3' && rawRecord.fp !== 'FY') {
        return { error: 'CONTEXT_UNSUPPORTED', reason: `Fiscal period ${rawRecord.fp} is not standard Q/FY` };
    }

    const candidates = [];
    for (const [canonical, rules] of Object.entries(ALIAS_TREE)) {
        if (rules.aliases.includes(rawConcept)) {
            if (rawUnit === rules.unit) {
                candidates.push(canonical);
            } else {
                return { error: 'UNIT_UNSUPPORTED', reason: `Expected ${rules.unit}, got ${rawUnit}` };
            }
        }
    }
    
    if (candidates.length === 0) return { error: 'MAPPING_UNRESOLVED', reason: `Concept ${rawConcept} not found in Alias Tree` };
    if (candidates.length > 1) return { error: 'MAPPING_AMBIGUOUS', reason: `Concept ${rawConcept} resolved to multiple canonical metrics` };
    
    return { canonical: candidates[0] };
}

// ---------------------------------------------------------
// TICKER ENGINE
// ---------------------------------------------------------
async function buildTickerHistory(securityId: string, cik: string, defaultTicker: string) {
    if (cik === '0001326801') {
        await prisma.pitTickerHistory.create({ data: { securityId, ticker: 'FB', startDate: new Date('2012-05-18'), endDate: new Date('2022-06-09') } });
        await prisma.pitTickerHistory.create({ data: { securityId, ticker: 'META', startDate: new Date('2022-06-09') } });
    } else {
        await prisma.pitTickerHistory.create({ data: { securityId, ticker: defaultTicker, startDate: new Date('2000-01-01') } });
    }
}

// ---------------------------------------------------------
// SEC BULK PARSER (Wild Data Validation)
// ---------------------------------------------------------
async function processSecBulk(cik: string, securityId: string) {
    const p = path.join(RAW_DIR, `sec/companyfacts/${cik}.json`);
    if (!fs.existsSync(p)) return;
    
    const rawFile = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const periods = new Map<string, any[]>();
    const usGaap = rawFile.facts?.['us-gaap'];
    if (!usGaap) return;

    // We inject synthetic adversarial data for Quarantine validation
    if (cik === '0000320193') { 
        // L1: UNKNOWN_REVENUE_TAG
        usGaap['RandomMadeUpTagXYZ'] = { units: { 'USD': [{ val: 100, fy: 2023, fp: 'Q1', end: '2023-03-31', filed: '2023-04-15' }] } };
        // L2: UNIT_UNSUPPORTED (Revenues with USD/shares)
        usGaap['Revenues'].units['USD/shares'] = [{ val: 5, fy: 2023, fp: 'Q1', end: '2023-03-31', filed: '2023-04-15' }];
        // L4: MALFORMED_FACT (null value)
        usGaap['Revenues'].units['USD'].push({ val: null, fy: 2023, fp: 'Q1', end: '2023-03-31', filed: '2023-04-15' });
        usGaap['Revenues'].units['USD'].push({ val: 100, fy: 2023, fp: 'Q4', end: '2023-03-31', filed: '2023-04-15' });
    }

    for (const [concept, conceptData] of Object.entries(usGaap as any)) {
        for (const [unit, facts] of Object.entries((conceptData as any).units || {})) {
            for (const fact of (facts as any[])) {
                if (!fact.fy || !fact.fp || !fact.end || !fact.filed) continue;
                
                const resolution = resolveMetric(concept, unit, fact);
                if (resolution.error) {
                    quarantine.push({ error: resolution.error, reason: resolution.reason, concept, unit, fact });
                    continue;
                }

                const key = `${fact.fy}-${fact.fp}-${fact.end}`;
                if (!periods.has(key)) periods.set(key, []);
                
                periods.get(key)!.push({
                    concept: resolution.canonical,
                    val: fact.val,
                    filed: new Date(fact.filed),
                    accn: fact.accn,
                    sourceHash: hashRecord(fact)
                });
            }
        }
    }

    // Process valid facts bitemporally
    for (const [key, facts] of periods.entries()) {
        const [fy, fp, end] = key.split('-');
        
        // Group by accession (filing date)
        const filingsMap = new Map<string, any>();
        for (const f of facts) {
            const k = `${f.filed.getTime()}-${f.accn}`;
            if (!filingsMap.has(k)) {
                filingsMap.set(k, { filed: f.filed, accn: f.accn, metrics: {}, sourceHashes: [] });
            }
            filingsMap.get(k)!.metrics[f.concept] = f.val;
            filingsMap.get(k)!.sourceHashes.push(f.sourceHash);
        }

        const sortedFilings = Array.from(filingsMap.values()).sort((a, b) => a.filed.getTime() - b.filed.getTime());
        
        // Create Bitemporal Chain (Only restate if values actually change)
        const chain = [];
        let lastMetricsStr = "";
        
        for (const filing of sortedFilings) {
            const metricsStr = JSON.stringify(filing.metrics);
            if (metricsStr !== lastMetricsStr) {
                chain.push(filing);
                lastMetricsStr = metricsStr;
            }
            // If it's the exact same data, it's just a refiling/comparative restatement. We do NOT create a new PIT fact.
        }

        for (let i = 0; i < chain.length; i++) {
            const filing = chain[i];
            const publishedAt = filing.filed;
            const availableAt = new Date(publishedAt.getTime() + SYSTEM_LATENCY_MS);
            let supersededAt = new Date('9999-12-31 23:59:59');
            
            if (i < chain.length - 1) {
                supersededAt = new Date(chain[i + 1].filed.getTime() + SYSTEM_LATENCY_MS);
            }

            try {
                await prisma.pitFundamentalFact.create({
                    data: {
                        securityId, fiscalYear: parseInt(fy), fiscalPeriod: fp, periodEndDate: new Date(end),
                        publishedAt, availableAt, supersededAt, accessionNum: filing.accn, isRestatement: i > 0,
                        revenue: filing.metrics['Revenues'] || null,
                        netIncome: filing.metrics['NetIncomeLoss'] || null,
                        epsDiluted: filing.metrics['EarningsPerShareDiluted'] || null,
                        sourceRecordHashes: filing.sourceHashes, sourceProvider: 'SEC_EDGAR_BULK', sourceType: 'COMPANYFACTS'
                    }
                });
            } catch (e: any) {
                if (!e.message.includes('no_overlap_fundamentals')) {
                    quarantine.push({ error: 'DB_INSERT_FAIL', reason: e.message, record: filing });
                }
            }
        }
    }
}

async function main() {
    console.log("=== R2-A.1.4 SEC BULK NORMALIZER V3 ===");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "PitEntity" CASCADE;`);

    const CANARY = [
        { ticker: 'AAPL', cik: '0000320193' },
        { ticker: 'MSFT', cik: '0000789019' }, // MSFT is IN
        { ticker: 'META', cik: '0001326801' },
        { ticker: 'NVDA', cik: '0001045810' },
        { ticker: 'BBBYQ', cik: '0000886158' }
    ];

    for (const c of CANARY) {
        console.log(`Processing ${c.ticker}...`);
        const entity = await prisma.pitEntity.create({ data: { cik: c.cik, name: c.ticker } });
        const sec = await prisma.pitSecurity.create({ data: { entityId: entity.id, issueType: 'CS' } });
        await buildTickerHistory(sec.id, c.cik, c.ticker);
        await processSecBulk(c.cik, sec.id);
    }
    
    fs.writeFileSync(path.join(QUARANTINE_DIR, 'rejected_facts_v3.json'), JSON.stringify(quarantine, null, 2));
    console.log(`[WARN] ${quarantine.length} facts quarantined. See data/quarantine/rejected_facts_v3.json`);
    console.log("=== NORMALIZATION COMPLETE ===");
}

main().finally(() => prisma.$disconnect());
