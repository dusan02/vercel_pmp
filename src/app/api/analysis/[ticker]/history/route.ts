import { NextResponse } from 'next/server';
import { del } from '@/lib/redis/operations';
import { getHistoryResponse } from '@/lib/analysis/historyResponse';

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };

export async function GET(
    request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();
    const body = await getHistoryResponse(symbol);
    if (!body) return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    return NextResponse.json(body, { headers: CACHE_HEADERS });
}

// Invalidate cache when POST refreshes analysis data
export async function POST(
    request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();
    try {
        await del([`analysis:history:${symbol}`, `analysis:history:v2:${symbol}`]);
    } catch {}
    return NextResponse.json({ ok: true });
}
