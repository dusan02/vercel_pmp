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

        const revPerShareHistory: PerSharePoint[] = [];
        const epsPerShareHistory: PerSharePoint[] = [];

        // Compute TTM per-share at each statement date using shared utility
        // Anomaly filter: skip points where value drops >50% from the previous point,
        // which typically indicates a missing FY statement in the DB causing broken TTM
        let prevRevPS: number | null = null;
        let prevEpsPS: number | null = null;
        for (const s of statements) {
            if (!s.fiscalPeriod || s.fiscalPeriod === 'FY') continue;
            const { netIncome: ttmNI, revenue: ttmRev } = computeTTMAtDate(statements, s.endDate);
            const shares = s.sharesOutstanding;
            if (shares && shares > 0 && s.endDate) {
                const dateStr = s.endDate.toISOString().split('T')[0] as string;
                if (ttmRev != null && ttmRev > 0) {
                    const revPS = parseFloat((ttmRev / shares).toFixed(4));
                    // Skip if >50% drop from previous point (anomaly from broken TTM)
                    if (prevRevPS !== null && revPS < prevRevPS * 0.5) {
                        // Anomaly detected — skip this point
                    } else {
                        revPerShareHistory.push({ date: dateStr, value: revPS });
                        prevRevPS = revPS;
                    }
                }
                if (ttmNI != null && ttmNI > 0) {
                    const epsPS = parseFloat((ttmNI / shares).toFixed(4));
                    // Skip if >50% drop from previous point (anomaly from broken TTM)
                    if (prevEpsPS !== null && epsPS < prevEpsPS * 0.5) {
                        // Anomaly detected — skip this point
                    } else {
                        epsPerShareHistory.push({ date: dateStr, value: epsPS });
                        prevEpsPS = epsPS;
                    }
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

        // Valuation history: choose intrinsic series and align with price history
        const intrinsicSeries = impliedPricePE.length > 0 ? impliedPricePE : impliedPricePS;
        const valuationHistory = priceHistory.map(p => {
            // Find the most recent intrinsic point on or before this price date (forward-fill)
            const validPoints = intrinsicSeries.filter(i => i.date <= (p.date || ''));
            if (validPoints.length === 0) return null;
            const intrinsicPoint = validPoints[validPoints.length - 1]!; // already sorted ascending
            
            const intrinsic = intrinsicPoint.impliedPrice;
            const underval = intrinsic > 0 ? ((intrinsic - p.price) / intrinsic) * 100 : 0;
            return {
                date: p.date,
                price: p.price,
                intrinsic,
                undervaluationPct: parseFloat(underval.toFixed(2)),
            };
        }).filter(Boolean) as { date: string; price: number; intrinsic: number; undervaluationPct: number }[];

        const currentUndervaluation = valuationHistory.length
            ? valuationHistory[valuationHistory.length - 1]!.undervaluationPct
            : null;

        // 5Y average undervaluation
        const cutoff5y = new Date(); cutoff5y.setFullYear(cutoff5y.getFullYear() - 5);
        const avg5yVals = valuationHistory.filter(v => new Date(v.date) >= cutoff5y);
        const avg5yUnderval = avg5yVals.length
            ? parseFloat((avg5yVals.reduce((a, b) => a + b.undervaluationPct, 0) / avg5yVals.length).toFixed(2))
            : null;

        // Intrinsic CAGR (using earliest vs latest intrinsic)
        const intrinsicCagr = valuationHistory.length >= 2
            ? (() => {
                const start = valuationHistory[0]!.intrinsic;
                const end = valuationHistory[valuationHistory.length - 1]!.intrinsic;
                const startDate = new Date(valuationHistory[0]!.date);
                const endDate = new Date(valuationHistory[valuationHistory.length - 1]!.date);
                const years = Math.max(1, (endDate.getTime() - startDate.getTime()) / (365 * 24 * 60 * 60 * 1000));
                if (start <= 0 || end <= 0) return null;
                const cagr = Math.pow(end / start, 1 / years) - 1;
                return parseFloat((cagr * 100).toFixed(2));
            })()
            : null;

        // --- Simple forward estimates (projection) ---
        const revForecast = projectForward(revPerShareHistory, 6);
        const epsForecast = projectForward(epsPerShareHistory, 6);

        const impliedPSForecast = medianPS
            ? revForecast.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPS).toFixed(2)), isForecast: true }))
            : [];
        const impliedPEForecast = medianPE
            ? epsForecast.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPE).toFixed(2)), isForecast: true }))
            : [];

        const intrinsicForecastSeries = impliedPEForecast.length > 0 ? impliedPEForecast : impliedPSForecast;

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
            valuationHistory,
            valuationSummary: {
                currentUndervaluation,
                avg5yUndervaluation: avg5yUnderval,
                intrinsicCagr,
            },
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
