/**
 * Script to run refs worker tasks once (universe refresh + bootstrap previous closes)
 * Run: npx tsx scripts/bootstrap-refs-once.ts
 */

// Load environment variables
try {
  const { config } = require('dotenv');
  const { resolve } = require('path');
  config({ path: resolve(process.cwd(), '.env.local') });
} catch (e) {
  // dotenv not available, continue without it
}

import { getAllProjectTickers } from '@/data/defaultTickers';
import { addToUniverse, getUniverse } from '@/lib/redis/operations';
import { bootstrapPreviousCloses } from '@/workers/polygonWorker';

async function main() {
  const apiKey = process.env.POLYGON_API_KEY;
  
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }

  console.log('🔄 Running refs tasks once...');
  
  // 1. Refresh universe
  console.log('📊 Step 1: Refreshing universe...');
  try {
    const tickers = getAllProjectTickers('pmp');
    console.log(`📊 Adding ${tickers.length} tickers to universe:sp500...`);
    
    let successCount = 0;
    for (const ticker of tickers) {
      const success = await addToUniverse('sp500', ticker);
      if (success) successCount++;
    }
    
    console.log(`✅ Universe refreshed: ${successCount}/${tickers.length} tickers added`);
  } catch (error) {
    console.error('❌ Error refreshing universe:', error);
  }

  // 2. Bootstrap previous closes
  console.log('📊 Step 2: Bootstrapping previous closes...');
  try {
    const tickers = await getUniverse('sp500');
    if (tickers.length === 0) {
      console.warn('⚠️ Universe is empty, using default tickers');
      const defaultTickers = getAllProjectTickers('pmp').slice(0, 100); // Limit to 100 for bootstrap
      const today = new Date().toISOString().split('T')[0];
      // apiKey is checked above, guaranteed to be string
      // @ts-expect-error - TypeScript doesn't trust process.env type narrowing
      await bootstrapPreviousCloses(defaultTickers, apiKey, today);
    } else {
      const today = new Date().toISOString().split('T')[0];
      // apiKey is checked above, guaranteed to be string
      // @ts-expect-error - TypeScript doesn't trust process.env type narrowing
      await bootstrapPreviousCloses(tickers, apiKey, today);
    }
    console.log('✅ Previous closes bootstrapped');
  } catch (error) {
    console.error('❌ Error bootstrapping previous closes:', error);
  }

  console.log('✅ All refs tasks completed');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

