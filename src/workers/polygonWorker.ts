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
import { PriceData } from '@/lib/types';
import { detectSession, isMarketOpen, isMarketHoliday, mapToRedisSession, getLastTradingDay, getTradingDay } from '@/lib/utils/timeUtils';
import { nowET, getDateET, createETDate, isWeekendET, toET } from '@/lib/utils/dateET';
import { resolveEffectivePrice, calculatePercentChange } from '@/lib/utils/priceResolver';
import { getPricingState, canOverwritePrice, getPreviousCloseTTL } from '@/lib/utils/pricingStateMachine';
import { withRetry, circuitBreaker } from '@/lib/api/rateLimiter';
// DLQ import - commented out to avoid startup issues
// import { addToDLQ } from '@/lib/dlq';
import { updateRankIndexes, updateStatsCache, getRankMinMax } from '@/lib/redis/ranking';
import { computeMarketCap, computeMarketCapDiff, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { prisma } from '@/lib/db/prisma';
import type { MarketSession } from '@/lib/types';

// Circuit breaker for Polygon API
const polygonCircuitBreaker = circuitBreaker('polygon', 5, 2, 60000);

// In tests we must not wait for rate-limit sleeps (keeps integration tests fast & deterministic)
const __IS_TEST__ = process.env.NODE_ENV === 'test';
const sleep = (ms: number) => (__IS_TEST__ ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms)));

interface PolygonSnapshot {
  ticker: string;
  day?: {
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
  };
  prevDay?: {
    c: number; // previous close
  };
  min?: {
    av: number; // average price
    t: number; // timestamp
    c?: number; // close price (for pre-market/after-hours)
    o?: number; // open price
    h?: number; // high price
    l?: number; // low price
    v?: number; // volume
  };
  lastQuote?: {
    p: number; // price
    t: number; // timestamp
  };
  lastTrade?: {
    p: number; // price
    t: number; // timestamp
  };
}

interface IngestResult {
  symbol: string;
  price: number;
  changePct: number;
  timestamp: Date;
  quality: 'delayed_15m' | 'rest' | 'snapshot';
  success: boolean;
  error?: string;
}

/**
 * Fetch snapshot data from Polygon API (batch) with retry and circuit breaker
 */
