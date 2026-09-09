/**
 * ⛔ LOCKED — normalizer-v5.ts BYPASSES the validated SecPitFundamentalReconstructor
 * =============================================================================
 *
 * This file is LOCKED and will not execute. It bypasses 14 PIT invariants
 * enforced by SecPitFundamentalReconstructor. Key issues:
 *
 *   1. `isRestatement` is HARDCODED to `false` — restatements are never detected
 *   2. Only 3 of 20 canonical concepts are mapped (Revenues, NetIncomeLoss, EPS)
 *   3. Uses `filed` date + 2h latency instead of SEC `acceptedAt` timestamp
 *   4. Does not use SecConceptDictionary for canonical concept resolution
 *   5. Does not use SecXbrlContextClassifier for period type validation
 *
 * CERTIFIED REPLACEMENT:
 *   Use `scripts/quant/p4/sec-fundamentals/ingest-20-concepts.ts` instead.
 *   That script routes ALL facts through SecPitFundamentalReconstructor.reconstructSnapshot(),
 *   which enforces 14 PIT invariants, restatement logic, and deterministic ordering.
 *   It also expands coverage from 3 to 20 canonical concepts.
 *
 * See: AGENTS.md → PRODUCT-PIT-INTEGRITY-AUDIT.md
 * See: docs/PRODUCT-PIT-INTEGRITY-AUDIT.md → "Deprecated Ingestion Path"
 */

// ⛔ HARD LOCK — prevent execution
console.error('⛔ normalizer-v5.ts is LOCKED. Use scripts/quant/p4/sec-fundamentals/ingest-20-concepts.ts instead.');
console.error('   This file bypasses PIT invariants and must not be used.');
console.error('   See: docs/PRODUCT-PIT-INTEGRITY-AUDIT.md');
process.exit(1);

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
let rawCount = 0, acceptedCount = 0, quarantineCount = 0, ignoredCount = 0;

function hashRecord(record: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

const ALIAS_TREE: Record<string, { aliases: string[], unit: string }> = {
    'Revenues': { aliases: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet'], unit: 'USD' },
    'NetIncomeLoss': { aliases: ['NetIncomeLoss'], unit: 'USD' },
    'EarningsPerShareDiluted': { aliases: ['EarningsPerShareDiluted'], unit: 'USD/shares' }
};

function resolveMetric(rawConcept: string, rawUnit: string, rawRecord: any): { canonical?: string, error?: string, reason?: string, ignore?: boolean } {
    if (rawRecord.val === null || rawRecord.val === undefined) return { error: 'MALFORMED_FACT', reason: 'Missing value' };
    if (!['Q1','Q2','Q3','FY'].includes(rawRecord.fp)) return { ignore: true, reason: `Context non-standard: ${rawRecord.fp}` };

    const candidates = [];
    for (const [canonical, rules] of Object.entries(ALIAS_TREE)) {
        if (rules.aliases.includes(rawConcept)) {
            if (rawUnit === rules.unit) candidates.push(canonical);
            else return { error: 'UNIT_UNSUPPORTED', reason: `Expected ${rules.unit}, got ${rawUnit}` };
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

    // INJECT ADVERSARIAL RESTATEMENT TEST (2 different periodEnds for same FY2018)
    if (cik === '0000320193') { 
        usGaap['Revenues'].units['USD'] = usGaap['Revenues'].units['USD'].filter((f:any) => !(f.fy === 2018 && f.fp === 'FY'));
        usGaap['NetIncomeLoss'].units['USD'] = usGaap['NetIncomeLoss'].units['USD'].filter((f:any) => !(f.fy === 2018 && f.fp === 'FY'));
        usGaap['EarningsPerShareDiluted'].units['USD/shares'] = usGaap['EarningsPerShareDiluted'].units['USD/shares'].filter((f:any) => !(f.fy === 2018 && f.fp === 'FY'));
        
        usGaap['Revenues'].units['USD'].push(
            { val: 100, fy: 2018, fp: 'FY', end: '2018-09-30', filed: '2018-11-01', accn: 'V1' },
            { val: 90, fy: 2018, fp: 'FY', end: '2017-09-30', filed: '2018-11-01', accn: 'V1' } // Comparative prior year reported in FY2018 filing!
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
                if (resolution.ignore) { ignoredCount++; continue; }
                if (resolution.error) {
                    quarantine.push({ error: resolution.error, reason: resolution.reason, concept, unit, fact });
                    quarantineCount++;
                    continue;
                }

                acceptedCount++;
                // KEY GROUPING MUST INCLUDE END DATE! 
                const key = `${fact.fy}|${fact.fp}|${fact.end}`;
                if (!periods.has(key)) periods.set(key, []);
                periods.get(key)!.push({ concept: resolution.canonical, val: fact.val, filed: new Date(fact.filed), accn: fact.accn, sourceHash: hashRecord(fact) });
            }
        }
    }

    // Now insert grouped bitemporal chains
    for (const [key, facts] of periods.entries()) {
        const [fy, fp, end] = key.split('|');
        
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
                    securityId, fiscalYear: parseInt(fy), fiscalPeriod: fp, periodEndDate: new Date(end),
                    publishedAt, availableAt, supersededAt, accessionNum: filing.accn,
                    isRestatement: false, // ⚠️ HARDCODED — should use SecPitFundamentalReconstructor's isRestatement
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
    console.log("=== R2-A.1.8 PRODUCTION PATH NORMALIZER V5 ===");
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
}

main().finally(() => prisma.$disconnect());
