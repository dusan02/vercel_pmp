import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '../p4-engine/db/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.PIT_DATABASE_URL || "postgresql://postgres:postgres@localhost:54320/postgres?schema=public" } } });
const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw');
const SYSTEM_LATENCY_MS = 2 * 60 * 60 * 1000;

function hashRecord(record: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

const ALIAS_TREE: Record<string, { aliases: string[], unit: string }> = {
    'Revenues': { aliases: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet'], unit: 'USD' },
    'NetIncomeLoss': { aliases: ['NetIncomeLoss'], unit: 'USD' },
    'EarningsPerShareDiluted': { aliases: ['EarningsPerShareDiluted'], unit: 'USD/shares' }
};

function resolveMetric(rawConcept: string, rawUnit: string, rawRecord: any) {
    if (rawRecord.val === null || rawRecord.val === undefined) return { error: 'MALFORMED' };
    if (!['Q1','Q2','Q3','FY'].includes(rawRecord.fp)) return { ignore: true };

    const candidates = [];
    for (const [canonical, rules] of Object.entries(ALIAS_TREE)) {
        if (rules.aliases.includes(rawConcept) && rawUnit === rules.unit) {
            candidates.push(canonical);
        }
    }
    if (candidates.length !== 1) return { error: 'UNRESOLVED' };
    return { canonical: candidates[0] };
}

async function processSecBulk(cik: string, securityId: string) {
    const p = path.join(RAW_DIR, `sec/companyfacts/${cik}.json`);
    if (!fs.existsSync(p)) return;
    
    const rawFile = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const usGaap = rawFile.facts?.['us-gaap'];
    if (!usGaap) return;

    const periods = new Map<string, any[]>();

    for (const [concept, conceptData] of Object.entries(usGaap as any)) {
        for (const [unit, facts] of Object.entries((conceptData as any).units || {})) {
            for (const fact of (facts as any[])) {
                if (!fact.fy || !fact.fp || !fact.end || !fact.filed) continue;
                
                const resolution = resolveMetric(concept, unit, fact);
                if (resolution.error || resolution.ignore) continue;

                const key = `${fact.fy}|${fact.fp}|${fact.end}`;
                if (!periods.has(key)) periods.set(key, []);
                periods.get(key)!.push({ concept: resolution.canonical, val: fact.val, filed: new Date(fact.filed), accn: fact.accn, sourceHash: hashRecord(fact) });
            }
        }
    }

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
                    publishedAt, availableAt, supersededAt, accessionNum: filing.accn, isRestatement: false,
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
    console.log("=== R2-A.2 CLEAN HISTORICAL INGESTION ===");
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
        await prisma.pitTickerHistory.create({ data: { securityId: sec.id, ticker: c.ticker, startDate: new Date('2000-01-01') } });
        await processSecBulk(c.cik, sec.id);
    }
}

main().finally(() => prisma.$disconnect());
