/**
 * Repair DailyValuationHistory rows corrupted by the split double-adjustment
 * bug (applySplitAdjustments multiplied statements that already reported a
 * post-split share count — LRCX Q1'25 period ended 2024-09-28 but was filed
 * post-split; SMCI FY'24; GOOGL Q2'22). Signature: psRatio/marketCap step
 * ~split-factor between consecutive days while closePrice stays flat.
 *
 * Recomputes every stored row for the target symbols through computeDayRatios
 * (the same formula fillValuationDay/syncValuationHistory use) on statements
 * normalized by the guarded applySplitAdjustments, then rewrites ALL ratio
 * columns where the value drifted. closePrice and peForward are never touched.
 *
 * Usage:
 *   npx tsx scripts/repair-valuation-split-artifacts.ts [--dry-run]
 *   npx tsx scripts/repair-valuation-split-artifacts.ts --symbols=LRCX,SMCI
 *
 * Default symbol set: DVH rows with a >4x day-over-day psRatio or marketCap
 * step while the close moved <40% — i.e. the share-basis artifacts.
 *
 * After running, flush Redis candles + invalidate ISR for repaired tickers:
 *   redis-cli -p 6380 --scan --pattern "candles:*" | xargs -r redis-cli -p 6380 DEL
 *   POST /api/admin/cache/invalidate {"symbol":"<SYM>"}
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { computeDayRatios } from '../src/services/analysis/fillValuationDay';
import { applySplitAdjustments, applyPostSplitAdjustment } from '../src/lib/utils/splitAdjustment';
import { dbWriteRetry as dbWrite } from '../src/lib/db/writeRetry';

const dryRun = process.argv.includes('--dry-run');
const symbolsArg = process.argv.find(a => a.startsWith('--symbols='));
const SYMBOL_LIST = symbolsArg
    ? symbolsArg.split('=')[1]!.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : null;

const RATIO_FIELDS = [
    'marketCap', 'peRatio', 'psRatio', 'evEbitda', 'fcfYield',
    'pbRatio', 'evFcf', 'evRevenue', 'roe', 'roic', 'currentRatio', 'debtToEquity',
] as const;

const REL_TOL = 1e-4;

function differs(a: number | null, b: number | null): boolean {
    if (a == null || b == null) return a !== b;
    return Math.abs(a - b) > Math.max(Math.abs(a), Math.abs(b)) * REL_TOL;
}

async function findSuspectSymbols(): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ symbol: string }[]>`
        WITH x AS (
          SELECT symbol, date, closePrice, psRatio, marketCap,
            LAG(psRatio) OVER w pPs, LAG(marketCap) OVER w pMc, LAG(closePrice) OVER w pPx
          FROM DailyValuationHistory WHERE closePrice > 0
          WINDOW w AS (PARTITION BY symbol ORDER BY date)
        )
        SELECT DISTINCT symbol FROM x
        WHERE (psRatio > 0 AND pPs > 0 AND (psRatio/pPs > 4 OR psRatio/pPs < 0.25) AND closePrice/pPx BETWEEN 0.6 AND 1.6)
           OR (marketCap > 0 AND pMc > 0 AND (marketCap/pMc > 4 OR marketCap/pMc < 0.25) AND closePrice/pPx BETWEEN 0.6 AND 1.6)
        ORDER BY symbol`;
    return rows.map(r => r.symbol);
}

async function main() {
    const symbols = SYMBOL_LIST ?? await findSuspectSymbols();
    console.log(`[repair] ${symbols.length} symbols ${dryRun ? '(DRY RUN)' : ''}`);

    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

    let rowsScanned = 0, rowsChanged = 0, symbolsDone = 0;
    const repaired: string[] = [];

    for (const symbol of symbols) {
        const stmts = await prisma.financialStatement.findMany({
            where: { symbol },
            orderBy: { endDate: 'desc' },
        });
        const ticker = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sharesOutstanding: true },
        });
        try {
            await applySplitAdjustments(stmts, symbol, tenYearsAgo);
            applyPostSplitAdjustment(stmts, ticker?.sharesOutstanding ?? null);
        } catch { /* internal boundary heuristic inside computeDayRatios still applies */ }

        const rows = await prisma.dailyValuationHistory.findMany({
            where: { symbol, closePrice: { not: null } },
            orderBy: { date: 'asc' },
        });
        if (!rows.length) { symbolsDone++; continue; }

        const updates: { symbol: string; date: Date; data: Record<string, number | null> }[] = [];
        for (const row of rows) {
            rowsScanned++;
            const ratios = computeDayRatios(stmts, row.closePrice!, row.date, ticker?.sharesOutstanding ?? null);
            const data: Record<string, number | null> = {};
            let changed = false;
            for (const f of RATIO_FIELDS) {
                const nv = ratios[f];
                data[f] = nv;
                if (differs(row[f] as number | null, nv)) changed = true;
            }
            if (changed) updates.push({ symbol, date: row.date, data });
        }

        if (updates.length > 0) {
            repaired.push(`${symbol}:${updates.length}`);
            if (!dryRun) {
                const CHUNK = 400;
                for (let i = 0; i < updates.length; i += CHUNK) {
                    await dbWrite(() => prisma.$transaction(
                        updates.slice(i, i + CHUNK).map(u => prisma.dailyValuationHistory.update({
                            where: { symbol_date: { symbol: u.symbol, date: u.date } },
                            data: u.data,
                        }))
                    ), 'repairValuation.update');
                }
            }
        }
        rowsChanged += updates.length;
        symbolsDone++;
        if (symbolsDone % 25 === 0 || symbolsDone === symbols.length) {
            console.log(`[repair] ${symbolsDone}/${symbols.length} — ${rowsScanned} rows scanned, ${rowsChanged} updated`);
        }
    }

    console.log(`\n[repair] done: ${rowsChanged}/${rowsScanned} rows updated ${dryRun ? '(dry-run)' : ''}`);
    console.log(`[repair] changed symbols: ${repaired.join(' ')}`);
    if (!dryRun && rowsChanged > 0) {
        console.log(`\nNext: flush candles:* on redis -p 6380 and POST /api/admin/cache/invalidate per repaired symbol`);
    }
}

main()
    .then(() => process.exit(0)) // redis client keeps the event loop alive otherwise
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
