/**
 * Cron job for verifying and fixing incorrect previousClose values
 * 
 * Compares DB previousClose values with Polygon API and fixes mismatches.
 * Less aggressive than full reset - only fixes incorrect values.
 * 
 * Should run 2-3x daily (e.g., 08:00, 14:00, 20:00 ET)
 * 
 * Usage: POST /api/cron/verify-prevclose
 * Authorization: Bearer token with CRON_SECRET_KEY
 * 
 * Query params:
 * - limit: Max number of tickers to check (default: unlimited - checks all)
 * - dryRun: If true, only report issues without fixing (default: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getPreviousClose } from '@/lib/utils/marketCapUtils';
import { getLastTradingDay, detectSession } from '@/lib/utils/timeUtils';
import { getDateET, createETDate, nowET } from '@/lib/utils/dateET';
import { setPrevClose } from '@/lib/redis/operations';
import { verifyCronAuth } from '@/lib/utils/cronAuth';

const MAX_CONCURRENT = 3; // Conservative to avoid rate limiting
// Note: By default checks ALL tickers (no limit)
// Use ?limit=N query param to limit for testing

interface VerifyResult {
  checked: number;
  needsFix: number;
  fixed: number;
  errors: number;
  issues: Array<{ ticker: string; dbValue: number; correctValue: number; diff: number }>;
}

async function verifyAndFixTicker(
  ticker: string,
  dbPrevClose: number,
  lastTradingDay: Date,
  todayStr: string,
  dryRun: boolean
): Promise<{ needsFix: boolean; fixed: boolean; diff: number; correctValue?: number; error?: string }> {
  try {
    // Fetch correct value from Polygon API
    const correctPrevClose = await getPreviousClose(ticker);
    
    if (!correctPrevClose || correctPrevClose <= 0) {
      return { needsFix: false, fixed: false, diff: 0, error: 'fetch_failed' };
    }

    // Compare
    const diff = Math.abs(dbPrevClose - correctPrevClose);
    if (diff <= 0.01) {
      return { needsFix: false, fixed: false, diff };
    }

    // Fix if not dry run
    if (!dryRun) {
      try {
        // Update Ticker table
        await prisma.ticker.update({
          where: { symbol: ticker },
          data: {
            latestPrevClose: correctPrevClose,
            latestPrevCloseDate: lastTradingDay,
            updatedAt: new Date()
          }
        });

        // Update DailyRef table
        // INVARIANT: Only update prevClose for lastTradingDay (todayTradingDay), never nextTradingDay
        // This prevents overwriting future prevClose values prepared by saveRegularClose
        await prisma.dailyRef.upsert({
          where: {
            symbol_date: {
              symbol: ticker,
              date: lastTradingDay // todayTradingDay - this is the target day for verification
            }
          },
          update: {
            previousClose: correctPrevClose,
            updatedAt: new Date()
          },
          create: {
            symbol: ticker,
            date: lastTradingDay,
            previousClose: correctPrevClose
          }
        });

        // Update Redis cache - Model A: prevCloseKey(todayTradingDay) = close(yesterdayTradingDay)
        // todayStr is actually todayTradingDateStr passed from caller
        try {
          await setPrevClose(todayStr, ticker, correctPrevClose);
        } catch (error) {
          // Non-fatal
        }

        return { needsFix: true, fixed: true, diff, correctValue: correctPrevClose };
      } catch (error) {
        return { needsFix: true, fixed: false, diff, error: 'update_failed' };
      }
    }

    return { needsFix: true, fixed: false, diff, correctValue: correctPrevClose };
  } catch (error) {
    return { needsFix: false, fixed: false, diff: 0, error: 'exception' };
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined; // undefined = no limit
    const dryRun = url.searchParams.get('dryRun') === 'true';

    console.log(`🔍 Starting previousClose verification (limit: ${limit || 'unlimited'}, dryRun: ${dryRun})...`);

    // CRITICAL: Use trading date (ET), not UTC calendar date
    // Model A: prevCloseKey(todayTradingDay) = close(yesterdayTradingDay)
    // verify-prevclose opravuje prevClose pre dnešný trading session
    const etNow = nowET();
    const calendarDateETStr = getDateET(etNow); // Calendar date in ET
    const calendarDateET = createETDate(calendarDateETStr);
    const todayTradingDay = getLastTradingDay(calendarDateET); // Today's trading day (or last if today is not trading day)
    const todayTradingDateStr = getDateET(todayTradingDay); // Trading date string for prevClose lookup
    const yesterdayTradingDay = getLastTradingDay(todayTradingDay);
    
    // CRITICAL: Include tickers with lastPrice > 0, even if prevClose is missing/null
    // This fixes "broken" tickers that were reset or never had prevClose set
    // We check both:
    // 1. Tickers with prevClose > 0 (normal case)
    // 2. Tickers with lastPrice > 0 but prevClose is null/0 or stale date (broken case)
    // 
    // NOTE: latestPrevCloseDate comparison uses date range to handle timezone correctly
    // yesterdayTradingDay is Date object (ET midnight), but DB stores DateTime (UTC)
    // We compare by date range: >= start of yesterdayTradingDay UTC, < start of next day UTC
    const yesterdayTradingDayStart = new Date(yesterdayTradingDay);
    yesterdayTradingDayStart.setUTCHours(0, 0, 0, 0);
    const yesterdayTradingDayEnd = new Date(yesterdayTradingDayStart);
    yesterdayTradingDayEnd.setUTCDate(yesterdayTradingDayEnd.getUTCDate() + 1);
    
    const tickers = await prisma.ticker.findMany({
      where: {
        lastPrice: { gt: 0 },
        OR: [
          // Normal case: has prevClose
          { latestPrevClose: { gt: 0 } },
          // Broken case: missing or stale prevClose
          {
            OR: [
              { latestPrevClose: null },
              { latestPrevClose: 0 },
              // Stale date: not within yesterdayTradingDay (date range comparison for timezone safety)
              {
                OR: [
                  { latestPrevCloseDate: null },
                  { latestPrevCloseDate: { lt: yesterdayTradingDayStart } },
                  { latestPrevCloseDate: { gte: yesterdayTradingDayEnd } }
                ]
              }
            ]
          }
        ]
      },
      select: {
        symbol: true,
        latestPrevClose: true,
        latestPrevCloseDate: true
      },
      orderBy: {
        symbol: 'asc'
      },
      ...(limit ? { take: limit } : {}) // Only apply limit if specified
    });

    console.log(`📊 Found ${tickers.length} tickers to verify`);

    const result: VerifyResult = {
      checked: 0,
      needsFix: 0,
      fixed: 0,
      errors: 0,
      issues: []
    };
    
    // INVARIANT: verify-prevclose only fixes prevClose for todayTradingDay, never nextTradingDay
    // This prevents overwriting future prevClose values prepared by saveRegularClose
    const { getNextTradingDay } = await import('@/lib/utils/pricingStateMachine');
    const nextTradingDay = getNextTradingDay(todayTradingDay);
    const nextTradingDateStr = getDateET(nextTradingDay);
    
    // Log context for debugging
    const session = detectSession(etNow);
    const isTradingDay = getDateET(todayTradingDay) === calendarDateETStr;
    console.log(`📅 verify-prevclose context: calendarET=${calendarDateETStr}, tradingDayET=${todayTradingDateStr}, nextTradingDayET=${nextTradingDateStr}, isTradingDay=${isTradingDay}, session=${session}`);
    console.log(`📅 verify-prevclose target: prevClose(${todayTradingDateStr}) = close(yesterdayTradingDay), will NOT touch prevClose(${nextTradingDateStr})`);

    // Process in batches with rate limiting
    for (let i = 0; i < tickers.length; i += MAX_CONCURRENT) {
      const batch = tickers.slice(i, i + MAX_CONCURRENT);
      
      const batchResults = await Promise.all(
        batch.map(t => 
          verifyAndFixTicker(
            t.symbol,
            t.latestPrevClose!,
            todayTradingDay,
            todayTradingDateStr, // Pass trading date string
            dryRun
          )
        )
      );

      batchResults.forEach((r, idx) => {
        const ticker = batch[idx];
        if (!ticker) return;
        
        result.checked++;
        
        if (r.error) {
          result.errors++;
        } else if (r.needsFix) {
          result.needsFix++;
          if (r.fixed) {
            result.fixed++;
          }
          result.issues.push({
            ticker: ticker.symbol,
            dbValue: ticker.latestPrevClose!,
            correctValue: r.correctValue!,
            diff: r.diff
          });
        }
      });

      // Rate limiting: delay between batches
      if (i + MAX_CONCURRENT < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Verification complete: ${result.checked} checked, ${result.needsFix} need fix, ${result.fixed} fixed`);

    return NextResponse.json({
      success: true,
      message: `PreviousClose verification completed${dryRun ? ' (dry run)' : ''}`,
      result: {
        checked: result.checked,
        needsFix: result.needsFix,
        fixed: result.fixed,
        errors: result.errors,
        issues: result.issues.slice(0, 20) // Limit response size
      },
      summary: {
        duration: `${(duration / 1000).toFixed(2)}s`,
        dryRun
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in verify-prevclose cron job:', error);
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
    const dryRun = url.searchParams.get('dryRun') !== 'false'; // Default to dry run for GET

    console.log(`🧪 Testing verify-prevclose with ${limit} tickers (dryRun: ${dryRun})...`);

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
    testUrl.searchParams.set('dryRun', String(dryRun));
    
    return await POST(new NextRequest(testUrl, mockRequest));
  } catch (error) {
    console.error('❌ Error in test verify-prevclose:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
