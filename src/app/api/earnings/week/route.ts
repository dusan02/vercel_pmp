import { NextRequest, NextResponse } from 'next/server';
import { getEarningsForDate } from '@/lib/server/earningsService';

export const revalidate = 60; // 1 min cache

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');
  
  // Base date calculation
  let baseDate: Date;
  if (startParam) {
    baseDate = new Date(startParam);
  } else {
    // Current date ET
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    baseDate = easternTime;
  }
  
  // Calculate Monday of the week
  const day = baseDate.getDay();
  const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(baseDate.setDate(diff));
  
  // Generate 5 days (Monday to Friday)
  const weekDates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d.toISOString().split('T')[0]);
  }
  
  const refresh = searchParams.get('refresh') === 'true';

  try {
    const results = await Promise.all(
      weekDates.map(async (date) => {
        try {
          const result = await getEarningsForDate(date, refresh);
          // Split into preMarket, afterMarket, timeTbd based on the 'time' field
          // earningsService pushes everything not 'bmo' to afterMarket, so we check 'time'
          
          const allEarnings = [...result.data.preMarket, ...result.data.afterMarket];
          
          const preMarket = allEarnings.filter(e => e.time === 'bmo');
          const afterMarket = allEarnings.filter(e => e.time === 'amc' || e.time === 'after');
          const timeTbd = allEarnings.filter(e => e.time !== 'bmo' && e.time !== 'amc' && e.time !== 'after');
          
          return {
            date,
            preMarket,
            afterMarket,
            timeTbd
          };
        } catch (err) {
          console.error(`Error fetching earnings for ${date}:`, err);
          return {
            date,
            preMarket: [],
            afterMarket: [],
            timeTbd: []
          };
        }
      })
    );

    const weekData = results.reduce((acc, curr) => {
      acc[curr.date] = curr;
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({
      success: true,
      data: weekData
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
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
