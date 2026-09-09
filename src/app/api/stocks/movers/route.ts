import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getDateET, nowET, createETDate } from '@/lib/utils/dateET';
import { detectSession } from '@/lib/utils/timeUtils';
import { calculatePercentChange } from '@/lib/utils/priceResolver';

/**
 * API Endpoint to fetch top market movers
 * GET /api/stocks/movers
 *
 * Price source: same as All Stocks / Heatmap
 *  1. Ticker.lastPrice  (baseline)
 *  2. SessionPrice.lastPrice  if newer by ≥1 min  (preferred)
 *  3. % change re-calculated via calculatePercentChange(price, session, prevClose, regularClose)
 *
 * Previously this route enriched from Redis which could be stale and out-of-sync with DB,
 * causing PSKY (and others) to show a different price/% on Movers vs All Stocks.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '10', 10);
        // Threshold: 2.0 = statistically significant (2 std dev above mean).
        const minZScore = parseFloat(searchParams.get('minZ') || '2.0');

        console.log(`🔍 [MoversAPI] Fetching top ${limit} movers (minZ: ${minZScore})...`);

        const etNow = nowET();
        const session = detectSession(etNow);

        // ── Step 1: Fetch candidates from DB ──────────────────────────────────
        // STALENESS GUARD: Only include tickers with fresh lastPriceUpdated (< 24h).
        // Without this, stale tickers with old Z-scores/RVOL show 0.00% change
        // because their prevClose is missing or price is outdated.
        const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);
        let topMovers = await prisma.ticker.findMany({
            where: {
                lastPrice: { gt: 0 },
                lastPriceUpdated: { gte: TWENTY_FOUR_HOURS_AGO },
                OR: [
                    { latestMoversZScore: { gte: minZScore } },
                    { latestMoversZScore: { lte: -minZScore } },
                    { lastChangePct: { gte: 5.0 } },
                    { lastChangePct: { lte: -5.0 } },
                    { latestMoversRVOL: { gte: 3.0 } }
                ]
            },
            take: limit * 2, // Fetch more for ranking
            select: {
                symbol: true,
                name: true,
                logoUrl: true,
                sector: true,
                lastPrice: true,
                lastChangePct: true,
                latestPrevClose: true,
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
                const dateET = getDateET(etNow);
                const today = createETDate(dateET);
                const lookback = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

                const sessionPrices = await prisma.sessionPrice.findMany({
                    where: {
                        symbol: { in: symbols },
                        date: { gte: lookback, lte: today }
                    },
                    orderBy: { lastTs: 'desc' },
                    select: { symbol: true, lastPrice: true, lastTs: true }
                });

                // Keep newest SessionPrice per symbol
                const latestSpBySymbol = new Map<string, { price: number; ts: Date }>();
                for (const sp of sessionPrices) {
                    if (!latestSpBySymbol.has(sp.symbol)) {
                        latestSpBySymbol.set(sp.symbol, { price: sp.lastPrice, ts: sp.lastTs });
                    }
                }

                const STALE_THRESHOLD_MS = 60 * 1000; // 1 minute
                for (const [symbol, sp] of latestSpBySymbol.entries()) {
                    const existing = bestPriceBySymbol.get(symbol);
                    if (existing) {
                        const spIsNewer = sp.ts.getTime() > existing.ts.getTime() + STALE_THRESHOLD_MS;
                        if (spIsNewer) {
                            bestPriceBySymbol.set(symbol, { price: sp.price, ts: sp.ts });
                        }
                    } else {
                        bestPriceBySymbol.set(symbol, { price: sp.price, ts: sp.ts });
                    }
                }
            } catch (e) {
                console.warn('[MoversAPI] SessionPrice fetch failed, using Ticker.lastPrice:', e);
            }
        }

        // ── Step 3: Fetch DailyRef regularClose (for after-hours % calc) ──────
        const regularCloseBySymbol = new Map<string, number>();
        if (symbols.length > 0) {
            try {
                const dateET = getDateET(etNow);
                const todayDateObj = createETDate(dateET);
                const dailyRefs = await prisma.dailyRef.findMany({
                    where: {
                        symbol: { in: symbols },
                        date: todayDateObj
                    },
                    select: { symbol: true, regularClose: true, date: true }
                });
                dailyRefs.forEach(r => {
                    if (r.regularClose && r.regularClose > 0) {
                        const drDate = new Date(r.date);
                        const todayDateObj2 = createETDate(getDateET(etNow));
                        if (drDate.getTime() === todayDateObj2.getTime()) {
                            regularCloseBySymbol.set(r.symbol, r.regularClose);
                        }
                    }
                });
            } catch (e) {
                console.warn('[MoversAPI] DailyRef fetch failed:', e);
            }
        }

        // ── Step 4: Enrich movers with fresh price + recalculated % change ────
        const enrichedMovers = topMovers.map(m => {
            const best = bestPriceBySymbol.get(m.symbol);
            const currentPrice = best?.price || m.lastPrice || 0;
            const previousClose = m.latestPrevClose || 0;
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

            return {
                symbol: m.symbol,
                name: m.name,
                logoUrl: m.logoUrl,
                sector: m.sector,
                lastPrice: currentPrice,
                lastChangePct,
                latestMoversZScore: m.latestMoversZScore,
                latestMoversRVOL: m.latestMoversRVOL,
                moversReason: m.moversReason,
                moversCategory: m.moversCategory,
            };
        });

        // ── Step 5: Sort by combined significance score ───────────────────────
        enrichedMovers.sort((a, b) => {
            const sigA = Math.abs(a.latestMoversZScore || 0) + (Math.abs(a.lastChangePct || 0) / 2) + (a.latestMoversRVOL || 0);
            const sigB = Math.abs(b.latestMoversZScore || 0) + (Math.abs(b.lastChangePct || 0) / 2) + (b.latestMoversRVOL || 0);
            return sigB - sigA;
        });

        const finalMovers = enrichedMovers.slice(0, limit);

        console.log(`✅ [MoversAPI] Returning ${finalMovers.length} movers (session: ${session})`);

        return NextResponse.json({
            movers: finalMovers,
            session,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ [MoversAPI] Error:', error);
        return NextResponse.json({
            error: 'Failed to fetch movers',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
