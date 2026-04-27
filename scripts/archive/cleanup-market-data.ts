/**
 * Cleanup Market Data - Audit and remove de-listed tickers
 * 
 * Usage:
 * npx tsx scripts/cleanup-market-data.ts [--execute]
 * 
 * Flags:
 *   --execute     - Actually perform the deletion (default is dry-run)
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.trim().split('=');
    if (key && valueParts.length > 0) {
      process.env[key] = valueParts.join('=');
    }
  });
}

const prisma = new PrismaClient();
const apiKey = process.env.POLYGON_API_KEY;

async function fetchTickerStatus(symbol: string): Promise<{ active: boolean; exists: boolean }> {
  if (!apiKey) throw new Error('POLYGON_API_KEY not found');
  
  const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.status === 404) return { active: false, exists: false };
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    
    const data = await resp.json();
    return { active: !!data.results?.active, exists: true };
  } catch (err) {
    console.warn(`⚠️ Failed to fetch status for ${symbol}:`, err instanceof Error ? err.message : err);
    return { active: true, exists: true }; // Assume active on error to be safe
  }
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');

  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not found');
    process.exit(1);
  }

  console.log(`🚀 Starting Market Data Cleanup (${execute ? 'EXECUTE' : 'DRY-RUN'})`);

  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  });

  let hasRedis = false;
  try {
    await redisClient.connect();
    hasRedis = true;
    console.log('✅ Connected to Redis');
  } catch (err) {
    console.warn('⚠️ Could not connect to Redis, skipping Redis cleanup');
  }

  // Get all tickers from DB
  const tickers = await prisma.ticker.findMany({
    select: { symbol: true, lastChangePct: true }
  });

  console.log(`📊 Auditing ${tickers.length} tickers...`);

  const toRemove: string[] = [];
  const extremeMovers = tickers.filter(t => Math.abs(t.lastChangePct || 0) >= 999);
  
  console.log(`🔍 Identified ${extremeMovers.length} tickers with extreme movements (>= 999%). Checking status...`);

  for (const ticker of tickers) {
    const symbol = ticker.symbol;
    process.stdout.write(`Checking ${symbol}... `);
    const status = await fetchTickerStatus(symbol);
    if (!status.active || !status.exists) {
      console.log(`❌ INACTIVE (exists: ${status.exists})`);
      toRemove.push(symbol);
    } else {
      console.log('✅ Active');
    }
    // Wait to respect rate limits (300ms for safety with all tickers)
    await new Promise(r => setTimeout(r, 300));
  }

  if (toRemove.length === 0) {
    console.log('\n✅ No de-listed tickers identified for removal.');
    await prisma.$disconnect();
    if (hasRedis) await redisClient.disconnect();
    return;
  }

  console.log(`\n🧹 Identified ${toRemove.length} tickers for removal: ${toRemove.join(', ')}`);

  if (execute) {
    console.log('\n🔥 Executing cleanup...');
    
    for (const symbol of toRemove) {
      // 1. Remove from Redis universes
      if (hasRedis) {
        try {
          await redisClient.sRem('universe:sp500', symbol);
          await redisClient.sRem('universe:pmp', symbol);
          // Delete cache keys
          const keys = await redisClient.keys(`*${symbol}*`);
          if (keys.length > 0) {
            await redisClient.del(keys);
          }
          console.log(`  [Redis] Cleaned up ${symbol}`);
        } catch (err) {
          console.warn(`  [Redis] Failed to cleanup ${symbol}:`, err);
        }
      }

      // 2. Delete from DB
      try {
        await prisma.ticker.delete({ where: { symbol } });
        console.log(`  [DB] Deleted ${symbol}`);
      } catch (err) {
        console.warn(`  [DB] Failed to delete ${symbol}:`, err);
      }
    }
    console.log('\n✅ Cleanup complete.');
  } else {
    console.log('\n📝 Dry-run complete. Run with --execute to perform cleanup.');
  }

  await prisma.$disconnect();
  if (hasRedis) await redisClient.disconnect();
}

main().catch(err => {
  console.error('\n❌ Fatal Error:', err);
  process.exit(1);
});
