import { prisma } from '../src/lib/db/prisma';
import { redisClient } from '../src/lib/redis/client';

async function removeTickers(symbols: string[]) {
  console.log('🚀 Starting ticker removal...');

  for (const symbol of symbols) {
    console.log(`\nProcessing ${symbol}...`);

    try {
      // 1. Remove from Redis Universes
      try {
        if (redisClient && redisClient.isOpen) {
          await redisClient.sRem('universe:sp500', symbol);
          await redisClient.sRem('universe:pmp', symbol);
          
          const keys = [
            `last:pre:${symbol}`, `last:live:${symbol}`, `last:after:${symbol}`,
            `stock:${symbol}`
          ];
          
          for (const key of keys) {
              await redisClient.del(key);
          }

          // Remove from heatmaps
          for (const session of ['pre', 'live', 'after']) {
            await redisClient.zRem(`heatmap:${session}`, symbol);
            await redisClient.zRem(`rank:chg:${session}`, symbol);
            await redisClient.zRem(`rank:price:${session}`, symbol);
            await redisClient.zRem(`rank:cap:${session}`, symbol);
            await redisClient.zRem(`rank:capdiff:${session}`, symbol);
          }
          console.log(`  ✅ Removed from Redis`);
        } else {
          console.log(`  ℹ️ Redis not connected. Skipping Redis removal.`);
        }
      } catch (redisError: any) {
         console.warn(`  ⚠️ Redis error, continuing with DB: ${redisError.message}`);
      }

      // 2. Remove from DB
      await prisma.sessionPrice.deleteMany({ where: { symbol } });
      await prisma.dailyRef.deleteMany({ where: { symbol } });
      try {
        await prisma.moverEvent.deleteMany({ where: { symbol } });
      } catch (e) {
        // moverEvent might not exist
      }
      
      const tickerResult = await prisma.ticker.deleteMany({ where: { symbol } });
      
      console.log(`  ✅ Removed from DB (${tickerResult.count} ticker record)`);
    } catch (error: any) {
      console.error(`  ❌ Error processing ${symbol}: ${error.message}`);
    }
  }

  console.log('\n🎉 Removal finished!');
}

const symbolsToRemove = [
  'ARNS', 'MNDT', 'SJI', 'JWN', 'GPS', 'ATVI', 'PEAK', 'WRK', 'ANSS'
];

removeTickers(symbolsToRemove)
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
    process.exit(0);
  });
