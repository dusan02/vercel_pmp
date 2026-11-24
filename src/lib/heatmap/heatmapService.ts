import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { detectSession } from '@/lib/utils/timeUtils';
import { nowET } from '@/lib/utils/dateET';
import {
  fetchTickers,
  fetchPriceData,
  fetchCachedStockData,
  fetchPrevCloseOnDemand,
  fetchWeekRefCloses,
  fetchLastSessionRefs,
  fetchPerfRefCloses,
  computeDateBoundaries,
  deduplicateSessionPrices,
  deduplicateDailyRefs,
} from './heatmapFetcher';
import {
  computeTransformContext,
  transformToHeatmap,
  buildPayload,
  buildPriceMap,
  buildPrevCloseMaps,
  toCompactRow,
  type HeatmapPayloadRow,
} from './heatmapTransformer';

/**
 * Shared heatmap data pipeline — used by /api/heatmap (HTTP layer keeps
 * ETag/status concerns) and by homepage SSR (which previously self-fetched
 * the API over localhost).
 *
 * Data flow: Redis cache (fresh < 60s) → else SessionPrice/DailyRef/Ticker
 * DB pipeline → transform → cache write.
 */

const CACHE_KEY = `heatmap-data:${process.env.NEXT_PUBLIC_BUILD_ID || 'dev'}`;
const CACHE_TTL = 900;
// Max age for the in-process fallback cache if Redis is unavailable (e.g. MISCONF/restart).
const MEMORY_FALLBACK_MAX_AGE_MS = 30 * 60 * 1000;
// With the Yahoo real-time overlay, DB prices update every ~60s during
// active sessions — a 5-min cache age cap would double the visible lag.
const MAX_DATA_AGE = 60 * 1000;

interface HeatmapMemoryCache {
  fetchedAt: number;
  payload: HeatmapPayloadRow[];
  rows: Record<string, unknown>[];
  dataTimestamp: string | null;
}

/**
 * In-process L1/fallback cache:
 * 1. Avoids re-mapping ~1,000 rows on every Redis hit when fetchedAt matches.
 * 2. Keeps serving stale-while-revalidate if Redis becomes unavailable (e.g. MISCONF),
 *    preventing 3-6s SQLite rebuilds on every incoming request.
 */
let memoryCache: HeatmapMemoryCache | null = null;

const DATE_RANGE = {
  DAYS_BACK: 1,
  MAX_TICKERS: 3000,
} as const;

const DATA_FRESHNESS = {
  HOUR_AGO: 60,
  MINUTES_AGO: 15,
  STALE_THRESHOLD: 0.1,
  OLD_DATA_THRESHOLD: 30,
} as const;

export interface HeatmapQuery {
  /** Clamp 1..3000; pass null/undefined for no limit. */
  limit?: number | null;
  timeframe?: string;
  forceRefresh?: boolean;
  debug?: boolean;
}

export type HeatmapServiceResult =
  | {
      ok: true;
      payload: unknown[];
      rows: Record<string, unknown>[];
      count: number;
      fromCache: boolean;
      /** Age of the underlying price data — the route needs it for ETag freshness. */
      dataAgeMs: number;
      lastUpdatedAt: string;
      debugStats?: unknown;
    }
  | {
      ok: false;
      /** Suggested HTTP status — 'empty'/'no_results' map to 200 (data is valid, just absent). */
      kind: 'db_error' | 'empty' | 'no_results';
      error: string;
      debug?: Record<string, unknown>;
    };

/**
 * Single-flight rebuild: concurrent cache misses share one DB rebuild
 * instead of stampeding SQLite/Redis (was the cause of multi-second
 * queueing and nginx 504s during pre-market open rebuild bursts).
 */
let inflightRebuild: Promise<HeatmapServiceResult> | null = null;

function startHeatmapRebuild(opts: { timeframe: string; forceRefresh: boolean; debug: boolean }): Promise<HeatmapServiceResult> {
  if (!inflightRebuild) {
    inflightRebuild = rebuildHeatmapData(opts).finally(() => { inflightRebuild = null; });
  }
  return inflightRebuild;
}

function applyLimit(result: HeatmapServiceResult, requestedLimit: number | null): HeatmapServiceResult {
  if (!result.ok || !requestedLimit || result.payload.length <= requestedLimit) return result;
  return {
    ...result,
    payload: result.payload.slice(0, requestedLimit),
    rows: result.rows.slice(0, requestedLimit),
    count: requestedLimit,
  };
}

