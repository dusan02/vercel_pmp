import { ingestBatch } from './polygonWorker';
import { logger } from '@/lib/utils/logger'; // Assuming this path based on common patterns, will verify
import { getAllTrackedTickers } from '@/lib/utils/universeHelpers';
import { nowET, detectSession } from '@/lib/utils/timeUtils';

const BATCH_SIZE = 50;
const TARGET_TICKER_COUNT = 600;

/**
 * Background Preloader Worker
 * 
 * Načíta dáta pre 500-600 firiem (SP500 + 100 zahraničných) v pozadí
 * a uloží do Redis cache pre okamžité načítanie po otvorení stránky
 * 
 * Spustenie:
 * Preload all stock data for tracked tickers
 */
async function preloadBulkStocks(apiKey: string): Promise<{ success: number; failed: number }> {
  const startTime = Date.now();
  let success = 0;
  let failed = 0;

  const tickers = await getAllTrackedTickers();


  // Process in batches
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tickers.length / BATCH_SIZE);

    logger.info(`Processing batch ${batchNum}/${totalBatches}`, {
      batch: batchNum,
      totalBatches,
      batchSize: batch.length
    });

    try {
      const results = await ingestBatch(batch, apiKey);

      const batchSuccess = results.filter(r => r.success).length;
      const batchFailed = results.filter(r => !r.success).length;

      success += batchSuccess;
      failed += batchFailed;

      logger.info(`Batch ${batchNum} completed`, {
        batch: batchNum,
        success: batchSuccess,
        failed: batchFailed
      });

      // Rate limiting: 60s between batches (Polygon free tier: 5 calls/min)
      if (i + BATCH_SIZE < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    } catch (error) {
      logger.error('Batch ingest failed', error, { batch: batchNum });
      failed += batch.length;
    }
  }

  const duration = Date.now() - startTime;
  logger.info('Bulk preload completed', {
    success,
    failed,
    total: tickers.length,
    duration: `${Math.round(duration / 1000)}s`
  });

  return { success, failed };
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

  logger.info('Background preloader started', { session, etTime: etNow.toISOString() });

  // Run preload
  await preloadBulkStocks(apiKey);

  logger.info('Background preloader finished');
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Preloader fatal error', error);
    process.exit(1);
  });
}

export { preloadBulkStocks };

