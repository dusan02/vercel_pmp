import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/** Linear interpolation percentile on a sorted array */
function pct(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0]!;
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(Math.ceil(idx), sorted.length - 1);
    return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (idx - lo);
}

/** Build percentile stats object from a raw (unsorted) value array */
function buildStats(values: number[]) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return {
        avg: parseFloat(avg.toFixed(2)),
        p10: parseFloat(pct(sorted, 10).toFixed(2)),
        p25: parseFloat(pct(sorted, 25).toFixed(2)),
        median: parseFloat(pct(sorted, 50).toFixed(2)),
        p75: parseFloat(pct(sorted, 75).toFixed(2)),
        p90: parseFloat(pct(sorted, 90).toFixed(2)),
        min: parseFloat((sorted[0] ?? 0).toFixed(2)),
        max: parseFloat((sorted[sorted.length - 1] ?? 0).toFixed(2)),
        count: sorted.length,
    };
}

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

        // Filter valid (positive, non-extreme) values for percentile calculation
        const VALID_PE = (v: number | null): v is number => v !== null && v > 0 && v < 500;
        const VALID_PS = (v: number | null): v is number => v !== null && v > 0 && v < 200;

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
        const statements = await prisma.financialStatement.findMany({
            where: { symbol },
            orderBy: { endDate: 'asc' },
            select: { endDate: true, revenue: true, netIncome: true, sharesOutstanding: true, fiscalPeriod: true }
        });

        type PerSharePoint = { date: string; value: number };
        const revPerShareHistory: PerSharePoint[] = [];
        const epsPerShareHistory: PerSharePoint[] = [];

        // compute TTM over rolling 4 quarters
        const quarterly = statements.filter(s => s.fiscalPeriod?.toLowerCase().includes('q')); // heuristic
        for (let i = 3; i < quarterly.length; i++) {
            const slice = quarterly.slice(i - 3, i + 1);
            const revSum = slice.reduce((a, b) => a + (b.revenue || 0), 0);
            const niSum = slice.reduce((a, b) => a + (b.netIncome || 0), 0);
            const shares = slice[slice.length - 1]?.sharesOutstanding || slice[0]?.sharesOutstanding || 0;
            const end = slice[slice.length - 1]?.endDate;
            if (shares && shares > 0 && end) {
                const dateStr = end.toISOString().split('T')[0] as string;
                revPerShareHistory.push({ date: dateStr, value: parseFloat((revSum / shares).toFixed(4)) });
                epsPerShareHistory.push({ date: dateStr, value: parseFloat((niSum / shares).toFixed(4)) });
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

        const medianPS = psStats?.median ?? latestPS ?? null;
        const medianPE = peStats?.median ?? latestPE ?? null;

        const impliedPricePS = medianPS
            ? revPerShareHistory.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPS).toFixed(2)) }))
            : [];

        const impliedPricePE = medianPE
            ? epsPerShareHistory.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPE).toFixed(2)) }))
            : [];

        // --- Simple forward estimates (projection) ---
        function projectForward(base: { date: string; value: number }[], quarters: number) {
            if (!base.length) return [] as { date: string; value: number; isForecast: boolean }[];
            const last = base[base.length - 1]!;
            const lastDate = new Date(last.date);
            // Growth rate: CAGR of last 4 points (approx TTM trend)
            const n = Math.min(4, base.length);
            const first = base[base.length - n]!;
            const growth = first.value > 0 ? Math.pow(last.value / first.value, 1 / Math.max(1, n - 1)) - 1 : 0;
            const forecasts: { date: string; value: number; isForecast: boolean }[] = [];
            for (let i = 1; i <= quarters; i++) {
                const d = new Date(lastDate);
                d.setMonth(d.getMonth() + i * 3); // quarterly step
                const next = last.value * Math.pow(1 + growth, i);
                forecasts.push({ date: d.toISOString().split('T')[0] as string, value: parseFloat(next.toFixed(4)), isForecast: true });
            }
            return forecasts;
        }

        const revForecast = projectForward(revPerShareHistory, 6);
        const epsForecast = projectForward(epsPerShareHistory, 6);

        const impliedPSForecast = medianPS
            ? revForecast.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPS).toFixed(2)), isForecast: true }))
            : [];
        const impliedPEForecast = medianPE
            ? epsForecast.map(pt => ({ date: pt.date, impliedPrice: parseFloat((pt.value * medianPE).toFixed(2)), isForecast: true }))
            : [];

        function pearson(xs: number[], ys: number[]) {
            if (xs.length !== ys.length || xs.length === 0) return null;
            const n = xs.length;
            const meanX = xs.reduce((a, b) => a + b, 0) / n;
            const meanY = ys.reduce((a, b) => a + b, 0) / n;
            let num = 0, denX = 0, denY = 0;
            for (let i = 0; i < n; i++) {
                const dx = xs[i]! - meanX;
                const dy = ys[i]! - meanY;
                num += dx * dy;
                denX += dx * dx;
                denY += dy * dy;
            }
            const den = Math.sqrt(denX * denY);
            if (den === 0) return null;
            return parseFloat((num / den).toFixed(4));
        }

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
