/**
 * Fill missing DailyValuationHistory rows for a single trading day.
 *
 * Background:
 * - syncValuationHistory is per-ticker incremental (Polygon aggs fetch), so the
 *   newest trading day only gets rows when a ticker is synced — lazy page views
 *   plus the weekly refresh-all. Mid-week coverage of the latest close was ~2%.
 * - This script recomputes the day locally: closePrice comes from
 *   DailyRef.regularClose (official close, already repaired), multiples come
 *   from computeTTMAtDate against local FinancialStatement data. No API calls.
 * - Same formula as tickerDetailsSync.syncValuationHistory — keep in sync.
 *
 * Usage:
 *   npx tsx scripts/fill-valuation-day.ts --date=2026-09-28 [--dry-run] [--limit=50]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { computeTTMAtDate } from '../src/lib/utils/ttm';
import { dbWriteRetry as dbWrite } from '../src/lib/db/writeRetry';

const dryRun = process.argv.includes('--dry-run');
const dateArg = process.argv.find(a => a.startsWith('--date='));
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

if (!dateArg) {
    console.error('Usage: fill-valuation-day.ts --date=YYYY-MM-DD [--dry-run]');
    process.exit(1);
}
// Row dates are ET-midnight instants (04:00/05:00 UTC depending on DST),
// matching Polygon agg.t used by syncValuationHistory and DailyRef.date.
// Resolve the instant from DailyRef so the upsert key is identical.
const DAY_START = new Date(dateArg.split('=')[1]! + 'T00:00:00Z');
const DAY_END = new Date(DAY_START.getTime() + 86_400_000);

async function main() {
    // Ticker universe = symbols with an official close for the day that don't
    // already have a valuation row for it.
    const refs = await prisma.dailyRef.findMany({
        where: { date: { gte: DAY_START, lt: DAY_END }, regularClose: { not: null } },
        select: { symbol: true, regularClose: true, date: true },
        ...(LIMIT ? { take: LIMIT } : {}),
    });
    const DAY = refs[0]?.date ?? DAY_START;
    const existing = await prisma.dailyValuationHistory.findMany({
        where: { date: { gte: DAY_START, lt: DAY_END } },
        select: { symbol: true, date: true },
    });
    const have = new Set(existing.map(r => r.symbol));
    const targets = refs.filter(r => !have.has(r.symbol) && r.date.getTime() === DAY.getTime());

    console.log(`[fill] ${DAY.toISOString().slice(0, 10)}: ${refs.length} closes, ${have.size} already present, ${targets.length} to fill ${dryRun ? '(DRY RUN)' : ''}`);

    let filled = 0, failed = 0;
    const inserts: Parameters<typeof prisma.dailyValuationHistory.create>[0]['data'][] = [];

    for (const ref of targets) {
        const { symbol } = ref;
        const regularClose = ref.regularClose;
        const closePrice = regularClose!;
        try {
            const statements = await prisma.financialStatement.findMany({
                where: { symbol },
                orderBy: { endDate: 'desc' },
            });

            let marketCap: number | null = null;
            let peRatio: number | null = null;
            let psRatio: number | null = null;
            let evEbitda: number | null = null;
            let fcfYield: number | null = null;

            const ttm = computeTTMAtDate(statements, DAY);
            const stmtsBeforeDate = statements.filter(s => s.endDate.getTime() <= DAY.getTime());
            const stmt = stmtsBeforeDate[0] || statements[statements.length - 1];

            if (stmt && stmt.sharesOutstanding) {
                marketCap = closePrice * stmt.sharesOutstanding;

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
                if (effOcf !== null && effCapex !== null && marketCap > 0) {
                    fcfYield = (effOcf - Math.abs(effCapex)) / marketCap;
                }
            }

            inserts.push({ symbol, date: ref.date, closePrice, marketCap, peRatio, psRatio, evEbitda, fcfYield });
            filled++;
        } catch (err: any) {
            console.error(`  ✗ ${symbol}: ${err?.message}`);
            failed++;
        }
    }

    const withMultiples = inserts.filter(i => i.peRatio !== null || i.psRatio !== null).length;
    console.log(`[fill] computed ${inserts.length} rows (${withMultiples} with multiples, ${inserts.length - withMultiples} price-only)`);
    for (const sample of inserts.slice(0, 5)) {
        console.log(`  ${sample.symbol}: close=${sample.closePrice} mcap=${sample.marketCap ? (sample.marketCap / 1e9).toFixed(1) + 'B' : 'null'} pe=${sample.peRatio?.toFixed(1) ?? 'null'} ps=${sample.psRatio?.toFixed(1) ?? 'null'}`);
    }

    if (!dryRun && inserts.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < inserts.length; i += chunkSize) {
            await dbWrite(() => prisma.dailyValuationHistory.createMany({
                data: inserts.slice(i, i + chunkSize),
            }));
        }
        console.log(`[fill] wrote ${inserts.length} rows`);
    }

    console.log(`\n[fill] done: ${filled} computed, ${failed} failed ${dryRun ? '(dry-run — nothing written)' : ''}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
