/**
 * Script to check Redis rank keys and versions
 * Run: tsx scripts/check-redis-versions.ts
 */

import { redisClient } from '../src/lib/redis/client';
import { getDateET } from '../src/lib/redis/ranking';
import { detectSession, nowET } from '../src/lib/utils/timeUtils';

async function checkRedisVersions() {
  console.log('=== Checking Redis Rank Keys and Versions ===\n');

  try {
    if (!redisClient || !redisClient.isOpen) {
      console.error('❌ Redis not available');
      process.exit(1);
    }

    const date = getDateET();
    const etNow = nowET();
    const session = detectSession(etNow);

    console.log(`Date: ${date}`);
    console.log(`Session: ${session}\n`);

    // Check rank keys
    const rankPatterns = [
      `rank:capdiff:${date}:${session}:asc`,
      `rank:capdiff:${date}:${session}:desc`,
      `rank:chg:${date}:${session}:asc`,
      `rank:chg:${date}:${session}:desc`,
      `rank:price:${date}:${session}:asc`,
      `rank:price:${date}:${session}:desc`
    ];

    console.log('Rank Keys:');
    for (const pattern of rankPatterns) {
      const count = await redisClient.zCard(pattern);
      const version = await redisClient.get(`meta:${pattern}:v`);
      console.log(`  ${pattern}:`);
      console.log(`    Count: ${count} symbols`);
      console.log(`    Version: ${version || '0'}`);
    }
    console.log('');

    // Check stock hashes
    console.log('Stock Hashes (sample):');
    const sampleKeys = ['stock:AAPL', 'stock:MSFT', 'stock:GOOGL'];
    for (const key of sampleKeys) {
      const hash = await redisClient.hGetAll(key);
      if (hash && Object.keys(hash).length > 0) {
        console.log(`  ${key}:`, hash);
      } else {
        console.log(`  ${key}: (empty or not found)`);
      }
    }
    console.log('');

    console.log('=== Check Complete ===');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
  }
}

checkRedisVersions();

