/**
 * Script to reset closing prices and reload from Polygon
 * Run: npx tsx scripts/reset-and-reload-closing-prices.ts [--ingest]
 * 
 * This script:
 * 1. Resets closing prices in database (Ticker.latestPrevClose, DailyRef.previousClose)
 * 2. Clears Redis cache for previous closes
 * 3. Bootstraps previous closes from Polygon
 * 4. Optionally runs manual ingest (if --ingest flag is provided)
 */

// Load environment variables
try {
  const { config } = require('dotenv');
  const { resolve } = require('path');
  config({ path: resolve(process.cwd(), '.env.local') });
} catch (e) {
  // dotenv not available, continue without it
}

import { prisma } from '../src/lib/db/prisma';
import { getUniverse } from '@/lib/redis/operations';
import { bootstrapPreviousCloses } from '@/workers/polygonWorker';
import { ingestBatch } from '@/workers/polygonWorker';
import { getDateET } from '@/lib/utils/dateET';
import { clearRedisPrevCloseCache } from '@/lib/utils/redisCacheUtils';
import { refreshClosingPricesInDB } from '@/lib/utils/closingPricesUtils';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`❌ ${key} not configured`);
    throw new Error(`${key} is required`);
  }
  return value;
}

async function main() {
  const shouldIngest = process.argv.includes('--ingest');
  
  console.log('🔄 Starting reset and reload of closing prices...');
  console.log(`📊 Mode: ${shouldIngest ? 'Reset + Bootstrap + Ingest' : 'Reset + Bootstrap only'}`);
  
  const apiKey = requireEnv('POLYGON_API_KEY');
  
  try {
    // Step 1: Clear Redis cache
    console.log('\n📝 Step 1: Clearing Redis cache...');
    await clearRedisPrevCloseCache();
    
    // Step 2: Reset closing prices in database (hard reset)
    console.log('\n📝 Step 2: Resetting closing prices in database...');
    await refreshClosingPricesInDB(true); // hardReset=true
    const tickerSymbols = (await prisma.ticker.findMany({ select: { symbol: true } })).map(t => t.symbol);
    
    // Step 3: Get universe (or use tickers from DB)
    console.log('\n📝 Step 3: Getting ticker universe...');
    let tickers = await getUniverse('sp500');
    if (tickers.length === 0) {
      console.log('⚠️  Universe is empty, using tickers from database...');
      tickers = tickerSymbols;
    }
    
    if (tickers.length === 0) {
      console.error('❌ No tickers found. Please populate universe first.');
      process.exit(1);
    }
    
    console.log(`📊 Found ${tickers.length} tickers to process`);
    
    // Step 4: Bootstrap previous closes from Polygon
    console.log('\n📝 Step 4: Bootstrapping previous closes from Polygon...');
    const today = getDateET();
    await bootstrapPreviousCloses(tickers, apiKey, today);
    console.log('✅ Bootstrap complete');
    
    // Step 5: Optional - Run manual ingest
    if (shouldIngest) {
      console.log('\n📝 Step 5: Running manual ingest...');
      const batchSize = 60;
      let totalIngested = 0;
      
      for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(tickers.length / batchSize);
        
        console.log(`\n📥 Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);
        
        try {
          const results = await ingestBatch(batch, apiKey, true); // force=true to bypass state machine
          const successCount = results.filter(r => r.success).length;
          totalIngested += successCount;
          
          console.log(`✅ Batch ${batchNum} complete: ${successCount}/${batch.length} successful`);
          
          // Rate limiting: 15s between batches
          if (i + batchSize < tickers.length) {
            console.log('⏳ Waiting 15s before next batch...');
            await new Promise(resolve => setTimeout(resolve, 15000));
          }
        } catch (error) {
          console.error(`❌ Error in batch ${batchNum}:`, error);
        }
      }
      
      console.log(`\n✅ Manual ingest complete: ${totalIngested} tickers ingested`);
    }
    
    console.log('\n✅ Reset and reload complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
