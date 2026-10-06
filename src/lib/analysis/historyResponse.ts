import { prisma } from '@/lib/db/prisma';
import { projectForward, buildStats, quarterlyDiffCorr, type PerSharePoint } from '@/lib/utils/analysisMath';
import { computeTTMAtDate } from '@/lib/utils/ttm';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { applySplitAdjustments, applyPostSplitAdjustment, findNearestSplit, COMMON_SPLIT_RATIOS } from '@/lib/utils/splitAdjustment';
import { isPeDistorted } from '@/lib/analysis/peDistortion';

const HISTORY_CACHE_TTL = 3600; // 1 hour (valuation history changes slowly)

/**
 * Shared analysis-history pipeline — used by /api/analysis/[ticker]/history
 * (HTTP layer adds Cache-Control/status) and by the analysis page SSR
 * prefetch (same Redis cache, no localhost hop).
 * Returns the JSON-serialisable response body, or null on error.
 */
export async function getHistoryResponse(symbol: string): Promise<Record<string, any> | null> {
    const cacheKey = `analysis:history:v2:${symbol}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) return cached as Record<string, any>;
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
        // Positive multiples remain valid even below 3 or above 200; extremes are not stale data.
        // The chart uses a log scale for wide ranges rather than deleting recent observations.
        const VALID_PE = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;
        const VALID_PS = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;

        const peAllValues = rows.map(r => r.peRatio).filter(VALID_PE);
        const psAllValues = rows.map(r => r.psRatio).filter(VALID_PS);

        // Build time-series arrays (weekly, all 10Y — client filters by period)
        const peHistory = weekly
            .filter(r => VALID_PE(r.peRatio))
            .map(r => ({ date: r.date.toISOString().split('T')[0], value: parseFloat((r.peRatio as number).toFixed(2)) }));

        const psHistory = weekly
            .filter(r => VALID_PS(r.psRatio))
            .map(r => ({ date: r.date.toISOString().split('T')[0], value: parseFloat((r.psRatio as number).toFixed(2)) }));

        // Latest historical snapshot only — never relabel an older valid multiple as current.
        const latest = rows.at(-1);
        const latestPE = VALID_PE(latest?.peRatio ?? null) ? latest!.peRatio : null;
        const latestPS = VALID_PS(latest?.psRatio ?? null) ? latest!.psRatio : null;

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

        // Detect stock splits using shared utility (Polygon API with Redis cache)
        // Falls back to statement-based detection if API unavailable
        let splitEvents: { date: Date; ratio: number }[] = [];

        try {
            splitEvents = await applySplitAdjustments(statements, symbol, tenYearsAgo);
        } catch {
            // Fall through to statement-based detection
        }

        if (splitEvents.length === 0) {
            // Fallback: detect splits from shares jumps between consecutive quarterly statements
            const quarterlyStmts = statements.filter(s => s.fiscalPeriod && s.fiscalPeriod !== 'FY');
            for (let i = 1; i < quarterlyStmts.length; i++) {
                const prev = quarterlyStmts[i - 1]!;
                const curr = quarterlyStmts[i]!;
                if (prev.sharesOutstanding && prev.sharesOutstanding > 0 &&
                    curr.sharesOutstanding && curr.sharesOutstanding > 0) {
                    const ratio = curr.sharesOutstanding / prev.sharesOutstanding;
                    if (ratio > 1.5) {
                        const nearestSplit = findNearestSplit(ratio);
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

        // Post-split shares adjustment for Finnhub statements not updated after recent split
        const tickerInfo = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sharesOutstanding: true },
        });

        if (tickerInfo?.sharesOutstanding && statements.length > 0) {
            applyPostSplitAdjustment(statements, tickerInfo.sharesOutstanding);
        }

        // Per-share timelines record ANY sign of TTM — a non-positive quarter
        // marks the start of a stretch where a multiple-implied value is not
        // meaningful, and the forward-fill must gap instead of carrying a
        // stale positive EPS across the loss window (DAL sat at a frozen
        // $50.53 implied through COVID losses).
        const revPerShareTimeline: PerSharePoint[] = [];
        const epsPerShareTimeline: PerSharePoint[] = [];
        let lastTtmNI: number | null = null;
        let lastTtmRev: number | null = null;

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
                // Use the calendar date of the statement end (add 1 day to compensate
                // for UTC offset — Finnhub reports endDate as midnight UTC which is
                // actually the end of the fiscal period in the company's local timezone).
                const endDate = new Date(s.endDate.getTime() + 24 * 60 * 60 * 1000);
                const dateStr = endDate.toISOString().split('T')[0] as string;
                lastTtmNI = ttmNI;
                lastTtmRev = ttmRev;
                if (ttmRev != null) {
                    revPerShareTimeline.push({ date: dateStr, value: parseFloat((ttmRev / shares).toFixed(4)) });
                }
                if (ttmNI != null) {
                    epsPerShareTimeline.push({ date: dateStr, value: parseFloat((ttmNI / shares).toFixed(4)) });
                }
            }
        }

        // Canonical current basis: the latest statement point uses the trusted
        // ticker share count (same convention as the daily valuation row), so
        // the implied endpoint matches the EPS/revenue-per-share basis the
        // analysis page reports. Guarded — a >50% divergence means the ticker
        // share count is likely stale (unsynced split), so keep the statement
        // basis rather than corrupt the endpoint.
        const trustedShares = tickerInfo?.sharesOutstanding ?? null;
        if (trustedShares != null && trustedShares > 0) {
            const lastEpsPt = epsPerShareTimeline[epsPerShareTimeline.length - 1];
            if (lastEpsPt && lastTtmNI != null && lastTtmNI > 0 && lastEpsPt.value > 0) {
                const v = lastTtmNI / trustedShares;
                if (Math.abs(v / lastEpsPt.value - 1) < 0.5) {
                    lastEpsPt.value = parseFloat(v.toFixed(4));
                }
            }
            const lastRevPt = revPerShareTimeline[revPerShareTimeline.length - 1];
            if (lastRevPt && lastTtmRev != null && lastTtmRev > 0 && lastRevPt.value > 0) {
                const v = lastTtmRev / trustedShares;
                if (Math.abs(v / lastRevPt.value - 1) < 0.5) {
                    lastRevPt.value = parseFloat(v.toFixed(4));
                }
            }
        }

        // Positive-only views feed CAGR/forecast consumers and the emitted
        // arrays — negative quarters are gap markers, not growth inputs.
        const revPerShareHistory = revPerShareTimeline.filter(p => p.value > 0);
        const epsPerShareHistory = epsPerShareTimeline.filter(p => p.value > 0);

        // Ratio-derived fallback reconstructs the same TTM trail (DVH ratios
        // are price/TTM by construction), but it is weekly-resolution — it
        // must NOT feed quarterly forecast/CAGR inputs and must not bridge
        // multi-week gaps (missing DVH weeks = invalid fundamentals, not
        // quarters to fill). It populates only the implied-line timeline.
        const revRatioDerived = revPerShareHistory.length === 0;
        if (revRatioDerived) {
            revPerShareTimeline.push(...weekly
                .filter(r => VALID_PS(r.psRatio) && r.closePrice && r.closePrice > 0)
                .map(r => ({ date: r.date.toISOString().split('T')[0] as string, value: parseFloat(((r.closePrice as number) / (r.psRatio as number)).toFixed(4)) })));
        }
        const epsRatioDerived = epsPerShareHistory.length === 0;
        if (epsRatioDerived) {
            epsPerShareTimeline.push(...weekly
                .filter(r => VALID_PE(r.peRatio) && r.closePrice && r.closePrice > 0)
                .map(r => ({ date: r.date.toISOString().split('T')[0] as string, value: parseFloat(((r.closePrice as number) / (r.peRatio as number)).toFixed(4)) })));
        }
        // Fallback points append after statement markers — restore date order
        // before the single-pointer forward-fill walks the array.
        if (revRatioDerived) revPerShareTimeline.sort((a, b) => a.date < b.date ? -1 : 1);
        if (epsRatioDerived) epsPerShareTimeline.sort((a, b) => a.date < b.date ? -1 : 1);

        // Forward-fill per-share data to align with weekly price dates.
        // Emits only when the latest point is positive and within maxFillDays
        // — a non-positive statement quarter or a >maxFillDays-old ratio point
        // produces an honest gap, not a stale carried value.
        function forwardFillPerShare(perShare: PerSharePoint[], priceDates: string[], maxFillDays = Number.POSITIVE_INFINITY): { date: string; value: number }[] {
            const result: { date: string; value: number }[] = [];
            let lastValue: number | null = null;
            let lastTime = 0;
            let pi = 0;
            for (const pd of priceDates) {
                while (pi < perShare.length && perShare[pi]!.date <= pd) {
                    lastValue = perShare[pi]!.value;
                    lastTime = new Date(perShare[pi]!.date).getTime();
                    pi++;
                }
                if (lastValue !== null && lastValue > 0 &&
                    (new Date(pd).getTime() - lastTime) / 86400000 <= maxFillDays) {
                    result.push({ date: pd, value: lastValue });
                }
            }
            return result;
        }

        const weeklyDates = weekly.map(r => r.date.toISOString().split('T')[0]!);
        const revPerShareFilled = forwardFillPerShare(revPerShareTimeline, weeklyDates, revRatioDerived ? 10 : Number.POSITIVE_INFINITY);
        const epsPerShareFilled = forwardFillPerShare(epsPerShareTimeline, weeklyDates, epsRatioDerived ? 10 : Number.POSITIVE_INFINITY);

        const medianPS = psStats?.median ?? latestPS ?? null;
        const medianPE = peStats?.median ?? latestPE ?? null;

        const impliedPricePS = medianPS != null
            ? revPerShareFilled.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPS).toFixed(2)) }))
            : [];

        const impliedPricePE = medianPE != null
            ? epsPerShareFilled.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPE).toFixed(2)) }))
            : [];

        // Depressed-EPS distortion — dates where that day's P/E sits far above
        // the stock's own median multiple (STM: 308× vs ~15× median). A
        // PE-based intrinsic at those dates is not meaningful: EPS collapsed,
        // the price didn't 20×-reprice. Auto mode falls back to P/S there and
        // the PE series marks them unreliable instead of "200% overvalued".
        const peRatioByDate = new Map<string, number>();
        for (const r of weekly) {
            if (VALID_PE(r.peRatio)) peRatioByDate.set(r.date.toISOString().split('T')[0]!, r.peRatio!);
        }
        const distortedPeDates = new Set<string>();
        if (medianPE != null) {
            for (const [d, peT] of peRatioByDate) {
                if (isPeDistorted(peT, medianPE)) distortedPeDates.add(d);
            }
        }

        // Helper: build valuation history from a given intrinsic series
        // O(n+m) pointer-based — avoids O(n*m) filter inside map
        // Clamps undervaluation to [-200%, +200%] to prevent nonsensical extremes
        // (e.g. INTC with intrinsic $0.42 vs price $103 → -24538% is meaningless).
        // Also marks intrinsic as unreliable (null) when it's < 5% of price —
        // this happens when EPS/revenue is near-zero, making median×per-share meaningless.
        // validDates = weeks where the implied series has a real observation;
        // outside them lastIntrinsic is a stale carry and the % would read as
        // a fake signal (price crashed vs frozen pre-loss intrinsic).
        function buildValuationHistory(intrinsicSrc: { date: string; impliedPrice: number }[], validDates: Set<string>, unreliableDates?: Set<string>) {
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
                } else if (intrinsic < p.price * 0.05 || !validDates.has(p.date) || unreliableDates?.has(p.date)) {
                    // Intrinsic is < 5% of price — near-zero EPS/revenue makes this meaningless
                    result.push({ date: p.date, price: p.price, intrinsic, undervaluationPct: null });
                } else {
                    const underval = ((intrinsic - p.price) / intrinsic) * 100;
                    // Clamp to [-200%, +200%] to keep chart/tooltip readable
                    const clamped = Math.max(-200, Math.min(200, underval));
                    result.push({ date: p.date, price: p.price, intrinsic, undervaluationPct: parseFloat(clamped.toFixed(2)) });
                }
            }
            return result;
        }

        const impliedPeDates = new Set(impliedPricePE.map(p => p.date));
        const impliedPsDates = new Set(impliedPricePS.map(p => p.date));
        const valuationHistoryPE = buildValuationHistory(impliedPricePE, impliedPeDates, distortedPeDates);
        const valuationHistoryPS = buildValuationHistory(impliedPricePS, impliedPsDates);

        // Default: per-point PE/PS smart fallback — use PE when > 0 and not
        // depressed-EPS distorted, else PS
        const valuationHistory = priceHistory.map((p, idx) => {
            const pePoint = valuationHistoryPE[idx];
            const psPoint = valuationHistoryPS[idx];
            // Prefer PE when it has a valid positive intrinsic — but skip it
            // on distorted dates where P/S carries the real signal
            if (pePoint && pePoint.intrinsic > 0 && !distortedPeDates.has(pePoint.date)) return pePoint;
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
        // Pass lastPriceDate so forecast starts AFTER the latest price point,
        // preventing forecast dates from overlapping with historical data.
        const lastPriceDate = priceHistory.length > 0
            ? priceHistory[priceHistory.length - 1]!.date
            : null;
        const revForecast = projectForward(revPerShareHistory, 6, lastPriceDate);
        const epsForecast = projectForward(epsPerShareHistory, 6, lastPriceDate);

        const impliedPSForecast = medianPS
            ? revForecast.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPS).toFixed(2)), isForecast: true }))
            : [];
        const impliedPEForecast = medianPE
            ? epsForecast.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPE).toFixed(2)), isForecast: true }))
            : [];

        // Default forecast: PE-preferred with PS fallback. When today's P/E is
        // distorted by depressed EPS, the PE projection starts from a trough
        // base — P/S projects from revenue, which doesn't have that problem.
        const latestPeDistorted = isPeDistorted(latestPE, medianPE);
        const intrinsicForecastSeries = (!latestPeDistorted && impliedPEForecast.length > 0)
            ? impliedPEForecast
            : (impliedPSForecast.length > 0 ? impliedPSForecast : impliedPEForecast);
        const intrinsicForecastPE = impliedPEForecast;
        const intrinsicForecastPS = impliedPSForecast;

        const priceMap = new Map(priceHistory.map(p => [p.date, p.price]));

        // Co-movement measured on quarter-over-quarter % changes, not levels —
        // Pearson on two upward-trending level series is spuriously ~+0.9 for
        // almost any growing stock (both simply go up). Quarterly diffs match
        // the statement cadence of the implied line and measure whether price
        // actually moves WITH the fundamentals updates.
        const toPairs = (impliedSeries: { date: string; impliedPrice: number }[]) =>
            impliedSeries
                .map(pt => ({ date: pt.date, price: priceMap.get(pt.date) ?? null, implied: pt.impliedPrice }))
                .filter((p): p is { date: string; price: number; implied: number } => p.price != null && p.price > 0);

        const corrPS = quarterlyDiffCorr(toPairs(impliedPricePS));
        const corrPE = quarterlyDiffCorr(toPairs(impliedPricePE));

        // --- EPS CAGR (3Y & 5Y) from historical per-share earnings ---
        // Used by Data-Driven Scenario Lab as default growth rate.
        // Guards against negative/zero EPS (CAGR undefined for sign changes).
        function computeEpsCagr(years: number): number | null {
            if (epsPerShareHistory.length < 2) return null;
            const last = epsPerShareHistory[epsPerShareHistory.length - 1]!;
            const lastDate = new Date(last.date);
            const targetDate = new Date(lastDate);
            targetDate.setFullYear(targetDate.getFullYear() - years);
            // Find the point closest to (but not after) the target date
            let candidate = epsPerShareHistory[0]!;
            for (const pt of epsPerShareHistory) {
                if (new Date(pt.date) <= targetDate) {
                    candidate = pt;
                } else {
                    break;
                }
            }
            const actualYears = (lastDate.getTime() - new Date(candidate.date).getTime())
                / (365 * 24 * 60 * 60 * 1000);
            if (actualYears < years * 0.8) return null; // not enough history
            if (candidate.value <= 0 || last.value <= 0) return null; // CAGR undefined
            const cagr = Math.pow(last.value / candidate.value, 1 / actualYears) - 1;
            return parseFloat((cagr * 100).toFixed(2));
        }

        const epsCagr3y = computeEpsCagr(3);
        const epsCagr5y = computeEpsCagr(5);

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
            epsCagr3y,
            epsCagr5y,
        };

        // Cache in Redis (1 hour TTL)
        try { await setCachedData(cacheKey, responseBody, HISTORY_CACHE_TTL); } catch {}

        return responseBody;
    } catch (error) {
        console.error(`Error fetching history for ${symbol}:`, error);
        return null;
    }
}
