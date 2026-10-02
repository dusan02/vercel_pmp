/**
 * Movers 2.0 — shared data pipeline.
 *
 * Single source of truth for "current significant movers" used by BOTH
 * surfaces: /api/stocks/movers (client MoversSection) and /premarket-movers
 * (SSR SEO page). Keep them on this one function so the two can never
 * silently diverge.
 *
 * Price source: same as All Stocks / Heatmap
 *  1. Ticker.lastPrice  (baseline)
 *  2. SessionPrice.lastPrice  if newer by ≥1 min  (preferred)
 *  3. % change re-calculated via calculatePercentChange(price, session, prevClose, regularClose)
 */
import { prisma } from '@/lib/db/prisma';
import { getDateET, nowET, createETDate } from '@/lib/utils/dateET';
import { detectSession, getLastTradingDay } from '@/lib/utils/timeUtils';
import { isFreshPrevCloseDate } from '@/lib/utils/prevCloseDates';
import { fetchLatestSessionPrices, sessionPriceOverrides } from '@/lib/utils/freshPrice';
import { resolveTickerIdentity } from '@/lib/utils/tickerIdentity';
import { calculatePercentChange } from '@/lib/utils/priceResolver';
import { analyzeMovers, MoverAnalysis } from '@/services/movers/analyze';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

export interface MoverRecord {
    symbol: string;
    name: string | null;
    logoUrl: string | null;
    sector: string | null;
    lastPrice: number;
    lastChangePct: number;
    lastVolume: number | null;
    latestMoversZScore: number | null;
    latestMoversRVOL: number | null;
    moversReason: string | null;
    moversCategory: string | null;
    analysis: MoverAnalysis | null;
}

export interface MoversResult {
    movers: MoverRecord[];
    session: ReturnType<typeof detectSession>;
    marketChangePct: number | null;
}

