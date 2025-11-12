/**
 * Force ingest - ingest data even when market is closed (for testing)
 * Run: npx tsx scripts/force-ingest.ts
 * 
 * Note: Assumes .env.local is loaded by PM2 or manually via dotenv
 */

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}

import { getUniverse } from '@/lib/redisHelpers';
import { ingestBatch } from '@/workers/polygonWorker';

async function main() {
  console.log('🔄 Starting FORCE ingest (ignoring market status)...');
  console.log(`📊 DATABASE_URL: ${process.env.DATABASE_URL}`);
  
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }
  
  // Get universe
  let tickers = await getUniverse('sp500');
  if (tickers.length === 0) {
    console.log('⚠️ Universe is empty, using getAllProjectTickers...');
    const { getAllProjectTickers } = await import('@/data/defaultTickers');
    tickers = getAllProjectTickers('pmp');
  }
  
  // Ingest first 100 tickers (can be increased)
  const batchSize = 100;
  const testBatch = tickers.slice(0, batchSize);
  console.log(`📊 Ingesting ${testBatch.length} tickers (first ${batchSize} from universe)...`);
  
  try {
    const results = await ingestBatch(testBatch, apiKey);
    const successCount = results.filter(r => r.success).length;
    
    console.log(`\n✅ Ingest complete: ${successCount}/${testBatch.length} successful`);
    console.log('\n📊 Results:');
    results.forEach(r => {
      if (r.success) {
        console.log(`  ✅ ${r.symbol}: $${r.price.toFixed(2)} (${r.changePct > 0 ? '+' : ''}${r.changePct.toFixed(2)}%)`);
      } else {
        console.log(`  ❌ ${r.symbol}: ${r.error}`);
      }
    });
    
    // Check DB
    console.log('\n🔍 Checking DB...');
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const count = await prisma.sessionPrice.count({
      where: {
        symbol: { in: testBatch }
      }
    });
    
    console.log(`✅ Found ${count} records in SessionPrice table`);
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

