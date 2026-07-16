/**
 * Resolves previous close prices for batch ingestion.
 *
 * Lookup order:
 * 1. Redis (prevclose:YYYY-MM-DD:SYMBOL)
 * 2. DB DailyRef (if Redis empty)
 * 3. Polygon bootstrap (if still missing)
 *
 * Also handles:
 * - Static data lock checking
 * - Regular close loading (for after-hours % change)
 * - Frozen price loading (for overnight/weekend state)
 */

import { getPrevClose, setPrevClose } from '@/lib/redis/operations';
import { redisClient } from '@/lib/redis';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { getLastTradingDay, getTradingDay } from '@/lib/utils/timeUtils';
import { prisma } from '@/lib/db/prisma';
import { getPricingState } from '@/lib/utils/pricingStateMachine';

export type LockInfo = {
  isLocked: boolean;
  lockAgeSeconds: number;
};

/**
 * Check if static data update lock is held.
 * Returns lock status and age.
 */
export async function checkStaticLock(): Promise<LockInfo> {
  let isLocked = false;
  let lockAgeSeconds = 0;

  try {
    if (redisClient && redisClient.isOpen) {
      const lockKey = 'lock:static_data_update';
      const lockExists = await redisClient.exists(lockKey);
      isLocked = lockExists === 1;

      if (isLocked) {
        const lockValueStr = await redisClient.get(lockKey);
        if (lockValueStr) {
          try {
            const lockValue = JSON.parse(lockValueStr);
            if (lockValue.createdAt) {
              const now = Date.now();
              const createdAt = lockValue.createdAt;

              if (createdAt > now) {
                console.warn(`⚠️  Lock createdAt is in future (clock skew detected): createdAt=${new Date(createdAt).toISOString()}, now=${new Date(now).toISOString()}`);
                lockAgeSeconds = 0;
              } else {
                lockAgeSeconds = Math.floor((now - createdAt) / 1000);
              }
            } else {
              console.warn('⚠️  Lock exists but no createdAt timestamp (legacy format)');
              lockAgeSeconds = 0;
            }
          } catch (parseError) {
            console.warn('⚠️  Lock value not JSON (legacy format or poison value):', parseError instanceof Error ? parseError.message : 'unknown error');
            lockAgeSeconds = 0;
          }
        }

        if (lockAgeSeconds > 45 * 60) {
          console.error(`❌ STALE LOCK DETECTED: lock:static_data_update exists for ${Math.round(lockAgeSeconds / 60)} minutes (>45min threshold). This may indicate a crashed process.`);
        }

        if (lockAgeSeconds > 0) {
          console.log(`⚠️  Static data update in progress (lock age: ${Math.round(lockAgeSeconds / 60)}min) - percentages may need refresh after unlock`);
        } else {
          console.log(`⚠️  Static data update in progress - percentages may need refresh after unlock`);
        }
      }
    }
  } catch {
    // Non-fatal: continue if lock check fails
  }

  return { isLocked, lockAgeSeconds };
}

/**
 * Resolve previous close prices for a batch of tickers.
 * Lookup: Redis → DB → bootstrap fallback.
 */
export async function resolvePrevCloses(
  tickers: string[],
  calendarDateETStr: string,
  calendarDateET: Date,
  apiKey: string,
  isStaticUpdateLocked: boolean
): Promise<Map<string, number>> {
  const prevCloseMap = await getPrevClose(calendarDateETStr, tickers);

  // Fallback: load missing from DB
  const missingAfterRedis = tickers.filter(t => !prevCloseMap.has(t));
  if (missingAfterRedis.length > 0) {
    console.log(`⚠️ Missing previous close for ${missingAfterRedis.length} tickers in Redis, checking DB...`);
    try {
      const dailyRefs = await prisma.dailyRef.findMany({
        where: {
          symbol: { in: missingAfterRedis },
          date: calendarDateET
        },
        select: { symbol: true, previousClose: true }
      });

      if (dailyRefs.length > 0) {
        console.log(`✅ Loaded ${dailyRefs.length} previous closes from DB`);
        for (const ref of dailyRefs) {
          if (ref.previousClose && ref.previousClose > 0) {
            prevCloseMap.set(ref.symbol, ref.previousClose);
            await setPrevClose(calendarDateETStr, ref.symbol, ref.previousClose);
          }
        }
      }
    } catch (dbError) {
      console.error('Error loading previous closes from DB:', dbError);
    }
  }

  // Fallback: bootstrap from Polygon only for tickers still missing
  const missingPrevClose = tickers.filter(t => !prevCloseMap.has(t));
  if (!isStaticUpdateLocked && missingPrevClose.length > 0) {
    console.log(`⚠️ Missing previous close for ${missingPrevClose.length} tickers, attempting to fetch...`);
    const toFetch = missingPrevClose.slice(0, 50);
    const { bootstrapPreviousCloses } = await import('./bootstrapPrevClose');
    await bootstrapPreviousCloses(toFetch, apiKey, calendarDateETStr);

    const refreshedMap = await getPrevClose(calendarDateETStr, toFetch);
    refreshedMap.forEach((val, key) => prevCloseMap.set(key, val));
  }

  if (prevCloseMap.size === 0) {
    console.log('⚠️ Still no previous closes found, change % will be 0');
  } else {
    console.log(`✅ Using ${prevCloseMap.size} previous closes`);
  }

  return prevCloseMap;
}

/**
 * Load regular close prices from DB for after-hours/overnight % change.
 */
export async function loadRegularCloses(
  tickers: string[],
  calendarDateET: Date,
  session: string
): Promise<Map<string, number>> {
  const regularCloseMap = new Map<string, number>();
  if (session === 'after' || session === 'closed') {
    try {
      const dailyRefs = await prisma.dailyRef.findMany({
        where: {
          symbol: { in: tickers },
          date: calendarDateET
        },
        select: { symbol: true, regularClose: true }
      });
      dailyRefs.forEach(ref => {
        if (ref.regularClose && ref.regularClose > 0) {
          regularCloseMap.set(ref.symbol, ref.regularClose);
        }
      });
    } catch (error) {
      console.warn('Failed to load regular closes:', error);
    }
  }
  return regularCloseMap;
}

/**
 * Load frozen after-hours prices for overnight/weekend state.
 * Source of truth: last valid after-hours SessionPrice per symbol.
 */
export async function loadFrozenPrices(
  tickers: string[],
  useFrozenPrice: boolean
): Promise<Map<string, { price: number; timestamp: Date }>> {
  const frozenPricesMap = new Map<string, { price: number; timestamp: Date }>();
  if (!useFrozenPrice) return frozenPricesMap;

  try {
    const dateET = getDateET();
    const todayDate = createETDate(dateET);
    const frozenSessionPrices = await prisma.sessionPrice.findMany({
      where: {
        symbol: { in: tickers },
        date: todayDate,
        session: 'after',
        lastPrice: { gt: 0 }
      },
      select: { symbol: true, lastPrice: true, lastTs: true },
      orderBy: { lastTs: 'desc' }
    });
    const seenSymbols = new Set<string>();
    frozenSessionPrices.forEach(sp => {
      if (!seenSymbols.has(sp.symbol) && sp.lastPrice && sp.lastPrice > 0) {
        frozenPricesMap.set(sp.symbol, {
          price: sp.lastPrice,
          timestamp: sp.lastTs
        });
        seenSymbols.add(sp.symbol);
      }
    });
  } catch (error) {
    console.warn('Failed to load frozen prices:', error);
  }

  return frozenPricesMap;
}
