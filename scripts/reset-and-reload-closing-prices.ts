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
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { getLastTradingDay } from '@/lib/utils/timeUtils';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`❌ ${key} not configured`);
    throw new Error(`${key} is required`);
  }
  return value;
}

async function clearRedisPrevCloseCache() {
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
      const yesterdayKey = REDIS_KEYS.prevclose(yesterdayStr);
      await redisClient.del(yesterdayKey);
    } else {
      console.log('⚠️  Redis not available - skipping Redis cache clear');
    }
  } catch (error) {
    console.warn('⚠️  Failed to clear Redis cache:', error);
  }
}

async function resetClosingPricesInDB() {
  console.log('🔄 Resetting closing prices in database...');
  
  // Get all tickers
  const tickers = await prisma.ticker.findMany({
    select: { symbol: true }
  });
  
  console.log(`📊 Found ${tickers.length} tickers to reset`);
  
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
  
  return tickers.map(t => t.symbol);
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
    
    // Step 2: Reset closing prices in database
    console.log('\n📝 Step 2: Resetting closing prices in database...');
    const tickerSymbols = await resetClosingPricesInDB();
    
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
