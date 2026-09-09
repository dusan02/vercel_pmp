import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '../p4-engine/db/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.PIT_DATABASE_URL || "postgresql://postgres:postgres@localhost:54320/postgres?schema=public" } } });
const RAW_DIR = path.resolve(process.cwd(), 'src/lib/quant/data/raw/polygon/actions');
const SYSTEM_LATENCY_MS = 2 * 60 * 60 * 1000;

async function processActions(ticker: string, securityId: string) {
    const p = path.join(RAW_DIR, `${ticker}.json`);
    if (!fs.existsSync(p)) return;
    
    const rawFile = JSON.parse(fs.readFileSync(p, 'utf-8'));
    
    for (const split of rawFile.splits || []) {
        // Effective date is execution date
        const effectiveDate = new Date(split.execution_date);
        
        // Assume known 14 days prior
        const publishedAt = new Date(effectiveDate.getTime() - 14 * 24 * 60 * 60 * 1000);
        const availableAt = new Date(publishedAt.getTime() + SYSTEM_LATENCY_MS);
        const supersededAt = new Date('9999-12-31 23:59:59');

        await prisma.pitCorporateAction.create({
            data: {
                securityId,
                economicActionId: split.id || `SPLIT-${split.execution_date}`,
                version: 1,
                actionType: 'SPLIT',
                effectiveDate,
                publishedAt,
                availableAt,
                supersededAt,
                splitFactor: split.split_to / split.split_from,
                sourceRecordHash: crypto.createHash('sha256').update(JSON.stringify(split)).digest('hex'),
                sourceProvider: 'POLYGON',
                sourceType: 'SPLIT'
            }
        });
    }

    for (let i = 0; i < (rawFile.dividends || []).length; i++) {
        const div = rawFile.dividends[i];
        
        const effectiveDate = new Date(div.ex_dividend_date); // Ex-date is when it's effective for price adj
        const publishedAt = div.declaration_date ? new Date(div.declaration_date) : new Date(effectiveDate.getTime() - 14 * 24 * 60 * 60 * 1000);
        const availableAt = new Date(publishedAt.getTime() + SYSTEM_LATENCY_MS);
        let supersededAt = new Date('9999-12-31 23:59:59');
        
        // ADVERSARIAL MUTATION: Restate the very first dividend for AAPL
        if (ticker === 'AAPL' && i === 0) {
            supersededAt = new Date(availableAt.getTime() + 48 * 60 * 60 * 1000); // 2 days later, it's corrected
        }

        await prisma.pitCorporateAction.create({
            data: {
                securityId,
                economicActionId: div.id || `DIV-${div.ex_dividend_date}`,
                version: 1,
                actionType: 'DIVIDEND',
                effectiveDate,
                publishedAt,
                availableAt,
                supersededAt,
                dividendAmount: div.cash_amount,
                currency: div.currency,
                recordDate: div.record_date ? new Date(div.record_date) : null,
                payDate: div.pay_date ? new Date(div.pay_date) : null,
                sourceRecordHash: crypto.createHash('sha256').update(JSON.stringify(div)).digest('hex'),
                sourceProvider: 'POLYGON',
                sourceType: 'DIVIDEND'
            }
        });

        // Insert V2 for AAPL
        if (ticker === 'AAPL' && i === 0) {
            await prisma.pitCorporateAction.create({
                data: {
                    securityId,
                    economicActionId: div.id || `DIV-${div.ex_dividend_date}`,
                    version: 2,
                    actionType: 'DIVIDEND',
                    effectiveDate,
                    publishedAt,
                    availableAt: supersededAt,
                    supersededAt: new Date('9999-12-31 23:59:59'),
                    dividendAmount: div.cash_amount + 0.05, // Mutated amount
                    currency: div.currency,
                    recordDate: div.record_date ? new Date(div.record_date) : null,
                    payDate: div.pay_date ? new Date(div.pay_date) : null,
                sourceRecordHash: crypto.createHash('sha256').update(JSON.stringify(div)).digest('hex'),
                sourceProvider: 'POLYGON',
                sourceType: 'DIVIDEND'
                }
            });
        }
    }
}

async function main() {
    console.log("=== R2-A.2 CORPORATE ACTIONS INGESTION ===");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "PitCorporateAction" CASCADE;`);

    const securities = await prisma.pitSecurity.findMany({ include: { entity: true, tickers: true } });

    for (const sec of securities) {
        // Find latest ticker
        const ticker = sec.tickers.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0].ticker;
        console.log(`Processing Actions for ${ticker}...`);
        await processActions(ticker, sec.id);
    }
}

main().finally(() => prisma.$disconnect());
