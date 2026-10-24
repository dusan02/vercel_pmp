import { detectSession } from '@/lib/utils/timeUtils';
import { getDateET } from '@/lib/utils/dateET';

export interface IntradayPoint {
  ts: string;
  price: number;
}

export type MarketSession = 'pre' | 'live' | 'after' | 'closed';

export interface IntradaySeries {
  points: IntradayPoint[];
  date: string | null;
  session: MarketSession;
}

/**
 * Intraday price series for one ticker (5-minute Polygon aggregates).
 * - pre/after session: today's bars (pre-market window visible)
 * - live session: today's bars (pre + regular so far)
 * - closed/weekend: last trading day (full session) — always something to show
 *
 * Shared by the /intraday API route and the tooltip sparkline endpoint.
 */
export async function getSessionIntraday(symbol: string, apiKey: string): Promise<IntradaySeries> {
    const now = new Date();
    const session = detectSession(now);
    const todayIso = getDateET(now);

    // During live/after sessions show today (pre + regular so far);
    // otherwise show the last trading day so the chart is never empty.
    const dates = session === 'live' || session === 'after'
        ? [todayIso]
        : [todayIso, getLastTradingDayIso(todayIso)];

    for (const dateIso of dates) {
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/5/minute/${dateIso}/${dateIso}?adjusted=true&sort=asc&limit=500&apiKey=${apiKey}`;
        try {
            const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
            if (!res.ok) continue;
            const json = await res.json();
            const pts: IntradayPoint[] = Array.isArray(json?.results)
                ? (json.results as any[])
                    .filter((p) => typeof p.c === 'number' && p.c > 0)
                    .map((p) => ({ ts: new Date(p.t).toISOString(), price: p.c }))
                : [];
            if (pts.length > 0) {
                return { points: pts, date: dateIso, session };
            }
        } catch {
            // try next date
        }
    }

    return { points: [], date: null, session };
}

function getLastTradingDayIso(todayIso: string): string {
    const d = new Date(todayIso + 'T12:00:00Z');
    do {
        d.setUTCDate(d.getUTCDate() - 1);
    } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().split('T')[0]!;
}
