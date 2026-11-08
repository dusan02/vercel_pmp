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
import { nowET } from '@/lib/utils/dateET';
import { detectSession, getLastTradingDay, getSessionDateStr, getTradingDay } from '@/lib/utils/timeUtils';
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
    marketCap: number | null;
    marketCapDiff: number | null;
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
    // Trading-day-aware: on weekends/holidays "today" is the last session
    // (Friday) — a wall-clock 24h gate would empty the movers list ~24h after
    // Friday's close. Anchoring to todayStartET keeps Friday's movers visible
    // through the weekend while dropping tickers with no prints in the session.
    const todayStartET = getTradingDay(etNow);
    const freshToday = { lastPriceUpdated: { gte: todayStartET } };
    const select = {
        symbol: true,
        name: true,
        sector: true,
        lastPrice: true,
        lastChangePct: true,
        lastVolume: true,
        lastMarketCap: true,
        lastMarketCapDiff: true,
        sharesOutstanding: true,
        latestPrevClose: true,
        latestPrevCloseDate: true,
        lastPriceUpdated: true,
        updatedAt: true,
        latestMoversZScore: true,
        latestMoversRVOL: true,
        moversReason: true,
        moversCategory: true,
    };
    const baseWhere = {
        lastPrice: { gt: 0 },
        ...freshToday,
    };

    // Parallel fetch targeting top gainers, losers, heavyweight MCap movers, extreme Z-scores, and RVOL spikes.
    // Explicit orderBy prevents SQLite from taking only 'A' tickers by primary key.
    const candidateLimit = Math.max(limit, 50);
    const [gainers, losers, mcapGainers, mcapLosers, zHigh, zLow, rvolSpikes] = await Promise.all([
        prisma.ticker.findMany({
            where: { ...baseWhere, lastChangePct: { gte: 3.0 } },
            orderBy: { lastChangePct: 'desc' },
            take: candidateLimit,
            select,
        }),
        prisma.ticker.findMany({
            where: { ...baseWhere, lastChangePct: { lte: -3.0 } },
            orderBy: { lastChangePct: 'asc' },
            take: candidateLimit,
            select,
        }),
        prisma.ticker.findMany({
            where: { ...baseWhere, lastMarketCapDiff: { gt: 0 } },
            orderBy: { lastMarketCapDiff: 'desc' },
            take: Math.min(candidateLimit, 40),
            select,
        }),
        prisma.ticker.findMany({
            where: { ...baseWhere, lastMarketCapDiff: { lt: 0 } },
            orderBy: { lastMarketCapDiff: 'asc' },
            take: Math.min(candidateLimit, 40),
            select,
        }),
        prisma.ticker.findMany({
            where: { ...baseWhere, latestMoversZScore: { gte: minZScore } },
            orderBy: { latestMoversZScore: 'desc' },
            take: Math.min(candidateLimit, 30),
            select,
        }),
        prisma.ticker.findMany({
            where: { ...baseWhere, latestMoversZScore: { lte: -minZScore } },
            orderBy: { latestMoversZScore: 'asc' },
            take: Math.min(candidateLimit, 30),
            select,
        }),
        prisma.ticker.findMany({
            where: { ...baseWhere, latestMoversRVOL: { gte: 3.0 } },
            orderBy: { latestMoversRVOL: 'desc' },
            take: Math.min(candidateLimit, 30),
            select,
        }),
    ]);

    const candidateMap = new Map<string, (typeof gainers)[0]>();
    for (const list of [gainers, losers, mcapGainers, mcapLosers, zHigh, zLow, rvolSpikes]) {
        for (const item of list) candidateMap.set(item.symbol, item);
    }
    const topMovers = Array.from(candidateMap.values());

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
            const todayDateObj = getTradingDay(etNow);
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
    // PrevClose freshness is measured against the session being displayed —
    // on weekends that's the last trading day, whose prevClose ref is the
    // trading day before it (e.g. Saturday → session Friday → ref Thursday).
    const lastTradingDay = getLastTradingDay(getTradingDay(etNow));
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
            marketCap: m.lastMarketCap ?? null,
            marketCapDiff: (m.sharesOutstanding && currentPrice > 0 && previousClose > 0)
                ? Number((((currentPrice - previousClose) * m.sharesOutstanding) / 1e9).toFixed(2))
                : (m.lastMarketCap != null && m.lastMarketCap > 0 && lastChangePct !== 0)
                    ? Number((m.lastMarketCap * (lastChangePct / 100)).toFixed(2))
                    : (m.lastMarketCapDiff ?? null),
            latestMoversZScore: m.latestMoversZScore,
            latestMoversRVOL: m.latestMoversRVOL,
            moversReason: m.moversReason,
            moversCategory: m.moversCategory,
        };
    });

    // ── Step 4b: Post-filter on the FRESH recomputed move ─────────────────
    // Candidate selection uses stored fields that can lag a session boundary;
    // a "mover" must actually be moving NOW:
    //  - |fresh %| >= 1.5% drops yesterday's leftovers whose price merely drifted
    //  - OR |marketCapDiff| >= $1.0B qualifies mega-caps whose percentage move
    //    is modest but whose dollar impact on the market is massive.
    const MIN_FRESH_MOVE_PCT = 1.5;
    const MIN_FRESH_MCAP_DIFF = 1.0;
    const significantMovers = enrichedMovers.filter(m =>
        Math.abs(m.lastChangePct || 0) >= MIN_FRESH_MOVE_PCT ||
        Math.abs(m.marketCapDiff || 0) >= MIN_FRESH_MCAP_DIFF
    );

    // ── Step 5: Sort by combined significance score ───────────────────────
    // Ensure balanced representation: retain top gainers and top losers
    // up to `limit` each (both % and $ MCap diff) so surfaces can populate
    // both sides without starvation.
    const sortedGainers = significantMovers
        .filter(m => (m.lastChangePct || 0) > 0)
        .sort((a, b) => (b.lastChangePct || 0) - (a.lastChangePct || 0))
        .slice(0, limit);
    const sortedLosers = significantMovers
        .filter(m => (m.lastChangePct || 0) < 0)
        .sort((a, b) => (a.lastChangePct || 0) - (b.lastChangePct || 0))
        .slice(0, limit);
    const sortedMcapGainers = significantMovers
        .filter(m => (m.marketCapDiff || 0) > 0)
        .sort((a, b) => (b.marketCapDiff || 0) - (a.marketCapDiff || 0))
        .slice(0, limit);
    const sortedMcapLosers = significantMovers
        .filter(m => (m.marketCapDiff || 0) < 0)
        .sort((a, b) => (a.marketCapDiff || 0) - (b.marketCapDiff || 0))
        .slice(0, limit);

    // Merge and sort by significance score
    const finalMoversMap = new Map<string, (typeof significantMovers)[0]>();
    for (const m of [
        ...sortedGainers,
        ...sortedLosers,
        ...sortedMcapGainers,
        ...sortedMcapLosers,
        ...significantMovers.slice(0, limit),
    ]) {
        finalMoversMap.set(m.symbol, m);
    }
    const finalMovers = Array.from(finalMoversMap.values()).sort((a, b) => {
        const sigA = Math.abs(a.latestMoversZScore || 0) + (Math.abs(a.lastChangePct || 0) / 2) + (a.latestMoversRVOL || 0) + Math.min(Math.abs(a.marketCapDiff || 0) / 10, 5);
        const sigB = Math.abs(b.latestMoversZScore || 0) + (Math.abs(b.lastChangePct || 0) / 2) + (b.latestMoversRVOL || 0) + Math.min(Math.abs(b.marketCapDiff || 0) / 10, 5);
        return sigB - sigA;
    });

    // ── Step 6: Movers 2.0 analysis — sigma level, market/sector context,
    // deterministic catalyst detection, pillar strip. List-level Redis cache
    // (~90s) bounds the per-ticker Finnhub fetches; analysis failure never
    // blocks the movers payload (degrades to analysis:null).
    let analysisBySymbol = new Map<string, MoverAnalysis>();
    let marketChangePct: number | null = null;
    try {
        const dateET = getSessionDateStr(etNow);
        const cacheKey = `movers:analysis:${dateET}:${session}`;
        let cached: Record<string, MoverAnalysis> | null = null;
        try { cached = await getCachedData(cacheKey); } catch { }
        if (cached && typeof cached === 'object') {
            analysisBySymbol = new Map(Object.entries(cached));
            marketChangePct = Object.values(cached)[0]?.marketChangePct ?? null;
        } else {
            const inputs = finalMovers.map(m => ({
                symbol: m.symbol,
                name: m.name,
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
