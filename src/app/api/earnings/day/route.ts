import { NextRequest, NextResponse } from 'next/server';
import { getEarningsRange } from '@/lib/seo/earningsSSR';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

export const revalidate = 60;

const DAY_CACHE_TTL = 300; // 5 min Redis cache
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/earnings/day?date=YYYY-MM-DD — enriched rows for a single date.
 * Powers the calendar-driven day table on /earnings. Same EarningsSSRRow
 * shape as the SSR pipeline (enriched: marketCap, price, scores, moves).
 */
export async function GET(request: NextRequest) {
  const date = new URL(request.url).searchParams.get('date');
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ success: false, error: 'Missing or invalid date (YYYY-MM-DD)' }, { status: 400 });
  }

  const cacheKey = `earnings:day:v2:${date}`;
  try {
    const cached = await getCachedData(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      });
    }
  } catch {}

  try {
    const groups = await getEarningsRange(date, date, { enrich: true });
    const g = groups[0];
    const rows = g ? [...g.preMarket, ...g.afterMarket, ...g.timeTbd] : [];
    const body = {
      success: true,
      data: { date, rows },
      count: rows.length,
      timestamp: new Date().toISOString(),
    };
    try { await setCachedData(cacheKey, body, DAY_CACHE_TTL); } catch {}
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[earnings/day] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch earnings' }, { status: 500 });
  }
}
