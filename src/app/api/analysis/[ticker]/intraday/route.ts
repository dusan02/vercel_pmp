import { NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { getSessionIntraday } from '@/lib/market/intradayPoints';

// The response is time-dependent (session detection + "today" resolution) —
// it must NEVER be prerendered at build time. A build-time snapshot served
// from the full-route cache showed Friday's bars during Monday pre-market.
export const dynamic = 'force-dynamic';

const CACHE_TTL_SESSION = 300; // 5 min while a session is active
const CACHE_TTL_CLOSED = 900; // 15 min when market is closed (session flips at 4:00 ET)

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ ticker: string }> }
) {
    const { ticker } = await params;
    const symbol = ticker.toUpperCase();
    const apiKey = process.env.POLYGON_API_KEY;

    if (!apiKey || apiKey.startsWith('dummy')) {
        return NextResponse.json({ points: [], date: null, session: 'closed' });
    }

    const cacheKey = `intraday:${symbol}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch {}

    const { points, date, session } = await getSessionIntraday(symbol, apiKey);

    const response = { points, date, session };
    const ttl = points.length > 0 ? (session === 'closed' ? CACHE_TTL_CLOSED : CACHE_TTL_SESSION) : 60;
    try {
        await setCachedData(cacheKey, response, ttl);
    } catch {}

    return NextResponse.json(response);
}
