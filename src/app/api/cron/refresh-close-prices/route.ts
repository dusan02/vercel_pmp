/**
 * Cron job for refreshing close prices every morning
 * 
 * This job runs every morning (05:05 ET) to ensure all tickers have:
 * - regularClose for yesterday's trading day
 * - previousClose for today's trading day
 * 
 * This addresses the issue where close prices might be missing or stale,
 * causing incorrect % change calculations.
 * 
 * Should run daily at 05:05 ET (10:05 UTC)
 * 
 * Usage: POST /api/cron/refresh-close-prices
 * Authorization: Bearer token with CRON_SECRET_KEY
 * 
 * Query params:
 * - limit: Max number of tickers to process (default: unlimited - processes all missing)
 * - force: If true, refresh even if close prices exist (default: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getLastTradingDay } from '@/lib/utils/timeUtils';
import { getDateET, createETDate, nowET } from '@/lib/utils/dateET';
import { setPrevClose } from '@/lib/redis/operations';
import { getUniverse } from '@/lib/redis/operations';
import { withRetry } from '@/lib/api/rateLimiter';

const MAX_CONCURRENT = 5; // Conservative to avoid rate limiting
const BATCH_SIZE = 60; // Polygon allows up to 100, but we use 60 for safety

interface RefreshResult {
  checked: number;
  missingRegularClose: number;
  missingPreviousClose: number;
  refreshed: number;
  errors: number;
  details: {
    regularCloseRefreshed: number;
    previousCloseRefreshed: number;
  };
}

/**
 * Fetch regular close for a specific date from Polygon API
 */
