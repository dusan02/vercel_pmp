/**
 * Repair DailyValuationHistory multiples to a consistent TTM basis.
 *
 * Background:
 * - syncValuationHistory originally wrote evEbitda = EV/(annual EBIT) and
 *   fcfYield = (annual OCF − capex)/mcap, while peRatio/psRatio already used
 *   TTM — a mixed-basis series. Historical percentiles must rank today's TTM
 *   value against a TTM history.
 * - This script recomputes all four multiples per stored row using
 *   computeTTMAtDate against local FinancialStatement data. No API calls —
 *   closePrice/marketCap are already stored; only derived columns change.
 *
 * Usage:
 *   npx tsx scripts/repair-valuation-history-ttm.ts [--dry-run] [--symbol=MU] [--limit=50]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { computeTTMAtDate } from '../src/lib/utils/ttm';
import { dbWriteRetry as dbWrite } from '../src/lib/db/writeRetry';

const dryRun = process.argv.includes('--dry-run');
const symbolArg = process.argv.find(a => a.startsWith('--symbol='));
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const ONLY_SYMBOL = symbolArg ? symbolArg.split('=')[1]!.toUpperCase() : null;
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

async function main() {
    const symbols = await prisma.dailyValuationHistory.findMany({
        where: ONLY_SYMBOL ? { symbol: ONLY_SYMBOL } : {},
        select: { symbol: true },
        distinct: ['symbol'],
        orderBy: { symbol: 'asc' },
        ...(LIMIT ? { take: LIMIT } : {}),
    });

    console.log(`[repair] ${symbols.length} symbols ${dryRun ? '(DRY RUN)' : ''}`);

    let totalRows = 0, totalChanged = 0;
    const drift: Record<string, { n: number; sumAbsDelta: number; maxAbsDelta: number }> = {};

    const track = (key: string, oldV: number | null, newV: number | null) => {
        if (oldV == null || newV == null) return;
        const d = Math.abs(newV - oldV);
        const s = (drift[key] ??= { n: 0, sumAbsDelta: 0, maxAbsDelta: 0 });
        s.n++; s.sumAbsDelta += d; s.maxAbsDelta = Math.max(s.maxAbsDelta, d);
    };

    for (const { symbol } of symbols) {
        const stmts = await prisma.financialStatement.findMany({
            where: { symbol },
            orderBy: { endDate: 'desc' },
        });
        if (stmts.length === 0) { console.log(`  ${symbol}: no statements, skip`); continue; }

        const rows = await prisma.dailyValuationHistory.findMany({
            where: { symbol },
            orderBy: { date: 'asc' },
        });
        if (rows.length === 0) continue;

        const updates: { id: string; peRatio: number | null; psRatio: number | null; evEbitda: number | null; fcfYield: number | null }[] = [];

        for (const row of rows) {
            const closePrice = row.closePrice;
            if (closePrice == null || closePrice <= 0) continue;

            const ttm = computeTTMAtDate(stmts, row.date);
            const stmtsBeforeDate = stmts.filter(s => s.endDate.getTime() <= row.date.getTime());
            const stmt = stmtsBeforeDate[0] || stmts[stmts.length - 1]!;
            if (!stmt?.sharesOutstanding) continue;

            const marketCap = closePrice * stmt.sharesOutstanding;
            let peRatio: number | null = null;
            let psRatio: number | null = null;
            let evEbitda: number | null = null;
            let fcfYield: number | null = null;

            const effectiveNI = ttm.netIncome ?? stmt.netIncome;
            if (effectiveNI && effectiveNI > 0) {
                peRatio = closePrice / (effectiveNI / stmt.sharesOutstanding);
            }
            const effectiveRev = ttm.revenue ?? stmt.revenue;
            if (effectiveRev && effectiveRev > 0) {
                psRatio = closePrice / (effectiveRev / stmt.sharesOutstanding);
            }
            const effectiveEbit = ttm.ebit ?? stmt.ebit;
            if (effectiveEbit && effectiveEbit > 0 && stmt.totalDebt !== null && stmt.cashAndEquivalents !== null) {
                evEbitda = (marketCap + stmt.totalDebt - stmt.cashAndEquivalents) / effectiveEbit;
            }
            const effOcf = ttm.operatingCashFlow ?? stmt.operatingCashFlow;
            const effCapex = ttm.capex ?? stmt.capex;
            if (effOcf !== null && effCapex !== null) {
                fcfYield = (effOcf - Math.abs(effCapex)) / marketCap;
            }

            track('peRatio', row.peRatio, peRatio);
            track('psRatio', row.psRatio, psRatio);
            track('evEbitda', row.evEbitda, evEbitda);
            track('fcfYield', row.fcfYield, fcfYield);

            const changed = peRatio !== row.peRatio || psRatio !== row.psRatio
                || evEbitda !== row.evEbitda || fcfYield !== row.fcfYield;
            if (changed) {
                updates.push({ id: row.id, peRatio, psRatio, evEbitda, fcfYield });
            }
        }

        totalRows += rows.length;
        totalChanged += updates.length;

        if (!dryRun && updates.length > 0) {
            const chunkSize = 500;
            for (let i = 0; i < updates.length; i += chunkSize) {
                await dbWrite(() => prisma.$transaction(
                    updates.slice(i, i + chunkSize).map(u => prisma.dailyValuationHistory.update({
                        where: { id: u.id },
                        data: { peRatio: u.peRatio, psRatio: u.psRatio, evEbitda: u.evEbitda, fcfYield: u.fcfYield },
                    }))
                ));
            }
        }
        console.log(`  ${symbol}: ${rows.length} rows, ${updates.length} changed`);
    }

    console.log(`\n[repair] done: ${totalRows} rows scanned, ${totalChanged} updated ${dryRun ? '(dry-run — nothing written)' : ''}`);
    for (const [k, s] of Object.entries(drift)) {
        console.log(`  ${k}: n=${s.n} avg|Δ|=${(s.sumAbsDelta / s.n).toFixed(4)} max|Δ|=${s.maxAbsDelta.toFixed(4)}`);
    }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
