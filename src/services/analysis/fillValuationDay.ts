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

interface ValuationRow {
    symbol: string;
    date: Date;
    closePrice: number;
    marketCap: number | null;
    peRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
    fcfYield: number | null;
}

export interface FillValuationDayResult {
    day: string;
    closes: number;
    filled: number;
    updated: number;
    unchanged: number;
    failed: number;
    priceOnly: number;
}

export interface DayRatios {
    marketCap: number | null;
    peRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
    fcfYield: number | null;
}

/**
 * Compute valuation multiples for one close price from local statements.
 * `statements` must be sorted endDate desc (as the DB query returns them).
 *
 * Share-count fallback: the latest filing does not always report
 * sharesOutstanding (e.g. CMCSA Q1-2026 has null while FY2025 has 3.99B) —
 * gating all ratios on the newest row's share count produced null P/E for the
 * whole ticker. We take shares from the most recent statement that reports
 * them; balance-sheet fields still come from the latest statement.
 */
export function computeDayRatios(statements: FinancialStatement[], closePrice: number, asOf: Date): DayRatios {
    const out: DayRatios = { marketCap: null, peRatio: null, psRatio: null, evEbitda: null, fcfYield: null };
    const ttm = computeTTMAtDate(statements, asOf);
    const stmtsBeforeDate = statements.filter(s => s.endDate.getTime() <= asOf.getTime());
    // Latest filings don't always report every field (e.g. CMCSA Q1-2026:
    // sharesOutstanding/debt/cash all null while FY2025 has them). Gating all
    // ratios on the newest row produced null multiples for the whole ticker —
    // fall back per-field-group to the most recent statement that reports it.
    const latestWith = (pred: (s: FinancialStatement) => boolean) =>
        stmtsBeforeDate.find(pred) ?? statements.find(pred) ?? null;
    const shares = latestWith((s) => s.sharesOutstanding != null && s.sharesOutstanding > 0)?.sharesOutstanding ?? null;

    if (shares) {
        out.marketCap = closePrice * shares;

        const effectiveNI = ttm.netIncome ?? latestWith((s) => s.netIncome != null)?.netIncome;
        if (effectiveNI && effectiveNI > 0) {
            out.peRatio = closePrice / (effectiveNI / shares);
        }
        const effectiveRev = ttm.revenue ?? latestWith((s) => s.revenue != null)?.revenue;
        if (effectiveRev && effectiveRev > 0) {
            out.psRatio = closePrice / (effectiveRev / shares);
        }
        const bs = latestWith((s) => s.totalDebt != null && s.cashAndEquivalents != null);
        const effectiveEbit = ttm.ebit ?? latestWith((s) => s.ebit != null)?.ebit;
        if (effectiveEbit && effectiveEbit > 0 && bs) {
            out.evEbitda = (out.marketCap + bs.totalDebt! - bs.cashAndEquivalents!) / effectiveEbit;
        }
        const cf = latestWith((s) => s.operatingCashFlow != null && s.capex != null);
        const effOcf = ttm.operatingCashFlow ?? cf?.operatingCashFlow ?? null;
        const effCapex = ttm.capex ?? cf?.capex ?? null;
        if (effOcf !== null && effCapex !== null && out.marketCap > 0) {
            out.fcfYield = (effOcf - Math.abs(effCapex)) / out.marketCap;
        }
    }
    return out;
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
        filled: 0,
        updated: 0,
        unchanged: 0,
        failed: 0,
        priceOnly: 0,
    };
    if (refs.length === 0) return result; // non-trading day — nothing to do

    const dayInstant = refs[0]!.date;
    const dayRefs = refs.filter(r => r.date.getTime() === dayInstant.getTime());

    const existing = await prisma.dailyValuationHistory.findMany({
        where: { date: dayInstant },
        select: {
            symbol: true, closePrice: true, marketCap: true,
            peRatio: true, psRatio: true, evEbitda: true, fcfYield: true,
        },
    });
    const have = new Map(existing.map(r => [r.symbol, r]));

    const targets = dayRefs;

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

    const inserts: ValuationRow[] = [];
    const updates: ValuationRow[] = [];

    for (const ref of targets) {
        const closePrice = ref.regularClose!;
        try {
            const statements = stmtsBySymbol.get(ref.symbol) ?? [];
            const { marketCap, peRatio, psRatio, evEbitda, fcfYield } =
                computeDayRatios(statements, closePrice, ref.date);

            if (peRatio === null && psRatio === null) result.priceOnly++;

            const row = { symbol: ref.symbol, date: ref.date, closePrice, marketCap, peRatio, psRatio, evEbitda, fcfYield };
            const prev = have.get(ref.symbol);

            if (!prev) {
                inserts.push(row);
                result.filled++;
            } else {
                // Existing row may hold a mid-session partial close (lazy syncs
                // run before 16:00 ET) — overwrite with the official close.
                const same = prev.closePrice === row.closePrice && prev.marketCap === row.marketCap
                    && prev.peRatio === row.peRatio && prev.psRatio === row.psRatio
                    && prev.evEbitda === row.evEbitda && prev.fcfYield === row.fcfYield;
                if (same) { result.unchanged++; continue; }
                updates.push(row);
                result.updated++;
            }
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
    for (let i = 0; i < updates.length; i += writeChunk) {
        await dbWrite(() => prisma.$transaction(
            updates.slice(i, i + writeChunk).map(u => prisma.dailyValuationHistory.update({
                where: { symbol_date: { symbol: u.symbol, date: u.date } },
                data: {
                    closePrice: u.closePrice, marketCap: u.marketCap, peRatio: u.peRatio,
                    psRatio: u.psRatio, evEbitda: u.evEbitda, fcfYield: u.fcfYield,
                },
            }))
        ), 'fillValuationDay.update');
    }

    return result;
}
