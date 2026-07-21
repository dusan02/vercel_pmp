import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import {
  fetchTickers,
  fetchPriceData,
  fetchCachedStockData,
  fetchPrevCloseOnDemand,
  computeDateBoundaries,
  deduplicateSessionPrices,
  deduplicateDailyRefs,
} from '@/lib/heatmap/heatmapFetcher';
import {
  computeTransformContext,
  transformToHeatmap,
  buildPayload,
  buildPriceMap,
  buildPrevCloseMaps,
} from '@/lib/heatmap/heatmapTransformer';

const CACHE_KEY = `heatmap-data:${process.env.NEXT_PUBLIC_BUILD_ID || 'dev'}`;
const CACHE_TTL = 900;
const ETAG_BUCKET_SIZE = 5000;
const MAX_DATA_AGE_FOR_ETAG = 5 * 60 * 1000;

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

/**
 * Heatmap endpoint - načítava dáta priamo z DB (SessionPrice, DailyRef, Ticker)
 * Rýchlejšie ako volanie /api/stocks s 3000 tickermi (500-1000ms vs 10+ minút)
 * Používa Redis cache (15 min TTL) pre aktuálnejšie dáta
 * Podporuje force refresh cez query parameter: ?force=true
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  process.env.SILENT_PREVCLOSE_LOGS = 'true';

  try {
    const limitParam = request.nextUrl.searchParams.get('limit');
    const requestedLimit = limitParam ? Math.max(1, Math.min(3000, Number(limitParam))) : null;
    const timeframe = request.nextUrl.searchParams.get('timeframe') || 'day';
    const forceRefresh = request.nextUrl.searchParams.get('force') === 'true';
    const debug = request.nextUrl.searchParams.get('debug') === 'true';
    const ifNoneMatch = request.headers.get('if-none-match');

    const timeBucket = Math.floor(Date.now() / ETAG_BUCKET_SIZE);
    const etag = `"heatmap-${timeBucket}"`;

    // 1. Cache + ETag check
    if (!forceRefresh) {
      try {
        const cachedData = await getCachedData(CACHE_KEY);

        if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
          const cacheTimestamp = (cachedData as any)?.[0]?._timestamp || null;
          const dataAgeMs = cacheTimestamp ? Date.now() - new Date(cacheTimestamp).getTime() : Infinity;

          if (ifNoneMatch && ifNoneMatch === etag) {
            if (dataAgeMs < MAX_DATA_AGE_FOR_ETAG) {
              console.log(`✅ Heatmap ETag match - returning 304 (data age: ${Math.floor(dataAgeMs / 1000)}s, ${Date.now() - startTime}ms)`);
              return new NextResponse(null, {
                status: 304,
                headers: {
                  'ETag': etag,
                  'Cache-Control': 'public, max-age=10, stale-while-revalidate=30'
                }
              });
            } else {
              console.log(`⚠️ Heatmap ETag match but data is stale (${Math.floor(dataAgeMs / 1000)}s old) - forcing refresh`);
            }
          }

          if (dataAgeMs < MAX_DATA_AGE_FOR_ETAG) {
            console.log(`✅ Heatmap cache hit - returning ${cachedData.length} companies (data age: ${Math.floor(dataAgeMs / 1000)}s, ${Date.now() - startTime}ms)`);
            const limited = requestedLimit ? cachedData.slice(0, requestedLimit) : cachedData;
            return NextResponse.json({
              success: true,
              data: limited,
              cached: true,
              count: limited.length,
              timestamp: new Date().toISOString(),
              lastUpdatedAt: cacheTimestamp || new Date().toISOString(),
            }, {
              headers: {
                'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
                'ETag': etag
              }
            });
          } else {
            console.log(`⚠️ Cache data is stale (${Math.floor(dataAgeMs / 1000)}s old) - fetching from DB`);
          }
        }
      } catch (cacheError) {
        console.warn('⚠️ Cache read error, continuing with DB fetch:', cacheError);
      }
    } else {
      console.log('🔄 Force refresh requested - bypassing cache');
    }

    console.log('🔄 Heatmap cache miss - fetching from DB...');

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
      return NextResponse.json(
        {
          success: false,
          error: `Database error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`,
          data: [],
          count: 0,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    if (tickers.length === 0) {
      console.warn('⚠️ No tickers found');
      return NextResponse.json({
        success: true,
        data: [],
        cached: false,
        count: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Compute date boundaries
    const now = new Date();
    const { todayYMD, today, tomorrow, oneWeekAgo, dayAgo } = computeDateBoundaries(now);

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
      cachedStockDataMap
    ] = await Promise.all([
      fetchPriceData(tickerSymbols, canUseFastPath, timeframe, dayAgo, tomorrow, oneWeekAgo, today),
      fetchCachedStockData(tickerSymbols, tickerMap),
    ]);

    const sessionPrices = deduplicateSessionPrices(rawSessionPrices);
    const dailyRefs = deduplicateDailyRefs(rawDailyRefs);

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
    const prelimPrevCloseMaps = buildPrevCloseMaps(rawDailyRefs, ctx);

    // 10. On-demand prevClose fetch
    const prevCloseBatchMap = await fetchPrevCloseOnDemand(
      tickerSymbols, tickerMap, cachedStockDataMap, prelimPrevCloseMaps.previousCloseMap, priceMap, todayYMD
    );

    // 11. Transform all data into heatmap rows (pass precomputed maps to avoid double computation)
    const transformResult = transformToHeatmap(
      tickerSymbols, tickerMap, sessionPrices, rawDailyRefs,
      cachedStockDataMap, prevCloseBatchMap, ctx, now, debug,
      { previousCloseMap: prelimPrevCloseMaps.previousCloseMap, regularCloseMap: prelimPrevCloseMaps.regularCloseMap, priceMap }
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
    } else {
      console.warn('⚠️ No valid timestamps found in SessionPrice records');
    }

    if (payload.length === 0) {
      const errorMsg = `No companies with valid data found. Checked ${tickerSymbols.length} tickers, found ${sessionPrices.length} SessionPrice records, ${dailyRefs.length} DailyRef records. Please ensure database is populated with recent data. The heatmap requires data from SessionPrice and DailyRef tables.`;
      console.error(`❌ ${errorMsg}`);
      return NextResponse.json(
        {
          success: false,
          error: errorMsg,
          data: [],
          count: 0,
          timestamp: new Date().toISOString(),
          ...(debug ? { debug: transformResult.debugStats } : {})
        },
        { status: 200 }
      );
    }

    // 13. Cache + respond
    try {
      await setCachedData(CACHE_KEY, payload, CACHE_TTL);
      const lastUpdatedAt = transformResult.maxUpdatedAt ? transformResult.maxUpdatedAt.toISOString() : new Date().toISOString();
      const duration = Date.now() - startTime;
      console.log(`✅ Heatmap data fetched from DB and cached: ${payload.length} companies (lastUpdated: ${lastUpdatedAt}) in ${duration}ms`);

      return NextResponse.json({
        success: true,
        data: payload,
        rows,
        cached: false,
        count: payload.length,
        timestamp: new Date().toISOString(),
        lastUpdatedAt,
        ...(debug ? { debug: transformResult.debugStats } : {})
      }, {
        headers: {
          'ETag': etag,
          'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
        },
      });
    } catch (cacheError) {
      console.warn('⚠️ Error caching heatmap results:', cacheError);
      const duration = Date.now() - startTime;
      const lastUpdatedAt = transformResult.maxUpdatedAt ? transformResult.maxUpdatedAt.toISOString() : new Date().toISOString();
      console.log(`✅ Heatmap data fetched from DB (cache failed): ${payload.length} companies (lastUpdated: ${lastUpdatedAt}) in ${duration}ms`);

      return NextResponse.json({
        success: true,
        data: payload,
        cached: false,
        count: payload.length,
        timestamp: new Date().toISOString(),
        lastUpdatedAt,
        ...(debug ? { debug: transformResult.debugStats } : {})
      }, {
        headers: {
          'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
        },
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Error in /api/heatmap (${duration}ms):`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: [],
        count: 0,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    delete process.env.SILENT_PREVCLOSE_LOGS;
  }
}
