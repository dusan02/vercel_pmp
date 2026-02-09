import { NextRequest, NextResponse } from 'next/server';
import { getEarningsForDate } from '@/lib/server/earningsService';

// Cache for 60 seconds (ISR / route handler caching).
// NOTE: Do not combine `dynamic = 'force-dynamic'` with `revalidate`,
// as newer Next.js versions treat that as an invalid segment configuration.
export const revalidate = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const date = (dateParam || new Date().toISOString().split('T')[0]) as string;
  const refresh = searchParams.get('refresh') === 'true';

  try {
    const result = await getEarningsForDate(date, refresh);

    // Add cache control headers
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    });

  } catch (error) {
    console.error('❌ Error in /api/earnings-finnhub:', error);

    // Fallback error response
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