async function fetchPolygonSnapshot(
  tickers: string[],
  apiKey: string
): Promise<PolygonSnapshot[]> {
  // Check circuit breaker
  if (polygonCircuitBreaker.isOpen) {
    console.warn('⚠️ Polygon circuit breaker is OPEN, skipping API calls');
    return [];
  }

  const batchSize = 60; // Polygon allows up to 100, but we use 60 for safety
  const results: PolygonSnapshot[] = [];

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const tickersParam = batch.join(',');

    try {
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${apiKey}`;

      const response = await withRetry(async () => {
        const res = await fetch(url);
        if (!res.ok && res.status === 429) {
          throw new Error(`Rate limited: ${res.status}`);
        }
        return res;
      });

      if (!response.ok) {
        polygonCircuitBreaker.recordFailure();
        console.error(`Polygon API error: ${response.status} ${response.statusText}`);
        continue;
      }

      polygonCircuitBreaker.recordSuccess();
      const data = await response.json();
      // Polygon returns 'tickers' array, not 'results'
      if (data.tickers && Array.isArray(data.tickers)) {
        results.push(...data.tickers);
      } else if (data.results && Array.isArray(data.results)) {
        // Fallback for other endpoints
        results.push(...data.results);
      }

      // Rate limiting: Polygon free tier allows 5 calls/minute
      if (i + batchSize < tickers.length) {
        await sleep(15000); // 15s delay
      }
    } catch (error) {
      polygonCircuitBreaker.recordFailure();
      console.error(`Error fetching batch ${i}-${i + batchSize}:`, error);
    }
  }

  return results;
}

/**
 * Normalize Polygon snapshot to our data structure
 * 
 * CRITICAL: Now uses session-aware price resolver to prevent stale data overwrites
 * 
 * INVARIANTS:
 * - Never returns price <= 0 (returns null instead)
 * - Always uses adjusted=true aggregates for previousClose
 * - Returns reference info for UI display
 */
function normalizeSnapshot(
  snapshot: PolygonSnapshot,
  previousClose: number | null,
  regularClose: number | null,
  session: 'pre' | 'live' | 'after' | 'closed',
  frozenAfterHoursPrice?: { price: number; timestamp: Date },
  force: boolean = false
): {
  price: number;
  changePct: number;
  timestamp: Date;
  quality: 'delayed_15m' | 'rest' | 'snapshot';
  source: string;
  isStale: boolean;
  reference: { used: 'previousClose' | 'regularClose' | null; price: number | null };
} | null {
  // Use session-aware price resolver (SINGLE SOURCE OF TRUTH)
  const effectivePrice = resolveEffectivePrice(
    snapshot,
    session,
    nowET(),
    frozenAfterHoursPrice,
    force
  );

  // INVARIANT: Never return price <= 0
  if (!effectivePrice || effectivePrice.price <= 0) {
    return null;
  }

  // Calculate change percentage based on session rules (returns reference info)
  const percentResult = calculatePercentChange(
    effectivePrice.price,
    session,
    previousClose,
    regularClose
  );

  // Determine quality based on source and staleness
  let quality: 'delayed_15m' | 'rest' | 'snapshot' = 'rest';
  if (effectivePrice.isStale) {
    quality = 'delayed_15m';
  } else if (process.env.POLYGON_PLAN === 'starter') {
    quality = 'delayed_15m';
  }

  return {
    price: effectivePrice.price,
    changePct: percentResult.changePct,
    timestamp: effectivePrice.timestamp,
    quality,
    source: effectivePrice.source,
    isStale: effectivePrice.isStale,
    reference: percentResult.reference
  };
}

/**
 * Upsert to database (only if newer timestamp)
 */
async function upsertToDB(
  symbol: string,
  session: MarketSession,
  normalized: ReturnType<typeof normalizeSnapshot>,
  previousClose: number | null,
  marketCap: number,
  marketCapDiff: number,
  isStaticUpdateLocked: boolean = false,
  lastChangePctFromCache: number | null | undefined = undefined
): Promise<{ success: boolean; effectiveChangePct: number }> {
  if (!normalized) return { success: false, effectiveChangePct: 0 };

  try {
    // CRITICAL: Use getDateET() for date, not UTC midnight!
    const dateET = getDateET(); // YYYY-MM-DD string in ET
    const today = createETDate(dateET); // ET midnight (DST-safe)

    // Get last trading day for previousClose date
    const lastTradingDay = getLastTradingDay();

    // 1. Fetch existing ticker to check staleness and preserve data
    const existingTicker = await prisma.ticker.findUnique({
      where: { symbol },
      select: {
        lastPriceUpdated: true,
        lastChangePct: true,
        latestPrevClose: true,
        // Fetch other fields if we need to merge? (Usually not needed for this logic)
      }
    });

    // 2. Staleness Check
    // If we have an existing price update that is NEWER than the incoming snapshot,
    // we should NOT overwrite the price/change/diff.
    // However, if previousClose is provided, we might still want to update that?
    // Generally, snapshots usually come in order, but forceful ingest or racing workers can cause out-of-order.
    let skipPriceUpdate = false;
    if (existingTicker?.lastPriceUpdated && normalized.timestamp < existingTicker.lastPriceUpdated) {
      if (!isStaticUpdateLocked) {
        // Only log if not locked (during lock we might be reprocessing old data intentionally?)
        // Actually, even in lock, we shouldn't overwrite new data with old data.
        console.log(`⏭️ Skipping price update for ${symbol} - incoming data is older (${normalized.timestamp.toISOString()} < ${existingTicker.lastPriceUpdated.toISOString()})`);
      }
      skipPriceUpdate = true;
    }

    // 3. Resolve Change Pct to Use
    // If we have a valid reference, use the calculated changePct.
    // If NOT (e.g. no prevClose), try to preserve existing changePct from DB or cache.
    let changePctToUse = normalized.changePct;
    const hasValidReference = normalized.reference && normalized.reference.used !== null;

    if (!hasValidReference) {
      // Logic from original code "isStaticUpdateLocked && !previousClose" extended to general case
      // If we computed 0% because of missing reference, DO NOT SAVE 0%.
      // Use cached value or existing DB value.
      if (lastChangePctFromCache !== undefined && lastChangePctFromCache !== null) {
        changePctToUse = lastChangePctFromCache;
      } else if (existingTicker?.lastChangePct !== null && existingTicker?.lastChangePct !== undefined) {
        changePctToUse = existingTicker.lastChangePct;
      }

      // Log limits: only if it changed significantly or first time
      // console.log(`⚠️ ${symbol}: No reference price (prevClose=${previousClose}), preserving lastChangePct=${changePctToUse}`);
    }

    // If skipping price update, forced to use existing pct (so we return the correct "current" pct)
    if (skipPriceUpdate && existingTicker?.lastChangePct !== null && existingTicker?.lastChangePct !== undefined) {
      changePctToUse = existingTicker.lastChangePct;
    }

    // 4. Perform Upsert (conditional based on staleness)
    // We always want to upsert to ensure the "Ticker" record exists (create case),
    // but update only minimal fields if stale.

    if (skipPriceUpdate) {
      // Only update "static" or non-price fields if needed, OR just ensure existence.
      // For now, if price is skipped, we basically do nothing for the Ticker update 
      // regarding price, but we might check if we need to update previousClose?
      // Let's assume if price is old, everything in this snapshot is old.
      // BUT, we might be here just to update 'latestPrevClose' if we learned it recently?
      // upsertToDB is mainly driven by snapshot ingest.

      // If it's a "create" case (existingTicker is null), skipPriceUpdate is false.
      // So here existingTicker is NOT null.

      // Maybe just update Reference info if provided?
      if (previousClose && existingTicker && (!existingTicker.latestPrevClose || previousClose !== existingTicker.latestPrevClose)) {
        await prisma.ticker.update({
          where: { symbol },
          data: {
            latestPrevClose: previousClose,
            latestPrevCloseDate: lastTradingDay,
            updatedAt: new Date()
          }
        });
      }

      // Return existing change pct as the "effective" one
      return { success: true, effectiveChangePct: changePctToUse };
    }

    // Standard Upsert (New Data or Create)
    await prisma.ticker.upsert({
      where: { symbol },
      update: {
        updatedAt: new Date(),
        lastPrice: normalized.price,
        lastChangePct: changePctToUse,
        lastMarketCap: marketCap,
        lastMarketCapDiff: marketCapDiff,
        lastPriceUpdated: normalized.timestamp,
        ...(previousClose ? {
          latestPrevClose: previousClose,
          latestPrevCloseDate: lastTradingDay
        } : {})
      },
      create: {
        symbol,
        updatedAt: new Date(),
        lastPrice: normalized.price,
        lastChangePct: changePctToUse,
        lastMarketCap: marketCap,
        lastMarketCapDiff: marketCapDiff,
        lastPriceUpdated: normalized.timestamp,
        latestPrevClose: previousClose || 0,
        latestPrevCloseDate: previousClose ? lastTradingDay : null
      }
    });

    // Upsert session price (SessionPrice)
    // Same logic: check staleness against SessionPrice table
    const pricingState = getPricingState(nowET());
    const existingSession = await prisma.sessionPrice.findUnique({
      where: { symbol_date_session: { symbol, date: today, session } }
    });

    const sessionCanOverwrite = existingSession && existingSession.lastPrice && existingSession.lastPrice > 0
      ? canOverwritePrice(
        pricingState,
        { price: existingSession.lastPrice, timestamp: existingSession.lastTs, session: existingSession.session },
        { price: normalized.price, timestamp: normalized.timestamp }
      )
      : true;

    if (sessionCanOverwrite && (!existingSession || normalized.timestamp >= existingSession.lastTs)) {
      await prisma.sessionPrice.upsert({
        where: { symbol_date_session: { symbol, date: today, session } },
        update: {
          lastPrice: normalized.price,
          lastTs: normalized.timestamp,
          changePct: changePctToUse, // Use the resolved pct
          source: normalized.quality,
          quality: normalized.quality,
          updatedAt: new Date()
        },
        create: {
          symbol, date: today, session,
          lastPrice: normalized.price,
          lastTs: normalized.timestamp,
          changePct: changePctToUse, // Use the resolved pct
          source: normalized.quality,
          quality: normalized.quality
        }
      });
    }

    // Upsert daily ref if previous close is available
    if (previousClose) {
      await prisma.dailyRef.upsert({
        where: { symbol_date: { symbol, date: today } },
        update: { previousClose, updatedAt: new Date() },
        create: { symbol, date: today, previousClose }
      });
    }

    return { success: true, effectiveChangePct: changePctToUse };
  } catch (error) {
    console.error(`Error upserting ${symbol} to DB:`, error);
    return { success: false, effectiveChangePct: normalized ? normalized.changePct : 0 };
  }
}

/**
 * Save regular close prices (16:00 ET)
 * 
 * CRITICAL: regularClose must be adjusted (same as previousClose)
 * Polygon snapshot day.c is already adjusted, so we use it directly
 */
async function saveRegularClose(apiKey: string, date: string, runId?: string): Promise<void> {
  const correlationId = runId || Date.now().toString(36);
  try {
    console.log(`💾 [runId:${correlationId}] Starting regular close save...`);

    // IDEMPOTENCY: Check if already saved for today (avoid unnecessary Polygon API calls)
    const calendarDateETStr = getDateET();
    const calendarDateET = createETDate(calendarDateETStr);
    const todayTradingDay = getTradingDay(calendarDateET);

    const existingRegularClose = await prisma.dailyRef.findFirst({
      where: {
        date: todayTradingDay,
        regularClose: { not: null }
      },
      select: { symbol: true }
    });

    if (existingRegularClose) {
      console.log(`⏭️  [runId:${correlationId}] Skipping saveRegularClose - already saved for ${getDateET(todayTradingDay)} (idempotent check, saved for ${existingRegularClose.symbol})`);
      return;
    }

    const tickers = await getUniverse('sp500');

    if (tickers.length === 0) {
      console.warn('⚠️ No tickers in universe, skipping regular close save');
      return;
    }

    console.log(`📊 [runId:${correlationId}] Fetching regular close for ${tickers.length} tickers...`);
    const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
    console.log(`✅ [runId:${correlationId}] Received ${snapshots.length} snapshots`);

    // DST-safe date creation (reuse variables from idempotency check above)
    // calendarDateETStr, calendarDateET, todayTradingDay already defined above

    // CRITICAL: Use nextTradingDay, not calendar tomorrow!
    // This handles weekends/holidays correctly (Friday -> Monday, not Friday -> Saturday)
    const { getNextTradingDay } = await import('@/lib/utils/pricingStateMachine');
    const nextTradingDay = getNextTradingDay(todayTradingDay);
    const nextTradingDateStr = getDateET(nextTradingDay);
    const nextTradingDateObj = createETDate(nextTradingDateStr);

    let saved = 0;
    let prevCloseUpdated = 0;
    for (const snapshot of snapshots) {
      try {
        const symbol = snapshot.ticker;
        // Get regular close from snapshot (day.c is the regular session close)
        // Polygon snapshot day.c is already adjusted (split-adjusted)
        const regularClose = snapshot.day?.c;

        // INVARIANT: Only save valid prices
        if (regularClose && regularClose > 0) {
          // Update DailyRef with regular close (for today's trading day)
          await prisma.dailyRef.upsert({
            where: {
              symbol_date: {
                symbol,
                date: todayTradingDay
              }
            },
            update: {
              regularClose
            },
            create: {
              symbol,
              date: todayTradingDay,
              previousClose: regularClose, // Fallback if previousClose not set
              regularClose
            }
          });
          saved++;

          // CRITICAL: Update previousClose for nextTradingDay (Model A)
          // Model A: prevCloseKey(nextTradingDay) = close(todayTradingDay)
          // This ensures pre-market next trading day uses today's regularClose as reference
          try {
            // INVARIANT: nextTradingDay must be a trading day (not weekend/holiday)
            const nextTradingDayET = toET(nextTradingDay);
            const isNextTradingDayValid = nextTradingDayET.weekday !== 0 &&
              nextTradingDayET.weekday !== 6 &&
              !isMarketHoliday(nextTradingDay);

            if (!isNextTradingDayValid) {
              console.error(`❌ INVARIANT VIOLATION: nextTradingDay ${nextTradingDateStr} is not a valid trading day!`);
              throw new Error(`nextTradingDay ${nextTradingDateStr} is not a valid trading day`);
            }

            // Update DailyRef for nextTradingDay - nextTradingDay's previousClose = today's regularClose
            await prisma.dailyRef.upsert({
              where: {
                symbol_date: {
                  symbol,
                  date: nextTradingDateObj
                }
              },
              update: {
                previousClose: regularClose,
                updatedAt: new Date()
              },
              create: {
                symbol,
                date: nextTradingDateObj,
                previousClose: regularClose
              }
            });

            // CRITICAL: Redis cache uses Model A: prevCloseKey(date) = close(date-1)
            // For nextTradingDay, prevClose(nextTradingDay) = close(todayTradingDay) = today's regularClose
            await setPrevClose(nextTradingDateStr, symbol, regularClose);

            // Update Ticker.latestPrevClose and latestPrevCloseDate
            // This is the denormalized field used by heatmap API
            // The date should be todayTradingDay (when the close happened)
            await prisma.ticker.update({
              where: { symbol },
              data: {
                latestPrevClose: regularClose,
                latestPrevCloseDate: todayTradingDay, // Today's trading day (when close happened)
                updatedAt: new Date()
              }
            });

            prevCloseUpdated++;
          } catch (prevCloseError) {
            // Non-fatal: log but continue
            console.warn(`⚠️ Failed to update previousClose for ${symbol} (nextTradingDay: ${nextTradingDateStr}):`, prevCloseError);
          }
        }
      } catch (error) {
        console.error(`Error saving regular close for ${snapshot.ticker}:`, error);
      }
    }

    console.log(`✅ [runId:${correlationId}] Saved regular close for ${saved}/${snapshots.length} tickers`);
    console.log(`✅ [runId:${correlationId}] Updated previousClose for ${prevCloseUpdated} tickers (nextTradingDay: ${nextTradingDateStr}, todayTradingDay: ${getDateET(todayTradingDay)})`);
  } catch (error) {
    console.error(`❌ [runId:${correlationId}] Error in saveRegularClose:`, error);
  }
}

/**
 * Main ingest function
 * Exported for manual execution
 * @param force - If true, bypass pricing state machine (for manual/force ingest)
 */
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
    // bootstrapPreviousCloses expects calendar date, will calculate trading day internally
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

  // Process each snapshot
  for (const snapshot of snapshots) {
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
      // If static update is locked and no prevClose, still normalize (will return null if no prevClose by design)
      // This prevents calculating % with null reference, but still allows price updates
      const normalized = normalizeSnapshot(
        snapshot,
        previousClose,
        regularClose,
        session,
        frozenPrice,
        force
      );

      // Log if locked and no prevClose (for debugging)
      if (isStaticUpdateLocked && !previousClose && normalized) {
        console.log(`⚠️  ${symbol}: Normalized during lock without prevClose - % may be 0`);
      }
      if (!normalized) {
        if (symbol === 'GOOG' || symbol === 'GOOGL') {
          console.log(`   ❌ normalizeSnapshot returned null for ${symbol}`);
        }
        results.push({
          symbol,
          price: 0,
          changePct: 0,
          timestamp: new Date(),
          quality: 'snapshot',
          success: false,
          error: 'No price data'
        });
        continue;
      }

      // Get batch-fetched shares (ak existuje), inak fetch jednotlivo
      let shares = sharesMap.get(symbol) || 0;
      if (shares === 0) {
        shares = await getSharesOutstanding(symbol, normalized.price);
      }

      const marketCap = computeMarketCap(normalized.price, shares);
      // Use previousClose (adjusted aggregates) for marketCapDiff, not effectivePrevClose
      const marketCapDiff = previousClose
        ? computeMarketCapDiff(normalized.price, previousClose, shares)
        : 0;

      // Upsert to DB (includes updating Ticker table for sorting)
      // Pass previousClose - always use adjusted aggregates API value
      // Pass isStaticUpdateLocked to preserve lastChangePct during lock
      // Pass cached lastChangePct to avoid per-ticker query during lock
      const cachedLastChangePct = lastChangePctMap.get(symbol);
      const { success: dbSuccess, effectiveChangePct } = await upsertToDB(
        symbol, session, normalized, previousClose, marketCap, marketCapDiff, isStaticUpdateLocked, cachedLastChangePct
      );

      // Write to Redis (atomic operation)
      const priceData: PriceData = {
        p: normalized.price,
        change: effectiveChangePct, // CRITICAL: Use resolved effective percent, not normalized (which might be 0)
        ts: normalized.timestamp.getTime(),
        source: normalized.quality,
        quality: normalized.quality
      };

      // Map 'closed' to 'after' for Redis operations
      const redisSession = mapToRedisSession(session);

      // Atomic update: last price + heatmap
      await atomicUpdatePrice(redisSession, symbol, priceData, effectiveChangePct);

      // Get ticker info for name/sector
      const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: { name: true, sector: true, industry: true }
      });

      // Update rank indexes (date-based ZSET indexes) - ATOMIC
      const date = getDateET();
      await updateRankIndexes(date, redisSession, {
        symbol,
        price: normalized.price,
        marketCap,
        marketCapDiff,
        changePct: effectiveChangePct, // Use effective pct
        name: ticker?.name ?? undefined,
        sector: ticker?.sector ?? undefined,
        industry: ticker?.industry ?? undefined
      }, false); // Don't update stats here, we'll do it separately after checking min/max

      // Check and update stats cache (min/max) - only if this is a new min/max
      // This is done after rank update to ensure ZSETs are up to date
      const checkAndUpdateStats = async (field: 'price' | 'cap' | 'capdiff' | 'chg', value: number) => {
        const currentStats = await getRankMinMax(date, redisSession, field);

        const min = currentStats.min;
        const max = currentStats.max;

        const isMin = !min || value < min.v;
        const isMax = !max || value > max.v;

        if (isMin || isMax) {
          await updateStatsCache(date, redisSession, field, symbol, value, isMin, isMax);
        }
      };

      // Check all fields (in parallel, but only update if needed)
      await Promise.all([
        checkAndUpdateStats('price', normalized.price),
        checkAndUpdateStats('cap', marketCap),
        checkAndUpdateStats('capdiff', marketCapDiff),
        checkAndUpdateStats('chg', Math.round(effectiveChangePct * 10000))
      ]);

      // Publish to Redis Pub/Sub (for WebSocket)
      await publishTick(symbol, redisSession, priceData);

      results.push({
        symbol,
        price: normalized.price,
        changePct: effectiveChangePct,
        timestamp: normalized.timestamp,
        quality: normalized.quality,
        success: dbSuccess
      });
    } catch (error) {
      console.error(`Error processing ${symbol}:`, error);

      // Add to DLQ after max retries - commented out to avoid startup issues
      // await addToDLQ('ingest', { symbol, tickers }, error, 1);

      results.push({
        symbol,
        price: 0,
        changePct: 0,
        timestamp: new Date(),
        quality: 'snapshot',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

/**
 * Bootstrap previous closes (run at 04:00 ET)
 */
export async function bootstrapPreviousCloses(
  tickers: string[],
  apiKey: string,
  date: string // YYYY-MM-DD
): Promise<void> {
  console.log(`🔄 Bootstrapping previous closes for ${tickers.length} tickers (Optimized: Snapshot API)...`);

  const isLikelySqlite = (process.env.DATABASE_URL || '').startsWith('file:');
  const dbWriteRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T | null> => {
    const maxAttempts = isLikelySqlite ? 10 : 3;
    let delayMs = 100;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as any)?.code as string | undefined;
        const isDbBusy =
          code === 'P1008' ||
          msg.includes('SQLITE_BUSY') ||
          msg.includes('database is locked') ||
          msg.includes('failed to respond to a query within the configured timeout');

        if (!isDbBusy || attempt === maxAttempts) {
          console.warn(`⚠️ DB write failed (${label}) after ${attempt}/${maxAttempts}:`, err);
          return null;
        }

        await sleep(delayMs);
        delayMs = Math.min(2000, Math.floor(delayMs * 2));
      }
    }
    return null;
  };

  const calendarDateET = createETDate(date);
  const todayTradingDay = getTradingDay(calendarDateET);
  const prevTradingDay = getLastTradingDay(todayTradingDay);
  const expectedPrevYMD = getDateET(prevTradingDay);
  const isNonTradingCalendarDay = getDateET(todayTradingDay) !== date;

  // 1. Fetch snapshots in large batches
  console.log('📥 Fetching snapshots for batch previous day reference...');
  const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
  const snapshotMap = new Map<string, PolygonSnapshot>();
  snapshots.forEach(s => snapshotMap.set(s.ticker, s));
  console.log(`✅ Received ${snapshots.length} snapshots`);

  let snapshotHits = 0;
  let fallbackHits = 0;
  let failedCount = 0;

  for (const symbol of tickers) {
    try {
      let prevClose = 0;
      let actualPrevTradingDay: Date | null = null;

      // PRIORITY 1: Use Snapshot data if available (prevDay.c)
      const snapshot = snapshotMap.get(symbol);
      if (snapshot?.prevDay?.c && snapshot.prevDay.c > 0) {
        prevClose = snapshot.prevDay.c;
        actualPrevTradingDay = prevTradingDay;
        snapshotHits++;
      }

      // PRIORITY 2: Fallback to slow Range API if snapshot missing or invalid
      if (!prevClose || prevClose <= 0) {
        try {
          const rangeUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${expectedPrevYMD}/${expectedPrevYMD}?adjusted=true&apiKey=${apiKey}`;
          const rangeResp = await withRetry(async () => fetch(rangeUrl));
          if (rangeResp && rangeResp.ok) {
            const rangeData = await rangeResp.json();
            const result = rangeData?.results?.[0];
            const c = result?.c;
            if (typeof c === 'number' && c > 0) {
              prevClose = c;
              const timestamp = result?.t;
              if (timestamp) {
                const timestampDate = new Date(timestamp);
                actualPrevTradingDay = createETDate(getDateET(timestampDate));
              } else {
                actualPrevTradingDay = prevTradingDay;
              }
              fallbackHits++;
            }
          }
        } catch (rangeError) {
          // ignore
        }
      }

      // Save to DB and Redis
      if (prevClose > 0 && actualPrevTradingDay) {
        await setPrevClose(date, symbol, prevClose);

        // If `date` is a non-trading calendar day (weekend/holiday), ensure we also persist the LAST trading day's
        // regular close (snapshot.day.c). This is needed so APIs can show 0% vs Friday close on Saturday/Sunday
        // instead of showing "Friday move vs Thursday close".
        // NOTE: On trading days at 04:00 ET, snapshot.day.c is not the current day's regular close, so we skip.
        if (isNonTradingCalendarDay && snapshot?.day?.c && snapshot.day.c > 0) {
          const lastTradingDay = todayTradingDay; // collapsed trading day (e.g. Saturday -> Friday)
          await dbWriteRetry(
            () => prisma.dailyRef.upsert({
              where: { symbol_date: { symbol, date: lastTradingDay } },
              update: { regularClose: snapshot.day!.c, previousClose: prevClose, updatedAt: new Date() },
              create: { symbol, date: lastTradingDay, regularClose: snapshot.day!.c, previousClose: prevClose }
            }),
            `dailyRef.upsert(lastTradingDayClose):${symbol}`
          );
        }

        await dbWriteRetry(
          () => prisma.dailyRef.upsert({
            where: { symbol_date: { symbol, date: actualPrevTradingDay! } },
            update: { previousClose: prevClose, regularClose: prevClose, updatedAt: new Date() },
            create: { symbol, date: actualPrevTradingDay!, previousClose: prevClose, regularClose: prevClose }
          }),
          `dailyRef.upsert:${symbol}`
        );

        await dbWriteRetry(
          () => prisma.dailyRef.upsert({
            where: { symbol_date: { symbol, date: calendarDateET } },
            update: { previousClose: prevClose, updatedAt: new Date() },
            create: { symbol, date: calendarDateET, previousClose: prevClose }
          }),
          `dailyRef.upsert(todayPrevClose):${symbol}`
        );

        await dbWriteRetry(
          () => prisma.ticker.update({
            where: { symbol },
            data: { latestPrevClose: prevClose, latestPrevCloseDate: actualPrevTradingDay }
          }),
          `ticker.update(prevClose):${symbol}`
        );
      } else {
        failedCount++;
      }

      // Avoid DB lock pressure
      if (fallbackHits > 0 && fallbackHits % 5 === 0) await sleep(100);
    } catch (error) {
      console.error(`Error bootstrapping ${symbol}:`, error);
      failedCount++;
    }
  }

  console.log(`✅ Bootstrap complete: ${snapshotHits} from snapshot, ${fallbackHits} from fallback, ${failedCount} failed`);
}

