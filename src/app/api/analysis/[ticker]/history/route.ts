import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { projectForward, pearson, buildStats, type PerSharePoint } from '@/lib/utils/analysisMath';
import { computeTTMAtDate } from '@/lib/utils/ttm';
import { getCachedData, setCachedData, del } from '@/lib/redis/operations';

const HISTORY_CACHE_TTL = 3600; // 1 hour (valuation history changes slowly)

// Shared with route.ts — keep in sync
const SPLITS_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days

/**
 * Fetch stock splits from Polygon API with Redis caching (7-day TTL).
 * Splits change rarely so we cache aggressively.
 */
async function getCachedSplitsLocal(symbol: string, tenYearsAgo: Date): Promise<{ execution_date: string; split_to: number; split_from: number }[]> {
    const cacheKey = `analysis:splits:${symbol}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached && Array.isArray(cached)) return cached;
    } catch {}

    const polygonApiKey = process.env.POLYGON_API_KEY;
    if (!polygonApiKey) return [];

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const splitsResp = await fetch(
            `https://api.polygon.io/v3/reference/splits?ticker=${symbol}&apiKey=${polygonApiKey}`,
            { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (splitsResp.ok) {
            const splitsData = await splitsResp.json();
            const results = (splitsData.results || []).filter((sp: any) => {
                const splitDate = new Date(sp.execution_date + 'T00:00:00Z');
                return splitDate.getTime() >= tenYearsAgo.getTime();
            });
            try { await setCachedData(cacheKey, results, SPLITS_CACHE_TTL); } catch {}
            return results;
        }
    } catch {}
    return [];
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();

    // Check Redis cache first
    const cacheKey = `analysis:history:${symbol}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) {
            return NextResponse.json(cached, {
                headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
            });
        }
    } catch {}

    try {
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

        // Fetch 10Y daily valuation history
        const rows = await prisma.dailyValuationHistory.findMany({
            where: { symbol, date: { gte: tenYearsAgo } },
            select: { date: true, peRatio: true, psRatio: true, closePrice: true },
            orderBy: { date: 'asc' },
        });

        // Weekly downsample: keep last row of each ISO-week bucket
        // bucket key = floor(ms / 7days) to avoid date-fns dependency
        const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
        const weekMap = new Map<number, typeof rows[0]>();
        for (const r of rows) {
            weekMap.set(Math.floor(r.date.getTime() / MS_WEEK), r);
        }
        const weekly = Array.from(weekMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

        // Filter valid values for percentile calculation
        // P/E < 5: stock split artifacts (adjusted shares vs pre-split price)
        // P/E > 200: near-zero earnings spikes that distort bands (e.g. AMZN 2022-2023)
        const VALID_PE = (v: number | null): v is number => v !== null && v > 5 && v < 200;
        const VALID_PS = (v: number | null): v is number => v !== null && v > 0.5 && v < 200;

        const peAllValues = rows.map(r => r.peRatio).filter(VALID_PE);
        const psAllValues = rows.map(r => r.psRatio).filter(VALID_PS);

        // Build time-series arrays (weekly, all 10Y — client filters by period)
        const peHistory = weekly
            .filter(r => VALID_PE(r.peRatio))
            .map(r => ({ date: r.date.toISOString().split('T')[0], value: parseFloat((r.peRatio as number).toFixed(2)) }));

        const psHistory = weekly
            .filter(r => VALID_PS(r.psRatio))
            .map(r => ({ date: r.date.toISOString().split('T')[0], value: parseFloat((r.psRatio as number).toFixed(2)) }));

        // Current values (most recent row with valid data) — single reverse iteration
        let latestPE: number | null = null;
        let latestPS: number | null = null;
        for (let i = rows.length - 1; i >= 0 && (latestPE === null || latestPS === null); i--) {
            if (latestPE === null && VALID_PE(rows[i]!.peRatio)) latestPE = rows[i]!.peRatio;
            if (latestPS === null && VALID_PS(rows[i]!.psRatio)) latestPS = rows[i]!.psRatio;
        }

        // Price history (weekly) for Scenario Lab chart
        const priceHistory = weekly
            .filter(r => r.closePrice !== null && r.closePrice !== undefined && r.closePrice > 0)
            .map(r => ({ date: r.date.toISOString().split('T')[0]!, price: parseFloat((r.closePrice as number).toFixed(2)) }));

        // Build stats first
        const peStats = buildStats(peAllValues);
        const psStats = buildStats(psAllValues);

        // --- Financial statements: compute TTM per-share metrics ---
        const tenYearsAgoStmts = new Date();
        tenYearsAgoStmts.setFullYear(tenYearsAgoStmts.getFullYear() - 10);

        const statements = await prisma.financialStatement.findMany({
            where: { symbol, endDate: { gte: tenYearsAgoStmts } },
            orderBy: { endDate: 'asc' },
        });

        // Build weekly price lookup for stock split detection
        const weeklyPriceMap = new Map<string, number>();
        for (const w of weekly) {
            if (w.closePrice && w.closePrice > 0) {
                weeklyPriceMap.set(w.date.toISOString().split('T')[0]!, w.closePrice);
            }
        }
        const sortedPriceDates = Array.from(weeklyPriceMap.keys()).sort();

        // Detect stock splits using cached Polygon reference API (7-day Redis cache + 3s timeout)
        // Falls back to statement-based detection if API unavailable
        const splitEvents: { date: Date; ratio: number }[] = [];

        try {
            const splits = await getCachedSplitsLocal(symbol, tenYearsAgo);
            for (const sp of splits) {
                const splitDate = new Date(sp.execution_date + 'T00:00:00Z');
                const splitRatio = sp.split_to / sp.split_from;
                if (splitDate.getTime() >= tenYearsAgo.getTime()) {
                    splitEvents.push({ date: splitDate, ratio: splitRatio });
                }
            }
        } catch {
            // Fall through to statement-based detection
        }

        if (splitEvents.length > 0) {
            // Use Polygon split dates: multiply shares for statements before each split date
            for (const split of splitEvents) {
                for (const s of statements) {
                    if (s.endDate.getTime() < split.date.getTime() &&
                        s.sharesOutstanding && s.sharesOutstanding > 0) {
                        s.sharesOutstanding = s.sharesOutstanding * split.ratio;
                    }
                }
            }
        } else {
            // Fallback: detect splits from shares jumps between consecutive quarterly statements
            const quarterlyStmts = statements.filter(s => s.fiscalPeriod && s.fiscalPeriod !== 'FY');
            for (let i = 1; i < quarterlyStmts.length; i++) {
                const prev = quarterlyStmts[i - 1]!;
                const curr = quarterlyStmts[i]!;
                if (prev.sharesOutstanding && prev.sharesOutstanding > 0 &&
                    curr.sharesOutstanding && curr.sharesOutstanding > 0) {
                    const ratio = curr.sharesOutstanding / prev.sharesOutstanding;
                    if (ratio > 1.5) {
                        const commonSplits = [2, 3, 4, 5, 7, 8, 10, 15, 20, 25];
                        const nearestSplit = commonSplits.reduce((best, r) =>
                            Math.abs(ratio - r) < Math.abs(ratio - best) ? r : best
                        );
                        if (Math.abs(ratio - nearestSplit) / nearestSplit <= 0.15) {
                            // Only multiply statements that are clearly pre-split (shares < curr/2)
                            const threshold = curr.sharesOutstanding / 2;
                            for (const s of statements) {
                                if (s.endDate.getTime() < curr.endDate.getTime() &&
                                    s.sharesOutstanding && s.sharesOutstanding > 0 &&
                                    s.sharesOutstanding < threshold) {
                                    s.sharesOutstanding = s.sharesOutstanding * nearestSplit;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Post-split shares adjustment (for Finnhub statements not updated after recent split):
        // If Ticker.sharesOutstanding is much larger than latest statement shares,
        // and ratio matches a split ratio, multiply only statements that are still pre-split.
        // Uses threshold to avoid double-adjusting statements already fixed above.
        const tickerInfo = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sharesOutstanding: true },
        });

        if (tickerInfo?.sharesOutstanding && tickerInfo.sharesOutstanding > 0 && statements.length > 0) {
            const lastStmt = statements[statements.length - 1]!;
            const lastStmtShares = lastStmt.sharesOutstanding;
            if (lastStmtShares && lastStmtShares > 0) {
                const ratio = tickerInfo.sharesOutstanding / lastStmtShares;
                if (ratio > 1.5) {
                    const commonSplits = [2, 3, 4, 5, 7, 8, 10, 15, 20, 25];
                    const nearestSplit = commonSplits.reduce((best, r) =>
                        Math.abs(ratio - r) < Math.abs(ratio - best) ? r : best
                    );
                    if (Math.abs(ratio - nearestSplit) / nearestSplit <= 0.15) {
                        const threshold = tickerInfo.sharesOutstanding / 2;
                        for (const s of statements) {
                            if (s.sharesOutstanding && s.sharesOutstanding > 0 &&
                                s.sharesOutstanding < threshold) {
                                s.sharesOutstanding = s.sharesOutstanding * nearestSplit;
                            }
                        }
                    }
                }
            }
        }

        const revPerShareHistory: PerSharePoint[] = [];
        const epsPerShareHistory: PerSharePoint[] = [];

        let prevShares: number | null = null;
        for (const s of statements) {
            if (!s.fiscalPeriod || s.fiscalPeriod === 'FY') continue;
            const { netIncome: ttmNI, revenue: ttmRev } = computeTTMAtDate(statements, s.endDate);
            let shares = s.sharesOutstanding;
            // After split adjustment, shares should be consistent.
            // If there's still a >2x jump that doesn't match a split ratio, it's a data error.
            if (shares && shares > 0 && prevShares && prevShares > 0 && shares > prevShares * 2) {
                const sharesRatio = shares / prevShares;
                const commonRatios = [2, 3, 4, 5, 7, 8, 10, 15, 20, 25];
                const nearest = commonRatios.reduce((best, r) =>
                    Math.abs(sharesRatio - r) < Math.abs(sharesRatio - best) ? r : best
                );
                if (Math.abs(sharesRatio - nearest) / nearest > 0.15) {
                    shares = prevShares; // Data error, not a real split
                }
            }
            if (shares && shares > 0 && s.endDate) {
                prevShares = shares;
                const dateStr = s.endDate.toISOString().split('T')[0] as string;
                if (ttmRev != null && ttmRev > 0) {
                    revPerShareHistory.push({ date: dateStr, value: parseFloat((ttmRev / shares).toFixed(4)) });
                }
                if (ttmNI != null && ttmNI > 0) {
                    epsPerShareHistory.push({ date: dateStr, value: parseFloat((ttmNI / shares).toFixed(4)) });
                }
            }
        }

        // Fallback to ratio-derived if statements missing
        if (revPerShareHistory.length === 0) {
            revPerShareHistory.push(...weekly
                .filter(r => VALID_PS(r.psRatio) && r.closePrice && r.closePrice > 0)
                .map(r => ({ date: r.date.toISOString().split('T')[0] as string, value: parseFloat(((r.closePrice as number) / (r.psRatio as number)).toFixed(4)) })));
        }
        if (epsPerShareHistory.length === 0) {
            epsPerShareHistory.push(...weekly
                .filter(r => VALID_PE(r.peRatio) && r.closePrice && r.closePrice > 0)
                .map(r => ({ date: r.date.toISOString().split('T')[0] as string, value: parseFloat(((r.closePrice as number) / (r.peRatio as number)).toFixed(4)) })));
        }

        // Forward-fill per-share data to align with weekly price dates
        function forwardFillPerShare(perShare: PerSharePoint[], priceDates: string[]): { date: string; value: number }[] {
            const result: { date: string; value: number }[] = [];
            let lastValue: number | null = null;
            let pi = 0;
            for (const pd of priceDates) {
                while (pi < perShare.length && perShare[pi]!.date <= pd) {
                    lastValue = perShare[pi]!.value;
                    pi++;
                }
                if (lastValue !== null) {
                    result.push({ date: pd, value: lastValue });
                }
            }
            return result;
        }

        const weeklyDates = weekly.map(r => r.date.toISOString().split('T')[0]!);
        const revPerShareFilled = forwardFillPerShare(revPerShareHistory, weeklyDates);
        const epsPerShareFilled = forwardFillPerShare(epsPerShareHistory, weeklyDates);

        const medianPS = psStats?.median ?? latestPS ?? null;
        const medianPE = peStats?.median ?? latestPE ?? null;

        const impliedPricePS = medianPS != null
            ? revPerShareFilled.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPS).toFixed(2)) }))
            : [];

        const impliedPricePE = medianPE != null
            ? epsPerShareFilled.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPE).toFixed(2)) }))
            : [];

        // Helper: build valuation history from a given intrinsic series
        // O(n+m) pointer-based — avoids O(n*m) filter inside map
        function buildValuationHistory(intrinsicSrc: { date: string; impliedPrice: number }[]) {
            const result: { date: string; price: number; intrinsic: number; undervaluationPct: number | null }[] = [];
            let lastIntrinsic: { date: string; impliedPrice: number } | null = null;
            let pi = 0;
            for (const p of priceHistory) {
                while (pi < intrinsicSrc.length && intrinsicSrc[pi]!.date <= p.date) {
                    lastIntrinsic = intrinsicSrc[pi]!;
                    pi++;
                }
                if (!lastIntrinsic) continue;
                const intrinsic = lastIntrinsic.impliedPrice;
                if (intrinsic <= 0) {
                    result.push({ date: p.date, price: p.price, intrinsic: 0, undervaluationPct: null });
                } else {
                    const underval = ((intrinsic - p.price) / intrinsic) * 100;
                    result.push({ date: p.date, price: p.price, intrinsic, undervaluationPct: parseFloat(underval.toFixed(2)) });
                }
            }
            return result;
        }

        const valuationHistoryPE = buildValuationHistory(impliedPricePE);
        const valuationHistoryPS = buildValuationHistory(impliedPricePS);

        // Default: per-point PE/PS smart fallback — use PE when > 0, else PS
        const valuationHistory = priceHistory.map((p, idx) => {
            const pePoint = valuationHistoryPE[idx];
            const psPoint = valuationHistoryPS[idx];
            // Prefer PE when it has a valid positive intrinsic
            if (pePoint && pePoint.intrinsic > 0) return pePoint;
            if (psPoint && psPoint.intrinsic > 0) return psPoint;
            // Both invalid — return PE point with null undervaluation
            return pePoint ?? psPoint ?? null;
        }).filter(Boolean) as { date: string; price: number; intrinsic: number; undervaluationPct: number | null }[];

        function computeSummary(vh: { date: string; price: number; intrinsic: number; undervaluationPct: number | null }[]) {
            const valid = vh.filter(v => v.undervaluationPct !== null);
            const currentUnderval = valid.length ? valid[valid.length - 1]!.undervaluationPct : null;

            const cutoff5y = new Date(); cutoff5y.setFullYear(cutoff5y.getFullYear() - 5);
            const avg5yVals = valid.filter(v => new Date(v.date) >= cutoff5y);
            const avg5yUnderval = avg5yVals.length
                ? parseFloat((avg5yVals.reduce((a, b) => a + (b.undervaluationPct ?? 0), 0) / avg5yVals.length).toFixed(2))
                : null;

            const intrinsicCagr = valid.length >= 2
                ? (() => {
                    const start = valid[0]!.intrinsic;
                    const end = valid[valid.length - 1]!.intrinsic;
                    const startDate = new Date(valid[0]!.date);
                    const endDate = new Date(valid[valid.length - 1]!.date);
                    const years = Math.max(1, (endDate.getTime() - startDate.getTime()) / (365 * 24 * 60 * 60 * 1000));
                    if (start <= 0 || end <= 0) return null;
                    const cagr = Math.pow(end / start, 1 / years) - 1;
                    return parseFloat((cagr * 100).toFixed(2));
                })()
                : null;

            return { currentUndervaluation: currentUnderval, avg5yUndervaluation: avg5yUnderval, intrinsicCagr };
        }

        const valuationSummary = computeSummary(valuationHistory);
        const valuationSummaryPE = computeSummary(valuationHistoryPE);
        const valuationSummaryPS = computeSummary(valuationHistoryPS);

        // --- Simple forward estimates (projection) ---
        const revForecast = projectForward(revPerShareHistory, 6);
        const epsForecast = projectForward(epsPerShareHistory, 6);

        const impliedPSForecast = medianPS
            ? revForecast.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPS).toFixed(2)), isForecast: true }))
            : [];
        const impliedPEForecast = medianPE
            ? epsForecast.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPE).toFixed(2)), isForecast: true }))
            : [];

        // Default forecast: PE-preferred with PS fallback
        const intrinsicForecastSeries = impliedPEForecast.length > 0 ? impliedPEForecast : impliedPSForecast;
        const intrinsicForecastPE = impliedPEForecast;
        const intrinsicForecastPS = impliedPSForecast;

        const priceMap = new Map(priceHistory.map(p => [p.date, p.price]));
        const psAligned = impliedPricePS.filter(pt => priceMap.has(pt.date));
        const psPrices = psAligned.map(pt => priceMap.get(pt.date) as number);
        const psImplied = psAligned.map(pt => pt.impliedPrice);
        const corrPS = (psPrices.length > 2) ? pearson(psPrices, psImplied) : null;

        const peAligned = impliedPricePE.filter(pt => priceMap.has(pt.date));
        const pePrices = peAligned.map(pt => priceMap.get(pt.date) as number);
        const peImplied = peAligned.map(pt => pt.impliedPrice);
        const corrPE = (pePrices.length > 2) ? pearson(pePrices, peImplied) : null;

        const responseBody = {
            peHistory,
            psHistory,
            priceHistory,
            revPerShareHistory,
            epsPerShareHistory,
            impliedPricePS,
            impliedPricePE,
            valuationForecast: intrinsicForecastSeries.map(pt => ({ date: pt.date, intrinsic: pt.impliedPrice })),
            valuationForecastPE: intrinsicForecastPE.map(pt => ({ date: pt.date, intrinsic: pt.impliedPrice })),
            valuationForecastPS: intrinsicForecastPS.map(pt => ({ date: pt.date, intrinsic: pt.impliedPrice })),
            valuationHistory,
            valuationHistoryPE,
            valuationHistoryPS,
            valuationSummary,
            valuationSummaryPE,
            valuationSummaryPS,
            correlation: {
                priceVsImpliedPS: corrPS,
                priceVsImpliedPE: corrPE,
            },
            current: {
                pe: latestPE !== null ? parseFloat((latestPE as number).toFixed(2)) : null,
                ps: latestPS !== null ? parseFloat((latestPS as number).toFixed(2)) : null,
            },
            stats: { pe: peStats, ps: psStats },
        };

        // Cache in Redis (1 hour TTL)
        try { await setCachedData(cacheKey, responseBody, HISTORY_CACHE_TTL); } catch {}

        return NextResponse.json(responseBody, {
            headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
        });
    } catch (error) {
        console.error(`Error fetching history for ${symbol}:`, error);
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}

// Invalidate cache when POST refreshes analysis data
export async function POST(
    request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();
    try {
        await del([`analysis:history:${symbol}`]);
    } catch {}
    return NextResponse.json({ ok: true });
}
