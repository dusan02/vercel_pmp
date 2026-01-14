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
 * - limit: Max number of tickers to check (default: 200)
 * - dryRun: If true, only report issues without fixing (default: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getPreviousClose } from '@/lib/utils/marketCapUtils';
import { getLastTradingDay } from '@/lib/utils/timeUtils';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { setPrevClose } from '@/lib/redis/operations';

const DEFAULT_LIMIT = 200;
const MAX_CONCURRENT = 3; // Conservative to avoid rate limiting

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
        await prisma.dailyRef.upsert({
          where: {
            symbol_date: {
              symbol: ticker,
              date: lastTradingDay
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

        // Update Redis cache
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
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
    const dryRun = url.searchParams.get('dryRun') === 'true';

    console.log(`🔍 Starting previousClose verification (limit: ${limit}, dryRun: ${dryRun})...`);

    // Get all tickers with previousClose
    const tickers = await prisma.ticker.findMany({
      where: {
        lastPrice: { gt: 0 },
        latestPrevClose: { gt: 0 }
      },
      select: {
        symbol: true,
        latestPrevClose: true,
        latestPrevCloseDate: true
      },
      orderBy: {
        symbol: 'asc'
      },
      take: limit
    });

    console.log(`📊 Found ${tickers.length} tickers to verify`);

    const result: VerifyResult = {
      checked: 0,
      needsFix: 0,
      fixed: 0,
      errors: 0,
      issues: []
    };

    // Get last trading day
    const etNow = createETDate(getDateET());
    const lastTradingDay = getLastTradingDay(etNow);
    const todayStr = getDateET(etNow);

    // Process in batches with rate limiting
    for (let i = 0; i < tickers.length; i += MAX_CONCURRENT) {
      const batch = tickers.slice(i, i + MAX_CONCURRENT);
      
      const batchResults = await Promise.all(
        batch.map(t => 
          verifyAndFixTicker(
            t.symbol,
            t.latestPrevClose!,
            lastTradingDay,
            todayStr,
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
