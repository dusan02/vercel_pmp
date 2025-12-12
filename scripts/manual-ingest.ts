/**
 * Manual ingest script - ingest data even when market is closed
 * Run: npx tsx scripts/manual-ingest.ts
 */

// Load .env.local (using require to avoid TypeScript errors)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config } = require('dotenv');
  const { resolve } = require('path');
  config({ path: resolve(process.cwd(), '.env.local') });
} catch (e) {
  // dotenv not installed, assume env vars are already loaded
  console.warn('⚠️ dotenv not found, using existing environment variables');
}

import { getUniverse } from '@/lib/redis/operations';
import { ingestBatch } from '@/workers/polygonWorker';

async function main() {
  console.log('🔄 Starting manual ingest...');
  
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }
  
  // Get universe (fallback to getAllProjectTickers if empty)
  let tickers = await getUniverse('sp500');
  if (tickers.length === 0) {
    console.log('⚠️ Universe is empty, using getAllProjectTickers...');
    const { getAllProjectTickers } = await import('@/data/defaultTickers');
    tickers = getAllProjectTickers('pmp');
  }
  
  console.log(`📊 Found ${tickers.length} tickers to ingest`);
  
  // Process in batches of 60-70
  const batchSize = 60;
  let totalIngested = 0;
  
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(tickers.length / batchSize);
    
    console.log(`\n📥 Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);
    
    try {
      const results = await ingestBatch(batch, apiKey);
      const successCount = results.filter(r => r.success).length;
      totalIngested += successCount;
      
      console.log(`✅ Batch ${batchNum} complete: ${successCount}/${batch.length} successful`);
      
      // Rate limiting: 15s between batches (Polygon free tier: 5 calls/min)
      if (i + batchSize < tickers.length) {
        console.log('⏳ Waiting 15s before next batch...');
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    } catch (error) {
      console.error(`❌ Error in batch ${batchNum}:`, error);
    }
  }
  
  console.log(`\n✅ Manual ingest complete: ${totalIngested} tickers ingested`);
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
