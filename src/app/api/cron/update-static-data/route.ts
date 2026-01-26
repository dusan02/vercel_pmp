/**
 * Cron job for daily update of static data
 * Updates sharesOutstanding and previousClose for all tickers
 * 
 * Now includes full reset and reload of closing prices from Polygon
 * to ensure all prices are fresh and correct (fixes stale price issues)
 * 
 * Should run once daily at 04:00 ET (09:00 UTC) before market opens
 * This ensures Polygon API has finalized previous day's closing prices
 * 
 * Usage: POST /api/cron/update-static-data
 * Authorization: Bearer token with CRON_SECRET_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllTrackedTickers } from '@/lib/utils/universeHelpers';
import { getDateET } from '@/lib/utils/dateET';
import { getUniverse } from '@/lib/redis/operations';
import { bootstrapPreviousCloses } from '@/workers/polygonWorker';
import { clearRedisPrevCloseCache } from '@/lib/utils/redisCacheUtils';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { 
  acquireStaticUpdateLock, 
  renewStaticUpdateLock, 
  releaseStaticUpdateLock 
} from '@/lib/utils/staticDataLock';
import { refreshClosingPricesInDB } from '@/lib/utils/closingPricesUtils';
import { verifyPriceConsistency } from '@/lib/utils/priceVerification';
import { processBatch } from '@/lib/utils/batchProcessing';
import { updateCronStatus } from '@/lib/utils/cronStatus';
import { 
  updateTickerSharesOutstanding, 
  updateTickerPreviousClose 
} from '@/lib/utils/tickerUpdates';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';

const BATCH_SIZE = 50; // Process 50 tickers at a time
const CONCURRENCY_LIMIT = 10; // Max 10 parallel API calls



export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify authorization (shared helper)
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    console.log('🚀 Starting daily static data update with refresh in place...');

    // Acquire lock to prevent worker from calculating percentages during update
    const { acquired: lockAcquired, ownerId } = await acquireStaticUpdateLock();
    if (!lockAcquired) {
      console.error('❌ Could not acquire static update lock - another update may be in progress');
      return NextResponse.json(
        { 
          error: 'Lock acquisition failed', 
          message: 'Another static data update may be in progress. Please wait and try again.' 
        },
        { status: 409 } // Conflict status
      );
    }

    let renewLockInterval: NodeJS.Timeout | undefined;
    try {
      // Renew lock periodically during long operations
      if (ownerId) {
        renewLockInterval = setInterval(async () => {
          await renewStaticUpdateLock(ownerId);
        }, 5 * 60 * 1000); // Every 5 minutes
      }
      // Get all tracked tickers (with optional test limit)
      const url = new URL(request.url);
      const testLimit = url.searchParams.get('testLimit');
      let allTickers = await getAllTrackedTickers();
      
      if (testLimit) {
        const limit = parseInt(testLimit, 10);
        allTickers = allTickers.slice(0, limit);
        console.log(`🧪 TEST MODE: Limited to ${allTickers.length} tickers`);
      }
      
      console.log(`📊 Found ${allTickers.length} tickers to update`);

      // STEP 1: Clear Redis cache for previous closes
      console.log('\n📝 Step 1: Clearing Redis cache for previous closes...');
      await clearRedisPrevCloseCache();
      
      // Check if hard reset is requested (via environment variable or query param)
      const hardResetParam = url.searchParams.get('hardReset') === 'true';
      const hardResetEnv = process.env.ENABLE_HARD_RESET === 'true';
      const shouldHardReset = hardResetParam || hardResetEnv;
      
      if (shouldHardReset) {
        console.log('⚠️  HARD RESET MODE: Will reset Ticker.latestPrevClose to null before bootstrap');
      }
      
      // STEP 2: Refresh closing prices in DB (delete today/yesterday refs; optional hard reset)
      // Safe because we hold a lock during the update window.
      console.log(`\n📝 Step 2: Refreshing closing prices in database (${shouldHardReset ? 'HARD RESET' : 'cleanup stale entries'})...`);
      const apiKey = process.env.POLYGON_API_KEY;
      let refreshResults = { updatedCount: 0, deletedToday: 0, deletedLastTradingDay: 0 };
      
      if (!apiKey) {
        console.error('❌ POLYGON_API_KEY not configured, skipping close refresh/bootstrap');
      } else {
        refreshResults = await refreshClosingPricesInDB(shouldHardReset);
        console.log(
          `✅ Refresh complete: ${refreshResults.deletedToday + refreshResults.deletedLastTradingDay} DailyRef entries deleted, ${refreshResults.updatedCount} tickers reset`
        );

        // Get universe tickers (or use all tracked tickers)
        let tickers = await getUniverse('sp500');
        if (tickers.length === 0) {
          console.log('⚠️  Universe is empty, using all tracked tickers...');
          tickers = allTickers;
        }
        
        const calendarDateETStr = getDateET();
        try {
          // STEP 3: Bootstrap previous closes from Polygon (re-populate DB refs + Redis cache)
          console.log('\n📝 Step 3: Bootstrapping previous closes from Polygon...');
          await bootstrapPreviousCloses(tickers, apiKey, calendarDateETStr);
          console.log(`✅ Bootstrap complete: Previous closes reloaded from Polygon for ${tickers.length} tickers`);
        } catch (error) {
          console.error('❌ Error during bootstrap:', error);
          // Continue with individual updates as fallback
          // Use same ticker list as bootstrap (tickers) not allTickers
          console.log('⚠️  Falling back to individual previousClose updates...');
          const prevCloseResults = await processBatch(
            tickers,
            updateTickerPreviousClose,
            BATCH_SIZE,
            CONCURRENCY_LIMIT
          );
          console.log(`✅ PreviousClose (fallback): ${prevCloseResults.success} updated, ${prevCloseResults.failed} failed`);
        }
      }

      // STEP 4: Update sharesOutstanding
      console.log('\n📝 Step 4: Updating sharesOutstanding...');
      const sharesResults = await processBatch(
        allTickers,
        updateTickerSharesOutstanding,
        BATCH_SIZE,
        CONCURRENCY_LIMIT
      );
      console.log(`✅ SharesOutstanding: ${sharesResults.success} updated, ${sharesResults.failed} failed`);

      // STEP 5: Verify price consistency (check for mismatches)
      console.log('\n📝 Step 5: Verifying price consistency...');
      let priceCheckResults = { checked: 0, issues: 0, details: [] as Array<{ ticker: string; issues: string[] }> };
      if (apiKey) {
        priceCheckResults = await verifyPriceConsistency(allTickers, apiKey);
        console.log(`✅ Price verification: ${priceCheckResults.checked} checked, ${priceCheckResults.issues} issues found`);
      } else {
        console.log('⚠️  Skipping price verification - POLYGON_API_KEY not configured');
      }

      // Update cron status after successful completion
      await updateCronStatus('static_data');

      const duration = Date.now() - startTime;
      const totalSuccess = sharesResults.success;
      const totalFailed = sharesResults.failed;

      return createCronSuccessResponse({
        message: 'Static data update completed with refresh in place',
        results: {
          refresh: refreshResults,
          sharesOutstanding: sharesResults,
          previousClose: {
            method: 'bootstrap',
            tickersProcessed: allTickers.length,
          },
          priceVerification: priceCheckResults,
        },
        summary: {
          totalTickers: allTickers.length,
          totalSuccess,
          totalFailed,
          duration: `${(duration / 1000).toFixed(2)}s`,
        },
      });
    } finally {
      // Clear lock renewal interval
      if (typeof renewLockInterval !== 'undefined') {
        clearInterval(renewLockInterval);
      }
      // Always release lock, even if update fails
      if (ownerId) {
        await releaseStaticUpdateLock(ownerId);
      }
    }

  } catch (error) {
    return handleCronError(error, 'static data update cron job');
  }
}

// GET endpoint for manual testing (limited to 10 tickers)
export async function GET(request: NextRequest) {
  try {
    // For testing, allow without auth (in production, require auth)
    const isProduction = process.env.NODE_ENV === 'production';
    const authHeader = request.headers.get('authorization');

    if (isProduction && authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create a modified request with test limit and hardReset=true
    const url = new URL(request.url);
    url.searchParams.set('testLimit', '10');
    url.searchParams.set('hardReset', 'true');
    
    const modifiedRequest = new NextRequest(url, {
      method: 'POST',
      headers: request.headers
    });

    // Call POST handler with test limit
    return await POST(modifiedRequest);
  } catch (error) {
    return handleCronError(error, 'test update');
  }
}

