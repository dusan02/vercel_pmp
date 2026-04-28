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
import { polygonCircuitBreaker, __IS_TEST__, sleep, PolygonSnapshot } from './shared';
async function fetchPolygonSnapshot(
  tickers: string[],
  apiKey: string
): Promise<PolygonSnapshot[]> {
  // Check circuit breaker
  if (polygonCircuitBreaker.isOpen) {
    console.warn('⚠️ Polygon circuit breaker is OPEN, skipping API calls');
    return [];
  }

  const envBatchSize = parseInt(process.env.POLYGON_MAX_BATCH_SIZE || '100', 10);
  const batchSize = Math.min(100, Math.max(1, envBatchSize));
  const batchDelay = parseInt(process.env.POLYGON_BATCH_DELAY_MS || '1000', 10);
  
  const results: PolygonSnapshot[] = [];
  const totalBatches = Math.ceil(tickers.length / batchSize);

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const tickersParam = batch.join(',');
    const batchNum = Math.floor(i / batchSize) + 1;

    try {
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${apiKey}`;
      console.log(`📥 Polygon snapshot batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);

      const response = await withRetry(async () => {
        // IMPORTANT: add a hard timeout so scripts don't appear "frozen" on network stalls.
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
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

      // Dynamic rate limiting: default 1s for assumed paid tier
      if (i + batchSize < tickers.length) {
        await sleep(batchDelay);
      }
    } catch (error) {
      polygonCircuitBreaker.recordFailure();
      console.error(`Error fetching batch ${i}-${i + batchSize}:`, error);
    }
  }

  return results;
}

/**
 * Helper: Calculate expected cumulative volume at current time using linear interpolation
 * @param symbol 
 * @param timeStr "HH:MM"
 * @param fullDayAvg20d Total day average volume
 */
