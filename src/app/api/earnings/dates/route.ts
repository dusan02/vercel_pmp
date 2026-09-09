import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const revalidate = 300; // 5 min cache

/**
 * GET /api/earnings/dates — all available earnings dates with counts.
 * Used by the month calendar to show which days have earnings.
 */
export async function GET(_request: NextRequest) {
  try {
    const rows = await prisma.earningsCalendar.findMany({
      select: { date: true, ticker: true },
    });

    const dateMap: Record<string, number> = {};
    for (const row of rows) {
      const dateStr = row.date.toISOString().split('T')[0] ?? '';
      dateMap[dateStr] = (dateMap[dateStr] ?? 0) + 1;
    }

    const dates = Object.entries(dateMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      data: dates,
      total: dates.length,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('[earnings/dates] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dates' },
      { status: 500 }
    );
  }
}
