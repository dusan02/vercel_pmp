/**
 * Universe management — startup refresh + periodic refresh from DB.
 *
 * Ensures all DB tickers are tracked in Redis universe:sp500 set.
 */

import { addToUniverse, getUniverse } from '@/lib/redis/operations';
import { redisClient } from '@/lib/redis';

/**
 * Refresh the ticker universe from DB at startup.
 * Falls back to hardcoded list if DB is unavailable.
 */
export async function refreshUniverseAtStartup(): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db/prisma');
    const dbTickers = await prisma.ticker.findMany({
      where: {},
      select: { symbol: true },
    });
    const startupTickers = dbTickers.map((t: { symbol: string }) => t.symbol);
    if (startupTickers.length > 0) {
      if (redisClient && redisClient.isOpen) {
        await redisClient.del('universe:sp500');
      }
      await addToUniverse('sp500', startupTickers);
      console.log(`✅ Startup: ${startupTickers.length} tickers from DB added to universe:sp500`);
    }
  } catch (error) {
    console.error('❌ Startup universe refresh failed, using fallback:', error);
    const { getAllProjectTickers } = await import('@/data/defaultTickers');
    const fallback = getAllProjectTickers('pmp');
    await addToUniverse('sp500', fallback);
    console.log(`✅ Fallback: ${fallback.length} tickers from defaultTickers added to universe:sp500`);
  }
}

/**
 * Refresh the ticker universe from DB (called periodically by refs scheduler).
 * Falls back to hardcoded list if DB is unavailable.
 */
export async function refreshUniverseFromDB(): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db/prisma');
    const dbTickers = await prisma.ticker.findMany({
      where: {},
      select: { symbol: true },
    });
    const tickers = dbTickers.map(t => t.symbol);
    console.log(`📊 Adding ${tickers.length} tickers from DB to universe:sp500...`);

    if (redisClient && redisClient.isOpen) {
      await redisClient.del('universe:sp500');
    }
    await addToUniverse('sp500', tickers);

    console.log(`✅ Universe refreshed: ${tickers.length} tickers from DB added to universe:sp500`);
  } catch (error) {
    console.error('❌ Error refreshing universe from DB:', error);
    try {
      const { getAllProjectTickers } = await import('@/data/defaultTickers');
      const tickers = getAllProjectTickers('pmp');
      await addToUniverse('sp500', tickers);
      console.log(`✅ Fallback: ${tickers.length} tickers from defaultTickers added to universe:sp500`);
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError);
    }
  }
}
