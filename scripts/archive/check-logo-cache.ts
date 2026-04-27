/**
 * Script to check Redis cache status for logos
 * Usage: npx tsx scripts/check-logo-cache.ts [ticker]
 */

import { redisClient, checkRedisHealth } from '../src/lib/redis/client';

async function checkLogoCache(ticker?: string) {
  console.log('🔍 Checking Redis cache for logos...\n');

  // 1. Check Redis health
  console.log('1. Redis Health Check:');
  const health = await checkRedisHealth();
  console.log(`   Status: ${health.status === 'healthy' ? '✅' : '❌'} ${health.status}`);
  console.log(`   Message: ${health.message}\n`);

  if (health.status !== 'healthy') {
    console.log('⚠️  Redis is not available. Logos will be loaded from external API or static files.\n');
    return;
  }

  // 2. Check if Redis client is open
  if (!redisClient || !redisClient.isOpen) {
    console.log('❌ Redis client is not connected\n');
    return;
  }

  // 3. Test specific ticker or sample tickers
  const testTickers = ticker ? [ticker.toUpperCase()] : ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
  const sizes = [32, 64];

  console.log(`2. Checking cache for ${testTickers.length} ticker(s):\n`);

  for (const symbol of testTickers) {
    console.log(`   📊 ${symbol}:`);
    
    for (const size of sizes) {
      // Check binary image cache
      const imgKey = `logo:img:${symbol}:${size}`;
      try {
        const cachedImg = await redisClient.get(imgKey);
        if (cachedImg) {
          const buffer = Buffer.isBuffer(cachedImg) ? cachedImg : Buffer.from(cachedImg);
          const sizeKB = (buffer.length / 1024).toFixed(2);
          console.log(`      ✅ Size ${size}px: Cached (${sizeKB} KB)`);
        } else {
          console.log(`      ❌ Size ${size}px: Not cached`);
        }
      } catch (error) {
        console.log(`      ⚠️  Size ${size}px: Error checking cache - ${error}`);
      }
    }

    // Check URL cache
    const urlKey = `logo:url:${symbol}`;
    try {
      const cachedUrl = await redisClient.get(urlKey);
      if (cachedUrl) {
        console.log(`      ✅ URL: Cached (${cachedUrl.toString().substring(0, 50)}...)`);
      } else {
        console.log(`      ❌ URL: Not cached`);
      }
    } catch (error) {
      console.log(`      ⚠️  URL: Error checking cache - ${error}`);
    }
    
    console.log('');
  }

  // 4. Get cache statistics
  console.log('3. Cache Statistics:');
  try {
    const keys = await redisClient.keys('logo:*');
    const imgKeys = keys.filter((k: string) => k.startsWith('logo:img:'));
    const urlKeys = keys.filter((k: string) => k.startsWith('logo:url:'));
    
    console.log(`   Total logo keys: ${keys.length}`);
    console.log(`   Image cache keys: ${imgKeys.length}`);
    console.log(`   URL cache keys: ${urlKeys.length}`);
    
    // Get TTL for sample keys
    if (imgKeys.length > 0) {
      const sampleKey = imgKeys[0];
      const ttl = await redisClient.ttl(sampleKey);
      if (ttl > 0) {
        const hours = Math.floor(ttl / 3600);
        const minutes = Math.floor((ttl % 3600) / 60);
        console.log(`   Sample TTL: ${hours}h ${minutes}m (${ttl}s remaining)`);
      } else {
        console.log(`   Sample TTL: Expired or no TTL`);
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Error getting statistics: ${error}`);
  }

  console.log('\n✅ Cache check complete!');
}

// Run the check
const ticker = process.argv[2];
checkLogoCache(ticker)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

