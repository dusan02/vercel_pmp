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
    pbRatio: number | null;
    evFcf: number | null;
    evRevenue: number | null;
    roe: number | null;
    roic: number | null;
    currentRatio: number | null;
    debtToEquity: number | null;
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
    /** price ÷ book value per share — null when equity ≤ 0 */
    pbRatio: number | null;
    /** EV ÷ TTM FCF — null when FCF ≤ 0 */
    evFcf: number | null;
    /** EV ÷ TTM revenue */
    evRevenue: number | null;
    /** TTM net income ÷ equity — may be negative (real signal) */
    roe: number | null;
    /** TTM EBIT ÷ invested capital (debt + equity − cash) */
    roic: number | null;
    currentRatio: number | null;
    debtToEquity: number | null;
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
 *
 * `trustedShares` (Ticker.sharesOutstanding) applies only on/after the
 * latest statement's period end: that is the "current" valuation point, and
 * the read path (computeMetrics' currentShareCount) already uses the trusted
 * count there — so the stored P/E and the implied EPS match what the analysis
 * page shows (V: EPS 12.02, not 11.92). Earlier dates keep statement shares:
 * the share base legitimately differed at those dates (buybacks/splits), so
 * period shares are the correct historical basis.
 */
export function computeDayRatios(statements: FinancialStatement[], closePrice: number, asOf: Date, trustedShares: number | null = null): DayRatios {
    const out: DayRatios = {
        marketCap: null, peRatio: null, psRatio: null, evEbitda: null, fcfYield: null,
        pbRatio: null, evFcf: null, evRevenue: null, roe: null, roic: null,
        currentRatio: null, debtToEquity: null,
    };
    const ttm = computeTTMAtDate(statements, asOf);
    const stmtsBeforeDate = statements.filter(s => s.endDate.getTime() <= asOf.getTime());
    // Latest filings don't always report every field (e.g. CMCSA Q1-2026:
    // sharesOutstanding/debt/cash all null while FY2025 has them). Gating all
    // ratios on the newest row produced null multiples for the whole ticker —
    // fall back per-field-group to the most recent statement that reports it.
    const latestWith = (pred: (s: FinancialStatement) => boolean) =>
        stmtsBeforeDate.find(pred) ?? statements.find(pred) ?? null;
    const stmtShares = latestWith((s) => s.sharesOutstanding != null && s.sharesOutstanding > 0)?.sharesOutstanding ?? null;
    const shares = trustedShares != null && trustedShares > 0
        && statements.length > 0 && asOf.getTime() >= statements[0]!.endDate.getTime()
        ? trustedShares
        : stmtShares;

    // Balance-sheet ratios don't need shares — compute them outside the
    // market-cap gate so debt/equity/current metrics exist even when the
    // share count is missing.
    const eqStmt = latestWith((s) => s.totalEquity != null);
    const equity = eqStmt?.totalEquity ?? null;
    const bs = latestWith((s) => s.totalDebt != null && s.cashAndEquivalents != null);
    const effectiveNI = ttm.netIncome ?? latestWith((s) => s.netIncome != null)?.netIncome;
    const effectiveRev = ttm.revenue ?? latestWith((s) => s.revenue != null)?.revenue;
    const effectiveEbit = ttm.ebit ?? latestWith((s) => s.ebit != null)?.ebit;
    const cf = latestWith((s) => s.operatingCashFlow != null && s.capex != null);
    const effOcf = ttm.operatingCashFlow ?? cf?.operatingCashFlow ?? null;
    const effCapex = ttm.capex ?? cf?.capex ?? null;
    const fcf = effOcf !== null && effCapex !== null ? effOcf - Math.abs(effCapex) : null;

    if (equity != null) {
        if (equity > 0) {
            if (effectiveNI != null) out.roe = effectiveNI / equity;
            if (bs != null) {
                const investedCapital = bs.totalDebt! + equity - bs.cashAndEquivalents!;
                if (investedCapital > 0 && effectiveEbit != null) out.roic = effectiveEbit / investedCapital;
            }
            if (bs != null) out.debtToEquity = bs.totalDebt! / equity;
        }
    }
    const liq = latestWith((s) => s.currentAssets != null && s.currentLiabilities != null);
    if (liq != null && liq.currentLiabilities! > 0) {
        out.currentRatio = liq.currentAssets! / liq.currentLiabilities!;
    }

    if (shares) {
        out.marketCap = closePrice * shares;

        if (effectiveNI && effectiveNI > 0) {
            out.peRatio = closePrice / (effectiveNI / shares);
        }
        if (effectiveRev && effectiveRev > 0) {
            out.psRatio = closePrice / (effectiveRev / shares);
        }
        if (equity != null && equity > 0) {
            out.pbRatio = out.marketCap / equity;
        }
        const ev = bs ? out.marketCap + bs.totalDebt! - bs.cashAndEquivalents! : null;
        if (effectiveEbit && effectiveEbit > 0 && ev != null) {
            out.evEbitda = ev / effectiveEbit;
        }
        if (ev != null) {
            if (effectiveRev != null && effectiveRev > 0) out.evRevenue = ev / effectiveRev;
            if (fcf != null && fcf > 0) out.evFcf = ev / fcf;
        }
        if (fcf !== null && out.marketCap > 0) {
            out.fcfYield = fcf / out.marketCap;
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
            pbRatio: true, evFcf: true, evRevenue: true,
            roe: true, roic: true, currentRatio: true, debtToEquity: true,
        },
    });
    const have = new Map(existing.map(r => [r.symbol, r]));

    const targets = dayRefs;

    // Bulk-load statements for all targets in chunks — a single `in` query for
    // ~1k symbols is fine for Prisma's auto-split, but chunking keeps the bound
    // explicit and memory modest.
    const stmtsBySymbol = new Map<string, FinancialStatement[]>();
    const trustedSharesBySymbol = new Map<string, number | null>();
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
        // Trusted share count — the canonical basis the analysis page uses.
        const tickers = await prisma.ticker.findMany({
            where: { symbol: { in: chunk } },
            select: { symbol: true, sharesOutstanding: true },
        });
        for (const t of tickers) trustedSharesBySymbol.set(t.symbol, t.sharesOutstanding);
    }

    const inserts: ValuationRow[] = [];
    const updates: ValuationRow[] = [];

    for (const ref of targets) {
        const closePrice = ref.regularClose!;
        try {
            const statements = stmtsBySymbol.get(ref.symbol) ?? [];
            const ratios =
                computeDayRatios(statements, closePrice, ref.date, trustedSharesBySymbol.get(ref.symbol) ?? null);

            if (ratios.peRatio === null && ratios.psRatio === null) result.priceOnly++;

            const row = { symbol: ref.symbol, date: ref.date, closePrice, ...ratios };
            const prev = have.get(ref.symbol);

            if (!prev) {
                inserts.push(row);
                result.filled++;
            } else {
                // Existing row may hold a mid-session partial close (lazy syncs
                // run before 16:00 ET) — overwrite with the official close.
                const RATIO_KEYS = ['peRatio', 'psRatio', 'evEbitda', 'fcfYield', 'pbRatio', 'evFcf', 'evRevenue', 'roe', 'roic', 'currentRatio', 'debtToEquity'] as const;
                const same = prev.closePrice === row.closePrice && prev.marketCap === row.marketCap
                    && RATIO_KEYS.every(k => prev[k] === row[k]);
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
                    pbRatio: u.pbRatio, evFcf: u.evFcf, evRevenue: u.evRevenue,
                    roe: u.roe, roic: u.roic, currentRatio: u.currentRatio, debtToEquity: u.debtToEquity,
                },
            }))
        ), 'fillValuationDay.update');
    }

    // Refresh 52W-range position on FinnhubMetrics from OUR OWN closes —
    // authoritative for foreign ADRs (Finnhub reports their 52w range in
    // home-market units: AZN GBX, TM ¥ vs the USD ADR price → unusable).
    // Today's close is inside the range by construction → position ∈ [0,100].
    // Only runs when filling the newest DVH day — a historical repair fill
    // must not overwrite the current position with a stale close.
    try {
        const latest = await prisma.dailyValuationHistory.aggregate({ _max: { date: true } });
        if (latest._max.date?.getTime() === dayInstant.getTime()) {
            const cutoff = new Date(dayInstant.getTime() - 366 * 24 * 60 * 60 * 1000);
            const ranges = await prisma.dailyValuationHistory.groupBy({
                by: ['symbol'],
                where: { date: { gte: cutoff }, closePrice: { gt: 0 } },
                _min: { closePrice: true },
                _max: { closePrice: true },
            });
            const rangeBySymbol = new Map(ranges.map((r) => [r.symbol, r]));
            const posUpdates: ReturnType<typeof prisma.finnhubMetrics.updateMany>[] = [];
            for (const ref of targets) {
                const g = rangeBySymbol.get(ref.symbol);
                const lo = g?._min?.closePrice, hi = g?._max?.closePrice;
                if (lo == null || hi == null || hi <= lo) continue;
                posUpdates.push(prisma.finnhubMetrics.updateMany({
                    where: { symbol: ref.symbol },
                    data: { week52Position: ((ref.regularClose! - lo) / (hi - lo)) * 100 },
                }));
            }
            for (let i = 0; i < posUpdates.length; i += writeChunk) {
                await dbWrite(() => prisma.$transaction(posUpdates.slice(i, i + writeChunk)), 'fillValuationDay.week52');
            }
        }
    } catch (e) {
        console.warn('⚠️ [fillValuationDay] week52Position refresh failed (non-fatal):', e);
    }

    return result;
}
