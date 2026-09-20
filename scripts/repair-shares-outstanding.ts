/**
 * Repair corrupted FinancialStatement.sharesOutstanding rows.
 *
 * Background:
 * - financialsSync's EPS fallback (netIncome / diluted EPS) wrote garbage
 *   when the EPS value came from a mismatched filing context — corrupt rows
 *   show netIncome / shares ≈ a small integer (1–12). PM reported +56%
 *   "dilution" over 5Y while the real share count was flat (~1.55B).
 * - For each symbol we take the trusted current count (Ticker.
 *   sharesOutstanding, else lastMarketCap / lastPrice) and the median of
 *   that symbol's non-corrupt rows; corrupt rows are rewritten to the best
 *   available same-symbol count (median-valid, else trusted), or null when
 *   nothing trustworthy exists.
 *
 * Usage:
 *   npx tsx scripts/repair-shares-outstanding.ts [--dry-run] [--symbol=PM] [--limit=50]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { dbWriteRetry as dbWrite } from '../src/lib/db/writeRetry';

const dryRun = process.argv.includes('--dry-run');
const symbolArg = process.argv.find(a => a.startsWith('--symbol='));
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const ONLY_SYMBOL = symbolArg ? symbolArg.split('=')[1]!.toUpperCase() : null;
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

async function main() {
    const tickers = await prisma.ticker.findMany({
        where: ONLY_SYMBOL ? { symbol: ONLY_SYMBOL } : {},
        select: { symbol: true, sharesOutstanding: true, lastMarketCap: true, lastPrice: true },
        orderBy: { symbol: 'asc' },
        ...(LIMIT ? { take: LIMIT } : {}),
    });

    console.log(`[repair] ${tickers.length} symbols ${dryRun ? '(DRY RUN)' : ''}`);

    let symbolsTouched = 0, rowsFixed = 0, rowsNulled = 0, rowsSkipped = 0;

    for (const t of tickers) {
        const stmts = await prisma.financialStatement.findMany({
            where: { symbol: t.symbol },
            select: { id: true, sharesOutstanding: true, netIncome: true },
        });
        if (stmts.length === 0) continue;

        // Trusted current count: Ticker.sharesOutstanding, else mcap ÷ price.
        const trusted = (t.sharesOutstanding && t.sharesOutstanding > 0)
            ? t.sharesOutstanding
            : (t.lastMarketCap && t.lastMarketCap > 0 && t.lastPrice && t.lastPrice > 0
                ? t.lastMarketCap * 1e9 / t.lastPrice
                : null);

        // First pass without trusted: find the signature (ni/sh ≈ int).
        // Second pass corroborates vs trusted when available.
        const flagged = stmts.filter(s => {
            if (s.sharesOutstanding == null || s.sharesOutstanding <= 0) return false;
            if (s.netIncome == null || s.netIncome === 0) return false;
            const eps = s.netIncome / s.sharesOutstanding;
            const r = Math.round(eps);
            if (r < 1 || r > 12 || Math.abs(eps - r) > 0.005) return false;
            // corroborate: deviate >30% from trusted (or flag anyway if none)
            return trusted == null || Math.abs(s.sharesOutstanding / trusted - 1) > 0.3;
        });
        if (flagged.length === 0) continue;

        const validMedian = (() => {
            const ok = stmts
                .filter(s => s.sharesOutstanding != null && s.sharesOutstanding > 0 && !flagged.includes(s))
                .map(s => s.sharesOutstanding!)
                .sort((a, b) => a - b);
            return ok.length > 0 ? ok[Math.floor(ok.length / 2)]! : null;
        })();
        const replacement = validMedian ?? trusted;

        symbolsTouched++;
        for (const row of flagged) {
            if (replacement == null) {
                rowsNulled++;
                if (!dryRun) {
                    await dbWrite(() => prisma.financialStatement.update({
                        where: { id: row.id },
                        data: { sharesOutstanding: null },
                    }), `repair-shares:${t.symbol}#${row.id}`);
                }
                continue;
            }
            // Skip if replacement is statistically identical (already fine)
            if (Math.abs(row.sharesOutstanding! / replacement - 1) < 0.02) { rowsSkipped++; continue; }
            rowsFixed++;
            if (!dryRun) {
                await dbWrite(() => prisma.financialStatement.update({
                    where: { id: row.id },
                    data: { sharesOutstanding: replacement },
                }), `repair-shares:${t.symbol}#${row.id}`);
            }
        }
        if (symbolsTouched <= 25 || symbolsTouched % 50 === 0) {
            console.log(`[repair] ${t.symbol}: ${flagged.length} corrupt rows → ${replacement == null ? 'null' : replacement.toExponential(3)}`);
        }
    }

    console.log(`[repair] done — symbols touched: ${symbolsTouched}, rows fixed: ${rowsFixed}, nulled: ${rowsNulled}, skipped: ${rowsSkipped}${dryRun ? ' (DRY RUN)' : ''}`);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
