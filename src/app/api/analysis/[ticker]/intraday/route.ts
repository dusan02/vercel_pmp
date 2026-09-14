import { NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { detectSession } from '@/lib/utils/timeUtils';
import { getDateET } from '@/lib/utils/dateET';

// The response is time-dependent (session detection + "today" resolution) —
// it must NEVER be prerendered at build time. A build-time snapshot served
// from the full-route cache showed Friday's bars during Monday pre-market.
export const dynamic = 'force-dynamic';

const CACHE_TTL_SESSION = 300; // 5 min while a session is active
const CACHE_TTL_CLOSED = 900; // 15 min when market is closed (session flips at 4:00 ET)

interface Point {
  ts: string;
  price: number;
}

/**
 * Intraday price series for one ticker (5-minute Polygon aggregates).
 * - pre/after session: today's bars (pre-market window visible)
 * - live session: today's bars (pre + regular so far)
 * - closed/weekend: last trading day (full session) — always something to show
 */
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

    const now = new Date();
    const session = detectSession(now);
    const todayIso = getDateET(now);

    // During live/after sessions show today (pre + regular so far);
    // otherwise show the last trading day so the chart is never empty.
    const dates = session === 'live' || session === 'after'
        ? [todayIso]
        : [todayIso, getLastTradingDayIso(todayIso)];

    let points: Point[] = [];
    let usedDate: string | null = null;

    for (const dateIso of dates) {
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/5/minute/${dateIso}/${dateIso}?adjusted=true&sort=asc&limit=500&apiKey=${apiKey}`;
        try {
            const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
            if (!res.ok) continue;
            const json = await res.json();
            const pts: Point[] = Array.isArray(json?.results)
                ? (json.results as any[])
                    .filter((p) => typeof p.c === 'number' && p.c > 0)
                    .map((p) => ({ ts: new Date(p.t).toISOString(), price: p.c }))
                : [];
            if (pts.length > 0) {
                points = pts;
                usedDate = dateIso;
                break;
            }
        } catch {
            // try next date
        }
    }

    const response = { points, date: usedDate, session };
    const ttl = points.length > 0 ? (session === 'closed' ? CACHE_TTL_CLOSED : CACHE_TTL_SESSION) : 60;
    try {
        await setCachedData(cacheKey, response, ttl);
    } catch {}

    return NextResponse.json(response);
}

function getLastTradingDayIso(todayIso: string): string {
    const d = new Date(todayIso + 'T12:00:00Z');
    do {
        d.setUTCDate(d.getUTCDate() - 1);
    } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().split('T')[0]!;
}