export async function getMoversData(limit: number, minZScore: number): Promise<MoversResult> {
    const etNow = nowET();
    const session = detectSession(etNow);

    // ── Step 1: Fetch candidates from DB ──────────────────────────────────
    // STALENESS GUARDS:
    //  - lastPriceUpdated < 24h: drops tickers with no recent prints at all.
    //  - lastPriceUpdated >= today's ET midnight: stored movers metrics
    //    (lastChangePct, zScore, rvol) are written per ingest tick and FREEZE
    //    when the price stops changing — after a session rollover they still
    //    carry yesterday's move (ACN stayed a "5.4σ mover" overnight on a
    //    +0.45% drift, Oct 2026). Requiring a today-dated price confines
    //    stored-field qualification to the current trading day.
    const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayStartET = createETDate(getDateET(etNow));
    const freshToday = { lastPriceUpdated: { gte: todayStartET } };
    const topMovers = await prisma.ticker.findMany({
        where: {
            lastPrice: { gt: 0 },
            lastPriceUpdated: { gte: TWENTY_FOUR_HOURS_AGO },
            OR: [
                { ...freshToday, latestMoversZScore: { gte: minZScore } },
                { ...freshToday, latestMoversZScore: { lte: -minZScore } },
                { ...freshToday, lastChangePct: { gte: 5.0 } },
                { ...freshToday, lastChangePct: { lte: -5.0 } },
                { ...freshToday, latestMoversRVOL: { gte: 3.0 } }
            ]
        },
        take: limit * 2, // Fetch more for ranking
        select: {
            symbol: true,
            name: true,
            sector: true,
            lastPrice: true,
            lastChangePct: true,
            lastVolume: true,
            latestPrevClose: true,
            latestPrevCloseDate: true,
            lastPriceUpdated: true,
            updatedAt: true,
            latestMoversZScore: true,
            latestMoversRVOL: true,
            moversReason: true,
            moversCategory: true,
        }
    });

    const symbols = topMovers.map(m => m.symbol);

    // ── Step 2: Find freshest price — Ticker vs SessionPrice ──────────────
    // Exactly the same tie-break logic as stockService.ts
    const bestPriceBySymbol = new Map<string, { price: number; ts: Date }>();
    for (const m of topMovers) {
        const ts = m.lastPriceUpdated ?? m.updatedAt;
        bestPriceBySymbol.set(m.symbol, { price: m.lastPrice || 0, ts });
    }

    if (symbols.length > 0) {
        try {
            const sessionPrices = await fetchLatestSessionPrices(symbols, etNow);
            for (const [symbol, sp] of sessionPrices) {
                const existing = bestPriceBySymbol.get(symbol);
                if (sessionPriceOverrides(sp.ts.getTime(), existing?.ts.getTime())) {
                    bestPriceBySymbol.set(symbol, { price: sp.price, ts: sp.ts });
                }
            }
        } catch (e) {
            console.warn('[Movers] SessionPrice fetch failed, using Ticker.lastPrice:', e);
        }
    }

    // ── Step 3: Fetch DailyRef regularClose + previousClose ──────────────
    // previousClose is today's canonical session reference (written by
    // writePrevClose); regularClose pins the official close for after/closed.
    const regularCloseBySymbol = new Map<string, number>();
    const dailyRefPrevBySymbol = new Map<string, number>();
    if (symbols.length > 0) {
        try {
            const dateET = getDateET(etNow);
            const todayDateObj = createETDate(dateET);
            const dailyRefs = await prisma.dailyRef.findMany({
                where: {
                    symbol: { in: symbols },
                    date: todayDateObj
                },
                select: { symbol: true, regularClose: true, previousClose: true, date: true }
            });
            dailyRefs.forEach(r => {
                const drDate = new Date(r.date);
                if (drDate.getTime() !== todayDateObj.getTime()) return;
                if (r.regularClose && r.regularClose > 0) {
                    regularCloseBySymbol.set(r.symbol, r.regularClose);
                }
                if (r.previousClose && r.previousClose > 0) {
                    dailyRefPrevBySymbol.set(r.symbol, r.previousClose);
                }
            });
        } catch (e) {
            console.warn('[Movers] DailyRef fetch failed:', e);
        }
    }

    // ── Step 4: Enrich movers with fresh price + recalculated % change ────
    const lastTradingDay = getLastTradingDay(createETDate(getDateET(etNow)));
    const enrichedMovers = topMovers.map(m => {
        const best = bestPriceBySymbol.get(m.symbol);
        const currentPrice = best?.price || m.lastPrice || 0;
        // Ticker.latestPrevClose is only trusted when its close date is at
        // least as fresh as the last trading day — same guard as
        // stockService (stale value was the Oct-2 two-day-move incident).
        const tickerPrev = isFreshPrevCloseDate(m.latestPrevCloseDate, lastTradingDay)
            ? (m.latestPrevClose || 0)
            : 0;
        const previousClose = dailyRefPrevBySymbol.get(m.symbol) || tickerPrev;
        const regularClose = regularCloseBySymbol.get(m.symbol) || 0;

        const pct = calculatePercentChange(
            currentPrice,
            session,
            previousClose > 0 ? previousClose : null,
            regularClose > 0 ? regularClose : null
        );

        // Prefer recalculated % when price has moved (currentPrice !== previousClose).
        // When currentPrice === previousClose (no new trades, price is regularClose fallback),
        // use Ticker.lastChangePct from the worker which has the correct value.
        const hasPriceMovement = currentPrice > 0 && previousClose > 0 && currentPrice !== previousClose;
        const lastChangePct = hasPriceMovement
            ? pct.changePct
            : (m.lastChangePct || pct.changePct || 0);

        const identity = resolveTickerIdentity(m.symbol, m.name, m.sector, null);
        return {
            symbol: m.symbol,
            name: identity.name,
            // Renderers resolve logos via /api/logo/{ticker} (local webp →
            // Redis → live fetch) — same as every other surface. Ticker.logoUrl
            // is intentionally not preferred so movers don't render a
            // different logo than the stocks table.
            logoUrl: null,
            sector: identity.sector,
            lastPrice: currentPrice,
            lastChangePct,
            lastVolume: m.lastVolume ?? null,
            latestMoversZScore: m.latestMoversZScore,
            latestMoversRVOL: m.latestMoversRVOL,
            moversReason: m.moversReason,
            moversCategory: m.moversCategory,
        };
    });

    // ── Step 4b: Post-filter on the FRESH recomputed move ─────────────────
    // Candidate selection uses stored fields that can lag a session boundary;
    // a "mover" must actually be moving NOW. |fresh %| >= 1.5 drops yesterday's
    // leftovers whose price merely drifted overnight.
    const MIN_FRESH_MOVE_PCT = 1.5;
    const significantMovers = enrichedMovers.filter(m =>
        Math.abs(m.lastChangePct || 0) >= MIN_FRESH_MOVE_PCT
    );

    // ── Step 5: Sort by combined significance score ───────────────────────
    significantMovers.sort((a, b) => {
        const sigA = Math.abs(a.latestMoversZScore || 0) + (Math.abs(a.lastChangePct || 0) / 2) + (a.latestMoversRVOL || 0);
        const sigB = Math.abs(b.latestMoversZScore || 0) + (Math.abs(b.lastChangePct || 0) / 2) + (b.latestMoversRVOL || 0);
        return sigB - sigA;
    });

    const finalMovers = significantMovers.slice(0, limit);

    // ── Step 6: Movers 2.0 analysis — sigma level, market/sector context,
    // deterministic catalyst detection, pillar strip. List-level Redis cache
    // (~90s) bounds the per-ticker Finnhub fetches; analysis failure never
    // blocks the movers payload (degrades to analysis:null).
    let analysisBySymbol = new Map<string, MoverAnalysis>();
    let marketChangePct: number | null = null;
    try {
        const dateET = getDateET(etNow);
        const cacheKey = `movers:analysis:${dateET}:${session}`;
        let cached: Record<string, MoverAnalysis> | null = null;
        try { cached = await getCachedData(cacheKey); } catch { }
        if (cached && typeof cached === 'object') {
            analysisBySymbol = new Map(Object.entries(cached));
            marketChangePct = Object.values(cached)[0]?.marketChangePct ?? null;
        } else {
            const inputs = finalMovers.map(m => ({
                symbol: m.symbol,
                sector: m.sector,
                changePct: m.lastChangePct,
                zScore: m.latestMoversZScore,
                rvol: m.latestMoversRVOL,
            }));
            analysisBySymbol = await analyzeMovers(inputs);
            marketChangePct = Object.values(Object.fromEntries(analysisBySymbol))[0]?.marketChangePct ?? null;
            try {
                await setCachedData(cacheKey, Object.fromEntries(analysisBySymbol), 90);
            } catch { }
        }
    } catch (e) {
        console.warn('[Movers] analysis enrichment failed, continuing without:', e);
    }

    return {
        movers: finalMovers.map(m => ({
            ...m,
            analysis: analysisBySymbol.get(m.symbol) ?? null,
        })),
        session,
        marketChangePct,
    };
}
