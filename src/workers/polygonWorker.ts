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
import { nowET, detectSession, isMarketOpen, mapToRedisSession } from '@/lib/utils/timeUtils';
import { withRetry, circuitBreaker } from '@/lib/api/rateLimiter';
// DLQ import - commented out to avoid startup issues
// import { addToDLQ } from '@/lib/dlq';
import { updateRankIndexes, getDateET, updateStatsCache, getRankMinMax } from '@/lib/redis/ranking';
import { computeMarketCap, computeMarketCapDiff, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { prisma } from '@/lib/db/prisma';
import type { MarketSession } from '@/lib/types';

// Circuit breaker for Polygon API
const polygonCircuitBreaker = circuitBreaker('polygon', 5, 2, 60000);

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
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15s delay
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
 */
function normalizeSnapshot(
  snapshot: PolygonSnapshot,
  previousClose: number | null
): {
  price: number;
  changePct: number;
  timestamp: Date;
  quality: 'delayed_15m' | 'rest' | 'snapshot';
} | null {
  // Determine price source (prefer lastTrade, then lastQuote, then day close)
  let price: number | null = null;
  let timestamp: number | null = null;

  if (snapshot.lastTrade?.p) {
    price = snapshot.lastTrade.p;
    timestamp = snapshot.lastTrade.t;
  } else if (snapshot.lastQuote?.p) {
    price = snapshot.lastQuote.p;
    timestamp = snapshot.lastQuote.t;
  } else if (snapshot.day?.c) {
    price = snapshot.day.c;
    timestamp = snapshot.min?.t || Date.now();
  }

  if (!price || !timestamp) {
    return null;
  }

  // Calculate change percentage
  const prevClose = previousClose || snapshot.prevDay?.c || snapshot.day?.c;
  const changePct = prevClose ? ((price / prevClose) - 1) * 100 : 0;

  // Determine quality (Polygon Starter = delayed_15m)
  const quality: 'delayed_15m' | 'rest' | 'snapshot' =
    process.env.POLYGON_PLAN === 'starter' ? 'delayed_15m' : 'rest';

  return {
    price,
    changePct,
    timestamp: new Date(timestamp),
    quality
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
  marketCapDiff: number
): Promise<boolean> {
  if (!normalized) return false;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert ticker if not exists
    // Update price/market cap columns for sorting
    if (symbol === 'GOOG' || symbol === 'GOOGL') {
      console.log(`🔍 Debug DB Upsert ${symbol}: Attempting to set latestPrevClose=${previousClose || 0}`);
    }

    await prisma.ticker.upsert({
      where: { symbol },
      update: {
        // Only update updatedAt and dynamic columns
        updatedAt: new Date(),
        lastPrice: normalized.price,
        lastChangePct: normalized.changePct,
        lastMarketCap: marketCap,
        lastMarketCapDiff: marketCapDiff,
        lastPriceUpdated: normalized.timestamp,
        // Always update latestPrevClose if we have it
        ...(previousClose ? { latestPrevClose: previousClose } : {})
      },
      create: {
        symbol,
        // Static fields will be populated by bootstrap script
        updatedAt: new Date(),
        lastPrice: normalized.price,
        lastChangePct: normalized.changePct,
        lastMarketCap: marketCap,
        lastMarketCapDiff: marketCapDiff,
        lastPriceUpdated: normalized.timestamp,
        latestPrevClose: previousClose || 0
      }
    });

    // Upsert session price (only if newer - idempotent)
    const existing = await prisma.sessionPrice.findUnique({
      where: {
        symbol_date_session: {
          symbol,
          date: today,
          session
        }
      }
    });

    // Only update if incoming timestamp is newer or equal
    if (!existing || normalized.timestamp >= existing.lastTs) {
      await prisma.sessionPrice.upsert({
        where: {
          symbol_date_session: {
            symbol,
            date: today,
            session
          }
        },
        update: {
          lastPrice: normalized.price,
          lastTs: normalized.timestamp,
          changePct: normalized.changePct,
          source: normalized.quality,
          quality: normalized.quality,
          updatedAt: new Date()
        },
        create: {
          symbol,
          date: today,
          session,
          lastPrice: normalized.price,
          lastTs: normalized.timestamp,
          changePct: normalized.changePct,
          source: normalized.quality,
          quality: normalized.quality
        }
      });
    } else {
      console.log(`⏭️ Skipping ${symbol} - existing data is newer (${existing.lastTs} > ${normalized.timestamp})`);
    }

    // Upsert daily ref if previous close is available
    if (previousClose) {
      await prisma.dailyRef.upsert({
        where: {
          symbol_date: {
            symbol,
            date: today
          }
        },
        update: {
          previousClose,
          updatedAt: new Date()
        },
        create: {
          symbol,
          date: today,
          previousClose
        }
      });
    }

    return true;
  } catch (error) {
    console.error(`Error upserting ${symbol} to DB:`, error);
    return false;
  }
}

/**
 * Save regular close prices (16:00 ET)
 */
async function saveRegularClose(apiKey: string, date: string): Promise<void> {
  try {
    console.log('💾 Starting regular close save...');
    const tickers = await getUniverse('sp500');

    if (tickers.length === 0) {
      console.warn('⚠️ No tickers in universe, skipping regular close save');
      return;
    }

    console.log(`📊 Fetching regular close for ${tickers.length} tickers...`);
    const snapshots = await fetchPolygonSnapshot(tickers, apiKey);
    console.log(`✅ Received ${snapshots.length} snapshots`);

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    let saved = 0;
    for (const snapshot of snapshots) {
      try {
        const symbol = snapshot.ticker;
        // Get regular close from snapshot (day.c is the regular session close)
        const regularClose = snapshot.day?.c;

        if (regularClose && regularClose > 0) {
          // Update DailyRef with regular close
          await prisma.dailyRef.upsert({
            where: {
              symbol_date: {
                symbol,
                date: dateObj
              }
            },
            update: {
              regularClose
            },
            create: {
              symbol,
              date: dateObj,
              previousClose: regularClose, // Fallback if previousClose not set
              regularClose
            }
          });
          saved++;
        }
      } catch (error) {
        console.error(`Error saving regular close for ${snapshot.ticker}:`, error);
      }
    }

    console.log(`✅ Saved regular close for ${saved}/${snapshots.length} tickers`);
  } catch (error) {
    console.error('Error in saveRegularClose:', error);
  }
}

/**
 * Main ingest function
 * Exported for manual execution
 */
export async function ingestBatch(
  tickers: string[],
  apiKey: string
): Promise<IngestResult[]> {
  const session = detectSession(nowET());
  const today = (new Date().toISOString().split('T')[0] || '') as string; // YYYY-MM-DD
  const results: IngestResult[] = [];

  // Fetch previous closes from Redis
  const prevCloseMap = await getPrevClose(today, tickers);
  
  // If no previous closes in Redis, try to load from DB
  if (prevCloseMap.size === 0) {
    console.log('⚠️ No previous closes found in Redis, checking DB...');
    try {
      const dailyRefs = await prisma.dailyRef.findMany({
        where: {
          symbol: { in: tickers },
          date: new Date(today)
        },
        select: { symbol: true, previousClose: true }
      });
      
      if (dailyRefs.length > 0) {
        console.log(`✅ Loaded ${dailyRefs.length} previous closes from DB`);
        for (const ref of dailyRefs) {
          prevCloseMap.set(ref.symbol, ref.previousClose);
          // Also update Redis cache
          await setPrevClose(today, ref.symbol, ref.previousClose);
        }
      }
    } catch (dbError) {
      console.error('Error loading previous closes from DB:', dbError);
    }
  }

  // If still missing previous closes, try to fetch from Polygon (even if market closed)
  // This handles the case where Redis/DB are empty after restart
  const missingPrevClose = tickers.filter(t => !prevCloseMap.has(t));
  if (missingPrevClose.length > 0) {
    console.log(`⚠️ Missing previous close for ${missingPrevClose.length} tickers, attempting to fetch...`);
    // Only fetch a few to avoid rate limits if many are missing
    const toFetch = missingPrevClose.slice(0, 50); 
    await bootstrapPreviousCloses(toFetch, apiKey, today);
    
    // Reload map after bootstrap
    const refreshedMap = await getPrevClose(today, toFetch);
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

  // Process each snapshot
  for (const snapshot of snapshots) {
    const symbol = snapshot.ticker;
    const previousClose = prevCloseMap.get(symbol) || null;
    
    // Determine effective previous close (used for calculation)
    const snapshotPrevClose = snapshot.prevDay?.c || snapshot.day?.c || null;
    const effectivePrevClose = previousClose || snapshotPrevClose;

    if (symbol === 'AAPL' || symbol === 'GOOGL') {
      console.log(`🔍 Debug ${symbol}: MapPrevClose=${previousClose}, SnapPrevClose=${snapshotPrevClose}, Effective=${effectivePrevClose}`);
    }

    try {
      // Normalize
      const normalized = normalizeSnapshot(snapshot, previousClose);
      if (!normalized) {
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
        shares = await getSharesOutstanding(symbol);
      }

      const marketCap = computeMarketCap(normalized.price, shares);
      const marketCapDiff = effectivePrevClose
        ? computeMarketCapDiff(normalized.price, effectivePrevClose, shares)
        : 0;

      // Upsert to DB (includes updating Ticker table for sorting)
      // Pass effectivePrevClose to update Ticker.latestPrevClose
      const dbSuccess = await upsertToDB(symbol, session, normalized, effectivePrevClose, marketCap, marketCapDiff);

      // Write to Redis (atomic operation)
      const priceData: PriceData = {
        p: normalized.price,
        change: normalized.changePct,
        ts: normalized.timestamp.getTime(),
        source: normalized.quality,
        quality: normalized.quality
      };

      // Map 'closed' to 'after' for Redis operations
      const redisSession = mapToRedisSession(session);

      // Atomic update: last price + heatmap
      await atomicUpdatePrice(redisSession, symbol, priceData, normalized.changePct);

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
        changePct: normalized.changePct,
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
        checkAndUpdateStats('chg', Math.round(normalized.changePct * 10000))
      ]);

      // Publish to Redis Pub/Sub (for WebSocket)
      await publishTick(symbol, redisSession, priceData);

      results.push({
        symbol,
        price: normalized.price,
        changePct: normalized.changePct,
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
  console.log(`🔄 Bootstrapping previous closes for ${tickers.length} tickers...`);

  // Fetch previous day's close prices from Polygon aggregates
  for (const symbol of tickers) {
    try {
      let prevClose = 0;
      // Look back up to 3 days (to handle weekends/holidays)
      for (let i = 1; i <= 3; i++) {
        const prevDate = new Date(date);
        prevDate.setDate(prevDate.getDate() - i);
        const prevDateStr = prevDate.toISOString().split('T')[0];

        // Use adjusted=true for split-adjusted prices
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${prevDateStr}/${prevDateStr}?adjusted=true&apiKey=${apiKey}`;
        const response = await withRetry(async () => fetch(url));

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            prevClose = data.results[0].c; // close price
            if (prevClose > 0) {
              await setPrevClose(date, symbol, prevClose);
              
              // Save to DB immediately for persistence
              try {
                await prisma.dailyRef.upsert({
                  where: { symbol_date: { symbol, date: new Date(date) } },
                  update: { previousClose: prevClose, updatedAt: new Date() },
                  create: { symbol, date: new Date(date), previousClose: prevClose }
                });
              } catch (dbErr) {
                console.warn(`⚠️ Failed to save bootstrapped prevClose to DB for ${symbol}:`, dbErr);
              }

              console.log(`✅ Set previous close for ${symbol} (from ${prevDateStr}): $${prevClose}`);
              break; // Found it, stop looking back
            }
          }
        }
        // Small delay between attempts
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Error bootstrapping ${symbol}:`, error);
    }
  }
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
      const now = new Date();
      const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const hours = easternTime.getHours();
      const minutes = easternTime.getMinutes();

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
      const today = easternTime.toISOString().split('T')[0] || '';
      const tickers = await getUniverse('sp500');

      if (tickers.length > 0 && today) {
        const { getPrevClose } = await import('@/lib/redis/operations');
        const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 10));

        // Bootstrap if: (1) it's 04:00 ET, or (2) previous closes are missing (any time before market close)
        const shouldBootstrap = (hours === 4 && minutes === 0) ||
          (samplePrevCloses.size === 0 && hours >= 0 && hours < 16);

        if (shouldBootstrap) {
          console.log('🔄 Bootstrapping previous closes...');
          await bootstrapPreviousCloses(tickers, apiKey, today);
        }
      }

      // 16:00 ET - Save regular close, switch to after-hours
      if (hours === 16 && minutes === 0) {
        console.log('🔄 Saving regular close...');
        await saveRegularClose(apiKey, today);
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

    const ingestLoop = async () => {
      const etNow = nowET();
      const session = detectSession(etNow);

      // Always try to ingest (even when market closed, we can get previous close)
      const tickers = await getUniverse('sp500'); // Get from Redis

      if (tickers.length === 0) {
        console.log('⚠️ Universe is empty, waiting...');
        return;
      }

      // If market is closed, still try to bootstrap previous closes if missing
      if (session === 'closed' || !isMarketOpen(etNow)) {
        const today = new Date().toISOString().split('T')[0] || '';
        if (!today) return;
        const { getPrevClose } = await import('@/lib/redis/operations');
        const samplePrevCloses = await getPrevClose(today, tickers.slice(0, 10));

        if (samplePrevCloses.size === 0) {
          console.log(`⏸️ Market closed (session: ${session}), but previous closes missing - bootstrapping...`);
          await bootstrapPreviousCloses(tickers, apiKey, today);
        } else {
          console.log(`⏸️ Market closed (session: ${session}), waiting...`);
        }
        return;
      }

      // Market is open - normal ingest with prioritization
      console.log(`📊 Market open (session: ${session}), ingesting with prioritization...`);

      // Prioritize tickers: top 200 get frequent updates (60s), rest less frequent (5min)
      const { getAllProjectTickers } = await import('@/data/defaultTickers');
      const premiumTickers = getAllProjectTickers('pmp').slice(0, 200); // Top 200

      // Load last update times from Redis (persistent across restarts)
      const { redisClient } = await import('@/lib/redis');
      const lastUpdateMap = new Map<string, number>();
      const PREMIUM_INTERVAL = 60 * 1000; // 60s for top 200
      const REST_INTERVAL = 5 * 60 * 1000; // 5 min for rest

      // Load last update times from Redis
      if (redisClient && redisClient.isOpen) {
        const updateKeys = tickers.map(t => `worker:last_update:${t}`);
        try {
          const updateTimes = await redisClient.mGet(updateKeys);
          tickers.forEach((ticker, idx) => {
            const timeStr = updateTimes[idx];
            if (timeStr) {
              lastUpdateMap.set(ticker, parseInt(timeStr, 10));
            }
          });
        } catch (error) {
          console.warn('Failed to load last update times from Redis:', error);
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

      console.log(`📊 Processing ${prioritizedTickers.length} tickers: ${premiumNeedingUpdate.length} premium (60s), ${restNeedingUpdate.length} rest (5min)`);

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
          await ingestBatch(batch, apiKey);
          hasSuccess = true;

          // Update last update time in Redis for successfully processed tickers
          if (redisClient && redisClient.isOpen) {
            const updatePromises = batch.map(ticker => {
              const key = `worker:last_update:${ticker}`;
              return redisClient.setEx(key, 86400, now.toString()); // 24h TTL
            });
            await Promise.all(updatePromises).catch(err => {
              console.warn('Failed to save last update times to Redis:', err);
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

    // Run every 30 seconds for faster premium ticker updates
    // Premium tickers will be updated every 60s, rest every 5min
    setInterval(ingestLoop, 30000); // 30s check interval
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

