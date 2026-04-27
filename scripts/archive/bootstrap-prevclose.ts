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

import { getUniverse } from '@/lib/redis/operations';

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!isString(value)) {
    console.error(`❌ ${key} not configured`);
    throw new Error(`${key} is required`);
  }
  // Type guard narrows to string - TypeScript should recognize this
  // but process.env types are tricky, so we assert
  return value;
}

async function main() {
  console.log('🔄 Bootstrapping previous closes...');
  
  const apiKey = requireEnv('POLYGON_API_KEY');
  
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
  // requireEnv throws if undefined, so apiKey is guaranteed to be string
  // @ts-expect-error - TypeScript doesn't trust requireEnv's return type due to process.env typing
  await bootstrapFn(tickers, apiKey, today);
  
  console.log('✅ Bootstrap complete');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