function buildCachedResult(
  payload: unknown[],
  rows: Record<string, unknown>[],
  dataTimestamp: string | null,
  dataAgeMs: number,
  requestedLimit: number | null,
): HeatmapServiceResult {
  const limitedPayload = requestedLimit ? payload.slice(0, requestedLimit) : payload;
  const limitedRows = requestedLimit ? rows.slice(0, requestedLimit) : rows;
  return {
    ok: true,
    payload: limitedPayload,
    rows: limitedRows,
    count: limitedPayload.length,
    fromCache: true,
    dataAgeMs,
    lastUpdatedAt: dataTimestamp || new Date().toISOString(),
  };
}

export async function getHeatmapData(query: HeatmapQuery = {}): Promise<HeatmapServiceResult> {
  const startTime = Date.now();
  // NaN (non-numeric ?limit=) must not reach prisma.take — it 500s.
  const requestedLimit = typeof query.limit === 'number' && isFinite(query.limit)
    ? Math.max(1, Math.min(3000, query.limit))
    : null;
  const timeframe = query.timeframe || 'day';
  const forceRefresh = query.forceRefresh === true;
  const debug = query.debug === true;

  const rebuildWindowMs = detectSession(nowET()) === 'closed' ? CACHE_TTL * 1000 : MAX_DATA_AGE;

  // 1. Cache check (in-memory L1 → Redis → stale-while-revalidate fallback)
  if (!forceRefresh) {
    // 1a. Fast L1 hit: avoids Redis round-trip + JSON.parse(~1.4MB) + toCompactRow map
    if (memoryCache && memoryCache.payload.length > 0) {
      const memFetchAgeMs = Date.now() - memoryCache.fetchedAt;
      const memDataAgeMs = memoryCache.dataTimestamp
        ? Date.now() - new Date(memoryCache.dataTimestamp).getTime()
        : Infinity;
      if (memDataAgeMs < MAX_DATA_AGE || memFetchAgeMs < rebuildWindowMs) {
        return buildCachedResult(
          memoryCache.payload,
          memoryCache.rows,
          memoryCache.dataTimestamp,
          memDataAgeMs,
          requestedLimit,
        );
      }
    }

    let cachedData: HeatmapPayloadRow[] | null = null;
    let fetchedAtMs: number | null = null;

    try {
      const cachedEnvelope = await getCachedData(CACHE_KEY);
      // Envelope {fetchedAt, data} since 2026-10; tolerate legacy bare array.
      const candidate = Array.isArray(cachedEnvelope) ? cachedEnvelope : (cachedEnvelope as any)?.data;
      if (Array.isArray(candidate) && candidate.length > 0) {
        cachedData = candidate as HeatmapPayloadRow[];
        fetchedAtMs = !Array.isArray(cachedEnvelope) && typeof (cachedEnvelope as any)?.fetchedAt === 'number'
          ? (cachedEnvelope as any).fetchedAt
          : null;
      }
    } catch (cacheError) {
      console.warn('⚠️ Cache read error, checking in-memory fallback:', cacheError);
    }

    if (cachedData) {
      const cacheTimestamp = (cachedData as any)?.[0]?._timestamp || null;
      const dataAgeMs = cacheTimestamp ? Date.now() - new Date(cacheTimestamp).getTime() : Infinity;
      const fetchAgeMs = fetchedAtMs ? Date.now() - fetchedAtMs : Infinity;

      const rows = (memoryCache && fetchedAtMs && memoryCache.fetchedAt === fetchedAtMs)
        ? memoryCache.rows
        : cachedData.map(toCompactRow);

      if (!memoryCache || (fetchedAtMs && memoryCache.fetchedAt !== fetchedAtMs)) {
        memoryCache = {
          fetchedAt: fetchedAtMs ?? Date.now(),
          payload: cachedData,
          rows,
          dataTimestamp: cacheTimestamp,
        };
      }

      if (dataAgeMs < MAX_DATA_AGE || fetchAgeMs < rebuildWindowMs) {
        console.log(`✅ Heatmap cache hit - returning ${cachedData.length} companies (data age: ${Math.floor(dataAgeMs / 1000)}s, ${Date.now() - startTime}ms)`);
        return buildCachedResult(cachedData, rows, cacheTimestamp, dataAgeMs, requestedLimit);
      }

      // Stale-while-revalidate: serve stale payload immediately and rebuild in background.
      console.log(`⚠️ Cache data is stale (${Math.floor(dataAgeMs / 1000)}s old) - serving stale + rebuilding in background`);
      void startHeatmapRebuild({ timeframe, forceRefresh: false, debug }).then((res) => {
        if (!res.ok) console.warn('⚠️ Heatmap background rebuild failed:', res.error);
      }).catch((err) => {
        console.warn('⚠️ Heatmap background rebuild error:', err);
      });
      return buildCachedResult(cachedData, rows, cacheTimestamp, dataAgeMs, requestedLimit);
    }

    // 1b. Redis returned null/error — serve bounded in-memory fallback if present
    // so a Redis outage/MISCONF never triggers 3-6s DB rebuilds on every hit.
    if (memoryCache && memoryCache.payload.length > 0 && (Date.now() - memoryCache.fetchedAt) < MEMORY_FALLBACK_MAX_AGE_MS) {
      const memDataAgeMs = memoryCache.dataTimestamp
        ? Date.now() - new Date(memoryCache.dataTimestamp).getTime()
        : Infinity;
      console.warn(`⚠️ Redis heatmap cache miss — serving in-memory fallback (${Math.floor((Date.now() - memoryCache.fetchedAt) / 1000)}s old) + background rebuild`);
      void startHeatmapRebuild({ timeframe, forceRefresh: false, debug }).then((res) => {
        if (!res.ok) console.warn('⚠️ Heatmap background rebuild failed:', res.error);
      }).catch((err) => {
        console.warn('⚠️ Heatmap background rebuild error:', err);
      });
      return buildCachedResult(
        memoryCache.payload,
        memoryCache.rows,
        memoryCache.dataTimestamp,
        memDataAgeMs,
        requestedLimit,
      );
    }
  }

  // 2. Cold cache (or force) — all concurrent misses await one shared rebuild.
  console.log('🔄 Heatmap cache miss - awaiting shared DB rebuild...');
  return applyLimit(await startHeatmapRebuild({ timeframe, forceRefresh, debug }), requestedLimit);
}

