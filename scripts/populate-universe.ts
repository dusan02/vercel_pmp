/**
 * Script to manually populate universe:sp500 in Redis
 * Run: npx tsx scripts/populate-universe.ts
 */

// Load environment variables from .env.local if available
try {
  const { config } = require('dotenv');
  const { resolve } = require('path');
  config({ path: resolve(process.cwd(), '.env.local') });
} catch (e) {
  // dotenv not available, continue without it
}

import { addToUniverse } from '@/lib/redisHelpers';
import { getAllProjectTickers } from '@/data/defaultTickers';

async function main() {
  console.log('🔄 Populating universe:sp500...');
  
  const tickers = getAllProjectTickers('pmp');
  console.log(`📊 Found ${tickers.length} tickers for project 'pmp'`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const ticker of tickers) {
    const success = await addToUniverse('sp500', ticker);
    if (success) {
      successCount++;
    } else {
      errorCount++;
      console.error(`❌ Failed to add ${ticker} to universe`);
    }
  }
  
  console.log(`✅ Universe populated: ${successCount} tickers added, ${errorCount} errors`);
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

