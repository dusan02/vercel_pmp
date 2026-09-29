/**
 * Fill DailyValuationHistory rows for a single trading day — locally, without
 * Polygon calls.
 *
 * Why this exists: syncValuationHistory is per-ticker incremental, so the
 * newest trading day only gained rows via lazy per-ticker refreshes plus the
 * weekly refresh-all. Mid-week coverage of the latest close dropped to ~2%
 * (16/995 rows on 2026-09-28). The daily post-market reset calls this after
 * saving official closes so the newest session is always covered.
 *
 * closePrice comes from DailyRef.regularClose (official close), multiples are
 * computed from computeTTMAtDate over local FinancialStatement data — the same
 * formula as tickerDetailsSync.syncValuationHistory. Keep them in sync.
 */
import type { FinancialStatement } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { computeTTMAtDate } from '@/lib/utils/ttm';
import { dbWriteRetry as dbWrite } from '@/lib/db/writeRetry';

export interface FillValuationDayResult {
    day: string;
    closes: number;
    alreadyPresent: number;
    filled: number;
    failed: number;
    priceOnly: number;
}

export async function fillValuationDay(dateET: string): Promise<FillValuationDayResult> {
    const DAY_START = new Date(dateET + 'T00:00:00Z');
    const DAY_END = new Date(DAY_START.getTime() + 86_400_000);

    // Row dates are ET-midnight instants (Polygon agg.t / DailyRef.date), so
    // match by UTC-day range and reuse the exact instant for the upsert key.
    const refs = await prisma.dailyRef.findMany({
        where: { date: { gte: DAY_START, lt: DAY_END }, regularClose: { not: null } },
        select: { symbol: true, regularClose: true, date: true },
    });

    const result: FillValuationDayResult = {
        day: dateET,
        closes: refs.length,
        alreadyPresent: 0,
        filled: 0,
        failed: 0,
        priceOnly: 0,
    };
    if (refs.length === 0) return result; // non-trading day — nothing to do

    const dayInstant = refs[0]!.date;
    const dayRefs = refs.filter(r => r.date.getTime() === dayInstant.getTime());

    const existing = await prisma.dailyValuationHistory.findMany({
        where: { date: dayInstant },
        select: { symbol: true },
    });
    const have = new Set(existing.map(r => r.symbol));
    result.alreadyPresent = have.size;

    const targets = dayRefs.filter(r => !have.has(r.symbol));
    if (targets.length === 0) return result;

    // Bulk-load statements for all targets in chunks — a single `in` query for
    // ~1k symbols is fine for Prisma's auto-split, but chunking keeps the bound
    // explicit and memory modest.
    const stmtsBySymbol = new Map<string, FinancialStatement[]>();
    const chunkSize = 400;
    for (let i = 0; i < targets.length; i += chunkSize) {
        const chunk = targets.slice(i, i + chunkSize).map(r => r.symbol);
        const rows = await prisma.financialStatement.findMany({
            where: { symbol: { in: chunk } },
            orderBy: { endDate: 'desc' },
        });
        for (const row of rows) {
            const list = stmtsBySymbol.get(row.symbol);
            if (list) list.push(row); else stmtsBySymbol.set(row.symbol, [row]);
        }
    }

    const inserts: {
        symbol: string;
        date: Date;
        closePrice: number;
        marketCap: number | null;
        peRatio: number | null;
        psRatio: number | null;
        evEbitda: number | null;
        fcfYield: number | null;
    }[] = [];

    for (const ref of targets) {
        const closePrice = ref.regularClose!;
        try {
            const statements = stmtsBySymbol.get(ref.symbol) ?? [];

            let marketCap: number | null = null;
            let peRatio: number | null = null;
            let psRatio: number | null = null;
            let evEbitda: number | null = null;
            let fcfYield: number | null = null;

            const ttm = computeTTMAtDate(statements, ref.date);
            const stmtsBeforeDate = statements.filter(s => s.endDate.getTime() <= ref.date.getTime());
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

            if (peRatio === null && psRatio === null) result.priceOnly++;
            inserts.push({ symbol: ref.symbol, date: ref.date, closePrice, marketCap, peRatio, psRatio, evEbitda, fcfYield });
            result.filled++;
        } catch (err) {
            console.error(`[fillValuationDay] ${ref.symbol}:`, err);
            result.failed++;
        }
    }

    const writeChunk = 500;
    for (let i = 0; i < inserts.length; i += writeChunk) {
        await dbWrite(() => prisma.dailyValuationHistory.createMany({
            data: inserts.slice(i, i + writeChunk),
        }), 'fillValuationDay.createMany');
    }

    return result;
}
