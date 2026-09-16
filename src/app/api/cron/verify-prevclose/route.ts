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
import { getTradingDay, detectSession } from '@/lib/utils/timeUtils';
import { getDateET, nowET } from '@/lib/utils/dateET';
import { getPrevCloseContext } from '@/lib/utils/prevCloseDates';
import { verifyCronAuth, withCronLock } from '@/lib/utils/cronAuth';
import { writePrevClose } from '@/lib/heatmap/prevCloseService';

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
  todayDate: Date,
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
        // Use centralized prevCloseService: updates Redis + DailyRef + Ticker atomically
        // INVARIANT: Only update prevClose for today, never nextTradingDay.
        // Redis key + DailyRef row are keyed by TODAY (the day this prevClose is
        // for); lastTradingDay only applies to Ticker.latestPrevCloseDate (the
        // date of the close itself).
        await writePrevClose(todayStr, lastTradingDay, ticker, correctPrevClose, { dailyRefDate: todayDate });

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
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    // Distributed lock: prevent overlapping runs (checks all tickers, minutes)
    return await withCronLock('verify-prevclose', 60 * 60, async () => runVerifyPrevClose(request));
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

async function runVerifyPrevClose(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined; // undefined = no limit
    const dryRun = url.searchParams.get('dryRun') === 'true';

    console.log(`🔍 Starting previousClose verification (limit: ${limit || 'unlimited'}, dryRun: ${dryRun})...`);

    // CRITICAL: Use trading date (ET), not UTC calendar date
    // Model A: prevCloseKey(todayTradingDay) = close(yesterdayTradingDay)
    // verify-prevclose opravuje prevClose pre dnešný trading session
    const etNow = nowET();
    // Centralized date semantics: sessionDate = the day prevClose is FOR,
    // closeRefDay = the trading day whose close IS the prevClose.
    const ctx = getPrevCloseContext(etNow);
    const calendarDateETStr = ctx.sessionDateStr;
    const calendarDateET = ctx.sessionDate;
    const prevCloseRefDay = ctx.closeRefDay;
    const prevCloseRefDateStr = ctx.closeRefDateStr;
    
    // CRITICAL: Include tickers with lastPrice > 0, even if prevClose is missing/null
    // This fixes "broken" tickers that were reset or never had prevClose set
    // We check both:
    // 1. Tickers with prevClose > 0 (normal case)
    // 2. Tickers with lastPrice > 0 but prevClose is null/0 or stale date (broken case)
    // 
    // NOTE: latestPrevCloseDate comparison uses date range to handle timezone correctly
    // prevCloseRefDay is a Date object (ET midnight), but DB stores DateTime (UTC)
    // We compare by date range: >= start of prevCloseRefDay UTC, < start of next day UTC
    const prevCloseRefDayStart = new Date(prevCloseRefDay);
    prevCloseRefDayStart.setUTCHours(0, 0, 0, 0);
    const prevCloseRefDayEnd = new Date(prevCloseRefDayStart);
    prevCloseRefDayEnd.setUTCDate(prevCloseRefDayEnd.getUTCDate() + 1);
    
    // Stale set: missing prevClose or latestPrevCloseDate outside the ref day.
    // These get a full Polygon verification every run.
    const staleTickers = await prisma.ticker.findMany({
      where: {
        lastPrice: { gt: 0 },
        OR: [
          { latestPrevClose: null },
          { latestPrevClose: 0 },
          { latestPrevCloseDate: null },
          { latestPrevCloseDate: { lt: prevCloseRefDayStart } },
          { latestPrevCloseDate: { gt: prevCloseRefDayEnd } }
        ]
      },
      select: {
        symbol: true,
        latestPrevClose: true,
        latestPrevCloseDate: true
      },
      orderBy: { symbol: 'asc' },
      ...(limit ? { take: limit } : {})
    });

    // Rotating deterministic sample of nominally-fresh tickers — catches value
    // drift (right date, wrong price) without paying ~700 Polygon calls/run.
    // The window slides daily so the full universe is covered over ~2 weeks.
    const freshTickers = limit ? [] : await prisma.ticker.findMany({
      where: {
        lastPrice: { gt: 0 },
        latestPrevClose: { gt: 0 },
        latestPrevCloseDate: { gte: prevCloseRefDayStart, lt: prevCloseRefDayEnd }
      },
      select: {
        symbol: true,
        latestPrevClose: true,
        latestPrevCloseDate: true
      },
      orderBy: { symbol: 'asc' }
    });
    const FRESH_SAMPLE_SIZE = 50;
    let freshSample: typeof freshTickers = [];
    if (freshTickers.length > 0) {
      const seed = parseInt(calendarDateETStr.replaceAll('-', ''), 10);
      const start = seed % freshTickers.length;
      freshSample = freshTickers.slice(start, start + FRESH_SAMPLE_SIZE);
      if (freshSample.length < FRESH_SAMPLE_SIZE) {
        freshSample = freshSample.concat(freshTickers.slice(0, FRESH_SAMPLE_SIZE - freshSample.length));
      }
    }

    const tickers = [...staleTickers, ...freshSample];
    console.log(`📊 Found ${tickers.length} tickers to verify (stale: ${staleTickers.length}, fresh sample: ${freshSample.length}/${freshTickers.length})`);

    const result: VerifyResult = {
      checked: 0,
      needsFix: 0,
      fixed: 0,
      errors: 0,
      issues: []
    };
    
    // INVARIANT: verify-prevclose only fixes prevClose for today, never the
    // next trading day — saveRegularClose prepares those forward-looking values.
    const { getNextTradingDay } = await import('@/lib/utils/pricingStateMachine');
    const nextTradingDay = getNextTradingDay(calendarDateET);
    const nextTradingDateStr = getDateET(nextTradingDay);

    // Log context for debugging
    const session = detectSession(etNow);
    const isTradingDay = getDateET(getTradingDay(calendarDateET)) === calendarDateETStr;
    console.log(`📅 verify-prevclose context: calendarET=${calendarDateETStr}, prevCloseRefDayET=${prevCloseRefDateStr}, nextTradingDayET=${nextTradingDateStr}, isTradingDay=${isTradingDay}, session=${session}`);
    console.log(`📅 verify-prevclose target: prevClose(${calendarDateETStr}) = close(${prevCloseRefDateStr}), will NOT touch prevClose(${nextTradingDateStr})`);

    // Process in batches with rate limiting
    for (let i = 0; i < tickers.length; i += MAX_CONCURRENT) {
      const batch = tickers.slice(i, i + MAX_CONCURRENT);
      
      const batchResults = await Promise.all(
        batch.map(t =>
          verifyAndFixTicker(
            t.symbol,
            t.latestPrevClose!,
            prevCloseRefDay,   // Ticker.latestPrevCloseDate = date of the close
            calendarDateETStr, // Redis key is the CALENDAR today (what getPrevClose reads)
            calendarDateET,    // DailyRef row is today's row
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

      // Rate limiting: delay between batches (3 req per 1 sec = 180 req/min, safely below 250 limit)
      if (i + MAX_CONCURRENT < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
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
