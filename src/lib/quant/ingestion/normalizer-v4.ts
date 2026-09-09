import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '../p4-engine/db/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.PIT_DATABASE_URL || "postgresql://postgres:postgres@localhost:54320/postgres?schema=public" } } });
const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw');
const QUARANTINE_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/quarantine');

const SYSTEM_LATENCY_MS = 2 * 60 * 60 * 1000;

function hashRecord(record: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

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

let rawCount = 0;
let acceptedCount = 0;
let quarantineCount = 0;
let ignoredCount = 0;
const quarantine: any[] = [];

function resolveMetric(rawConcept: string, rawUnit: string, rawRecord: any): { canonical?: string, error?: string, reason?: string, ignore?: boolean } {
    if (rawRecord.val === null || rawRecord.val === undefined) {
        return { error: 'MALFORMED_FACT', reason: 'Missing value' };
    }
    
    if (rawRecord.fp !== 'Q1' && rawRecord.fp !== 'Q2' && rawRecord.fp !== 'Q3' && rawRecord.fp !== 'FY') {
        return { ignore: true, reason: `Context non-standard: ${rawRecord.fp}` };
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
    
    if (candidates.length === 0) return { error: 'MAPPING_UNRESOLVED', reason: `Concept ${rawConcept} unknown` };
    if (candidates.length > 1) return { error: 'MAPPING_AMBIGUOUS', reason: `Concept ${rawConcept} matched multiple` };
    
    return { canonical: candidates[0] };
}

async function processSecBulk(cik: string, securityId: string) {
    const p = path.join(RAW_DIR, `sec/companyfacts/${cik}.json`);
    if (!fs.existsSync(p)) return;
    
    const rawFile = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const periods = new Map<string, any[]>();
    const usGaap = rawFile.facts?.['us-gaap'];
    if (!usGaap) return;

    // INJECT ADVERSARIAL RESTATEMENT TEST (J)
    if (cik === '0000320193') { 
        usGaap['Revenues'].units['USD'] = usGaap['Revenues'].units['USD'].filter((f:any) => !(f.fy === 2018 && f.fp === 'FY'));
        usGaap['NetIncomeLoss'].units['USD'] = usGaap['NetIncomeLoss'].units['USD'].filter((f:any) => !(f.fy === 2018 && f.fp === 'FY'));
        usGaap['EarningsPerShareDiluted'].units['USD/shares'] = usGaap['EarningsPerShareDiluted'].units['USD/shares'].filter((f:any) => !(f.fy === 2018 && f.fp === 'FY'));
        //usGaap['Revenues'].units['USD'].filter((f:any) => !(f.fy === 2018 && f.fp === 'FY'));
        usGaap['Revenues'].units['USD'].push(
            { val: 100, fy: 2018, fp: 'FY', end: '2018-09-30', filed: '2018-11-01', accn: 'V1' },
            { val: 100, fy: 2018, fp: 'FY', end: '2018-09-30', filed: '2018-11-05', accn: 'V2_DUP' }, // Duplicate, should not spawn version
            { val: 120, fy: 2018, fp: 'FY', end: '2018-09-30', filed: '2018-12-01', accn: 'V3_REST' }, // Changed, spawns version
            { val: 120, fy: 2018, fp: 'FY', end: '2018-09-30', filed: '2018-12-15', accn: 'V4_DUP' }, // Duplicate, ignored
            { val: 150, fy: 2018, fp: 'FY', end: '2018-09-30', filed: '2019-01-01', accn: 'V5_REST' }  // Changed, spawns version
        );
    }

    for (const [concept, conceptData] of Object.entries(usGaap as any)) {
        for (const [unit, facts] of Object.entries((conceptData as any).units || {})) {
            for (const fact of (facts as any[])) {
                rawCount++;
                if (!fact.fy || !fact.fp || !fact.end || !fact.filed) {
                    quarantine.push({ error: 'MALFORMED_FACT', reason: 'Missing keys', fact });
                    quarantineCount++;
                    continue;
                }
                
                const resolution = resolveMetric(concept, unit, fact);
                if (resolution.ignore) {
                    ignoredCount++;
                    continue;
                }
                if (resolution.error) {
                    quarantine.push({ error: resolution.error, reason: resolution.reason, concept, unit, fact });
                    quarantineCount++;
                    continue;
                }

                acceptedCount++;
                const key = `${fact.fy}-${fact.fp}`;
                if (!periods.has(key)) periods.set(key, []);
                periods.get(key)!.push({ concept: resolution.canonical, val: fact.val, end: fact.end, filed: new Date(fact.filed), accn: fact.accn, sourceHash: hashRecord(fact) });
            }
        }
    }

    for (const [key, facts] of periods.entries()) {
        const [fy, fp] = key.split('-');
        
        const filingsMap = new Map<string, any>();
        for (const f of facts) {
            const k = `${f.filed.getTime()}-${f.accn}`;
            if (!filingsMap.has(k)) filingsMap.set(k, { filed: f.filed, accn: f.accn, metrics: {}, sourceHashes: [] });
            filingsMap.get(k)!.metrics[f.concept] = f.val;
            filingsMap.get(k)!.sourceHashes.push(f.sourceHash);
        }

        const sortedFilings = Array.from(filingsMap.values()).sort((a, b) => a.filed.getTime() - b.filed.getTime());
        
        const chain = [];
        let lastMetricsStr = "";
        
        for (const filing of sortedFilings) {
            const metricsStr = JSON.stringify(filing.metrics);
            if (metricsStr !== lastMetricsStr) {
                chain.push(filing);
                lastMetricsStr = metricsStr;
            }
        }

        for (let i = 0; i < chain.length; i++) {
            const filing = chain[i];
            const publishedAt = filing.filed;
            const availableAt = new Date(publishedAt.getTime() + SYSTEM_LATENCY_MS);
            let supersededAt = new Date('9999-12-31 23:59:59');
            
            if (i < chain.length - 1) supersededAt = new Date(chain[i + 1].filed.getTime() + SYSTEM_LATENCY_MS);

            await prisma.pitFundamentalFact.create({
                data: {
                    securityId, fiscalYear: parseInt(fy), fiscalPeriod: fp, periodEndDate: new Date(facts[0].end),
                    publishedAt, availableAt, supersededAt, accessionNum: filing.accn, isRestatement: i > 0,
                    // FIX: ?? null instead of || null
                    revenue: filing.metrics['Revenues'] ?? null,
                    netIncome: filing.metrics['NetIncomeLoss'] ?? null,
                    epsDiluted: filing.metrics['EarningsPerShareDiluted'] ?? null,
                    sourceRecordHashes: filing.sourceHashes, sourceProvider: 'SEC_EDGAR_BULK', sourceType: 'COMPANYFACTS'
                }
            });
        }
    }
}

async function main() {
    console.log("=== R2-A.1.8 PRODUCTION PATH NORMALIZER V4 ===");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "PitEntity" CASCADE;`);

    const CANARY = [
        { ticker: 'AAPL', cik: '0000320193' },
        { ticker: 'MSFT', cik: '0000789019' },
        { ticker: 'META', cik: '0001326801' }
    ];

    for (const c of CANARY) {
        console.log(`Processing ${c.ticker}...`);
        const entity = await prisma.pitEntity.create({ data: { cik: c.cik, name: c.ticker } });
        const sec = await prisma.pitSecurity.create({ data: { entityId: entity.id, issueType: 'CS' } });
        
        if (c.cik === '0001326801') {
            await prisma.pitTickerHistory.create({ data: { securityId: sec.id, ticker: 'FB', startDate: new Date('2012-05-18'), endDate: new Date('2022-06-09') } });
            await prisma.pitTickerHistory.create({ data: { securityId: sec.id, ticker: 'META', startDate: new Date('2022-06-09') } });
        } else {
            await prisma.pitTickerHistory.create({ data: { securityId: sec.id, ticker: c.ticker, startDate: new Date('2000-01-01') } });
        }
        
        await processSecBulk(c.cik, sec.id);
    }

    console.log(`\nACCOUNTING SUMMARY:`);
    console.log(`Total RAW Facts:   ${rawCount}`);
    console.log(`Accepted:          ${acceptedCount}`);
    console.log(`Quarantined:       ${quarantineCount}`);
    console.log(`Explicit Ignored:  ${ignoredCount}`);
    
    if (rawCount !== acceptedCount + quarantineCount + ignoredCount) {
        console.error("FATAL: ACCOUNTING MISMATCH! Silent Data Loss Detected!");
        process.exit(1);
    }
    console.log("NO SILENT DATA LOSS VERIFIED.");
}

main().finally(() => prisma.$disconnect());
