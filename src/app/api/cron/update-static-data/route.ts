/**
 * Cron job for daily update of static data
 * Updates sharesOutstanding and previousClose for all tickers
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

const BATCH_SIZE = 50; // Process 50 tickers at a time
const CONCURRENCY_LIMIT = 10; // Max 10 parallel API calls

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
      lastTradingDay.setHours(0, 0, 0, 0);

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

    console.log('🚀 Starting daily static data update...');

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

    // Update sharesOutstanding
    console.log('📈 Updating sharesOutstanding...');
    const sharesResults = await processBatch(
      allTickers,
      updateSharesOutstanding,
      BATCH_SIZE,
      CONCURRENCY_LIMIT
    );
    console.log(`✅ SharesOutstanding: ${sharesResults.success} updated, ${sharesResults.failed} failed`);

    // Update previousClose
    console.log('📉 Updating previousClose...');
    const prevCloseResults = await processBatch(
      allTickers,
      updatePreviousClose,
      BATCH_SIZE,
      CONCURRENCY_LIMIT
    );
    console.log(`✅ PreviousClose: ${prevCloseResults.success} updated, ${prevCloseResults.failed} failed`);

    // Update cron status after successful completion
    await updateCronStatus();

    const duration = Date.now() - startTime;
    const totalSuccess = sharesResults.success + prevCloseResults.success;
    const totalFailed = sharesResults.failed + prevCloseResults.failed;

    return NextResponse.json({
      success: true,
      message: 'Static data update completed',
      results: {
        sharesOutstanding: sharesResults,
        previousClose: prevCloseResults,
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
    console.log(`🧪 Testing with ${allTickers.length} tickers...`);

    const sharesResults = await processBatch(
      allTickers,
      updateSharesOutstanding,
      5, // Smaller batch for testing
      5  // Lower concurrency for testing
    );

    const prevCloseResults = await processBatch(
      allTickers,
      updatePreviousClose,
      5,
      5
    );

    return NextResponse.json({
      success: true,
      message: 'Test update completed',
      results: {
        sharesOutstanding: sharesResults,
        previousClose: prevCloseResults,
      },
      note: 'This was a test run with limited tickers',
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

