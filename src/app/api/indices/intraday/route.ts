import { NextRequest, NextResponse } from 'next/server';
import { withRetry } from '@/lib/api/rateLimiter';
import { getLastTradingDay, isMarketHoliday } from '@/lib/utils/timeUtils';
import { getDateET, isWeekendET } from '@/lib/utils/dateET';

const INDICES = ['SPY', 'QQQ'];

export const revalidate = 300; // 5 min

export async function GET(_req: NextRequest) {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Polygon API key missing' }, { status: 500 });
  }

  try {
    // Determine the date to query.
    // On weekends/holidays: use last trading day (shows full session, not just futures bars).
    // On trading days: use today (shows live intraday as it builds up).
    const now = new Date();
    const isNonTradingDay = isWeekendET(now) || isMarketHoliday(now);
    const todayIso = getDateET(now);
    const lastTradingDayIso = getDateET(getLastTradingDay(now));

    // On non-trading days, prefer last trading day. On trading days, prefer today.
    // Always fall back to the other date if the preferred one returns no data.
    const dates = isNonTradingDay
      ? [lastTradingDayIso, todayIso]
      : [todayIso, lastTradingDayIso];

    const results = await Promise.all(
      INDICES.map(async (ticker) => {
        for (const dateIso of dates) {
          const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${dateIso}/${dateIso}?adjusted=true&sort=asc&limit=500&apiKey=${apiKey}`;
          try {
            const res = await withRetry(async () => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) }));
            if (!res.ok) continue;
            const json = await res.json();
            const points = Array.isArray(json.results)
              ? json.results
                  .filter((p: any) => p.c)
                  .map((p: any) => ({ ts: new Date(p.t).toISOString(), price: p.c }))
              : [];
            if (points.length > 0) return [ticker, points] as const;
          } catch {
            // try next date
          }
        }
        return [ticker, []] as const;
      })
    );

    const map: Record<string, { ts: string; price: number }[]> = {};
    results.forEach(([ticker, pts]) => {
      map[ticker] = pts;
    });

    return NextResponse.json({ data: map }, { status: 200, headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=300' } });
  } catch (error) {
    console.error('Error fetching index intraday:', error);
    return NextResponse.json({ error: 'Failed to fetch intraday data' }, { status: 500 });
  }
}
