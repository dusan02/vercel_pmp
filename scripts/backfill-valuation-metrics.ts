/**
 * Backfill the extended DailyValuationHistory metric columns
 * (pbRatio, evFcf, evRevenue, roe, roic, currentRatio, debtToEquity) for
 * existing rows — they were added to computeDayRatios later, so historical
 * rows carry NULLs.
 *
 * Fully local: recomputes each row's ratios via the same computeDayRatios
 * used by fillValuationDay/syncValuationHistory (DailyRef close stored on
 * the row + FinancialStatement TTM as-of the row date). Only writes the new
 * columns; never touches closePrice/marketCap/existing ratios.
 *
 * Usage:
 *   npx tsx scripts/backfill-valuation-metrics.ts [--symbol=NFLX] [--dry-run]
 *
 * After running, flush Redis so API responses pick up the new fields:
 *   redis-cli -p 6380 --scan --pattern "candles:*" | xargs -r redis-cli -p 6380 DEL
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { computeDayRatios } from '../src/services/analysis/fillValuationDay';
import type { FinancialStatement } from '@prisma/client';

const dryRun = process.argv.includes('--dry-run');
const symbolArg = process.argv.find(a => a.startsWith('--symbol='))?.split('=')[1]?.toUpperCase();

const NEW_FIELDS = ['pbRatio', 'evFcf', 'evRevenue', 'roe', 'roic', 'currentRatio', 'debtToEquity'] as const;

async function main() {
    const symbols = symbolArg
        ? [symbolArg]
        : (await prisma.dailyValuationHistory.findMany({
            where: { pbRatio: null, closePrice: { not: null } },
            select: { symbol: true },
            distinct: ['symbol'],
        })).map(r => r.symbol);

    console.log(`[backfill] ${symbols.length} symbols with missing metric rows${dryRun ? ' (dry-run)' : ''}`);

    let rowsScanned = 0, rowsUpdated = 0, symbolsDone = 0;
    for (const symbol of symbols) {
        const rows = await prisma.dailyValuationHistory.findMany({
            where: { symbol, closePrice: { not: null } },
            orderBy: { date: 'asc' },
            select: { symbol: true, date: true, closePrice: true },
        });
        if (!rows.length) { symbolsDone++; continue; }

        const statements: FinancialStatement[] = await prisma.financialStatement.findMany({
            where: { symbol },
            orderBy: { endDate: 'desc' },
        });
        const ticker = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sharesOutstanding: true },
        });

        const updates = rows
            .map(r => {
                const ratios = computeDayRatios(statements, r.closePrice!, r.date, ticker?.sharesOutstanding ?? null);
                const data = Object.fromEntries(NEW_FIELDS.map(f => [f, ratios[f]]));
                // Skip writes that would set everything to null (no data anyway)
                return Object.values(data).every(v => v === null) ? null : { symbol: r.symbol, date: r.date, data };
            })
            .filter((u): u is NonNullable<typeof u> => u !== null);

        rowsScanned += rows.length;
        if (!dryRun && updates.length) {
            const CHUNK = 400;
            for (let i = 0; i < updates.length; i += CHUNK) {
                await prisma.$transaction(
                    updates.slice(i, i + CHUNK).map(u => prisma.dailyValuationHistory.update({
                        where: { symbol_date: { symbol: u.symbol, date: u.date } },
                        data: u.data,
                    }))
                );
            }
        }
        rowsUpdated += updates.length;
        symbolsDone++;
        if (symbolsDone % 50 === 0 || symbolsDone === symbols.length) {
            console.log(`[backfill] ${symbolsDone}/${symbols.length} symbols — ${rowsScanned} rows scanned, ${rowsUpdated} updated`);
        }
    }
    console.log(`[backfill] done: ${rowsUpdated}/${rowsScanned} rows updated across ${symbolsDone} symbols`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
