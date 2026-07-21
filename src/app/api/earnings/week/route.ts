import { NextRequest, NextResponse } from 'next/server';
import { getEarningsForDate } from '@/lib/server/earningsService';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { prisma } from '@/lib/db/prisma';

export const revalidate = 60; // 1 min cache

const WEEK_CACHE_TTL = 300; // 5 minutes Redis cache

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
  
  // Generate 7 days (Monday to Sunday)
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }
  
  const cacheKey = `earnings:week:${weekDates[0]}`;
  
  // Check Redis cache first for instant load
  try {
    const cached = await getCachedData(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      });
    }
  } catch {}

  // DB-first approach: fetch from EarningsCalendar table (populated by cron)
  // This is much faster than calling Finnhub API for each day
  try {
    const startDate = new Date(weekDates[0] + 'T00:00:00Z');
    const endDate = new Date(weekDates[6] + 'T23:59:59Z');
    
    const dbEarnings = await prisma.earningsCalendar.findMany({
      where: {
        date: { gte: startDate, lte: endDate }
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { ticker: 'asc' }],
    });
    
    if (dbEarnings.length > 0) {
      // Build week data from DB records
      const weekData: Record<string, any> = {};
      for (const dateStr of weekDates) {
        const dayEarnings = dbEarnings.filter(e => 
          e.date.toISOString().split('T')[0] === dateStr
        );
        
        weekData[dateStr] = {
          date: dateStr,
          preMarket: dayEarnings.filter(e => e.time === 'bmo' || e.time === 'before').map(e => ({
            ticker: e.ticker,
            companyName: e.companyName,
            time: e.time,
          })),
          afterMarket: dayEarnings.filter(e => e.time === 'amc' || e.time === 'after').map(e => ({
            ticker: e.ticker,
            companyName: e.companyName,
            time: e.time,
          })),
          timeTbd: dayEarnings.filter(e => e.time !== 'bmo' && e.time !== 'amc' && e.time !== 'before' && e.time !== 'after').map(e => ({
            ticker: e.ticker,
            companyName: e.companyName,
            time: e.time,
          })),
        };
      }
      
      const responseBody = { success: true, data: weekData };
      try { await setCachedData(cacheKey, responseBody, WEEK_CACHE_TTL); } catch {}
      
      return NextResponse.json(responseBody, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      });
    }
  } catch (dbError) {
    console.warn('⚠️ DB earnings fetch failed, falling back to Finnhub:', dbError);
  }

  // Fallback: use Finnhub-based earningsService (slower but more complete)
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

    const responseBody = {
      success: true,
      data: weekData
    };

    // Cache in Redis (5 min TTL)
    try { await setCachedData(cacheKey, responseBody, WEEK_CACHE_TTL); } catch {}

    return NextResponse.json(responseBody, {
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