async function calculateExpectedVolume(symbol: string, timeStr: string, fullDayAvg20d: number): Promise<number | null> {
  try {
    const profileKey = `volume_profile:${symbol}`;
    const profile = await redisClient.hGetAll(profileKey);

    if (!profile || Object.keys(profile).length === 0) {
      // IPO/New Stock Fallback: Linear growth assumption or simple percentage
      // e.g. 0.1% of day avg per minute
      const timeParts = timeStr.split(':');
      const h = Number(timeParts[0]);
      const m = Number(timeParts[1]);
      const minsSinceOpen = Math.max(0, (h * 60 + m) - (9 * 60 + 30));
      if (minsSinceOpen <= 0) return fullDayAvg20d * 0.01; // Pre-market 1% floor
      const linearWeight = Math.min(1, minsSinceOpen / 390); // 390 mins in regular session
      return fullDayAvg20d * linearWeight;
    }

    const buckets = Object.keys(profile).sort(); // ["09:30", "09:45", ...]
    const currentMins = timeStr.split(':').reduce((acc, v, i) => acc + Number(v) * (i === 0 ? 60 : 1), 0);

    // Find surrounding buckets
    let prevBucketIdx = -1;
    let nextBucketIdx = -1;

    for (let i = 0; i < buckets.length; i++) {
      const bucketStr = buckets[i];
      if (!bucketStr) continue;
      const bucketParts = bucketStr.split(':');
      const bh = Number(bucketParts[0]);
      const bm = Number(bucketParts[1]);
      const bMins = bh * 60 + bm;
      if (bMins <= currentMins) prevBucketIdx = i;
      if (bMins > currentMins && nextBucketIdx === -1) {
        nextBucketIdx = i;
        break;
      }
    }

    if (prevBucketIdx === -1) {
      const firstKey = buckets[0];
      return firstKey !== undefined ? Number(profile[firstKey]) || null : null;
    }
    if (nextBucketIdx === -1) {
      const lastKey = buckets[buckets.length - 1];
      return lastKey !== undefined ? Number(profile[lastKey]) || null : null;
    }

    // Linear Interpolation
    const b1 = buckets[prevBucketIdx];
    const b2 = buckets[nextBucketIdx];
    if (!b1 || !b2) return null;

    const v1Val = profile[b1];
    const v2Val = profile[b2];
    if (v1Val === undefined || v2Val === undefined) return null;

    const v1 = Number(v1Val);
    const v2 = Number(v2Val);

    const m1Parts = b1.split(':');
    const m1Hour = Number(m1Parts[0]);
    const m1Min = Number(m1Parts[1]);
    if (isNaN(m1Hour) || isNaN(m1Min)) return null;
    const m1 = m1Hour * 60 + m1Min;

    const m2Parts = b2.split(':');
    const m2Hour = Number(m2Parts[0]);
    const m2Min = Number(m2Parts[1]);
    if (isNaN(m2Hour) || isNaN(m2Min)) return null;
    const m2 = m2Hour * 60 + m2Min;

    const ratio = (currentMins - m1) / (m2 - m1);
    return v1 + ratio * (v2 - v1);
  } catch (error) {
    return null;
  }
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
  volume: number;
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
  // CRITICAL: Ensure we use the snapshot's prevDay close if external DB closes are missing
  const effectivePreviousClose = previousClose || snapshot.prevDay?.c || null;

  const percentResult = calculatePercentChange(
    effectivePrice.price,
    session,
    effectivePreviousClose,
    regularClose
  );

  // Determine quality based on source and staleness
  let quality: 'delayed_15m' | 'rest' | 'snapshot' = 'rest';
  if (effectivePrice.isStale) {
    quality = 'delayed_15m';
  } else if (process.env.POLYGON_PLAN === 'starter') {
    quality = 'delayed_15m';
  }

  const result = {
    price: effectivePrice.price,
    changePct: percentResult.changePct,
    timestamp: effectivePrice.timestamp,
    quality,
    source: effectivePrice.source,
    isStale: effectivePrice.isStale,
    reference: percentResult.reference,
    volume: snapshot.day?.v || snapshot.min?.v || 0
  };

  // Temporary debug log
  if (['AXON', 'CRCL', 'COIN'].includes(snapshot.ticker)) {
    console.log(`[normalizeSnapshot] ${snapshot.ticker} raw min.c=${snapshot.min?.c} day.c=${snapshot.day?.c} prevClose=${previousClose} -> effective: ${result.price} changePct: ${result.changePct} (ref: ${result.reference.price})`);
  }

  return result;
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
  lastChangePctFromCache: number | null | undefined = undefined,
  stats?: { avgVolume20d: number | null; avgReturn20d: number | null; stdDevReturn20d: number | null },
  force: boolean = false
): Promise<{ success: boolean; effectiveChangePct: number; zScore: number; rvol: number }> {
  if (!normalized) return { success: false, effectiveChangePct: 0, zScore: 0, rvol: 0 };

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
        latestPrevCloseDate: true,
        avgVolume20d: true,
        avgReturn20d: true,
        stdDevReturn20d: true,
        moversCategory: true,
        moversReason: true,
        sector: true,
        industry: true,
        sharesOutstanding: true
      }
    });

    // 1.5. Metadata Enrichment & De-listing Check
    // If ticker is new OR missing metadata OR has placeholder shares (1B), fetch official details.
    const needsMetadata = !existingTicker 
      || existingTicker.sector === 'Unknown' 
      || existingTicker.sector === 'Other' 
      || !existingTicker.sector 
      || existingTicker.sharesOutstanding === 1000000000;

    let metadataUpdate: any = {};
    if (needsMetadata) {
      try {
        const polygon = getPolygonClient();
        if (polygon) {
          const details = await polygon.fetchTickerDetails(symbol);
            if (details) {
              if (details.active === false) {
                console.warn(`🗑️  [Enrichment] ${symbol} is INACTIVE. Cleaning up universe.`);
                // Clean up from Redis universes
                const { redisClient } = await import('@/lib/redis');
                if (redisClient && redisClient.isOpen) {
                  await redisClient.sRem('universe:sp500', symbol);
                  await redisClient.sRem('universe:pmp', symbol);
                }
                return { success: false, effectiveChangePct: 0, zScore: 0, rvol: 0 };
              }

              metadataUpdate = {
                name: details.name || undefined,
                sector: details.sic_description || undefined,
                industry: details.sic_description || undefined,
                sharesOutstanding: details.weighted_shares_outstanding || details.share_class_shares_outstanding || undefined,
              };
            } else {
              // Details is null (likely 404)
              console.warn(`⚠️ [Enrichment] ${symbol} details not found (404). Possible de-listing.`);
              // Optional: count consecutive 404s before removal? 
              // For now, let's be cautious but log it.
            }
        }
      } catch (err) {
        console.warn(`⚠️  [Enrichment] Failed for ${symbol}:`, err);
      }
    }

    // 2. Calculate Z-score and RVOL
    let zScore = 0;
    let rvol = 0;

    // Use passed stats or fallback to DB stats
    const avgVolume = stats?.avgVolume20d ?? existingTicker?.avgVolume20d;
    const avgReturn = stats?.avgReturn20d ?? existingTicker?.avgReturn20d;
    const stdDev = stats?.stdDevReturn20d ?? existingTicker?.stdDevReturn20d;

    if (avgVolume && avgVolume > 0 && normalized.volume > 0) {
      // Priority 1: Time-weighted RVOL (The "interpolation" masterstroke)
      // If we are during Market Open/Pre-market, we must use time-weighted buckets.
      const now = nowET();
      const timeStr = `${String(toET(now).hour).padStart(2, '0')}:${String(toET(now).minute).padStart(2, '0')}`;

      try {
        const expectedVolume = await calculateExpectedVolume(symbol, timeStr, avgVolume);
        rvol = normalized.volume / (expectedVolume || avgVolume);

        // Market Halt Detection: if price/volume hasn't moved for > 5 mins
        const stalenessLimitMs = 5 * 60 * 1000;
        const isHalted = (now.getTime() - normalized.timestamp.getTime()) > stalenessLimitMs;
        if (isHalted) {
          console.log(`⚠️  [HaltDetection] ${symbol} might be halted (Staleness: ${Math.round((now.getTime() - normalized.timestamp.getTime()) / 60000)}m)`);
        }
      } catch (err) {
        rvol = normalized.volume / avgVolume;
      }
    }

    if (stdDev && stdDev > 0) {
      // Use LOGARITHMIC RETURNS for Z-score calculation (Fat Tails & Symmetry)
      // CRITICAL: Use the effective changePct – normalized.changePct can be 0 when prevClose
      // is missing from Polygon snapshot. In that case, fall back to the cached DB value
      // so stocks like MELI (-9.8%) still get a correct Z-score.
      const effectiveChangePctForZ =
        (normalized.changePct !== 0)
          ? normalized.changePct
          : (lastChangePctFromCache ?? existingTicker?.lastChangePct ?? 0);

      const priceRatio = (effectiveChangePctForZ / 100) + 1;

      if (priceRatio > 0) {
        const logReturn = Math.log(priceRatio);
        const avgLogReturn = avgReturn ? Math.log((avgReturn / 100) + 1) : 0;
        zScore = (logReturn - avgLogReturn) / (stdDev / 100);
      }
    } else {
      // Fallback Z-score when no historical stats available (new ticker or missing data):
      // Use raw changePct / typical S&P500 daily stdDev (≈1.5%) as a conservative approximation.
      // This ensures large obvious movers (|move| >= 3%) are not silently ignored.
      const effectiveChangePct =
        (normalized.changePct !== 0)
          ? normalized.changePct
          : (lastChangePctFromCache ?? existingTicker?.lastChangePct ?? 0);

      // Only apply fallback if move is large enough to matter (avoids noise)
      if (Math.abs(effectiveChangePct) >= 3.0) {
        const TYPICAL_DAILY_STDDEV = 1.5; // percent – conservative assumption for large caps
        zScore = effectiveChangePct / TYPICAL_DAILY_STDDEV;
        // Log for observability
        console.log(`📐 [Z-fallback] ${symbol}: no stdDev, approximating Z=${zScore.toFixed(2)} from changePct=${effectiveChangePct.toFixed(2)}%`);
      }
    }

    // 3. Staleness Check
    // If we have an existing price update that is NEWER than the incoming snapshot,
    // we should NOT overwrite the price/change/diff.
    // However, if previousClose is provided, we might still want to update that?
    // Generally, snapshots usually come in order, but forceful ingest or racing workers can cause out-of-order.
    let skipPriceUpdate = false;

    // Use `forceSync` from the higher scope of `ingestBatch` if `force` was renamed, wait, the parameter in ingestBatch is `force: boolean = false`. Oh I see, `fetchPolygonSnapshot` doesn't have force. Let's refer back to ingestBatch signature.
    // The signature: `export async function ingestBatch(tickers: string[], apiKey: string, force: boolean = false)`.
    // It's a standard variable. If node says `force is not defined` it must be somewhere else. Let's just use `force`? Wait, is there a closure problem?
    if (!force && existingTicker?.lastPriceUpdated && normalized.timestamp < existingTicker.lastPriceUpdated) {
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
      // CRITICAL FIX: Same guard as below — don't overwrite if saveRegularClose already set a newer date.
      const skipPrevCloseIsNewer = existingTicker?.latestPrevCloseDate
        && lastTradingDay.getTime() < existingTicker.latestPrevCloseDate.getTime();
      if (previousClose && existingTicker && !skipPrevCloseIsNewer
        && (!existingTicker.latestPrevClose || previousClose !== existingTicker.latestPrevClose)) {
        await prisma.ticker.upsert({
          where: { symbol },
          update: {
            latestPrevClose: previousClose,
            latestPrevCloseDate: lastTradingDay,
            updatedAt: new Date()
          },
          create: {
            symbol,
            latestPrevClose: previousClose,
            latestPrevCloseDate: lastTradingDay,
            updatedAt: new Date(),
            lastPrice: 0,
            lastChangePct: 0,
            lastMarketCap: 0,
            lastMarketCapDiff: 0,
            lastVolume: 0,
            sector: 'Unknown',
            industry: 'Unknown'
          }
        });
      }

      // Return existing change pct as the "effective" one
      return { success: true, effectiveChangePct: changePctToUse, zScore, rvol };
    }

    // CRITICAL FIX: Guard latestPrevClose from being overwritten with stale data.
    // saveRegularClose (runs at ~16:05 ET) sets latestPrevClose = today's close for NEXT trading day.
    // But upsertToDB (runs continuously) passes previousClose = LAST trading day's close (for TODAY's % calc).
    // Without this guard, ingest after 16:05 ET overwrites the newer reference with the older one,
    // causing the heatmap to show cumulative multi-day % change after midnight date flip.
    const shouldUpdatePrevClose = previousClose && (() => {
      if (!existingTicker?.latestPrevCloseDate) return true; // No existing date = safe to write
      // Only update if our lastTradingDay is >= existing date (i.e., we're not going backwards)
      return lastTradingDay.getTime() >= existingTicker.latestPrevCloseDate.getTime();
    })();

    // WEEKEND_FROZEN: skip DB write — return calculated values for Redis
    const pricingStateNow = getPricingState(nowET());
    if (pricingStateNow.state === PriceState.WEEKEND_FROZEN && !force) {
      return { success: true, effectiveChangePct: changePctToUse, zScore, rvol };
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
        lastVolume: normalized.volume,
        ...(shouldUpdatePrevClose ? {
          latestPrevClose: previousClose,
          latestPrevCloseDate: lastTradingDay
        } : {}),
        latestMoversZScore: zScore,
        latestMoversRVOL: rvol,
        ...metadataUpdate
      },
      create: {
        symbol,
        updatedAt: new Date(),
        lastPrice: normalized.price,
        lastChangePct: changePctToUse,
        lastMarketCap: marketCap,
        lastMarketCapDiff: marketCapDiff,
        lastPriceUpdated: normalized.timestamp,
        lastVolume: normalized.volume,
        latestPrevClose: previousClose || 0,
        latestPrevCloseDate: previousClose ? lastTradingDay : null,
        latestMoversZScore: zScore,
        latestMoversRVOL: rvol,
        sector: 'Unknown', // Default if metadata fetch failed
        industry: 'Unknown',
        ...metadataUpdate
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
          zScore,
          rvol,
          updatedAt: new Date()
        },
        create: {
          symbol, date: today, session,
          lastPrice: normalized.price,
          lastTs: normalized.timestamp,
          changePct: changePctToUse, // Use the resolved pct
          source: normalized.quality,
          quality: normalized.quality,
          zScore,
          rvol
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

    // 5. Movers Archive Logic (Archive significant moves for historical analysis)
    // NOTE: Use Math.abs(zScore) to capture BOTH gainers AND losers (e.g. -40% premarket)
    const archiveThresholdZ = 2.0;
    const archiveThresholdRVOL = 1.5;

    if (Math.abs(zScore) >= archiveThresholdZ && rvol >= archiveThresholdRVOL) {
      try {
        // Cooldown: check if we already archived this symbol today
        const existingEvent = await prisma.moverEvent.findFirst({
          where: { symbol, date: today }
        });

        if (!existingEvent) {
          // Fetch current AI category/reason from Ticker to persist in the event if available
          const tickerData = await prisma.ticker.findUnique({
            where: { symbol },
            select: { moversCategory: true, moversReason: true }
          });

          await prisma.moverEvent.create({
            data: {
              symbol,
              date: today,
              priceAtEvent: normalized.price,
              zScore,
              rvol,
              changePct: changePctToUse,
              category: tickerData?.moversCategory ?? null,
              reason: tickerData?.moversReason ?? null,
              timestamp: normalized.timestamp
            }
          });
          console.log(`📜 [MoversArchive] Archived event for ${symbol} (zScore: ${zScore.toFixed(2)}, rvol: ${rvol.toFixed(2)})`);
        }
      } catch (archiveError) {
        console.warn(`⚠️ Failed to archive MoverEvent for ${symbol}:`, archiveError);
      }
    }

    return { success: true, effectiveChangePct: changePctToUse, zScore, rvol };
  } catch (error) {
    console.error(`Error upserting ${symbol} to DB:`, error);
    return { success: false, effectiveChangePct: normalized ? normalized.changePct : 0, zScore: 0, rvol: 0 };
  }
}

/**
 * Save regular close prices (16:00 ET)
 * 
 * CRITICAL: regularClose must be adjusted (same as previousClose)
 * Polygon snapshot day.c is already adjusted, so we use it directly
 */
export { fetchPolygonSnapshot, calculateExpectedVolume, normalizeSnapshot, upsertToDB };
