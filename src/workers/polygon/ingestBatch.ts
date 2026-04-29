/**
 * Polygon Worker - Batch ingest stock data
 * 
 * This worker:
 * 1. Fetches snapshot/aggs from Polygon API (batch 60-80 tickers)
 * 2. Normalizes data
 * 3. Upserts to DB (only if newer timestamp)
 * 4. Writes to Redis (hot cache)
 * 5. Publishes to Redis Pub/Sub for WebSocket updates
 */

import {
  setPrevClose,
  getPrevClose,
  publishTick,
  getUniverse,
  addToUniverse,
  atomicUpdatePrice
} from '@/lib/redis/operations';
import { redisClient } from '@/lib/redis';
import { recordSuccess, recordFailure } from '../healthMonitor';
import { PriceData } from '@/lib/types';
import { detectSession, isMarketOpen, isMarketHoliday, mapToRedisSession, getLastTradingDay, getTradingDay } from '@/lib/utils/timeUtils';
import { nowET, getDateET, createETDate, isWeekendET, toET } from '@/lib/utils/dateET';
import { resolveEffectivePrice, calculatePercentChange } from '@/lib/utils/priceResolver';
import { getPricingState, canOverwritePrice, getPreviousCloseTTL, PriceState } from '@/lib/utils/pricingStateMachine';
import { withRetry, circuitBreaker } from '@/lib/api/rateLimiter';
// DLQ import - commented out to avoid startup issues
// import { addToDLQ } from '@/lib/dlq';
import { updateRankIndexes, updateStatsCache, getRankMinMax } from '@/lib/redis/ranking';
import { computeMarketCap, computeMarketCapDiff, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { getPolygonClient } from '@/lib/clients/polygonClient';
import { prisma } from '@/lib/db/prisma';
import { processBatchWithConcurrency } from '@/lib/batchProcessor';
import type { MarketSession } from '@/lib/types';

// Circuit breaker for Polygon API
import { polygonCircuitBreaker, __IS_TEST__, sleep, PolygonSnapshot, IngestResult } from './shared';
import { fetchPolygonSnapshot, normalizeSnapshot, upsertToDB } from './core';
import { saveRegularClose } from './saveRegularClose';
export async function ingestBatch(
  tickers: string[],
  apiKey: string,
  force: boolean = false
): Promise<IngestResult[]> {
  const now = nowET();
  const pricingStateAtStart = getPricingState(now);

  // Respect state machine: e.g. overnight/weekend frozen should not ingest (no API calls)
  // UNLESS force=true (for manual ingest)
  if (!pricingStateAtStart.canIngest && !force) {
    return tickers.map(symbol => ({
      symbol,
      price: 0,
      changePct: 0,
      timestamp: now,
      quality: 'rest',
      success: false,
      error: `Ingest disabled by pricing state: ${pricingStateAtStart.state}`
    }));
  }

  const session = detectSession(now);
  // CRITICAL: getDateET() returns CALENDAR date in ET, not trading date
  const calendarDateETStr = getDateET(now); // YYYY-MM-DD calendar date in ET
  const calendarDateET = createETDate(calendarDateETStr);

  // For prevClose lookup: key by CALENDAR ET date.
  // prevClose(Mon) should be Fri close; prevClose(Tue) should be Mon close, etc.
  const todayTradingDay = getTradingDay(calendarDateET);
  const prevTradingDay = getLastTradingDay(todayTradingDay); // strictly previous trading day

  const results: IngestResult[] = [];

  // Check if static data update is in progress (lock)
  // If locked, we'll still normalize but mark as needing refresh
  let isStaticUpdateLocked = false;
  let lockAgeSeconds = 0;
  try {
    const { redisClient } = await import('@/lib/redis');
    if (redisClient && redisClient.isOpen) {
      const lockKey = 'lock:static_data_update';
      const lockExists = await redisClient.exists(lockKey);
      isStaticUpdateLocked = lockExists === 1;

      if (isStaticUpdateLocked) {
        // Check lock age from createdAt timestamp (not TTL!)
        // TTL is time until expiration, not time since creation
        const lockValueStr = await redisClient.get(lockKey);
        if (lockValueStr) {
          try {
            const lockValue = JSON.parse(lockValueStr);
            if (lockValue.createdAt) {
              const now = Date.now();
              const createdAt = lockValue.createdAt;

              // Guard: clock skew detection (createdAt in future)
              if (createdAt > now) {
                console.warn(`⚠️  Lock createdAt is in future (clock skew detected): createdAt=${new Date(createdAt).toISOString()}, now=${new Date(now).toISOString()}`);
                lockAgeSeconds = 0; // Ignore invalid timestamp
              } else {
                lockAgeSeconds = Math.floor((now - createdAt) / 1000);
              }
            } else {
              // Legacy format - cannot determine age, log warning
              console.warn('⚠️  Lock exists but no createdAt timestamp (legacy format)');
              lockAgeSeconds = 0;
            }
          } catch (parseError) {
            // Legacy format (plain string) or poison value - cannot determine age
            console.warn('⚠️  Lock value not JSON (legacy format or poison value):', parseError instanceof Error ? parseError.message : 'unknown error');
            lockAgeSeconds = 0; // Safe default: continue with degraded mode
          }
        }

        if (lockAgeSeconds > 45 * 60) { // > 45 minutes
          console.error(`❌ STALE LOCK DETECTED: lock:static_data_update exists for ${Math.round(lockAgeSeconds / 60)} minutes (>45min threshold). This may indicate a crashed process.`);
        }

        if (lockAgeSeconds > 0) {
          console.log(`⚠️  Static data update in progress (lock age: ${Math.round(lockAgeSeconds / 60)}min) - percentages may need refresh after unlock`);
        } else {
          console.log(`⚠️  Static data update in progress - percentages may need refresh after unlock`);
        }
      }
    }
  } catch (error) {
    // Non-fatal: continue if lock check fails
  }

  // Fetch previous closes from Redis (keyed by calendar date)
  const prevCloseMap = await getPrevClose(calendarDateETStr, tickers);

  // If no previous closes in Redis, try to load from DB
  // DailyRef(date=calendarDateET).previousClose = close(prevTradingDay)
  if (prevCloseMap.size === 0) {
    console.log('⚠️ No previous closes found in Redis, checking DB...');
    try {
      const dailyRefs = await prisma.dailyRef.findMany({
        where: {
          symbol: { in: tickers },
          date: calendarDateET
        },
        select: { symbol: true, previousClose: true }
      });

      if (dailyRefs.length > 0) {
        console.log(`✅ Loaded ${dailyRefs.length} previous closes from DB`);
        for (const ref of dailyRefs) {
          prevCloseMap.set(ref.symbol, ref.previousClose);
          // Also update Redis cache (keyed by calendar date)
          await setPrevClose(calendarDateETStr, ref.symbol, ref.previousClose);
        }
      }
    } catch (dbError) {
      console.error('Error loading previous closes from DB:', dbError);
    }
  }

  // If still missing previous closes, try to fetch from Polygon (even if market closed)
  // This handles the case where Redis/DB are empty after restart
  // CRITICAL: Worker percentá len keď prevCloseMap existuje (z Redis alebo DB)
  // This is a hard invariant: never calculate percentages with null references
  const missingPrevClose = tickers.filter(t => !prevCloseMap.has(t));
  if (!isStaticUpdateLocked && missingPrevClose.length > 0) {
    console.log(`⚠️ Missing previous close for ${missingPrevClose.length} tickers, attempting to fetch...`);
    // Only fetch a few to avoid rate limits if many are missing
    const toFetch = missingPrevClose.slice(0, 50);
    // Dynamic import to break circular dependency (bootstrapPrevClose.ts imports ingestBatch)
    const { bootstrapPreviousCloses } = await import('./bootstrapPrevClose');
    await bootstrapPreviousCloses(toFetch, apiKey, calendarDateETStr);

    // Reload map after bootstrap (keyed by calendar date)
    const refreshedMap = await getPrevClose(calendarDateETStr, toFetch);
    refreshedMap.forEach((val, key) => prevCloseMap.set(key, val));
  }

  if (prevCloseMap.size === 0) {
    console.log('⚠️ Still no previous closes found, change % will be 0');
  } else {
    console.log(`✅ Using ${prevCloseMap.size} previous closes`);
  }

  // Fetch snapshots from Polygon
  console.log(`📥 Fetching snapshots for ${tickers.length} tickers...`);
  const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
  console.log(`✅ Received ${snapshots.length} snapshots`);

  // Batch fetch sharesOutstanding pre všetky tickery naraz (optimalizácia)
  const symbolsNeedingShares = snapshots.map(s => s.ticker).filter(symbol => {
    // Fetch len ak nemáme previousClose (inak už máme dáta)
    return !prevCloseMap.has(symbol);
  });

  const sharesMap = new Map<string, number>();
  if (symbolsNeedingShares.length > 0) {
    console.log(`🔄 Batch fetching sharesOutstanding for ${symbolsNeedingShares.length} tickers...`);
    const sharesPromises = symbolsNeedingShares.map(async (symbol) => {
      try {
        const shares = await getSharesOutstanding(symbol);
        return { symbol, shares };
      } catch (error) {
        console.warn(`Failed to fetch shares for ${symbol}:`, error);
        return { symbol, shares: 0 };
      }
    });

    const sharesResults = await Promise.all(sharesPromises);
    sharesResults.forEach(({ symbol, shares }) => {
      if (shares > 0) {
        sharesMap.set(symbol, shares);
      }
    });
    console.log(`✅ Batch fetched ${sharesMap.size} sharesOutstanding values`);
  }

  // Get pricing state (for freeze mechanism)
  const pricingState = pricingStateAtStart;

  // Get regular close for after-hours/overnight percent change calculation
  const regularCloseMap = new Map<string, number>();
  if (session === 'after' || session === 'closed') {
    try {
      const dailyRefs = await prisma.dailyRef.findMany({
        where: {
          symbol: { in: tickers },
          date: calendarDateET // Use calendarDateET for regularClose lookup (today's date)
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

  // Get frozen after-hours prices (if in overnight/weekend state)
  // FROZEN PRICE SOURCE OF TRUTH: Last valid after-hours price per symbol (deterministic)
  const frozenPricesMap = new Map<string, { price: number; timestamp: Date }>();
  if (pricingState.useFrozenPrice) {
    try {
      const dateET = getDateET();
      // DST-safe: Use createETDate helper, not new Date(dateET + 'T00:00:00')
      const { createETDate } = await import('@/lib/utils/dateET');
      const todayDate = createETDate(dateET);
      const frozenSessionPrices = await prisma.sessionPrice.findMany({
        where: {
          symbol: { in: tickers },
          date: todayDate,
          session: 'after',
          lastPrice: { gt: 0 } // INVARIANT: Only valid prices
        },
        select: { symbol: true, lastPrice: true, lastTs: true },
        orderBy: { lastTs: 'desc' } // Get most recent first
      });
      // CRITICAL: Take FIRST (most recent) per symbol, not global top 1
      const seenSymbols = new Set<string>();
      frozenSessionPrices.forEach(sp => {
        if (!seenSymbols.has(sp.symbol) && sp.lastPrice && sp.lastPrice > 0) {
          frozenPricesMap.set(sp.symbol, {
            price: sp.lastPrice,
            timestamp: sp.lastTs
          });
          seenSymbols.add(sp.symbol); // Ensure deterministic: one price per symbol
        }
      });
    } catch (error) {
      console.warn('Failed to load frozen prices:', error);
    }
  }

  // OPTIMIZATION: Batch fetch lastChangePct for all tickers in batch (if locked)
  // This avoids per-ticker DB queries during lock
  const lastChangePctMap = new Map<string, number | null>();
  if (isStaticUpdateLocked) {
    try {
      const tickersWithChangePct = await prisma.ticker.findMany({
        where: {
          symbol: { in: tickers }
        },
        select: {
          symbol: true,
          lastChangePct: true
        }
      });
      tickersWithChangePct.forEach(t => {
        lastChangePctMap.set(t.symbol, t.lastChangePct);
      });
      console.log(`📊 Batch loaded lastChangePct for ${lastChangePctMap.size} tickers (lock optimization)`);
    } catch (error) {
      console.warn('⚠️  Failed to batch load lastChangePct, will fallback to per-ticker queries:', error);
    }
  }

  // OPTIMIZATION: Batch fetch statistical baselines for Movers
  const statsMap = new Map<string, { avgVolume20d: number | null; avgReturn20d: number | null; stdDevReturn20d: number | null }>();
  try {
    const tickerStats = await prisma.ticker.findMany({
      where: { symbol: { in: tickers } },
      select: {
        symbol: true,
        avgVolume20d: true,
        avgReturn20d: true,
        stdDevReturn20d: true,
      }
    });
    tickerStats.forEach(s => statsMap.set(s.symbol, s));
  } catch (error) {
    console.warn('⚠️  Failed to batch load statistical baselines:', error);
  }
  // Process each snapshot in parallel with limited concurrency (optimization)
  const redisSession = mapToRedisSession(session);
  const dateStr = getDateET();

  const batchResults = await processBatchWithConcurrency(
    snapshots,
    async (snapshot): Promise<IngestResult> => {
      const symbol = snapshot.ticker;
      const previousClose = prevCloseMap.get(symbol) || null;
      const regularClose = regularCloseMap.get(symbol) || null;
      const frozenPrice = frozenPricesMap.get(symbol);

      if (symbol === 'GOOG' || symbol === 'GOOGL') {
        console.log(`🔍 Debug ${symbol}:`);
        console.log(`   PrevClose=${previousClose}, RegularClose=${regularClose}, FrozenPrice=${frozenPrice?.price || 'none'}`);
        console.log(`   Snapshot: day.c=${snapshot.day?.c || 'N/A'}, min.c=${snapshot.min?.c || 'N/A'}, lastTrade.p=${snapshot.lastTrade?.p || 'N/A'}`);
        console.log(`   Session=${session}, Force=${force}`);
      }

      try {
        // Normalize using session-aware resolver
        const normalized = normalizeSnapshot(
          snapshot,
          previousClose,
          regularClose,
          session,
          frozenPrice,
          force
        );

        if (isStaticUpdateLocked && !previousClose && normalized) {
          console.log(`⚠️  ${symbol}: Normalized during lock without prevClose - % may be 0`);
        }

        if (!normalized) {
          if (symbol === 'GOOG' || symbol === 'GOOGL') {
            console.log(`   ❌ normalizeSnapshot returned null for ${symbol}`);
          }
          return {
            symbol,
            price: 0,
            changePct: 0,
            timestamp: new Date(),
            quality: 'snapshot',
            success: false,
            error: 'No price data'
          };
        }

        // Get batch-fetched shares
        let shares = sharesMap.get(symbol) || 0;
        if (shares === 0) {
          shares = await getSharesOutstanding(symbol, normalized.price);
        }

        const marketCap = computeMarketCap(normalized.price, shares);
        const marketCapDiff = previousClose
          ? computeMarketCapDiff(normalized.price, previousClose, shares)
          : 0;

        const cachedLastChangePct = lastChangePctMap.get(symbol);
        const stats = statsMap.get(symbol);
        const { success: dbSuccess, effectiveChangePct, zScore, rvol } = await upsertToDB(
          symbol, session, normalized, previousClose, marketCap, marketCapDiff, isStaticUpdateLocked, cachedLastChangePct, stats, force
        );

        const priceData: PriceData = {
          p: normalized.price,
          change: effectiveChangePct,
          ts: normalized.timestamp.getTime(),
          source: normalized.quality,
          quality: normalized.quality
        };

        // Atomic update: last price + heatmap
        await atomicUpdatePrice(redisSession, symbol, priceData, effectiveChangePct);

        // Get ticker info for name/sector
        const ticker = await prisma.ticker.findUnique({
          where: { symbol },
          select: { name: true, sector: true, industry: true }
        });

        // Update rank indexes
        await updateRankIndexes(dateStr, redisSession, {
          symbol,
          price: normalized.price,
          marketCap,
          marketCapDiff,
          changePct: effectiveChangePct,
          name: ticker?.name ?? undefined,
          sector: ticker?.sector ?? undefined,
          industry: ticker?.industry ?? undefined,
          zscore: zScore,
          rvol: rvol
        }, false);

        // Check and update stats cache (min/max)
        const checkAndUpdateStats = async (field: 'price' | 'cap' | 'capdiff' | 'chg', value: number) => {
          const currentStats = await getRankMinMax(dateStr, redisSession, field);
          const min = currentStats.min;
          const max = currentStats.max;
          const isMin = !min || value < min.v;
          const isMax = !max || value > max.v;
          if (isMin || isMax) {
            await updateStatsCache(dateStr, redisSession, field, symbol, value, isMin, isMax);
          }
        };

        await Promise.all([
          checkAndUpdateStats('price', normalized.price),
          checkAndUpdateStats('cap', marketCap),
          checkAndUpdateStats('capdiff', marketCapDiff),
          checkAndUpdateStats('chg', Math.round(effectiveChangePct * 10000))
        ]);

        await publishTick(symbol, redisSession, priceData);

        return {
          symbol,
          price: normalized.price,
          changePct: effectiveChangePct,
          timestamp: normalized.timestamp,
          quality: normalized.quality,
          success: dbSuccess
        };
      } catch (error) {
        console.error(`Error processing ${symbol}:`, error);
        return {
          symbol,
          price: 0,
          changePct: 0,
          timestamp: new Date(),
          quality: 'snapshot',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },
    15 // Concurrency limit: 15 tickers in parallel
  );

  results.push(...batchResults);

  return results;
}

/**
 * Bootstrap previous closes (run at 04:00 ET)
 */