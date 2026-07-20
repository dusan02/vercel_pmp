import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { projectForward, pearson, buildStats, type PerSharePoint } from '@/lib/utils/analysisMath';
import { computeTTMAtDate } from '@/lib/utils/ttm';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();

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

        // Current values (most recent row with valid data)
        const latestPE = [...rows].reverse().find(r => VALID_PE(r.peRatio))?.peRatio ?? null;
        const latestPS = [...rows].reverse().find(r => VALID_PS(r.psRatio))?.psRatio ?? null;

        // Price history (weekly) for Scenario Lab chart
        const priceHistory = weekly
            .filter(r => r.closePrice !== null && r.closePrice !== undefined && r.closePrice > 0)
            .map(r => ({ date: r.date.toISOString().split('T')[0], price: parseFloat((r.closePrice as number).toFixed(2)) }));

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

        // Post-split shares adjustment:
        // If Finnhub doesn't have post-split statements (e.g. AMZN did 20:1 split
        // but last Finnhub statement still has pre-split shares), we detect this
        // by comparing last statement shares to Ticker.sharesOutstanding.
        // If the ratio matches a common split ratio AND price history confirms
        // a proportional price drop, we multiply ALL historical shares by the ratio.
        const tickerInfo = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sharesOutstanding: true },
        });

        if (tickerInfo?.sharesOutstanding && tickerInfo.sharesOutstanding > 0 && statements.length > 0) {
            const lastStmtShares = statements[statements.length - 1]!.sharesOutstanding;
            if (lastStmtShares && lastStmtShares > 0) {
                const ratio = tickerInfo.sharesOutstanding / lastStmtShares;
                // Only adjust if shares increased significantly (ratio > 1.5)
                if (ratio > 1.5) {
                    const commonSplits = [2, 3, 4, 5, 7, 8, 10, 15, 20, 25];
                    const nearestSplit = commonSplits.reduce((best, r) =>
                        Math.abs(ratio - r) < Math.abs(ratio - best) ? r : best
                    );
                    // Ratio must be close to a common split ratio (within 15%)
                    if (Math.abs(ratio - nearestSplit) / nearestSplit <= 0.15) {
                        // Verify with price history: price should have dropped by ~same factor
                        const lastStmtDate = statements[statements.length - 1]!.endDate;
                        const targetDate = lastStmtDate.toISOString().split('T')[0]!;
                        const afterDate = new Date();
                        const priceAtStmt = sortedPriceDates.filter(d => d <= targetDate).slice(-1)[0];
                        const priceNow = sortedPriceDates.slice(-1)[0];
                        if (priceAtStmt && priceNow) {
                            const pBefore = weeklyPriceMap.get(priceAtStmt)!;
                            const pAfter = weeklyPriceMap.get(priceNow)!;
                            if (pBefore > 0 && pAfter > 0) {
                                const priceRatio = pBefore / pAfter;
                                // Price should be in the same ballpark as the split ratio
                                // (not exact because price also moves over time, so allow 50% tolerance)
                                if (priceRatio > nearestSplit * 0.5 && priceRatio < nearestSplit * 2) {
                                    // Confirmed split — adjust all historical shares
                                    for (const s of statements) {
                                        if (s.sharesOutstanding && s.sharesOutstanding > 0) {
                                            s.sharesOutstanding = s.sharesOutstanding * nearestSplit;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        const revPerShareHistory: PerSharePoint[] = [];
        const epsPerShareHistory: PerSharePoint[] = [];

        // Detect if a shares outstanding increase is a legitimate stock split
        // by checking if the price dropped by approximately the same factor.
        function isLikelyStockSplit(stmtDate: Date, sharesRatio: number): boolean {
            const commonSplitRatios = [2, 3, 4, 5, 8, 10];
            const nearest = commonSplitRatios.reduce((best, r) =>
                Math.abs(sharesRatio - r) < Math.abs(sharesRatio - best) ? r : best
            );
            // Shares ratio must be close to a common split ratio (within 15%)
            if (Math.abs(sharesRatio - nearest) / nearest > 0.15) return false;

            const targetDate = stmtDate.toISOString().split('T')[0]!;
            // Find price ~4 weeks before and at/after statement date
            const beforeDate = new Date(stmtDate);
            beforeDate.setDate(beforeDate.getDate() - 28);
            const beforeStr = beforeDate.toISOString().split('T')[0]!;

            const priceBefore = sortedPriceDates.filter(d => d <= beforeStr).slice(-1)[0];
            const priceAfter = sortedPriceDates.filter(d => d >= targetDate)[0];
            if (!priceBefore || !priceAfter) return false;

            const pBefore = weeklyPriceMap.get(priceBefore)!;
            const pAfter = weeklyPriceMap.get(priceAfter)!;
            if (pBefore <= 0 || pAfter <= 0) return false;

            const priceRatio = pBefore / pAfter;
            // Price should drop by approximately the same factor as shares increased
            return Math.abs(priceRatio - sharesRatio) / sharesRatio < 0.25;
        }

        // Compute TTM per-share at each statement date using shared utility.
        // Guard against anomalous shares outstanding (e.g. Finnhub reporting
        // in different units) by detecting stock splits via price history.
        // If shares jump >2x AND price didn't drop proportionally, it's a data error.
        let prevShares: number | null = null;
        for (const s of statements) {
            if (!s.fiscalPeriod || s.fiscalPeriod === 'FY') continue;
            const { netIncome: ttmNI, revenue: ttmRev } = computeTTMAtDate(statements, s.endDate);
            let shares = s.sharesOutstanding;
            if (shares && shares > 0 && prevShares && prevShares > 0 && shares > prevShares * 2) {
                const sharesRatio = shares / prevShares;
                if (!isLikelyStockSplit(s.endDate, sharesRatio)) {
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
        function buildValuationHistory(intrinsicSrc: { date: string; impliedPrice: number }[]) {
            return priceHistory.map(p => {
                const validPoints = intrinsicSrc.filter(i => i.date <= (p.date || ''));
                if (validPoints.length === 0) return null;
                const intrinsicPoint = validPoints[validPoints.length - 1]!;
                const intrinsic = intrinsicPoint.impliedPrice;
                // Guard: if intrinsic <= 0, mark as N/A (null) — don't compute nonsensical undervaluation
                if (intrinsic <= 0) {
                    return { date: p.date, price: p.price, intrinsic: 0, undervaluationPct: null as number | null };
                }
                const underval = ((intrinsic - p.price) / intrinsic) * 100;
                return {
                    date: p.date,
                    price: p.price,
                    intrinsic,
                    undervaluationPct: parseFloat(underval.toFixed(2)),
                };
            }).filter(Boolean) as { date: string; price: number; intrinsic: number; undervaluationPct: number | null }[];
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

        return NextResponse.json({
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
        }, {
            headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
        });
    } catch (error) {
        console.error(`Error fetching history for ${symbol}:`, error);
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}
