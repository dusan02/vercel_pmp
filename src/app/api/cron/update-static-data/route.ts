/**
 * Cron job for daily update of static data
 * Updates sharesOutstanding and previousClose for all tickers
 * 
 * Now includes full reset and reload of closing prices from Polygon
 * to ensure all prices are fresh and correct (fixes stale price issues)
 * 
 * Should run once daily (e.g., at 6 AM ET before market opens)
 * 
 * Usage: POST /api/cron/update-static-data
 * Authorization: Bearer token with CRON_SECRET_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSharesOutstanding, getPreviousClose } from '@/lib/utils/marketCapUtils';
import { getAllTrackedTickers } from '@/lib/utils/universeHelpers';
import { getLastTradingDay } from '@/lib/utils/timeUtils';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { getUniverse } from '@/lib/redis/operations';
import { bootstrapPreviousCloses } from '@/workers/polygonWorker';

const BATCH_SIZE = 50; // Process 50 tickers at a time
const CONCURRENCY_LIMIT = 10; // Max 10 parallel API calls

/**
 * Clear Redis cache for previous closes
 */
async function clearRedisPrevCloseCache(): Promise<void> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (redisClient && redisClient.isOpen) {
      const today = getDateET();
      const { REDIS_KEYS } = await import('@/lib/redis/keys');
      const key = REDIS_KEYS.prevclose(today);
      
      // Delete the hash key
      const deleted = await redisClient.del(key);
      if (deleted > 0) {
        console.log(`✅ Cleared Redis previous close cache for ${today}`);
      } else {
        console.log('ℹ️  No Redis previous close cache entries found for today');
      }
      
      // Also try to clear yesterday's cache (in case it's still there)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      if (yesterdayStr) {
        const yesterdayKey = REDIS_KEYS.prevclose(yesterdayStr);
        await redisClient.del(yesterdayKey);
      }
    } else {
      console.log('⚠️  Redis not available - skipping Redis cache clear');
    }
  } catch (error) {
    console.warn('⚠️  Failed to clear Redis cache:', error);
  }
}

/**
 * Reset closing prices in database (full reset before reload)
 */
async function resetClosingPricesInDB(): Promise<{ resetCount: number; deletedToday: number; deletedLastTradingDay: number }> {
  console.log('🔄 Resetting closing prices in database...');
  
  // Reset Ticker.latestPrevClose and latestPrevCloseDate
  const resetTickerResult = await prisma.ticker.updateMany({
    data: {
      latestPrevClose: null,
      latestPrevCloseDate: null,
      updatedAt: new Date()
    }
  });
  
  console.log(`✅ Reset latestPrevClose for ${resetTickerResult.count} tickers`);
  
  // Get today's date and last trading day
  const today = getDateET();
  const todayDate = createETDate(today);
  const lastTradingDay = getLastTradingDay(todayDate);
  
  // Delete DailyRef entries for today and last trading day
  const deletedToday = await prisma.dailyRef.deleteMany({
    where: {
      date: todayDate
    }
  });
  
  const deletedLastTradingDay = await prisma.dailyRef.deleteMany({
    where: {
      date: lastTradingDay
    }
  });
  
  console.log(`✅ Deleted ${deletedToday.count} DailyRef entries for today`);
  console.log(`✅ Deleted ${deletedLastTradingDay.count} DailyRef entries for last trading day`);
  
  return {
    resetCount: resetTickerResult.count,
    deletedToday: deletedToday.count,
    deletedLastTradingDay: deletedLastTradingDay.count
  };
}

/**
 * Update sharesOutstanding for a ticker
 */
