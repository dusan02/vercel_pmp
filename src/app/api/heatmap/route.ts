import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { StockData } from '@/lib/types';
import { SessionPrice, DailyRef } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { formatMarketCapDiff } from '@/lib/utils/format';
import { computeMarketCap, computeMarketCapDiff, computePercentChange, getPreviousClose } from '@/lib/utils/marketCapUtils';
import { getCacheKey } from '@/lib/redis/keys';
import { getDateET, createETDate, toET } from '@/lib/utils/dateET';
import { detectSession, nowET } from '@/lib/utils/timeUtils';
import { SECTOR_INDUSTRY_OVERRIDES } from '@/data/sectorIndustryOverrides';

const CACHE_KEY = 'heatmap-data';
const CACHE_TTL = 900; // 15 minút (prekvitie s 10m cronom)
const ETAG_BUCKET_SIZE = 5000; // 5 sekúnd

const MAX_DATA_AGE_FOR_ETAG = 5 * 60 * 1000; // 5 minút - ak sú dáta staršie, nevrátime 304

// Konštanty pre kontrolu aktuálnosti dát
const DATA_FRESHNESS = {
  HOUR_AGO: 60, // minút
  MINUTES_AGO: 15, // minút
  STALE_THRESHOLD: 0.1, // 10% - ak je menej ako 10% záznamov z posledných 15 min, varovanie
  OLD_DATA_THRESHOLD: 30, // minút - ak sú dáta staršie, varovanie
} as const;

// Konštanty pre date range - 24h okno pre heatmap.today
const DATE_RANGE = {
  DAYS_BACK: 1, // Posledných 24h (1 deň) pre heatmap.today
  MAX_TICKERS: 3000, // Maximálny počet tickerov
} as const;

