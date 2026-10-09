import { NextRequest, NextResponse } from 'next/server';
import { getEarningsWeekMap } from '@/lib/seo/earningsSSR';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { getDateET } from '@/lib/utils/dateET';

export const revalidate = 60; // 1 min cache

const WEEK_CACHE_TTL = 300; // 5 minutes Redis cache

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');

  // Base date — noon-UTC anchored so all getUTC*/setUTC* math is
  // timezone-immune (the previous local-field math only worked because
  // the prod server happens to run in UTC).
  const baseStr = startParam ?? getDateET();
  const baseDate = new Date(`${baseStr}T12:00:00Z`);

  // Calculate Monday of the week
  const day = baseDate.getUTCDay();
  const diff = baseDate.getUTCDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(baseDate);
  monday.setUTCDate(diff);
  const weekStart = monday.toISOString().slice(0, 10);

  const cacheKey = `earnings:week:${weekStart}`;

  // Check Redis cache first for instant load
  try {
    const cached = await getCachedData(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      });
    }
  } catch {}

  try {
    const weekData = await getEarningsWeekMap(weekStart);
    // getEarningsWeekMap returns {} on transient DB failure — a real week
    // always has all 7 date keys. Don't serve/cache an empty map as success.
    if (Object.keys(weekData).length === 0) {
      throw new Error('Earnings week map unavailable (DB error)');
    }
    const count = Object.values(weekData).reduce(
      (n, d) => n + d.preMarket.length + d.afterMarket.length + d.timeTbd.length,
      0
    );
    const responseBody = {
      success: true,
      data: weekData,
      count,
      timestamp: new Date().toISOString(),
    };

    try { await setCachedData(cacheKey, responseBody, WEEK_CACHE_TTL); } catch {}

    return NextResponse.json(responseBody, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('❌ Error in /api/earnings/week:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
