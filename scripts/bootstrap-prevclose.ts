/**
 * Script to manually bootstrap previous closes
 * Run: npx tsx scripts/bootstrap-prevclose.ts
 * 
 * Note: Assumes DATABASE_URL and POLYGON_API_KEY are set in environment
 */

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}

import { getUniverse } from '@/lib/redisHelpers';

async function main() {
  console.log('🔄 Bootstrapping previous closes...');
  
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }
  
  // TypeScript type assertion - apiKey is checked above
  const apiKeyString = apiKey as string;
  
  const tickers = await getUniverse('sp500');
  if (tickers.length === 0) {
    console.error('❌ Universe is empty. Run populate-universe.ts first.');
    process.exit(1);
  }
  
  console.log(`📊 Found ${tickers.length} tickers in universe`);
  
  const today = new Date().toISOString().split('T')[0];
  // Import bootstrap function
  const { bootstrapPreviousCloses: bootstrapFn } = await import('@/workers/polygonWorker');
  
  console.log(`📊 Bootstrapping previous closes for ${tickers.length} tickers...`);
  // Bootstrap all tickers (not just first 10)
  await bootstrapFn(tickers, apiKeyString, today);
  
  console.log('✅ Bootstrap complete');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

