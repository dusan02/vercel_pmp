/**
 * Background Preloader Worker
 * 
 * Načíta dáta pre 500-600 firiem (SP500 + 100 zahraničných) v pozadí
 * a uloží do Redis cache pre okamžité načítanie po otvorení stránky
 * 
 * Spustenie:
 * - Cron job: každých 5 minút 09:00-16:00 ET
 * - Jednorazovo: 08:00 ET (pred otvorením trhu)
 */

import { ingestBatch } from './polygonWorker';
import { getAllTrackedTickers } from '@/lib/universeHelpers';
import { nowET, detectSession, isMarketOpen } from '@/lib/timeUtils';
import { logger } from '@/lib/logger';

const BATCH_SIZE = 60; // Polygon API limit
const TARGET_TICKER_COUNT = 600; // SP500 (500) + International (100)

/**
 * Preload all stock data for tracked tickers
 */
async function preloadBulkStocks(apiKey: string): Promise<{ success: number; failed: number }> {
  const startTime = Date.now();
  let success = 0;
  let failed = 0;

  try {
    logger.info('🚀 Starting bulk stock preload...');

    // Get all tracked tickers
    const tickers = await getAllTrackedTickers();
    
    if (tickers.length === 0) {
      logger.warn('No tickers to preload');
      return { success: 0, failed: 0 };
    }

    logger.info({ tickerCount: tickers.length }, 'Preloading bulk stocks');

    // Process in batches
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(tickers.length / BATCH_SIZE);

      logger.info({ 
        batch: batchNum, 
        totalBatches, 
        batchSize: batch.length 
      }, `Processing batch ${batchNum}/${totalBatches}`);

      try {
        const results = await ingestBatch(batch, apiKey);
        
        const batchSuccess = results.filter(r => r.success).length;
        const batchFailed = results.filter(r => !r.success).length;
        
        success += batchSuccess;
        failed += batchFailed;

        logger.info({ 
          batch: batchNum,
          success: batchSuccess,
          failed: batchFailed
        }, `Batch ${batchNum} completed`);

        // Rate limiting: 60s between batches (Polygon free tier: 5 calls/min)
        if (i + BATCH_SIZE < tickers.length) {
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      } catch (error) {
        logger.error({ err: error, batch: batchNum }, 'Batch ingest failed');
        failed += batch.length;
      }
    }

    const duration = Date.now() - startTime;
    logger.info({ 
      success, 
      failed, 
      total: tickers.length,
      duration: `${Math.round(duration / 1000)}s`
    }, 'Bulk preload completed');

    return { success, failed };
  } catch (error) {
    logger.error({ err: error }, 'Bulk preload error');
    return { success, failed };
  }
}

/**
 * Main worker entry point
 */
async function main() {
  const apiKey = process.env.POLYGON_API_KEY;
  
  if (!apiKey) {
    logger.error('POLYGON_API_KEY not configured');
    process.exit(1);
  }

  const etNow = nowET();
  const session = detectSession(etNow);

  logger.info({ session, etTime: etNow.toISOString() }, 'Background preloader started');

  // Run preload
  await preloadBulkStocks(apiKey);

  logger.info('Background preloader finished');
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    logger.error({ err: error }, 'Preloader fatal error');
    process.exit(1);
  });
}

export { preloadBulkStocks };