async function updateSharesOutstanding(ticker: string): Promise<boolean> {
  try {
    const shares = await getSharesOutstanding(ticker);
    if (shares > 0) {
      await prisma.ticker.upsert({
        where: { symbol: ticker },
        update: { sharesOutstanding: shares },
        create: {
          symbol: ticker,
          sharesOutstanding: shares,
        },
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to update sharesOutstanding for ${ticker}:`, error);
    return false;
  }
}

/**
 * Update previousClose for a ticker
 * IMPORTANT: date = actual trading day of the close, not "today"
 */
async function updatePreviousClose(ticker: string): Promise<boolean> {
  try {
    const prevClose = await getPreviousClose(ticker);
    if (prevClose > 0) {
      // Get the last trading day (the day when this close actually happened)
      const lastTradingDay = getLastTradingDay();

      // Use findFirst + create/update instead of upsert for compound unique constraint
      const existing = await prisma.dailyRef.findFirst({
        where: {
          symbol: ticker,
          date: lastTradingDay,
        },
      });

      if (existing) {
        await prisma.dailyRef.update({
          where: { id: existing.id },
          data: { previousClose: prevClose },
        });
      } else {
        await prisma.dailyRef.create({
          data: {
            symbol: ticker,
            date: lastTradingDay, // Date of the actual trading day, not "today"
            previousClose: prevClose,
          },
        });
      }

      // Denormalize to Ticker table for quick access
      await prisma.ticker.update({
        where: { symbol: ticker },
        data: {
          latestPrevClose: prevClose,
          latestPrevCloseDate: lastTradingDay,
        },
      });

      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to update previousClose for ${ticker}:`, error);
    return false;
  }
}

/**
 * Process batch of tickers with concurrency limit
 */
async function processBatch(
  tickers: string[],
  processor: (ticker: string) => Promise<boolean>,
  batchSize: number = BATCH_SIZE,
  concurrencyLimit: number = CONCURRENCY_LIMIT
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tickers.length / batchSize)} (${batch.length} tickers)...`);

    // Process with concurrency limit
    for (let j = 0; j < batch.length; j += concurrencyLimit) {
      const concurrentBatch = batch.slice(j, j + concurrencyLimit);
      const results = await Promise.allSettled(
        concurrentBatch.map(ticker => processor(ticker))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          success++;
        } else {
          failed++;
          console.warn(`Failed to process ${concurrentBatch[index]}:`, result.status === 'rejected' ? result.reason : 'Unknown error');
        }
      });

      // Small delay between concurrent batches to avoid rate limiting
      if (j + concurrencyLimit < batch.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Delay between batches
    if (i + batchSize < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return { success, failed };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🚀 Starting daily static data update with full closing price reset...');

    // Get all tracked tickers
    const allTickers = await getAllTrackedTickers();
    console.log(`📊 Found ${allTickers.length} tickers to update`);

    // Update cron status in Redis
    const updateCronStatus = async () => {
      try {
        const { redisClient } = await import('@/lib/redis/client');
        if (redisClient && redisClient.isOpen) {
          await redisClient.setEx('cron:static_data:last_success_ts', 86400, Date.now().toString()); // 24 hour TTL
        }
      } catch (error) {
        console.warn('Failed to update cron status:', error);
      }
    };

    // STEP 1: Reset closing prices (clear cache and DB)
    console.log('\n📝 Step 1: Clearing Redis cache for previous closes...');
    await clearRedisPrevCloseCache();
    
    console.log('\n📝 Step 2: Resetting closing prices in database...');
    const resetResults = await resetClosingPricesInDB();
    console.log(`✅ Reset complete: ${resetResults.resetCount} tickers, ${resetResults.deletedToday + resetResults.deletedLastTradingDay} DailyRef entries deleted`);

    // STEP 2: Bootstrap previous closes from Polygon (full reload)
    console.log('\n📝 Step 3: Bootstrapping previous closes from Polygon (full reload)...');
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      console.error('❌ POLYGON_API_KEY not configured, skipping bootstrap');
    } else {
      // Get universe tickers (or use all tracked tickers)
      let tickers = await getUniverse('sp500');
      if (tickers.length === 0) {
        console.log('⚠️  Universe is empty, using all tracked tickers...');
        tickers = allTickers;
      }
      
      const today = getDateET();
      try {
        await bootstrapPreviousCloses(tickers, apiKey, today);
        console.log(`✅ Bootstrap complete: Previous closes reloaded from Polygon for ${tickers.length} tickers`);
      } catch (error) {
        console.error('❌ Error during bootstrap:', error);
        // Continue with individual updates as fallback
        console.log('⚠️  Falling back to individual previousClose updates...');
        const prevCloseResults = await processBatch(
          allTickers,
          updatePreviousClose,
          BATCH_SIZE,
          CONCURRENCY_LIMIT
        );
        console.log(`✅ PreviousClose (fallback): ${prevCloseResults.success} updated, ${prevCloseResults.failed} failed`);
      }
    }

    // STEP 3: Update sharesOutstanding
    console.log('\n📝 Step 4: Updating sharesOutstanding...');
    const sharesResults = await processBatch(
      allTickers,
      updateSharesOutstanding,
      BATCH_SIZE,
      CONCURRENCY_LIMIT
    );
    console.log(`✅ SharesOutstanding: ${sharesResults.success} updated, ${sharesResults.failed} failed`);

    // Update cron status after successful completion
    await updateCronStatus();

    const duration = Date.now() - startTime;
    const totalSuccess = sharesResults.success;
    const totalFailed = sharesResults.failed;

    return NextResponse.json({
      success: true,
      message: 'Static data update completed with full closing price reset',
      results: {
        reset: resetResults,
        sharesOutstanding: sharesResults,
        previousClose: {
          method: 'bootstrap',
          tickersProcessed: allTickers.length,
        },
      },
      summary: {
        totalTickers: allTickers.length,
        totalSuccess,
        totalFailed,
        duration: `${(duration / 1000).toFixed(2)}s`,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Error in static data update cron job:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// GET endpoint for manual testing
export async function GET(request: NextRequest) {
  try {
    // For testing, allow without auth (in production, require auth)
    const isProduction = process.env.NODE_ENV === 'production';
    const authHeader = request.headers.get('authorization');

    if (isProduction && authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run update (limited to first 10 tickers for testing)
    const allTickers = (await getAllTrackedTickers()).slice(0, 10);
    console.log(`🧪 Testing with ${allTickers.length} tickers (with reset)...`);

    // Test reset (limited scope)
    console.log('🧪 Testing reset (limited to test tickers)...');
    await clearRedisPrevCloseCache();
    
    // Reset only test tickers
    await prisma.ticker.updateMany({
      where: { symbol: { in: allTickers } },
      data: {
        latestPrevClose: null,
        latestPrevCloseDate: null,
        updatedAt: new Date()
      }
    });

    // Try bootstrap for test tickers
    const apiKey = process.env.POLYGON_API_KEY;
    if (apiKey) {
      const today = getDateET();
      try {
        await bootstrapPreviousCloses(allTickers, apiKey, today);
        console.log('✅ Bootstrap complete for test tickers');
      } catch (error) {
        console.warn('⚠️  Bootstrap failed, using individual updates:', error);
        await processBatch(allTickers, updatePreviousClose, 5, 5);
      }
    } else {
      await processBatch(allTickers, updatePreviousClose, 5, 5);
    }

    const sharesResults = await processBatch(
      allTickers,
      updateSharesOutstanding,
      5, // Smaller batch for testing
      5  // Lower concurrency for testing
    );

    return NextResponse.json({
      success: true,
      message: 'Test update completed (with reset)',
      results: {
        sharesOutstanding: sharesResults,
        previousClose: {
          method: 'bootstrap',
          tickersProcessed: allTickers.length,
        },
      },
      note: 'This was a test run with limited tickers and full reset',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Error in test update:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

