import { NextRequest, NextResponse } from 'next/server';
import { getEarningsDateCounts } from '@/lib/seo/earningsSSR';

export const revalidate = 300; // 5 min cache

/**
 * GET /api/earnings/dates — all available earnings dates with counts.
 * Used by the month calendar to show which days have earnings.
 */
export async function GET(_request: NextRequest) {
  const dates = await getEarningsDateCounts();
  if (!dates) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dates' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: dates,
    total: dates.length,
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
  });
}