/**
 * Main worker entry point (PM2)
 */
async function main() {
  const mode = process.env.MODE || 'snapshot';
  const apiKey = process.env.POLYGON_API_KEY;

  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }

  if (mode === 'refs') {
    // Daily reference tasks
    console.log('🔄 Starting refs worker...');

    // Schedule tasks based on ET time
    const scheduleTask = async () => {
      const now = new Date(); // real instant
      const et = toET(now);
      const hours = et.hour;
      const minutes = et.minute;

      // 03:30 ET - Refresh universe
      if (hours === 3 && minutes === 30) {
        console.log('🔄 Refreshing universe...');
        try {
          const { getAllProjectTickers } = await import('@/data/defaultTickers');
          const tickers = getAllProjectTickers('pmp');
          console.log(`📊 Adding ${tickers.length} tickers to universe:sp500...`);

          for (const ticker of tickers) {
            await addToUniverse('sp500', ticker);
          }

          console.log(`✅ Universe refreshed: ${tickers.length} tickers added to universe:sp500`);
        } catch (error) {
          console.error('❌ Error refreshing universe:', error);
        }
      }

      // Bootstrap previous closes (04:00 ET or if missing)
      const today = getDateET(now);
      const tickers = await getUniverse('sp500');

      if (tickers.length > 0 && today) {
        const { getPrevClose } = await import('@/lib/redis/operations');
        const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 10));

        // Bootstrap if:
        // 1) It's 04:00 ET (normal daily bootstrap)
        // 2) Previous closes are missing (any time before market close)
        // 3) Previous closes are present but STALE vs expected trading day (self-heal)
        //
        // NOTE: Our Redis prevClose cache doesn't store the trading-day date, only the number.
        // To detect staleness we sample the DB `latestPrevCloseDate` for a small set of tickers.
        let isStale = false;
        try {
          const { prisma } = await import('@/lib/db/prisma');
          const expectedPrevYMD = getDateET(getLastTradingDay(getTradingDay(createETDate(today))));
          const sampleSymbols = tickers.slice(0, 25);
          const rows = await prisma.ticker.findMany({
            where: { symbol: { in: sampleSymbols } },
            select: { latestPrevCloseDate: true }
          });

          const counts = new Map<string, number>();
          for (const r of rows) {
            if (!r.latestPrevCloseDate) continue;
            const ymd = r.latestPrevCloseDate.toISOString().slice(0, 10);
            counts.set(ymd, (counts.get(ymd) || 0) + 1);
          }
          const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
          if (mode && expectedPrevYMD && mode < expectedPrevYMD) {
            isStale = true;
          }
        } catch {
          // Non-fatal: if DB is unavailable we fall back to missing-cache logic.
        }

        // Rate-limit stale-trigger bootstraps to every 30 minutes to avoid Polygon spam
        const staleWindowOk = minutes % 30 === 0;

        const shouldBootstrap =
          (hours === 4 && minutes === 0) ||
          (samplePrevCloses.size === 0 && hours >= 0 && hours < 16) ||
          (isStale && hours >= 0 && hours < 16 && staleWindowOk);

        if (shouldBootstrap) {
          console.log('🔄 Bootstrapping previous closes...');
          await bootstrapPreviousCloses(tickers, apiKey, today);
        }
      }

      // 16:00-17:00 ET - Save regular close (with retry logic for early closes)
      // Retry every 5 minutes until 17:00 ET or until all tickers have regular close
      if (hours >= 16 && hours < 17) {
        // Check if we need to save regular close
        const { redisClient } = await import('@/lib/redis');
        if (redisClient && redisClient.isOpen) {
          const lastRegularCloseSave = await redisClient.get(`regular_close:last_save:${today}`);
          const now = Date.now();
          const fiveMinAgo = now - (5 * 60 * 1000);

          // Save/retry if: (1) first time (16:00), or (2) last save was > 5 min ago
          const shouldSave = !lastRegularCloseSave || parseInt(lastRegularCloseSave, 10) < fiveMinAgo;

          if (shouldSave) {
            // Check if regular close is missing for any tickers
            // Use stratified sample: top 50 (premium) + random 50 (to catch batch failures)
            const tickers = await getUniverse('sp500');
            const { getAllProjectTickers } = await import('@/data/defaultTickers');
            const premiumTickers = getAllProjectTickers('pmp').slice(0, 50);
            // Reservoir sampling for random 50 (O(n) instead of O(n log n), more uniform distribution)
            const remainingTickers = tickers.filter(t => !premiumTickers.includes(t));
            const randomTickers: string[] = [];
            const randomCount = Math.min(50, remainingTickers.length);

            // Fisher-Yates shuffle for first N elements (more efficient than full sort)
            for (let i = 0; i < randomCount; i++) {
              const j = Math.floor(Math.random() * (remainingTickers.length - i)) + i;
              const temp = remainingTickers[i];
              if (temp && remainingTickers[j]) {
                remainingTickers[i] = remainingTickers[j];
                remainingTickers[j] = temp;
                randomTickers.push(temp);
              }
            }

            const sampleTickers = [...premiumTickers, ...randomTickers];

            const { prisma } = await import('@/lib/db/prisma');
            const dateObj = createETDate(today);

            const missingCount = await prisma.dailyRef.count({
              where: {
                symbol: { in: sampleTickers },
                date: dateObj,
                regularClose: null
              }
            });

            if (missingCount > 0 || !lastRegularCloseSave) {
              const runId = Date.now().toString(36);
              console.log(`🔄 [runId:${runId}] Saving regular close (retry: ${!!lastRegularCloseSave})...`);
              await saveRegularClose(apiKey, today, runId);
              await redisClient.setEx(`regular_close:last_save:${today}`, 3600, now.toString());
            }
          }
        } else {
          // Fallback: save at 16:00 ET if Redis unavailable
          // Guard: check if already saved for today (safe by design)
          if (hours === 16 && minutes === 0) {
            try {
              const { prisma } = await import('@/lib/db/prisma');
              const { createETDate } = await import('@/lib/utils/dateET');
              const { getLastTradingDay } = await import('@/lib/utils/timeUtils');
              const todayDate = createETDate(today);
              const todayTradingDay = getLastTradingDay(todayDate);

              // Check if regular close already saved for today
              const existingDailyRef = await prisma.dailyRef.findFirst({
                where: {
                  date: todayTradingDay,
                  regularClose: { not: null }
                },
                select: { symbol: true }
              });

              if (!existingDailyRef) {
                // Not saved yet - safe to save
                const runId = Date.now().toString(36);
                console.log(`🔄 [runId:${runId}] Saving regular close (Redis unavailable, fallback - not saved yet)...`);
                await saveRegularClose(apiKey, today, runId);
              } else {
                console.log(`⏭️  Skipping fallback saveRegularClose - already saved for ${todayTradingDay.toISOString().split('T')[0]}`);
              }
            } catch (fallbackError) {
              console.warn('⚠️  Failed to check if regular close already saved (fallback):', fallbackError);
              // Continue anyway - better to save twice than not at all
              const runId = Date.now().toString(36);
              console.log(`🔄 [runId:${runId}] Saving regular close (Redis unavailable, fallback - check failed)...`);
              await saveRegularClose(apiKey, today, runId);
            }
          }
        }
      }
    };

    // Check every minute
    setInterval(scheduleTask, 60000);
    scheduleTask(); // Run immediately

  } else if (mode === 'snapshot') {
    // Continuous snapshot ingest
    console.log('🔄 Starting snapshot worker...');

    // Update worker status in Redis
    const updateWorkerStatus = async () => {
      try {
        const { redisClient } = await import('@/lib/redis');
        if (redisClient && redisClient.isOpen) {
          await redisClient.setEx('worker:last_success_ts', 3600, Date.now().toString()); // 1 hour TTL
        }
      } catch (error) {
        console.warn('Failed to update worker status:', error);
      }
    };

    // DST-safe bulk preloader scheduler
    const scheduleBulkPreload = async () => {
      const etNow = nowET();
      const et = toET(etNow);
      const hours = et.hour;
      const minutes = et.minute;
      const dayOfWeek = et.weekday;

      // Pre-market + live trading: 07:30-15:55 ET (DST-safe via toET())
      // Stop at 15:55 to avoid overlap with regular close save at 16:00
      const isPreMarketOrLive = (hours >= 7 && hours < 15) ||
        (hours === 7 && minutes >= 30) ||
        (hours === 15 && minutes < 55);

      // Only on weekdays (1-5 = Monday-Friday)
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

      if (!isPreMarketOrLive || !isWeekday) {
        return; // Outside bulk preload window
      }

      // Check if last bulk preload was > 5 min ago
      const { redisClient } = await import('@/lib/redis');
      if (!redisClient || !redisClient.isOpen) {
        return;
      }

      const lastPreloadKey = 'bulk:last_preload_ts';
      const lastPreloadStr = await redisClient.get(lastPreloadKey);
      const now = Date.now();
      const fiveMinAgo = now - (5 * 60 * 1000);

      // Check timestamp (not TTL-based gating)
      if (lastPreloadStr && parseInt(lastPreloadStr, 10) >= fiveMinAgo) {
        return; // Too soon since last preload
      }

      // Acquire lock to prevent parallel execution
      const { withLock } = await import('@/lib/utils/redisLocks');
      const { preloadBulkStocks } = await import('./backgroundPreloader');

      const result = await withLock(
        'bulk_preload',
        8 * 60, // 8 min TTL (2x typical runtime ~3-4 min, prevents expiration during run)
        async () => {
          console.log('🔄 Running DST-safe bulk preload...');
          const apiKey = process.env.POLYGON_API_KEY;
          if (!apiKey) {
            console.warn('⚠️ POLYGON_API_KEY not set, skipping bulk preload');
            return;
          }

          // Import and run bulk preload logic
          const { preloadBulkStocks } = await import('./backgroundPreloader');
          const tickers = await getUniverse('sp500');
          if (tickers.length === 0) {
            return;
          }

          // Generate correlation ID for this run
          const runId = Date.now().toString(36);

          // Run bulk preload with duration tracking
          const preloadStartTime = Date.now();
          let preloadSuccess = true;
          let preloadError: string | null = null;

          console.log(`🔄 [runId:${runId}] Starting bulk preload...`);

          try {
            await preloadBulkStocks(apiKey);
            const preloadDuration = Date.now() - preloadStartTime;
            const preloadDurationMin = preloadDuration / (60 * 1000);

            // Max runtime alarms (warn at 6 min, error at 10 min)
            if (preloadDurationMin > 10) {
              const errorMsg = `Bulk preload took ${preloadDurationMin.toFixed(1)}min (exceeds 10min threshold) - possible Polygon/Redis/DB slowdown`;
              console.error(`❌ [runId:${runId}] ${errorMsg}`);
              await redisClient.set('bulk:last_error', errorMsg);
            } else if (preloadDurationMin > 6) {
              console.warn(`⚠️ [runId:${runId}] Bulk preload took ${preloadDurationMin.toFixed(1)}min (exceeds 6min threshold) - monitoring for slowdown`);
            }

            // Update last preload timestamp and metrics (no TTL - persistent, not TTL-based gating)
            await redisClient.set(lastPreloadKey, now.toString());
            await redisClient.set('bulk:last_duration_ms', preloadDuration.toString());
            await redisClient.set('bulk:last_success_ts', now.toString());
            if (preloadDurationMin <= 10) {
              await redisClient.del('bulk:last_error'); // Clear error on success (unless exceeded 10min)
            }

            // Check for stale bulk preload (alert if age > 10 min during window 07:30-15:55)
            const etNow = nowET();
            const et = toET(etNow);
            const hours = et.hour;
            const minutes = et.minute;
            const isPreMarketOrLive = (hours >= 7 && hours < 15) ||
              (hours === 7 && minutes >= 30) ||
              (hours === 15 && minutes < 55);

            if (isPreMarketOrLive) {
              const bulkAgeMinutes = Math.floor((now - parseInt(await redisClient.get('bulk:last_success_ts') || '0', 10)) / 60000);
              if (bulkAgeMinutes > 10) {
                console.error(`ALERT: [runId:${runId}] Bulk preload stale - last success ${bulkAgeMinutes}min ago (threshold: 10min) during market hours`);
              }
            }

            console.log(`✅ [runId:${runId}] Bulk preload completed in ${preloadDuration}ms (${preloadDurationMin.toFixed(1)}min)`);
          } catch (error) {
            preloadSuccess = false;
            preloadError = error instanceof Error ? error.message : String(error);
            const preloadDuration = Date.now() - preloadStartTime;

            await redisClient.set('bulk:last_duration_ms', preloadDuration.toString());
            await redisClient.set('bulk:last_error', preloadError);

            console.error(`❌ Bulk preload failed after ${preloadDuration}ms:`, error);
            throw error; // Re-throw to let withLock handle it
          }
        }
      );

      if (result === null) {
        // Lock acquisition failed (another process is running it)
        console.log('⏸️ Bulk preload already running, skipping...');
      }
    };

    const ingestLoop = async () => {
      const etNow = nowET();
      const session = detectSession(etNow);

      // --- Regular close + next-day prevClose (CRITICAL) ---
      // In production we run the worker in MODE=snapshot (see PM2 ecosystem).
      // Previously, regular close saving (and preparing nextTradingDay prevClose) only ran in MODE=refs,
      // which meant "previous close available shortly after market close" was not guaranteed.
      //
      // Goal: have regularClose/prevClose available ASAP after 16:00 ET (target: ~5 minutes).
      // Strategy: attempt at 16:05 ET and retry every 5 minutes until 17:00 ET, with Redis throttling + DB idempotency.
      try {
        const et = toET(etNow);
        const hours = et.hour;
        const minutes = et.minute;

        // Window 16:05 - 16:59 ET (retry every 5 minutes)
        const inCloseWindow = hours === 16 && minutes >= 5;
        const isRetryMinute = (minutes % 5) === 0;

        if (inCloseWindow && isRetryMinute) {
          const today = getDateET(etNow);
          const { redisClient } = await import('@/lib/redis');
          const throttleKey = `regular_close:last_save:${today}`;
          const nowMs = Date.now();

          // Throttle: don't run more often than every ~4 minutes even if loop timing jitters
          const lastStr = (redisClient && redisClient.isOpen) ? await redisClient.get(throttleKey) : null;
          const lastMs = lastStr ? parseInt(lastStr, 10) : 0;
          const tooSoon = lastMs && (nowMs - lastMs) < (4 * 60 * 1000);

          if (!tooSoon) {
            const runId = nowMs.toString(36);
            console.log(`🔔 [runId:${runId}] Snapshot worker: attempting saveRegularClose (ET ${hours}:${String(minutes).padStart(2, '0')})...`);
            await saveRegularClose(apiKey, today, runId);
            if (redisClient && redisClient.isOpen) {
              await redisClient.setEx(throttleKey, 3600, nowMs.toString());
            }
          }
        }
      } catch (e) {
        // Non-fatal: regular close save failures should not stop ingest loop
        console.warn('⚠️ Snapshot worker: saveRegularClose attempt failed:', e);
      }

      // Schedule bulk preload (DST-safe, with lock)
      await scheduleBulkPreload();

      // Always try to ingest (even when market closed, we can get previous close)
      const tickers = await getUniverse('sp500'); // Get from Redis

      if (tickers.length === 0) {
        console.log('⚠️ Universe is empty, waiting...');
        return;
      }

      // CRITICAL: For premarketprice.com, we MUST ingest pre-market and after-hours data!
      // Only skip on weekends/holidays (true closed days)
      const isWeekendOrHoliday = isWeekendET(etNow) || isMarketHoliday(etNow);

      if (session === 'closed' && isWeekendOrHoliday) {
        // True closed day (weekend/holiday) - only bootstrap previous closes if missing
        const today = getDateET(etNow);
        const { getPrevClose } = await import('@/lib/redis/operations');
        const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 10));

        if (samplePrevCloses.size === 0) {
          console.log(`⏸️ Weekend/Holiday (session: ${session}), bootstrapping previous closes...`);
          await bootstrapPreviousCloses(tickers, apiKey, today);
        } else {
          console.log(`⏸️ Weekend/Holiday (session: ${session}), skipping ingest`);
        }
        return;
      }

      // For pre-market, after-hours, live, or closed (but not weekend/holiday) - INGEST DATA!
      // This is critical for premarketprice.com - we need pre-market prices!
      if (session === 'pre' || session === 'after') {
        console.log(`🌅 Pre-market/After-hours mode (session: ${session}) - ingesting pre-market prices...`);
      } else if (session === 'closed' && !isWeekendOrHoliday) {
        // Closed but not weekend/holiday (e.g., before 4:00 AM or after 8:00 PM) - still ingest
        console.log(`🌙 Off-hours (session: ${session}) - ingesting available prices...`);
      } else {
        console.log(`📊 Market open (session: ${session}), ingesting with prioritization...`);
      }

      // Prioritize tickers: top 200 get frequent updates (60s), rest less frequent (5min)
      // For pre-market/after-hours, use longer intervals (5min for all)
      const { getAllProjectTickers } = await import('@/data/defaultTickers');
      const premiumTickers = getAllProjectTickers('pmp').slice(0, 200); // Top 200

      // Load last update times from Redis (persistent across restarts)
      const { redisClient } = await import('@/lib/redis');
      const lastUpdateMap = new Map<string, number>();

      // Adjust intervals based on session
      // Goal: keep major tickers highly fresh even in pre-market, while keeping overall API load reasonable.
      const isPreMarket = session === 'pre';
      const isOffHours = session === 'after' || (session === 'closed' && !isWeekendOrHoliday);
      const PREMIUM_INTERVAL = isPreMarket ? 60 * 1000 : isOffHours ? 2 * 60 * 1000 : 60 * 1000; // pre: 60s, off-hours: 2min, live: 60s
      const REST_INTERVAL = 5 * 60 * 1000; // keep rest at 5min to avoid rate-limit pressure

      // Load last update times from Redis (using freshness metrics hash - O(1))
      if (redisClient && redisClient.isOpen) {
        try {
          const { getFreshnessMetrics } = await import('@/lib/utils/freshnessMetrics');
          const hashKey = 'freshness:last_update';
          const timestamps = await redisClient.hGetAll(hashKey);

          tickers.forEach((ticker) => {
            const timestampStr = timestamps[ticker];
            if (timestampStr) {
              const timestamp = parseInt(timestampStr, 10);
              if (!isNaN(timestamp)) {
                lastUpdateMap.set(ticker, timestamp);
              }
            }
          });
        } catch (error) {
          console.warn('Failed to load freshness timestamps from Redis:', error);
        }
      }

      // Get tickers that need update based on priority
      const now = Date.now();
      const tickersNeedingUpdate = tickers.filter(ticker => {
        const lastUpdate = lastUpdateMap.get(ticker) || 0;
        const interval = premiumTickers.includes(ticker) ? PREMIUM_INTERVAL : REST_INTERVAL;
        return (now - lastUpdate) >= interval;
      });

      if (tickersNeedingUpdate.length === 0) {
        console.log('⏭️ No tickers need update yet (within refresh intervals)');
        return;
      }

      // Prioritize: process premium tickers first, then rest
      const premiumNeedingUpdate = tickersNeedingUpdate.filter(t => premiumTickers.includes(t));
      const restNeedingUpdate = tickersNeedingUpdate.filter(t => !premiumTickers.includes(t));
      const prioritizedTickers = [...premiumNeedingUpdate, ...restNeedingUpdate];

      const intervalDesc = isPreMarket ? '60s' : isOffHours ? '2min' : '60s';
      console.log(`📊 Processing ${prioritizedTickers.length} tickers: ${premiumNeedingUpdate.length} premium (${intervalDesc}), ${restNeedingUpdate.length} rest (5min)`);

      // Dynamic batch size and delay based on rate limit
      // Polygon API: 5 req/s = 300 req/min
      // Conservative: use 250 req/min to leave buffer
      const MAX_REQUESTS_PER_MINUTE = 250;
      const batchSize = 70; // Keep batch size
      const delayBetweenBatches = Math.ceil((60 * 1000) / (MAX_REQUESTS_PER_MINUTE / batchSize)); // ~17s

      let hasSuccess = false;
      for (let i = 0; i < prioritizedTickers.length; i += batchSize) {
        const batch = prioritizedTickers.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(prioritizedTickers.length / batchSize);
        console.log(`📥 Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);

        try {
          const results = await ingestBatch(batch, apiKey);
          const successSymbols = results.filter(r => r.success).map(r => r.symbol);
          if (successSymbols.length > 0) {
            hasSuccess = true;
          }

          // Update freshness metrics (O(1) hash operation)
          if (redisClient && redisClient.isOpen) {
            const { updateFreshnessTimestampsBatch } = await import('@/lib/utils/freshnessMetrics');
            const freshnessUpdates = new Map<string, number>();
            // CRITICAL: only mark freshness for tickers that actually succeeded.
            // Otherwise failed tickers look "fresh" and won't be retried until the next interval.
            successSymbols.forEach(ticker => freshnessUpdates.set(ticker, now));
            await updateFreshnessTimestampsBatch(freshnessUpdates).catch(err => {
              console.warn('Failed to update freshness metrics:', err);
            });
          }
        } catch (error) {
          console.error(`Error in batch ${i}:`, error);
        }

        // Dynamic delay based on rate limit calculation
        if (i + batchSize < prioritizedTickers.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      // Update worker status after successful ingest
      if (hasSuccess) {
        await updateWorkerStatus();
      }
    };

    // Run every 60 seconds to check for updates (optimized from 30s)
    // During live trading: Premium tickers updated every 60s, rest every 5min
    // During pre-market/after-hours: All tickers updated every 5min (critical for premarketprice.com!)
    // Note: 60s check interval matches premium ticker update interval, reducing unnecessary checks
    setInterval(ingestLoop, 60000); // 60s check interval (optimized - matches premium update interval)
    ingestLoop(); // Run immediately
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Worker error:', error);
    process.exit(1);
  });
}