/**
 * Heatmap endpoint - načítava dáta priamo z DB (SessionPrice, DailyRef, Ticker)
 * Rýchlejšie ako volanie /api/stocks s 3000 tickermi (500-1000ms vs 10+ minút)
 * Používa Redis cache (30s TTL) pre aktuálnejšie dáta
 * Podporuje force refresh cez query parameter: ?force=true
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  // Tichý režim pre prevClose logy (aby sa nezobrazovali stovky správ)
  process.env.SILENT_PREVCLOSE_LOGS = 'true';

  try {
    // OPTIMIZATION: Support limiting payload (mobile treemap only needs a subset)
    // We still compute the full set if needed, but we can cut down response size significantly.
    const limitParam = request.nextUrl.searchParams.get('limit');
    const requestedLimit = limitParam ? Math.max(1, Math.min(3000, Number(limitParam))) : null;

    // Skontroluj, či chceme force refresh (bypass cache)
    const forceRefresh = request.nextUrl.searchParams.get('force') === 'true';

    // 1. Skús cache + ETag support (iba ak nie je force refresh)
    const ifNoneMatch = request.headers.get('if-none-match');

    // Generate ETag based on time bucket (not on data changes)
    // ETag = "heatmap-{bucket}" where bucket = floor(now / 5s)
    // This prevents ETag from changing on every worker update
    const timeBucket = Math.floor(Date.now() / ETAG_BUCKET_SIZE);
    const etag = `"heatmap-${timeBucket}"`;

    // Skip cache ak je force refresh
    if (!forceRefresh) {
      try {
        const cachedData = await getCachedData(CACHE_KEY);

        if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
          // Skontroluj timestamp dát v cache (ak existuje)
          const cacheTimestamp = (cachedData as any)?.[0]?._timestamp || null;
          const dataAgeMs = cacheTimestamp ? Date.now() - new Date(cacheTimestamp).getTime() : Infinity;

          // ETag match - vráť 304 Not Modified, ale len ak sú dáta aktuálne (< 5 min)
          // Ak sú dáta staršie, vráť 200 aby sa načítali nové dáta z DB
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
              // Pokračuj s DB fetch (nie return, len continue)
            }
          }

          // Ak ETag nesedí alebo dáta sú staršie, ale cache existuje, vráť ho s novým ETag
          // (ale len ak nie sú príliš staré - inak načítame z DB)
          if (dataAgeMs < MAX_DATA_AGE_FOR_ETAG) {
            console.log(`✅ Heatmap cache hit - returning ${cachedData.length} companies (data age: ${Math.floor(dataAgeMs / 1000)}s, ${Date.now() - startTime}ms)`);
            const headers: HeadersInit = {
              'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
              'ETag': etag
            };

            const limited = requestedLimit ? cachedData.slice(0, requestedLimit) : cachedData;
            return NextResponse.json({
              success: true,
              data: limited,
              cached: true,
              count: limited.length,
              timestamp: new Date().toISOString(),
              lastUpdatedAt: cacheTimestamp || new Date().toISOString(),
            }, { headers });
          } else {
            console.log(`⚠️ Cache data is stale (${Math.floor(dataAgeMs / 1000)}s old) - fetching from DB`);
            // Pokračuj s DB fetch
          }
        }
      } catch (cacheError) {
        console.warn('⚠️ Cache read error, continuing with DB fetch:', cacheError);
      }
    } else {
      console.log('🔄 Force refresh requested - bypassing cache');
    }

    console.log('🔄 Heatmap cache miss - fetching from DB...');

    // 2. Načítaj dáta priamo z DB (SessionPrice, DailyRef, Ticker) - rýchlejšie ako /api/stocks
    let prisma;
    try {
      const prismaModule = await import('@/lib/db/prisma');
      prisma = prismaModule.prisma;
    } catch (prismaError) {
      console.error('❌ Failed to import Prisma:', prismaError);
      return NextResponse.json(
        {
          success: false,
          error: 'Database connection failed',
          data: [],
          count: 0,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    // Získaj tickery z DB (Ticker table).
    // IMPORTANT: Heatmap needs sector/industry for grouping, but local/dev DB may not have it populated yet.
    // We intentionally DO NOT filter out null/empty sector/industry here and instead fall back to "Other" / "Uncategorized".
    let tickers;
    try {
      tickers = await prisma.ticker.findMany({
        where: {},
        select: {
          symbol: true,
          name: true,
          sector: true,
          industry: true,
          sharesOutstanding: true,
          lastPrice: true, // Denormalized current price - PRIORITA 1
          lastPriceUpdated: true,
          latestPrevClose: true, // Denormalized previous close - PRIORITA 1
          latestPrevCloseDate: true,
          lastChangePct: true, // Pre referenciu
          lastMarketCap: true, // Pre referenciu
          lastMarketCapDiff: true, // Pre referenciu
        },
        take: DATE_RANGE.MAX_TICKERS,
      });
      console.log(`📊 Found ${tickers.length} tickers (sector/industry may be missing in dev)`);
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

    const tickerSymbols = tickers.map(t => t.symbol);
    const tickerMap = new Map(
      tickers.map(t => {
        const symbol = t.symbol;
        const ov = SECTOR_INDUSTRY_OVERRIDES[symbol];
        const rawSector = (t.sector ?? '').trim();
        const rawIndustry = (t.industry ?? '').trim();

        const sector = ov && (!rawSector || rawSector === 'Other' || rawSector === 'Unrecognized')
          ? ov.sector
          : (rawSector || 'Other');

        const industry = ov && (!rawIndustry || rawIndustry === 'Uncategorized' || rawIndustry === 'Unrecognized' || rawSector === 'Other' || rawSector === 'Unrecognized')
          ? ov.industry
          : (rawIndustry || 'Uncategorized');

        const name = ov?.name && (!t.name || t.name.trim() === '') ? ov.name : t.name;

        return [symbol, {
          name,
          sector,
          industry,
          sharesOutstanding: t.sharesOutstanding,
          lastPrice: t.lastPrice, // Denormalized current price
          lastPriceUpdated: t.lastPriceUpdated,
          latestPrevClose: t.latestPrevClose, // Denormalized previous close
          latestPrevCloseDate: t.latestPrevCloseDate,
          lastChangePct: t.lastChangePct,
          lastMarketCap: t.lastMarketCap,
          lastMarketCapDiff: t.lastMarketCapDiff,
        }];
      })
    );

    // Načítaj SessionPrice (posledné ceny) - berieme najnovšie pre každý ticker
    // Použijeme 24h okno pre heatmap.today (posledných 24 hodín)
    // IMPORTANT: derive day boundaries in ET (not server timezone; Vercel often runs in UTC)
    const now = new Date(); // real instant

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const addETCalendarDays = (base: Date, days: number) => {
      const p = toET(base);
      const utcNoon = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
      utcNoon.setUTCDate(utcNoon.getUTCDate() + days);
      return `${utcNoon.getUTCFullYear()}-${pad2(utcNoon.getUTCMonth() + 1)}-${pad2(utcNoon.getUTCDate())}`;
    };

    const todayYMD = getDateET(now);
    const tomorrowYMD = addETCalendarDays(now, 1);
    const today = createETDate(todayYMD);       // ET midnight (UTC instant)
    const tomorrow = createETDate(tomorrowYMD); // next ET midnight

    // 24h okno: od teraz späť 7 dní (na pokrytie víkendov/sviatkov)
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    console.log(`📅 Date range: ${oneWeekAgo.toISOString()} to ${tomorrow.toISOString()} (last 7 days for DailyRef fallback)`);

    // Parallel fetch SessionPrice and DailyRef for better performance
    let allSessionPrices: SessionPrice[] = [];
    let allDailyRefs: DailyRef[] = [];

    try {
      // Execute both queries in parallel using Promise.all()
      // 24h okno pre heatmap.today
      const [sessionPricesResult, dailyRefsResult] = await Promise.all([
        prisma.sessionPrice.findMany({
          where: {
            symbol: { in: tickerSymbols },
            date: { gte: dayAgo, lt: tomorrow },
          },
          orderBy: [
            { lastTs: 'desc' },
            { session: 'asc' }, // live < pre < after (alphabetically)
          ],
        }),
        prisma.dailyRef.findMany({
          where: {
            symbol: { in: tickerSymbols },
            date: { gte: oneWeekAgo, lte: today }, // <= today to get last trading day
          },
          orderBy: {
            date: 'desc',
          },
        }),
      ]);

      allSessionPrices = sessionPricesResult;
      allDailyRefs = dailyRefsResult;

      console.log(`💰 Found ${allSessionPrices.length} SessionPrice records`);
      console.log(`📊 Found ${allDailyRefs.length} DailyRef records (last 7 days state)`);
    } catch (dbError) {
      console.error('❌ Error fetching SessionPrice or DailyRef:', dbError);
      // Fallback to empty arrays
      allSessionPrices = [];
      allDailyRefs = [];
    }

    // Helper funkcia pre získanie najnovších záznamov pre každý ticker (manuálne distinct)
    // Pre SessionPrice: prioritizujeme novšie dáta podľa lastTs
    const getLatestSessionPrices = (records: typeof allSessionPrices) => {
      const priceMap = new Map<string, typeof allSessionPrices[0]>();
      for (const sp of records) {
        const existing = priceMap.get(sp.symbol);
        // Keep the newest record per symbol. On ties (same lastTs), keep the first one
        // (records are ordered by lastTs desc, then session asc).
        if (!existing || (sp.lastTs && existing.lastTs && sp.lastTs > existing.lastTs)) {
          priceMap.set(sp.symbol, sp);
        }
      }
      return Array.from(priceMap.values());
    };

    const sessionPrices = getLatestSessionPrices(allSessionPrices);

    // Helper funkcia pre filtrovanie dát podľa času
    const filterByTime = (records: typeof sessionPrices, minutesAgo: number) => {
      const cutoffTime = new Date(now);
      cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesAgo);

      return records.filter(sp => {
        if (!sp.lastTs) return false;
        try {
          const lastTsDate = new Date(sp.lastTs);
          return lastTsDate >= cutoffTime;
        } catch {
          return false;
        }
      });
    };

    // Kontrola aktuálnosti dát - počet záznamov z poslednej hodiny a posledných 15 minút
    const recentPrices = filterByTime(sessionPrices, DATA_FRESHNESS.HOUR_AGO);
    const veryRecentPrices = filterByTime(sessionPrices, DATA_FRESHNESS.MINUTES_AGO);

    console.log(`💰 Unique SessionPrice records: ${sessionPrices.length} (${recentPrices.length} from last hour, ${veryRecentPrices.length} from last 15 minutes)`);

    // Varovanie ak je málo aktuálnych dát
    if (recentPrices.length < sessionPrices.length * DATA_FRESHNESS.STALE_THRESHOLD) {
      console.warn(`⚠️ Low data freshness: Only ${recentPrices.length}/${sessionPrices.length} records from last hour`);
    }

    // DailyRefs are already sorted by date desc
    // We just want the FIRST one for each ticker, as that is the "most recent" one
    // But we need to keep all of them temporarily to determine "is today"
    const latestDailyRefsMap = new Map<string, typeof allDailyRefs[0]>();
    for (const dr of allDailyRefs) {
      if (!latestDailyRefsMap.has(dr.symbol)) {
        latestDailyRefsMap.set(dr.symbol, dr);
      }
    }
    const dailyRefs = Array.from(latestDailyRefsMap.values());
    console.log(`📊 Unique DailyRef records: ${dailyRefs.length}`);

    // Vytvor mapy pre rýchle lookup
    // IMPORTANT:
    // Ticker.lastPrice is "priority 1", but it can be stale (e.g. older than SessionPrice).
    // For correct UX (and to avoid cases like SHOP showing huge mismatch), prefer the NEWER
    // price source based on timestamps.
    const priceMap = new Map<string, { price: number; changePct: number; tsMs: number; source: 'ticker' | 'session' }>();
    for (const [symbol, info] of tickerMap.entries()) {
      if (info.lastPrice && info.lastPrice > 0) {
        priceMap.set(symbol, {
          price: info.lastPrice,
          changePct: 0, // Bude prepočítané neskôr z currentPrice a previousClose
          tsMs: info.lastPriceUpdated ? new Date(info.lastPriceUpdated).getTime() : 0,
          source: 'ticker',
        });
      }
    }

    // PRIORITA 2 (timestamp-aware): Use SessionPrice if it is newer than Ticker.lastPriceUpdated.
    for (const sp of sessionPrices) {
      const spTs = sp.lastTs ? new Date(sp.lastTs).getTime() : (sp.updatedAt ? new Date(sp.updatedAt).getTime() : 0);
      const existing = priceMap.get(sp.symbol);
      // Prefer SessionPrice when it is newer OR exactly equal (tie-break in favor of SessionPrice).
      // This avoids confusing cases where both sources have the same timestamp but we still label it as "ticker".
      if (!existing || (spTs && spTs >= existing.tsMs)) {
        priceMap.set(sp.symbol, {
          price: sp.lastPrice,
          changePct: sp.changePct,
          tsMs: spTs,
          source: 'session',
        });
      }
    }

    // Get current session for session-aware percent change calculation
    const etNow = nowET();
    const session = detectSession(etNow);

    // Use denormalized latestPrevClose from Ticker (fastest)
    const previousCloseMap = new Map<string, number>();
    const regularCloseMap = new Map<string, number>();

    // Fallback: Use DailyRef for tickers without latestPrevClose
    // CRITICAL: Logic update for "Monday Problem"
    // 1. If DailyRef is from TODAY, use its previousClose (which is Yesterday's Close).
    // 2. If DailyRef is from OLDER (e.g. Friday), use its regularClose (e.g. Friday's Close).
    const todayDateStr = getDateET(etNow);
    const todayDateObj = createETDate(todayDateStr);
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][etNow.getDay()];

    // Debug stats container
    const debug = request.nextUrl.searchParams.get('debug') === 'true';
    const debugStats = {
      totalDailyRefs: 0,
      dailyRefsUsedConfig: {
        todayDateStr: todayDateStr,
        todayName: dayName,
        isMonday: etNow.getDay() === 1
      },
      counts: {
        totalTickers: tickerSymbols.length,
        dailyRefToday: 0,     // Used previousClose from Today's record
        dailyRefOlder: 0,     // Used regularClose from Older record
        tickerFallback: 0,    // Used Ticker.latestPrevClose
        missing: 0            // No prev close found
      }
    };

    debugStats.totalDailyRefs = dailyRefs.length;

    for (const dr of dailyRefs) {
      const drDate = new Date(dr.date);
      // createETDate returns midnight, so we can compare timestamps directly if dr.date is also midnight-based from DB
      // But just to be safe, compare substrings
      const drDateStr = getDateET(drDate);
      const isToday = drDateStr === todayDateStr;

      // Also collect regularClose for after-hours sessions
      // ONLY use regularClose from TODAY - prevent using yesterday's regularClose
      if (dr.regularClose && dr.regularClose > 0) {
        if (isToday) {
          regularCloseMap.set(dr.symbol, dr.regularClose);
        }
      }

      if (!previousCloseMap.has(dr.symbol)) {
        if (isToday) {
          // Record is from Today -> previousClose is Yesterday's close
          previousCloseMap.set(dr.symbol, dr.previousClose);
          debugStats.counts.dailyRefToday++;
        } else {
          // Record is Older (e.g. Friday) -> regularClose is Friday's close, which acts as today's previousClose
          // Only use if regularClose is valid
          if (dr.regularClose && dr.regularClose > 0) {
            previousCloseMap.set(dr.symbol, dr.regularClose);
            debugStats.counts.dailyRefOlder++;
          }
        }
      }
    }

    // Capture how many came from Ticker table initially
    // Capture how many came from Ticker table initially
    // Calculated above in debugStats.counts.tickerFallback

    // 3. Batch fetch cache pre všetky tickery naraz (optimalizácia N+1 problému)
    const project = 'pmp';
    const validTickers = tickerSymbols.filter(ticker => ticker !== 'GOOG' && tickerMap.has(ticker));
    const cacheKeys = validTickers.map(ticker => getCacheKey(project, ticker, 'stock'));

    // Batch fetch cache pomocou Redis mGet (normalizované API s fallback)
    const cachedStockDataMap = new Map<string, any>();
    try {
      const { mGetJsonMap } = await import('@/lib/redis');
      if (cacheKeys.length > 0) {
        const cachedData = await mGetJsonMap<any>(cacheKeys);
        // Map keys back to tickers
        validTickers.forEach((ticker, index) => {
          const cacheKey = cacheKeys[index];
          if (!cacheKey) return;
          const data = cachedData.get(cacheKey);
          if (data) {
            cachedStockDataMap.set(ticker, data);
          }
        });
      }
    } catch (e) {
      // Fallback už je v mGetJson - log len pre info
      console.warn('Batch cache fetch failed, fallback handled by mGetJson');
    }

    // Zozbieraj tickery, ktoré potrebujú previousClose z Polygon API
    const tickersNeedingPrevClose: string[] = [];
    for (const ticker of tickerSymbols) {
      if (ticker === 'GOOG') continue;
      const tickerInfo = tickerMap.get(ticker);
      if (!tickerInfo) continue;

      const cachedStockData = cachedStockDataMap.get(ticker);

      if (!cachedStockData || !cachedStockData.closePrice) {
        const previousClose = previousCloseMap.get(ticker) || 0;
        const priceInfo = priceMap.get(ticker);
        const currentPrice = priceInfo?.price || 0;

        // Ak nemáme previousClose a máme currentPrice, pridaj do batch fetch
        if (previousClose === 0 && currentPrice > 0) {
          tickersNeedingPrevClose.push(ticker);
        }
      }
    }

    // On-demand batch fetch previousClose with timeout budget and cap (API-safe)
    const prevCloseBatchMap = new Map<string, number>();
    const missingPrevCloseBefore = tickersNeedingPrevClose.length;
    if (tickersNeedingPrevClose.length > 0) {
      const onDemandStartTime = Date.now();
      console.log(`🔄 On-demand fetching previousClose for ${missingPrevCloseBefore} tickers (max 50, timeout 600ms)...`);

      try {
        const { fetchPreviousClosesBatchAndPersist } = await import('@/lib/utils/onDemandPrevClose');
        const onDemandResults = await fetchPreviousClosesBatchAndPersist(
          tickersNeedingPrevClose,
          todayYMD,  // Use string format (YYYY-MM-DD), not Date object
          {
            maxTickers: 50,        // Cap at 50 tickers per request
            timeoutBudget: 600,     // Max 600ms budget
            maxConcurrent: 5        // 5 concurrent fetches
          }
        );

        onDemandResults.forEach((prevClose, ticker) => {
          prevCloseBatchMap.set(ticker, prevClose);
        });

        const onDemandDuration = Date.now() - onDemandStartTime;
        const missingPrevCloseAfter = missingPrevCloseBefore - prevCloseBatchMap.size;
        console.log(`✅ On-demand prevClose: ${missingPrevCloseBefore} missing → ${prevCloseBatchMap.size} fetched → ${missingPrevCloseAfter} still missing (${onDemandDuration}ms, persisted to DB)`);
      } catch (error) {
        console.warn(`⚠️ On-demand prevClose fetch failed:`, error);
        // Continue without on-demand results (fallback to existing logic)
      }
    }

    // 4. Vypočítaj dáta pre každý ticker
    const results: StockData[] = [];
    let skippedNoPrice = 0;
    let skippedNoMarketCap = 0;
    let processed = 0;
    let cacheHits = 0;
    let dbHits = 0;

    for (const ticker of tickerSymbols) {
      // Odstráň GOOG - v heatmape chceme iba GOOGL
      if (ticker === 'GOOG') {
        continue;
      }

      const tickerInfo = tickerMap.get(ticker);
      if (!tickerInfo) continue;

      // Použij batch-fetched cache dáta (už máme v mape)
      const cachedStockData = cachedStockDataMap.get(ticker);

      let currentPrice = 0;
      let previousClose = 0;
      let changePercent = 0;
      let marketCap = 0;
      let marketCapDiff = 0;
      let priceTsMs = 0;
      let priceSource: 'cache' | 'ticker' | 'session' | 'unknown' = 'unknown';

      if (cachedStockData && cachedStockData.currentPrice && cachedStockData.closePrice) {
        // Použij cache dáta z stocks endpointu (najaktuálnejšie)
        currentPrice = cachedStockData.currentPrice;
        previousClose = cachedStockData.closePrice;
        const regularClose = regularCloseMap.get(ticker) || null;
        changePercent = cachedStockData.percentChange || computePercentChange(currentPrice, previousClose, session, regularClose);
        marketCap = cachedStockData.marketCap || 0;
        marketCapDiff = cachedStockData.marketCapDiff || 0;
        // NOTE: cache payload may not include per-ticker timestamps in a reliable way
        // (and Redis can be disabled). We'll still label source for debugging.
        priceSource = 'cache';
        cacheHits++;
      } else {
        // Prefer timestamp-aware "best available" price (SessionPrice if newer than Ticker.lastPriceUpdated)
        const priceInfo = priceMap.get(ticker);
        currentPrice = priceInfo?.price || 0;
        priceTsMs = priceInfo?.tsMs || 0;
        priceSource = priceInfo?.source || 'unknown';

        // Prefer denormalized prev close (fast), fallback to DailyRef-derived map
        const tickerInfoFromMap = tickerMap.get(ticker);
        previousClose = (tickerInfoFromMap?.latestPrevClose || 0) || (previousCloseMap.get(ticker) || 0);

        dbHits++;

        // Ak nemáme currentPrice, použijeme previousClose (fallback)
        if (currentPrice === 0 && previousClose > 0) {
          currentPrice = previousClose;
        }

        // Použij batch-fetched previousClose (ak existuje)
        if (previousClose === 0 && currentPrice > 0) {
          previousClose = prevCloseBatchMap.get(ticker) || 0;
          // CRITICAL: Never use currentPrice as previousClose fallback!
          // If still no previousClose, skip this ticker (don't show misleading 0% change)
          if (previousClose === 0) {
            skippedNoPrice++;
            continue; // Skip this ticker instead of showing misleading 0% change
          }
        }

        // Preskoč tickery bez ceny (potrebujeme aspoň currentPrice)
        if (currentPrice === 0) {
          skippedNoPrice++;
          continue;
        }

        // VŽDY počítať percentChange z aktuálnych hodnôt (nie z changePct v SessionPrice)
        // Toto zabezpečuje konzistentnosť s /api/stocks endpointom
        // Use session-aware calculation for correct after-hours % changes
        const regularClose = regularCloseMap.get(ticker) || null;
        changePercent = computePercentChange(currentPrice, previousClose, session, regularClose);

        // Vypočítaj market cap.
        // Prefer compute(price * shares), but if shares are missing (common in dev), fall back to denormalized columns.
        const sharesOutstanding = tickerInfo.sharesOutstanding || 0;
        marketCap = sharesOutstanding > 0
          ? computeMarketCap(currentPrice, sharesOutstanding)
          : (tickerInfo.lastMarketCap || 0);

        // Preskoč tickery bez market cap
        if (marketCap <= 0) {
          skippedNoMarketCap++;
          continue;
        }

        // Vypočítaj market cap diff - vždy z aktuálnych hodnôt, fallback na denormalized diff
        // CRITICAL: Use the same reference price as percentChange calculation (for after-hours consistency)
        // For after-hours/closed sessions, use regularClose if available, otherwise previousClose
        const referencePrice = regularClose && regularClose > 0 ? regularClose : previousClose;
        marketCapDiff = (sharesOutstanding > 0 && referencePrice > 0)
          ? computeMarketCapDiff(currentPrice, referencePrice, sharesOutstanding)
          : (tickerInfo.lastMarketCapDiff || 0);
      }

      // Preskoč tickery bez ceny (ak sme použili cache a nemá dáta)
      if (currentPrice === 0) {
        skippedNoPrice++;
        continue;
      }

      // Preskoč tickery bez market cap (ak sme použili DB a nemá market cap)
      if (marketCap <= 0) {
        skippedNoMarketCap++;
        continue;
      }

      // "isStale" is used for UX/diagnostics ("is this price reasonably fresh for this session?").
      // The previous thresholds (live=1min, pre/after=5min) were too strict and caused most tickers
      // to appear stale even though they were updated recently.
      const thresholdMin =
        session === 'live' ? 5 :
          session === 'pre' ? 30 :
            session === 'after' ? 30 :
              60;
      const nowMs = etNow.getTime();
      const isStale = currentPrice > 0 && priceTsMs > 0 && (nowMs - priceTsMs) > thresholdMin * 60_000;
      const lastUpdatedIso = priceTsMs ? new Date(priceTsMs).toISOString() : undefined;

      results.push({
        ticker,
        companyName: tickerInfo.name || ticker,
        sector: tickerInfo.sector,
        industry: tickerInfo.industry,
        currentPrice,
        closePrice: previousClose,
        percentChange: changePercent,
        marketCap,
        marketCapDiff,
        ...(lastUpdatedIso ? { lastUpdated: lastUpdatedIso } : {}),
        ...(isStale ? { isStale } : {}),
        // Extra debug field (kept optional by not always emitting it)
        ...(priceSource !== 'unknown' ? { priceSource } : {}),
      });

      processed++;
    }

    console.log(`✅ Processed ${processed} tickers (${cacheHits} from cache, ${dbHits} from DB), skipped ${skippedNoPrice} (no price), ${skippedNoMarketCap} (no market cap)`);

    if (results.length === 0) {
      console.warn('⚠️ No results after processing - possible causes:');
      console.warn(`  - No SessionPrice records found for ${tickerSymbols.length} tickers`);
      console.warn(`  - No DailyRef records found`);
      console.warn(`  - All tickers skipped due to missing price or market cap`);
      console.warn(`  - Date range: ${dayAgo.toISOString()} to ${tomorrow.toISOString()} (24h window)`);
    }

    // Zoraď podľa market cap desc
    results.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

    // Vypočítaj najnovší timestamp z SessionPrice PRED vytvorením payloadu
    let maxUpdatedAt: Date | null = null;
    try {
      for (const sp of sessionPrices) {
        if (sp.lastTs) {
          try {
            const ts = new Date(sp.lastTs);
            if (!isNaN(ts.getTime()) && (!maxUpdatedAt || ts > maxUpdatedAt)) {
              maxUpdatedAt = ts;
            }
          } catch (e) {
            // Ignore invalid dates
          }
        }
        if (sp.updatedAt) {
          try {
            const ts = new Date(sp.updatedAt);
            if (!isNaN(ts.getTime()) && (!maxUpdatedAt || ts > maxUpdatedAt)) {
              maxUpdatedAt = ts;
            }
          } catch (e) {
            // Ignore invalid dates
          }
        }
      }
    } catch (e) {
      // Ignore errors
    }

    // Použij maxUpdatedAt pre _timestamp (nie aktuálny čas!)
    const dataTimestamp = maxUpdatedAt ? maxUpdatedAt.toISOString() : new Date().toISOString();

    // OPTIMIZATION: Apply limit AFTER sorting so mobile still gets top market caps.
    const limitedResults = requestedLimit ? results.slice(0, requestedLimit) : results;

    // Zmenšíme payload - posielame len potrebné polia pre heatmapu
    const payload = limitedResults.map((s) => ({
      ticker: s.ticker,
      companyName: s.companyName,
      sector: s.sector,
      industry: s.industry,
      marketCap: s.marketCap,
      percentChange: s.percentChange,
      marketCapDiff: s.marketCapDiff,
      currentPrice: s.currentPrice, // Potrebné pre tooltip
      ...(s.lastUpdated ? { lastUpdated: s.lastUpdated } : {}),
      ...(s.isStale ? { isStale: s.isStale } : {}),
      ...((s as any).priceSource ? { priceSource: (s as any).priceSource } : {}),
      _timestamp: dataTimestamp, // Timestamp z dát (nie aktuálny čas!)
    }));

    console.log(`✅ Filtered to ${payload.length} companies with valid data`);

    // maxUpdatedAt už máme vypočítané vyššie (použité pre _timestamp)
    // Použijeme ho pre logovanie
    if (maxUpdatedAt) {
      const ageMinutes = Math.floor((Date.now() - maxUpdatedAt.getTime()) / 60000);
      console.log(`📊 Latest data timestamp: ${maxUpdatedAt.toISOString()} (${ageMinutes} minutes ago)`);
      if (ageMinutes > DATA_FRESHNESS.OLD_DATA_THRESHOLD) {
        console.warn(`⚠️ Data is ${ageMinutes} minutes old - may need worker update`);
      }
    } else {
      console.warn('⚠️ No valid timestamps found in SessionPrice records');
    }

    // Ak nie sú dáta v DB, vráť error message (fallback je vypnutý kvôli rate limitu)
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
          ...(debug ? { debug: debugStats } : {})
        },
        { status: 200 } // Vráť 200, aby sa zobrazil error message
      );
    }

    // 4. Ulož do cache + verziu pre ETag
    if (payload.length > 0) {
      try {
        // Ulož do cache (ETag je teraz time-based, nie version-based)
        const { setCachedData } = await import('@/lib/redis');
        await setCachedData(CACHE_KEY, payload, CACHE_TTL);

        const lastUpdatedAt = maxUpdatedAt ? maxUpdatedAt.toISOString() : new Date().toISOString();

        const duration = Date.now() - startTime;
        console.log(`✅ Heatmap data fetched from DB and cached: ${payload.length} companies (lastUpdated: ${lastUpdatedAt}) in ${duration}ms`);

        return NextResponse.json({
          success: true,
          data: payload,
          cached: false,
          count: payload.length,
          timestamp: new Date().toISOString(),
          lastUpdatedAt: lastUpdatedAt, // Max updatedAt z SessionPrice
          ...(debug ? { debug: debugStats } : {})
        }, {
          headers: {
            'ETag': etag,
            'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
          },
        });
      } catch (cacheError) {
        console.warn('⚠️ Error caching heatmap results:', cacheError);
        // Fallback - vráť dáta aj keď cache zlyhal
        const duration = Date.now() - startTime;
        const lastUpdatedAt = maxUpdatedAt ? maxUpdatedAt.toISOString() : new Date().toISOString();
        console.log(`✅ Heatmap data fetched from DB (cache failed): ${payload.length} companies (lastUpdated: ${lastUpdatedAt}) in ${duration}ms`);

        return NextResponse.json({
          success: true,
          data: payload,
          cached: false,
          count: payload.length,
          timestamp: new Date().toISOString(),
          lastUpdatedAt: lastUpdatedAt,
          ...(debug ? { debug: debugStats } : {})
        }, {
          headers: {
            'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
          },
        });
      }
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
    // Obnov tichý režim
    delete process.env.SILENT_PREVCLOSE_LOGS;
  }
}
