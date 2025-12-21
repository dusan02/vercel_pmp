/**
 * Script to add international NYSE tickers to database and Redis universe
 * Run: npm run db:add-international
 */

import { prisma } from '../src/lib/db/prisma';
import { addTickersToUniverse, UNIVERSE_TYPES } from '../src/lib/utils/universeHelpers';
import { getInternationalNYSETickers } from '../src/data/internationalTickers';
import { logger } from '../src/lib/utils/logger';

async function main() {
  logger.info('🚀 Adding international NYSE tickers to database...');
  
  const internationalTickers = getInternationalNYSETickers();
  let addedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const batchSize = 50;
  for (let i = 0; i < internationalTickers.length; i += batchSize) {
    const batch = internationalTickers.slice(i, i + batchSize);
    logger.info(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(internationalTickers.length / batchSize)} (${batch.length} tickers)...`);

    for (const ticker of batch) {
      try {
        // Upsert ticker to database
        // Note: Ticker model doesn't have 'type' field, so we just create/update with symbol and name
        await prisma.ticker.upsert({
          where: { symbol: ticker },
          update: { 
            name: ticker // Update name if exists
          },
          create: { 
            symbol: ticker, 
            name: ticker
          }
        });
        
        // Add to Redis universe
        await addTickersToUniverse(UNIVERSE_TYPES.INTERNATIONAL, [ticker]);
        addedCount++;
      } catch (error) {
        logger.error(`Failed to add ticker ${ticker}`, error, { ticker });
        errorCount++;
      }
    }
  }

  logger.info(`✅ Completed!
    Added: ${addedCount}
    Skipped: ${skippedCount}
    Errors: ${errorCount}
    Total: ${internationalTickers.length}`);

  // Verify count in DB (check if tickers exist)
  // Since we don't have a 'type' field, we'll just verify that the tickers were added
  const sampleTickers = internationalTickers.slice(0, 10);
  const dbTickers = await prisma.ticker.findMany({
    where: { symbol: { in: sampleTickers } },
    select: { symbol: true }
  });
  logger.info(`📊 Verification: ${dbTickers.length} of ${sampleTickers.length} sample international NYSE tickers found in database`);

  // Verify universe count
  const { getTickersByUniverseType } = await import('../src/lib/utils/universeHelpers');
  const universeTickers = await getTickersByUniverseType(UNIVERSE_TYPES.INTERNATIONAL);
  logger.info(`📊 Universe count: ${universeTickers.length} international tickers in Redis universe`);
}

main().catch(e => {
  logger.error('Error adding international NYSE tickers', e);
  process.exit(1);
});