/**
 * Full DB rebuild pipeline — always produces the complete payload; callers
 * slice per-request (a ?limit= request must not shrink the shared cache).
 */
async function rebuildHeatmapData(opts: { timeframe: string; forceRefresh: boolean; debug: boolean }): Promise<HeatmapServiceResult> {
  const startTime = Date.now();
  process.env.SILENT_PREVCLOSE_LOGS = 'true';

  try {
    const timeframe = opts.timeframe;
    const forceRefresh = opts.forceRefresh;
    const debug = opts.debug;
    // Rebuild always computes the full payload — limit is applied per-request
    // by callers so a mobile ?limit=250 can't shrink the shared cache.
    const requestedLimit = null;

    // 2. Fetch tickers from DB
    let tickers: any[];
    let tickerMap: Map<string, any>;
    let tickerSymbols: string[];
    try {
      const result = await fetchTickers(DATE_RANGE.MAX_TICKERS);
      tickers = result.tickers;
      tickerMap = result.tickerMap;
      tickerSymbols = result.tickerSymbols;
    } catch (dbError) {
      console.error('❌ Database query error:', dbError);
      return {
        ok: false,
        kind: 'db_error',
        error: `Database error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`,
      };
    }

    if (tickers.length === 0) {
      console.warn('⚠️ No tickers found');
      return { ok: false, kind: 'empty', error: 'No tickers found' };
    }

    // 3. Compute date boundaries
    const now = new Date();
    const { todayYMD, today, tomorrow, oneWeekAgo, weekRefLookback, dayAgo } = computeDateBoundaries(now);

    // 4. Fast path check
    const FAST_PATH_MIN_FRESH = 100;
    const fastPathFreshCount = tickers.filter((t: any) => {
      if (!t.lastPriceUpdated) return false;
      const ageMs = Date.now() - new Date(t.lastPriceUpdated).getTime();
      return ageMs < 30 * 60 * 1000;
    }).length;
    const canUseFastPath = timeframe === 'day' && !forceRefresh && fastPathFreshCount >= FAST_PATH_MIN_FRESH;

    console.log(`📅 Date range: ${oneWeekAgo.toISOString()} to ${tomorrow.toISOString()} (last 7 days for DailyRef fallback)`);

    // 5. Fetch SessionPrice + DailyRef AND cached stock data in parallel
    const [
      { sessionPrices: rawSessionPrices, dailyRefs: rawDailyRefs },
      cachedStockDataMap,
      slimWeekRefs,
      lastSessionRefs,
      perfRefs
    ] = await Promise.all([
      fetchPriceData(tickerSymbols, canUseFastPath, timeframe, dayAgo, tomorrow, weekRefLookback, today),
      fetchCachedStockData(tickerSymbols, tickerMap),
      // Fast path skips the full DailyRef query — fetch a slim week-reference
      // projection so the 'week' metric still has data.
      canUseFastPath ? fetchWeekRefCloses(tickerSymbols, weekRefLookback, today) : Promise.resolve(null),
      // Last completed session's DailyRef pair (close + prevClose) — lets the
      // transformer substitute Friday's real move during the pre-open gap
      // when tickers carry no post-flip print yet (price == new prevClose → 0%).
      fetchLastSessionRefs(tickerSymbols, dayAgo),
      // Longer-term perf refs (1M/YTD/1Y) from DailyValuationHistory — always
      // fetched (3 small windowed queries) so the shared cache payload carries
      // all metrics regardless of which one the requesting client selected.
      fetchPerfRefCloses(tickerSymbols, now, todayYMD),
    ]);

    const effectiveDailyRefs = rawDailyRefs.length > 0 ? rawDailyRefs : ((slimWeekRefs ?? []) as any[]);
    const sessionPrices = deduplicateSessionPrices(rawSessionPrices);
    const dailyRefs = deduplicateDailyRefs(effectiveDailyRefs);

    // 6. Freshness check
    const recentCount = sessionPrices.filter(sp => {
      if (!sp.lastTs) return false;
      const cutoff = new Date(now);
      cutoff.setMinutes(cutoff.getMinutes() - DATA_FRESHNESS.HOUR_AGO);
      return new Date(sp.lastTs) >= cutoff;
    }).length;
    const veryRecentCount = sessionPrices.filter(sp => {
      if (!sp.lastTs) return false;
      const cutoff = new Date(now);
      cutoff.setMinutes(cutoff.getMinutes() - DATA_FRESHNESS.MINUTES_AGO);
      return new Date(sp.lastTs) >= cutoff;
    }).length;

    console.log(`💰 Unique SessionPrice records: ${sessionPrices.length} (${recentCount} from last hour, ${veryRecentCount} from last 15 minutes)`);

    if (recentCount < sessionPrices.length * DATA_FRESHNESS.STALE_THRESHOLD) {
      console.warn(`⚠️ Low data freshness: Only ${recentCount}/${sessionPrices.length} records from last hour`);
    }

    console.log(`📊 Unique DailyRef records: ${dailyRefs.length}`);

    // 7. Compute transform context
    const ctx = computeTransformContext();

    // 9. Build price map + preliminary prevClose map for on-demand fetch
    const priceMap = buildPriceMap(tickerMap, sessionPrices);
    const prelimPrevCloseMaps = buildPrevCloseMaps(effectiveDailyRefs, ctx);

    // 10. On-demand prevClose fetch
    const prevCloseBatchMap = await fetchPrevCloseOnDemand(
      tickerSymbols, tickerMap, cachedStockDataMap, prelimPrevCloseMaps.previousCloseMap, priceMap, todayYMD
    );

    // 11. Transform all data into heatmap rows (pass precomputed maps to avoid double computation)
    const transformResult = transformToHeatmap(
      tickerSymbols, tickerMap, sessionPrices, effectiveDailyRefs,
      cachedStockDataMap, prevCloseBatchMap, ctx, now, debug,
      slimWeekRefs ?? undefined, perfRefs,
      { previousCloseMap: prelimPrevCloseMaps.previousCloseMap, regularCloseMap: prelimPrevCloseMaps.regularCloseMap, priceMap, lastSessionRefMap: lastSessionRefs }
    );

    console.log(`✅ Processed ${transformResult.processed} tickers (${transformResult.cacheHits} from cache, ${transformResult.dbHits} from DB), skipped ${transformResult.skippedNoPrice} (no price), ${transformResult.skippedNoMarketCap} (no market cap)`);

    if (transformResult.results.length === 0) {
      console.warn('⚠️ No results after processing - possible causes:');
      console.warn(`  - No SessionPrice records found for ${tickerSymbols.length} tickers`);
      console.warn(`  - No DailyRef records found`);
      console.warn(`  - All tickers skipped due to missing price or market cap`);
      console.warn(`  - Date range: ${dayAgo.toISOString()} to ${tomorrow.toISOString()} (last trading day window)`);
    }

    // 12. Build payload
    const dataTimestamp = transformResult.maxUpdatedAt ? transformResult.maxUpdatedAt.toISOString() : new Date().toISOString();
    const { payload, rows } = buildPayload(transformResult.results, dataTimestamp, requestedLimit);

    console.log(`✅ Filtered to ${payload.length} companies with valid data`);

    if (transformResult.maxUpdatedAt) {
      const ageMinutes = Math.floor((Date.now() - transformResult.maxUpdatedAt.getTime()) / 60000);
      console.log(`📊 Latest data timestamp: ${transformResult.maxUpdatedAt.toISOString()} (${ageMinutes} minutes ago)`);
      if (ageMinutes > DATA_FRESHNESS.OLD_DATA_THRESHOLD) {
        console.warn(`⚠️ Data is ${ageMinutes} minutes old - may need worker update`);
      }
    } else if (sessionPrices.length > 0) {
      // Fast path returns no SessionPrice rows by design — only warn when
      // a real fetch happened and none carried a timestamp.
      console.warn('⚠️ No valid timestamps found in SessionPrice records');
    }

    if (payload.length === 0) {
      const errorMsg = `No companies with valid data found. Checked ${tickerSymbols.length} tickers, found ${sessionPrices.length} SessionPrice records, ${dailyRefs.length} DailyRef records. Please ensure database is populated with recent data. The heatmap requires data from SessionPrice and DailyRef tables.`;
      console.error(`❌ ${errorMsg}`);
      console.error(`❌ Skip breakdown: processed=${transformResult.processed}, cacheHits=${transformResult.cacheHits}, dbHits=${transformResult.dbHits}, skippedNoPrice=${transformResult.skippedNoPrice}, skippedNoMarketCap=${transformResult.skippedNoMarketCap}, results=${transformResult.results.length}`);
      return {
        ok: false,
        kind: 'no_results',
        error: errorMsg,
        ...(debug ? {
          debug: {
            debug: transformResult.debugStats,
            skipBreakdown: {
              processed: transformResult.processed,
              cacheHits: transformResult.cacheHits,
              dbHits: transformResult.dbHits,
              skippedNoPrice: transformResult.skippedNoPrice,
              skippedNoMarketCap: transformResult.skippedNoMarketCap,
              resultsBeforeFilter: transformResult.results.length,
            },
            ctx: {
              session: ctx.session,
              isNonTradingClosedDay: ctx.isNonTradingClosedDay,
              todayDateStr: ctx.todayDateStr,
              lastTradingDayForQuery: ctx.lastTradingDayForQuery.toISOString(),
              regularCloseReferenceDayStr: ctx.regularCloseReferenceDayStr,
            },
            cachedStockDataCount: cachedStockDataMap.size,
            priceMapSize: priceMap.size,
            prevCloseMapSize: prelimPrevCloseMaps.previousCloseMap.size,
            prevCloseBatchMapSize: prevCloseBatchMap.size,
          },
        } : {}),
      };
    }

    // 13. Cache + return
    const lastUpdatedAt = transformResult.maxUpdatedAt ? transformResult.maxUpdatedAt.toISOString() : new Date().toISOString();
    const dataAgeMs = transformResult.maxUpdatedAt ? Date.now() - transformResult.maxUpdatedAt.getTime() : 0;
    const fetchedAt = Date.now();
    // Always populate in-process fallback even if Redis write fails.
    memoryCache = { fetchedAt, payload, rows, dataTimestamp: lastUpdatedAt };
    try {
      const wrote = await setCachedData(CACHE_KEY, { fetchedAt, data: payload }, CACHE_TTL);
      if (wrote) {
        console.log(`✅ Heatmap data fetched from DB and cached: ${payload.length} companies (lastUpdated: ${lastUpdatedAt}) in ${Date.now() - startTime}ms`);
      } else {
        console.warn(`⚠️ Heatmap Redis cache write returned false (serving from in-memory fallback): ${payload.length} companies in ${Date.now() - startTime}ms`);
      }
    } catch (cacheError) {
      console.warn('⚠️ Error caching heatmap results:', cacheError);
      console.log(`✅ Heatmap data fetched from DB (cache failed): ${payload.length} companies (lastUpdated: ${lastUpdatedAt}) in ${Date.now() - startTime}ms`);
    }

    return {
      ok: true,
      payload,
      rows,
      count: payload.length,
      fromCache: false,
      dataAgeMs,
      lastUpdatedAt,
      ...(debug ? { debugStats: transformResult.debugStats } : {}),
    };
  } finally {
    delete process.env.SILENT_PREVCLOSE_LOGS;
  }
}

/**
 * Safe SSR prefetch helper — fetches top `limit` compact rows within
 * `timeoutMs`, returning `[]` on timeout or error so client hydration can
 * still recover via /api/heatmap.
 */
export async function getInitialHeatmapRows(limit = 300, timeoutMs = 2500): Promise<Record<string, unknown>[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      getHeatmapData({ limit }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return result && result.ok ? result.rows : [];
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
