import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();

    try {
        // 1. Fetch 10Y of daily valuation history (date, closePrice, peRatio, psRatio)
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

        const valuationRows = await prisma.dailyValuationHistory.findMany({
            where: {
                symbol,
                date: { gte: tenYearsAgo },
                closePrice: { not: null },
            },
            select: { date: true, closePrice: true, peRatio: true, psRatio: true, evEbitda: true, fcfYield: true },
            orderBy: { date: 'asc' },
        });

        // Downsample to monthly (one row per month — last day of each month)
        const monthlyMap = new Map<string, typeof valuationRows[0]>();
        for (const row of valuationRows) {
            const key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap.set(key, row); // always overwrite → last day of month wins
        }
        const monthly = Array.from(monthlyMap.values());

        // 2. Compute valuation statistics (P/E, P/S, EV/EBITDA)
        const peValues = valuationRows.map(r => r.peRatio).filter((v): v is number => v !== null && v > 0 && v < 1000);
        const psValues = valuationRows.map(r => r.psRatio).filter((v): v is number => v !== null && v > 0 && v < 1000);
        const evValues = valuationRows.map(r => r.evEbitda).filter((v): v is number => v !== null && v > 0 && v < 1000);

        const peAvg = peValues.length > 0 ? peValues.reduce((a, b) => a + b, 0) / peValues.length : null;
        const peMin = peValues.length > 0 ? Math.min(...peValues) : null;
        const peMax = peValues.length > 0 ? Math.max(...peValues) : null;

        const psAvg = psValues.length > 0 ? psValues.reduce((a, b) => a + b, 0) / psValues.length : null;
        const psMin = psValues.length > 0 ? Math.min(...psValues) : null;
        const psMax = psValues.length > 0 ? Math.max(...psValues) : null;

        const evAvg = evValues.length > 0 ? evValues.reduce((a, b) => a + b, 0) / evValues.length : null;
        const evMin = evValues.length > 0 ? Math.min(...evValues) : null;
        const evMax = evValues.length > 0 ? Math.max(...evValues) : null;

        const statements = await prisma.financialStatement.findMany({
            where: { symbol, fiscalPeriod: 'FY', endDate: { gte: tenYearsAgo } },
            select: { endDate: true, revenue: true, netIncome: true, operatingCashFlow: true, capex: true },
            orderBy: { endDate: 'asc' },
        });

        // 4. Build chart data — merge monthly price with all bands
        const chartData = monthly.map(row => {
            const price = row.closePrice ?? 0;
            const eps = row.peRatio && price > 0 ? price / row.peRatio : null;
            const sps = row.psRatio && price > 0 ? price / row.psRatio : null;
            
            // For EV/EBITDA, we don't have a direct "per-share" equivalent that scales like EPS/SPS
            // we'll just return the raw ratio and the historical bands for it.
            
            return {
                date: row.date.toISOString().split('T')[0],
                price,
                peRatio: row.peRatio,
                psRatio: row.psRatio,
                evEbitda: row.evEbitda,
                
                // P/E Bands
                peBandAvg: eps !== null && peAvg !== null ? parseFloat((eps * peAvg).toFixed(2)) : null,
                peBandMin: eps !== null && peMin !== null ? parseFloat((eps * peMin).toFixed(2)) : null,
                peBandMax: eps !== null && peMax !== null ? parseFloat((eps * peMax).toFixed(2)) : null,
                
                // P/S Bands
                psBandAvg: sps !== null && psAvg !== null ? parseFloat((sps * psAvg).toFixed(2)) : null,
                psBandMin: sps !== null && psMin !== null ? parseFloat((sps * psMin).toFixed(2)) : null,
                psBandMax: sps !== null && psMax !== null ? parseFloat((sps * psMax).toFixed(2)) : null,
            };
        });

        // 5. Revenue chart data (annual)
        const revenueData = statements.map(s => {
            const fcf = (s.operatingCashFlow !== null && s.capex !== null) ? (s.operatingCashFlow - s.capex) : null;
            return {
                year: s.endDate.getFullYear().toString(),
                revenue: s.revenue ? parseFloat((s.revenue / 1e9).toFixed(2)) : null, // in billions
                netIncome: s.netIncome ? parseFloat((s.netIncome / 1e9).toFixed(2)) : null,
                fcf: fcf ? parseFloat((fcf / 1e9).toFixed(2)) : null,
            };
        });

        return NextResponse.json({
            chartData,
            revenueData,
            stats: { 
                peAvg, peMin, peMax,
                psAvg, psMin, psMax,
                evAvg, evMin, evMax
            },
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
            }
        });
    } catch (error) {
        console.error(`Error fetching history for ${symbol}:`, error);
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}