async function fetchRegularCloseForDate(
  ticker: string,
  date: string, // YYYY-MM-DD
  apiKey: string
): Promise<number | null> {
  try {
    // Use /range endpoint to get close for specific date
    const rangeUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${date}/${date}?adjusted=true&apiKey=${apiKey}`;
    const response = await withRetry(async () => {
      const res = await fetch(rangeUrl);
      if (!res.ok && res.status === 429) {
        throw new Error(`Rate limited: ${res.status}`);
      }
      return res;
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const close = data?.results?.[0]?.c;
    
    if (typeof close === 'number' && close > 0) {
      return close;
    }
    
    return null;
  } catch (error) {
    console.warn(`⚠️ Failed to fetch regular close for ${ticker} on ${date}:`, error);
    return null;
  }
}

/**
 * Refresh close prices for a ticker
 */
async function refreshClosePricesForTicker(
  ticker: string,
  yesterdayTradingDay: Date,
  todayTradingDay: Date,
  apiKey: string,
  force: boolean
): Promise<{
  regularCloseRefreshed: boolean;
  previousCloseRefreshed: boolean;
  error?: string;
}> {
  try {
    const yesterdayDateStr = getDateET(yesterdayTradingDay);
    const todayDateStr = getDateET(todayTradingDay);
    
    // Check if regularClose exists for yesterday
    const yesterdayDailyRef = await prisma.dailyRef.findUnique({
      where: {
        symbol_date: {
          symbol: ticker,
          date: yesterdayTradingDay
        }
      },
      select: { regularClose: true }
    });

    const needsRegularClose = !yesterdayDailyRef?.regularClose || force;
    
    // Check if previousClose exists for today
    const todayDailyRef = await prisma.dailyRef.findUnique({
      where: {
        symbol_date: {
          symbol: ticker,
          date: todayTradingDay
        }
      },
      select: { previousClose: true }
    });

    const needsPreviousClose = !todayDailyRef?.previousClose || force;

    let regularClose: number | null = null;
    let previousClose: number | null = null;
    let regularCloseRefreshed = false;
    let previousCloseRefreshed = false;

    // Fetch regularClose for yesterday if needed
    if (needsRegularClose) {
      regularClose = await fetchRegularCloseForDate(ticker, yesterdayDateStr, apiKey);
      
      if (regularClose && regularClose > 0) {
        // Update DailyRef for yesterday with regularClose
        await prisma.dailyRef.upsert({
          where: {
            symbol_date: {
              symbol: ticker,
              date: yesterdayTradingDay
            }
          },
          update: {
            regularClose,
            previousClose: regularClose // Also set as previousClose if not set
          },
          create: {
            symbol: ticker,
            date: yesterdayTradingDay,
            regularClose,
            previousClose: regularClose
          }
        });
        regularCloseRefreshed = true;
      }
    }

    // Use regularClose as previousClose for today if we just fetched it
    // Otherwise, fetch previousClose separately
    if (needsPreviousClose) {
      if (regularClose && regularClose > 0) {
        previousClose = regularClose; // Use yesterday's regularClose as today's previousClose (Model A)
      } else {
        // Fetch previousClose for today (which is yesterday's close)
        previousClose = await fetchRegularCloseForDate(ticker, yesterdayDateStr, apiKey);
      }

      if (previousClose && previousClose > 0) {
        // Update DailyRef for today with previousClose
        await prisma.dailyRef.upsert({
          where: {
            symbol_date: {
              symbol: ticker,
              date: todayTradingDay
            }
          },
          update: {
            previousClose
          },
          create: {
            symbol: ticker,
            date: todayTradingDay,
            previousClose
          }
        });

        // Update Redis cache (Model A: prevCloseKey(todayTradingDay) = close(yesterdayTradingDay))
        try {
          await setPrevClose(todayDateStr, ticker, previousClose);
        } catch (error) {
          // Non-fatal
        }

        // Update Ticker.latestPrevClose and latestPrevCloseDate
        await prisma.ticker.update({
          where: { symbol: ticker },
          data: {
            latestPrevClose: previousClose,
            latestPrevCloseDate: yesterdayTradingDay, // Date when close happened
            updatedAt: new Date()
          }
        });

        previousCloseRefreshed = true;
      }
    }

    return {
      regularCloseRefreshed,
      previousCloseRefreshed
    };
  } catch (error) {
    return {
      regularCloseRefreshed: false,
      previousCloseRefreshed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 });
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const force = url.searchParams.get('force') === 'true';

    console.log(`🔄 Starting close prices refresh (limit: ${limit || 'unlimited'}, force: ${force})...`);

    // Get trading days
    const etNow = nowET();
    const calendarDateETStr = getDateET(etNow);
    const calendarDateET = createETDate(calendarDateETStr);
    const todayTradingDay = getLastTradingDay(calendarDateET);
    const yesterdayTradingDay = getLastTradingDay(todayTradingDay);
    
    const yesterdayDateStr = getDateET(yesterdayTradingDay);
    const todayDateStr = getDateET(todayTradingDay);

    console.log(`📅 Refresh context: calendarET=${calendarDateETStr}, todayTradingDay=${todayDateStr}, yesterdayTradingDay=${yesterdayDateStr}`);

    // Get all tickers
    const allTickers = await getUniverse('sp500');
    
    if (allTickers.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No tickers found in universe'
      }, { status: 500 });
    }

    // Find tickers missing regularClose for yesterday or previousClose for today
    const tickersToCheck = await prisma.ticker.findMany({
      where: {
        symbol: { in: allTickers },
        lastPrice: { gt: 0 } // Only check tickers with prices
      },
      select: {
        symbol: true
      },
      orderBy: {
        symbol: 'asc'
      },
      ...(limit ? { take: limit } : {})
    });

    // Check which tickers need refresh
    const tickersNeedingRefresh: string[] = [];
    let missingRegularClose = 0;
    let missingPreviousClose = 0;

    for (const ticker of tickersToCheck) {
      const yesterdayRef = await prisma.dailyRef.findUnique({
        where: {
          symbol_date: {
            symbol: ticker.symbol,
            date: yesterdayTradingDay
          }
        },
        select: { regularClose: true }
      });

      const todayRef = await prisma.dailyRef.findUnique({
        where: {
          symbol_date: {
            symbol: ticker.symbol,
            date: todayTradingDay
          }
        },
        select: { previousClose: true }
      });

      const needsRefresh = force || 
        !yesterdayRef?.regularClose || 
        !todayRef?.previousClose;

      if (needsRefresh) {
        tickersNeedingRefresh.push(ticker.symbol);
        if (!yesterdayRef?.regularClose) missingRegularClose++;
        if (!todayRef?.previousClose) missingPreviousClose++;
      }
    }

    console.log(`📊 Found ${tickersNeedingRefresh.length} tickers needing refresh (${missingRegularClose} missing regularClose, ${missingPreviousClose} missing previousClose)`);

    const result: RefreshResult = {
      checked: tickersToCheck.length,
      missingRegularClose,
      missingPreviousClose,
      refreshed: 0,
      errors: 0,
      details: {
        regularCloseRefreshed: 0,
        previousCloseRefreshed: 0
      }
    };

    // Process in batches with rate limiting
    for (let i = 0; i < tickersNeedingRefresh.length; i += MAX_CONCURRENT) {
      const batch = tickersNeedingRefresh.slice(i, i + MAX_CONCURRENT);
      
      const batchResults = await Promise.all(
        batch.map(ticker =>
          refreshClosePricesForTicker(
            ticker,
            yesterdayTradingDay,
            todayTradingDay,
            apiKey,
            force
          )
        )
      );

      batchResults.forEach((r, idx) => {
        if (r.error) {
          result.errors++;
        } else {
          if (r.regularCloseRefreshed) {
            result.details.regularCloseRefreshed++;
            result.refreshed++;
          }
          if (r.previousCloseRefreshed) {
            result.details.previousCloseRefreshed++;
            if (!r.regularCloseRefreshed) {
              result.refreshed++; // Count once per ticker
            }
          }
        }
      });

      // Rate limiting: Polygon free tier allows 5 calls/minute
      if (i + MAX_CONCURRENT < tickersNeedingRefresh.length) {
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15s delay
      }
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Close prices refresh complete: ${result.checked} checked, ${result.refreshed} refreshed (${result.details.regularCloseRefreshed} regularClose, ${result.details.previousCloseRefreshed} previousClose)`);

    return NextResponse.json({
      success: true,
      message: 'Close prices refresh completed',
      result,
      summary: {
        duration: `${(duration / 1000).toFixed(2)}s`,
        force
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in refresh-close-prices cron job:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// GET endpoint for manual testing
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const force = url.searchParams.get('force') === 'true';

    console.log(`🧪 Testing refresh-close-prices with ${limit} tickers (force: ${force})...`);

    // Use POST handler logic but with test limit
    const mockRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${process.env.CRON_SECRET_KEY || ''}`
      }
    });
    
    // Add query params
    const testUrl = new URL(mockRequest.url);
    testUrl.searchParams.set('limit', String(limit));
    if (force) {
      testUrl.searchParams.set('force', 'true');
    }
    
    return await POST(new NextRequest(testUrl, mockRequest));
  } catch (error) {
    console.error('❌ Error in test refresh-close-prices:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
