/**
 * Backfill the extended DailyValuationHistory metric columns
 * (pbRatio, evFcf, evRevenue, roe, roic, currentRatio, debtToEquity) for
 * existing rows — they were added to computeDayRatios later, so historical
 * rows carry NULLs.
 *
 * Fully local except optional Polygon splits lookup (7-day Redis cache).
 * Recomputes each row's ratios via the same computeDayRatios used by
 * fillValuationDay/syncValuationHistory (DailyRef close stored on the row +
 * FinancialStatement TTM as-of the row date). Writes the new columns plus
 * marketCap (stale values pre-date split normalization); never touches
 * closePrice or the repair-script-owned pe/ps/evEbitda/fcfYield columns.
 *
 * Usage:
 *   npx tsx scripts/backfill-valuation-metrics.ts [--symbol=NFLX] [--force] [--dry-run]
 *
 *   --force  reprocess symbols even where pbRatio is already populated —
 *            needed after fixing share normalization (first run wrote
 *            pre-split-basis values)
 *
 * After running, flush Redis so API responses pick up the new fields:
 *   redis-cli -p 6380 --scan --pattern "candles:*" | xargs -r redis-cli -p 6380 DEL
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { computeDayRatios } from '../src/services/analysis/fillValuationDay';
import { applySplitAdjustments, applyPostSplitAdjustment } from '../src/lib/utils/splitAdjustment';
import type { FinancialStatement } from '@prisma/client';

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const symbolArg = process.argv.find(a => a.startsWith('--symbol='))?.split('=')[1]?.toUpperCase();

const NEW_FIELDS = ['pbRatio', 'evFcf', 'evRevenue', 'roe', 'roic', 'currentRatio', 'debtToEquity'] as const;

async function main() {
    const symbols = symbolArg
        ? [symbolArg]
        : (await prisma.dailyValuationHistory.findMany({
            where: { closePrice: { not: null }, ...(force ? {} : { pbRatio: null }) },
            select: { symbol: true },
            distinct: ['symbol'],
        })).map(r => r.symbol);

    console.log(`[backfill] ${symbols.length} symbols${force ? ' (force — all rows)' : ' with missing metric rows'}${dryRun ? ' (dry-run)' : ''}`);

    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

    let rowsScanned = 0, rowsUpdated = 0, symbolsDone = 0;
    for (const symbol of symbols) {
        const rows = await prisma.dailyValuationHistory.findMany({
            where: { symbol, closePrice: { not: null } },
            orderBy: { date: 'asc' },
            select: { symbol: true, date: true, closePrice: true },
        });
        if (!rows.length) { symbolsDone++; continue; }

        // Normalize statement share counts to the post-split basis BEFORE
        // computing — mirrors repair-valuation-history-ttm.ts (Polygon splits
        // authoritative; computeDayRatios' internal jump heuristic then finds
        // no residual jumps, so no double-counting).
        const statements: FinancialStatement[] = await prisma.financialStatement.findMany({
            where: { symbol },
            orderBy: { endDate: 'desc' },
        });
        const ticker = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sharesOutstanding: true },
        });
        try {
            await applySplitAdjustments(statements, symbol, tenYearsAgo);
            applyPostSplitAdjustment(statements, ticker?.sharesOutstanding ?? null);
        } catch { /* normalization optional — heuristic inside computeDayRatios still applies */ }

        const updates = rows
            .map(r => {
                const ratios = computeDayRatios(statements, r.closePrice!, r.date, ticker?.sharesOutstanding ?? null);
                const data: Record<string, number | null> = {
                    ...Object.fromEntries(NEW_FIELDS.map(f => [f, ratios[f]])),
                    marketCap: ratios.marketCap,
                };
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
