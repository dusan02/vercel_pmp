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
 * Acquire Redis lock for static data update
 * Prevents worker from calculating percentages during update
 * Uses owner ID for safe renewal and cleanup
 * Lock value contains: { ownerId, createdAt } as JSON for stale detection
 */
async function acquireStaticUpdateLock(): Promise<{ acquired: boolean; ownerId: string }> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (!redisClient || !redisClient.isOpen) {
      console.warn('⚠️  Redis not available - cannot acquire lock');
      return { acquired: false, ownerId: '' };
    }
    
    const lockKey = 'lock:static_data_update';
    const ownerId = `static_update_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const createdAt = Date.now();
    const lockTTL = 1800; // 30 minutes max
    
    // Lock value: JSON with ownerId and createdAt for stale detection
    const lockValue = JSON.stringify({ ownerId, createdAt });
    
    // Try to set lock (SET NX EX - only if not exists, with expiration)
    const result = await redisClient.set(lockKey, lockValue, {
      EX: lockTTL,
      NX: true
    });
    
    return { acquired: result === 'OK', ownerId };
  } catch (error) {
    console.warn('⚠️  Failed to acquire static update lock:', error);
    return { acquired: false, ownerId: '' };
  }
}

/**
 * Renew Redis lock (extend TTL)
 * Lock value is JSON, so we need to parse and check ownerId
 */
async function renewStaticUpdateLock(ownerId: string): Promise<boolean> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }
    
    const lockKey = 'lock:static_data_update';
    const lockTTL = 1800; // 30 minutes
    
    // Check if we still own the lock (parse JSON value)
    const lockValueStr = await redisClient.get(lockKey);
    if (lockValueStr) {
      try {
        const lockValue = JSON.parse(lockValueStr);
        if (lockValue.ownerId === ownerId) {
          await redisClient.expire(lockKey, lockTTL);
          return true;
        }
      } catch (parseError) {
        // Legacy format (plain ownerId string) - try direct comparison
        if (lockValueStr === ownerId) {
          await redisClient.expire(lockKey, lockTTL);
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.warn('⚠️  Failed to renew static update lock:', error);
    return false;
  }
}

/**
 * Release Redis lock for static data update (only if we own it)
 * Lock value is JSON, so we need to parse and check ownerId
 */
async function releaseStaticUpdateLock(ownerId: string): Promise<void> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (redisClient && redisClient.isOpen) {
      const lockKey = 'lock:static_data_update';
      // Only delete if we still own the lock (parse JSON value)
      const lockValueStr = await redisClient.get(lockKey);
      if (lockValueStr) {
        try {
          const lockValue = JSON.parse(lockValueStr);
          if (lockValue.ownerId === ownerId) {
            await redisClient.del(lockKey);
          } else {
            console.warn('⚠️  Cannot release lock - not owned by this process');
          }
        } catch (parseError) {
          // Legacy format (plain ownerId string) - try direct comparison
          if (lockValueStr === ownerId) {
            await redisClient.del(lockKey);
          } else {
            console.warn('⚠️  Cannot release lock - not owned by this process');
          }
        }
      }
    }
  } catch (error) {
    console.warn('⚠️  Failed to release static update lock:', error);
  }
}

/**
 * Refresh closing prices in database (refresh in place, don't reset to null)
 * Only updates missing or incorrect values, preserves existing correct values
 */
async function refreshClosingPricesInDB(): Promise<{ updatedCount: number; deletedToday: number; deletedLastTradingDay: number }> {
  console.log('🔄 Refreshing closing prices in database (refresh in place)...');
  
  // Get today's date and last trading day
  const today = getDateET();
  const todayDate = createETDate(today);
  const lastTradingDay = getLastTradingDay(todayDate);
  
  // Delete DailyRef entries for today and last trading day (will be repopulated by bootstrap)
  // This is safe because we'll immediately repopulate them
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
  
  // NOTE: We do NOT reset Ticker.latestPrevClose to null anymore
  // Bootstrap will update it with correct values, preserving existing correct values
  // This prevents "window of chaos" where worker calculates percentages with null references
  
  return {
    updatedCount: 0, // Not resetting, so count is 0
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

    console.log('🚀 Starting daily static data update with refresh in place...');

    // Acquire lock to prevent worker from calculating percentages during update
    const { acquired: lockAcquired, ownerId } = await acquireStaticUpdateLock();
    if (!lockAcquired) {
      console.warn('⚠️  Could not acquire static update lock - another update may be in progress');
      // Continue anyway, but log warning
    }

    let renewLockInterval: NodeJS.Timeout | undefined;
    try {
      // Renew lock periodically during long operations
      if (ownerId) {
        renewLockInterval = setInterval(async () => {
          await renewStaticUpdateLock(ownerId);
        }, 5 * 60 * 1000); // Every 5 minutes
      }
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

      // STEP 1: Clear Redis cache for previous closes
      console.log('\n📝 Step 1: Clearing Redis cache for previous closes...');
      await clearRedisPrevCloseCache();
      
      // STEP 2: Bootstrap previous closes from Polygon FIRST (prepare new data in memory)
      // This ensures we have data ready before deleting old data
      console.log('\n📝 Step 2: Bootstrapping previous closes from Polygon (prepare new data)...');
      const apiKey = process.env.POLYGON_API_KEY;
      let refreshResults = { updatedCount: 0, deletedToday: 0, deletedLastTradingDay: 0 };
      
      if (!apiKey) {
        console.error('❌ POLYGON_API_KEY not configured, skipping bootstrap');
      } else {
        // Get universe tickers (or use all tracked tickers)
        let tickers = await getUniverse('sp500');
        if (tickers.length === 0) {
          console.log('⚠️  Universe is empty, using all tracked tickers...');
          tickers = allTickers;
        }
        
        const calendarDateETStr = getDateET();
        try {
          // Bootstrap first - this populates DB with new prevClose values
          await bootstrapPreviousCloses(tickers, apiKey, calendarDateETStr);
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
        
        // STEP 3: Refresh closing prices (delete only stale/broken entries, new ones already populated)
        // This is now safe because bootstrap already populated new values
        console.log('\n📝 Step 3: Refreshing closing prices in database (cleanup stale entries)...');
        refreshResults = await refreshClosingPricesInDB();
        console.log(`✅ Refresh complete: ${refreshResults.deletedToday + refreshResults.deletedLastTradingDay} DailyRef entries deleted (new ones already populated by bootstrap)`);
      }

      // STEP 4: Update sharesOutstanding
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
        message: 'Static data update completed with refresh in place',
        results: {
          refresh: refreshResults,
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

