import { detectSession } from '@/lib/utils/timeUtils';
import { getDateET } from '@/lib/utils/dateET';
import { attachSessionVwap, type IntradayBar } from '@/lib/analysis/marketProfileMath';

export interface IntradayPoint {
  ts: string;
  price: number;
  vwap?: number | null;
}

export type MarketSession = 'pre' | 'live' | 'after' | 'closed';

export interface IntradaySeries {
  points: IntradayPoint[];
  date: string | null;
  session: MarketSession;
  sessionVwap?: number | null;
  dollarVolume?: number | null;
  totalTrades?: number | null;
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
            const rawBars = Array.isArray(json?.results)
                ? (json.results as Array<IntradayBar & { n?: number }>).filter(
                    (p) => typeof p.c === 'number' && p.c > 0 && typeof p.t === 'number',
                )
                : [];
            if (rawBars.length > 0) {
                const vwaps = attachSessionVwap(rawBars);
                let dollarVol = 0;
                let trades = 0;
                let sessionVwap: number | null = null;
                const pts: IntradayPoint[] = rawBars.map((p, i) => {
                    const vw = vwaps[i] ?? null;
                    if (vw != null) sessionVwap = vw;
                    const barVol = Number(p.v) || 0;
                    const barPx = Number(p.vw) > 0 ? Number(p.vw) : p.c;
                    if (barVol > 0 && barPx > 0) dollarVol += barPx * barVol;
                    if (typeof p.n === 'number' && p.n > 0) trades += p.n;
                    return {
                        ts: new Date(p.t).toISOString(),
                        price: p.c,
                        vwap: vw,
                    };
                });
                return {
                    points: pts,
                    date: dateIso,
                    session,
                    sessionVwap,
                    dollarVolume: dollarVol > 0 ? Math.round(dollarVol) : null,
                    totalTrades: trades > 0 ? trades : null,
                };
            }
        } catch {
            // try next date
        }
    }

    return { points: [], date: null, session, sessionVwap: null, dollarVolume: null, totalTrades: null };
}

function getLastTradingDayIso(todayIso: string): string {
    const d = new Date(todayIso + 'T12:00:00Z');
    do {
        d.setUTCDate(d.getUTCDate() - 1);
    } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().split('T')[0]!;
}
