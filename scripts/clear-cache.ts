/**
 * Script to clear all caches (Redis + in-memory)
 * Run: npx tsx scripts/clear-cache.ts
 */

// Load environment variables
try {
  const { config } = require('dotenv');
  const { resolve } = require('path');
  config({ path: resolve(process.cwd(), '.env.local') });
} catch (e) {
  // dotenv not available, continue without it
}

import { redisClient } from '@/lib/redis';
import { UnifiedCache } from '@/lib/unifiedCache';
import { clearAllCaches } from '@/lib/marketCapUtils';

async function main() {
  console.log('🧹 Starting cache cleanup...');
  
  try {
    // Clear UnifiedCache (Redis + in-memory)
    await UnifiedCache.clear();
    console.log('✅ UnifiedCache cleared');
    
    // Clear marketCapUtils caches (in-memory)
    clearAllCaches();
    console.log('✅ MarketCapUtils caches cleared');
    
    // Clear Redis if available
    if (redisClient && redisClient.isOpen) {
      try {
        // Clear all Redis keys
        const keys = await redisClient.keys('*');
        if (keys.length > 0) {
          await redisClient.del(keys);
          console.log(`✅ Cleared ${keys.length} Redis keys`);
        } else {
          console.log('✅ Redis is already empty');
        }
      } catch (redisError) {
        console.warn('⚠️ Redis clear error (may not be available):', redisError);
      }
    } else {
      console.log('⚠️ Redis not available - only in-memory cache cleared');
    }
    
    console.log('✅ Cache cleanup completed successfully');
    
  } catch (error) {
    console.error('❌ Cache cleanup error:', error);
    process.exit(1);
  } finally {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
    process.exit(0);
  }
}

main();

