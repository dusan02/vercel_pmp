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
  publishTick,
  atomicUpdatePrice
} from '@/lib/redis/operations';
import { PriceData } from '@/lib/types';
import { detectSession, mapToRedisSession, getLastTradingDay, getTradingDay } from '@/lib/utils/timeUtils';
import { nowET, getDateET, createETDate } from '@/lib/utils/dateET';
import { getPricingState } from '@/lib/utils/pricingStateMachine';
import { updateRankIndexes, updateStatsCache, getRankMinMax } from '@/lib/redis/ranking';
import { computeMarketCap, computeMarketCapDiff, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { prisma } from '@/lib/db/prisma';
import { processBatchWithConcurrency } from '@/lib/batchProcessor';

import { polygonCircuitBreaker, __IS_TEST__, sleep, PolygonSnapshot, IngestResult } from './shared';
import { fetchPolygonSnapshot, normalizeSnapshot, upsertToDB } from './core';
import { checkStaticLock, resolvePrevCloses, loadRegularCloses, loadFrozenPrices } from './prevCloseResolver';
import { batchLoadLastChangePct, batchLoadTickerStats } from './batchStatsLoader';

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

  // Check static data lock
  const { isLocked: isStaticUpdateLocked } = await checkStaticLock();

  // Resolve previous closes: Redis → DB → bootstrap
  const prevCloseMap = await resolvePrevCloses(
    tickers, calendarDateETStr, calendarDateET, apiKey, isStaticUpdateLocked
  );

  // Fetch snapshots from Polygon
  console.log(`📥 Fetching snapshots for ${tickers.length} tickers...`);
  const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
  console.log(`✅ Received ${snapshots.length} snapshots`);

  // Batch fetch sharesOutstanding pre tickery, kt. majú prevClose ale chýbajú im shares.
  // marketCapDiff je 0 keď prevClose chýba (pozri riadok nižšie), takže shares
  // sú potrebné len pre tickery kde prevClose existuje.
  const symbolsNeedingShares = snapshots.map(s => s.ticker).filter(symbol => {
    return prevCloseMap.has(symbol);
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

  // Load regular closes and frozen prices
  const regularCloseMap = await loadRegularCloses(tickers, calendarDateET, session);
  const frozenPricesMap = await loadFrozenPrices(tickers, pricingState.useFrozenPrice);

  // Batch load per-ticker metadata
  const lastChangePctMap = isStaticUpdateLocked
    ? await batchLoadLastChangePct(tickers)
    : new Map<string, number | null>();
  const statsMap = await batchLoadTickerStats(tickers);
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

        if (!normalized) {
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

        const cachedLastChangePct = lastChangePctMap.get(symbol);
        const stats = statsMap.get(symbol);
        const { success: dbSuccess, effectiveChangePct, effectivePrice, marketCap, marketCapDiff, zScore, rvol } = await upsertToDB(
          symbol, session, normalized, previousClose, shares, isStaticUpdateLocked, cachedLastChangePct, stats, force
        );

        const priceData: PriceData = {
          p: effectivePrice,
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