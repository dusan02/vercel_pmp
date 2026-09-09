import { NextResponse } from 'next/server';

export const revalidate = 300; // 5 min

export async function GET() {
    try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EDJI?interval=5m&range=1d';
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
            return NextResponse.json({ error: 'Yahoo Finance API error' }, { status: 502 });
        }

        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (!result) {
            return NextResponse.json({ error: 'No data' }, { status: 502 });
        }

        const meta = result.meta;
        const currentPrice = meta.regularMarketPrice ?? 0;
        const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? 0;
        const percentChange = previousClose > 0 ? ((currentPrice / previousClose) - 1) * 100 : 0;
        const dollarChange = currentPrice - previousClose;

        // Build intraday points from timestamps + close prices
        const timestamps: number[] = result.timestamp ?? [];
        const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
        const points: { ts: string; price: number }[] = [];
        for (let i = 0; i < timestamps.length; i++) {
            const c = closes[i];
            if (c != null) {
                points.push({ ts: new Date(timestamps[i]! * 1000).toISOString(), price: c });
            }
        }

        return NextResponse.json({
            price: currentPrice,
            previousClose,
            dollarChange,
            percentChange,
            intraday: points,
        }, {
            status: 200,
            headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=300' },
        });
    } catch (error) {
        console.error('Error fetching DJIA:', error);
        return NextResponse.json({ error: 'Failed to fetch DJIA data' }, { status: 500 });
    }
}
