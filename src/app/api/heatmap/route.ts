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

const CACHE_KEY = 'heatmap-data';
const CACHE_TTL = 30; // 30 sekúnd
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

            return NextResponse.json({
              success: true,
              data: cachedData,
              cached: true,
              count: cachedData.length,
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
    // We intentionally DO NOT filter out null/empty sector/industry here and instead fall back to "Unknown".
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
      tickers.map(t => [t.symbol, {
        name: t.name,
        sector: (t.sector ?? '').trim() || 'Unknown',
        industry: (t.industry ?? '').trim() || 'Unknown',
        sharesOutstanding: t.sharesOutstanding,
        lastPrice: t.lastPrice, // Denormalized current price
        latestPrevClose: t.latestPrevClose, // Denormalized previous close
        latestPrevCloseDate: t.latestPrevCloseDate,
        lastChangePct: t.lastChangePct,
        lastMarketCap: t.lastMarketCap,
        lastMarketCapDiff: t.lastMarketCapDiff,
      }])
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

    // 24h okno: od teraz späť 24 hodín (instant-based)
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    console.log(`📅 Date range: ${dayAgo.toISOString()} to ${tomorrow.toISOString()} (last 24 hours for heatmap.today)`);

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
            date: { gte: dayAgo, lte: today }, // <= today to get last trading day (24h okno)
          },
          orderBy: {
            date: 'desc',
          },
        }),
      ]);

      allSessionPrices = sessionPricesResult;
      allDailyRefs = dailyRefsResult;

      console.log(`💰 Found ${allSessionPrices.length} SessionPrice records`);
      console.log(`📊 Found ${allDailyRefs.length} DailyRef records`);
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

    // Helper funkcia pre získanie najnovších DailyRef pre každý ticker (manuálne distinct)
    // Pre DailyRef: berieme prvý záznam (už zoradené podľa date desc)
    const getLatestDailyRefs = (records: typeof allDailyRefs) => {
      const refMap = new Map<string, typeof allDailyRefs[0]>();
      for (const dr of records) {
        if (!refMap.has(dr.symbol)) {
          refMap.set(dr.symbol, dr);
        }
      }
      return Array.from(refMap.values());
    };

    const dailyRefs = getLatestDailyRefs(allDailyRefs);
    console.log(`📊 Unique DailyRef records: ${dailyRefs.length}`);

    // Vytvor mapy pre rýchle lookup
    // PRIORITA 1: Použi Ticker.lastPrice (denormalized, aktuálnejšie) - rovnaký zdroj ako /api/stocks
    // Toto zabezpečuje konzistentnosť dát medzi tabuľkami a heatmapou
    const priceMap = new Map<string, { price: number; changePct: number }>();
    for (const [symbol, info] of tickerMap.entries()) {
      if (info.lastPrice && info.lastPrice > 0) {
        priceMap.set(symbol, {
          price: info.lastPrice,
          changePct: 0, // Bude prepočítané neskôr z currentPrice a previousClose
        });
      }
    }

    // PRIORITA 2: Fallback na SessionPrice ak Ticker.lastPrice nie je dostupné
    // (len pre tickery, ktoré nemajú lastPrice v Ticker tabuľke)
    for (const sp of sessionPrices) {
      if (!priceMap.has(sp.symbol)) {
        priceMap.set(sp.symbol, {
          price: sp.lastPrice,
          changePct: sp.changePct,
        });
      }
    }

    // Use denormalized latestPrevClose from Ticker (fastest)
    const previousCloseMap = new Map<string, number>();
    const regularCloseMap = new Map<string, number>();

    // First, use denormalized latestPrevClose from Ticker
    tickerMap.forEach((info, symbol) => {
      if (info.latestPrevClose && info.latestPrevClose > 0) {
        previousCloseMap.set(symbol, info.latestPrevClose);
      }
    });

    // Fallback: Use DailyRef for tickers without latestPrevClose
    for (const dr of dailyRefs) {
      if (!previousCloseMap.has(dr.symbol)) {
        previousCloseMap.set(dr.symbol, dr.previousClose);
      }
      // Also collect regularClose for after-hours sessions
      if (dr.regularClose && dr.regularClose > 0) {
        regularCloseMap.set(dr.symbol, dr.regularClose);
      }
    }

    // Get current session for session-aware percent change calculation
    const etNow = nowET();
    const session = detectSession(etNow);

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

    // Batch fetch previousClose pre všetky tickery naraz (paralelne)
    const prevCloseBatchMap = new Map<string, number>();
    if (tickersNeedingPrevClose.length > 0) {
      console.log(`🔄 Batch fetching previousClose for ${tickersNeedingPrevClose.length} tickers...`);
      const prevClosePromises = tickersNeedingPrevClose.map(async (ticker) => {
        try {
          const prevClose = await getPreviousClose(ticker);
          return { ticker, prevClose };
        } catch (error) {
          console.warn(`Failed to fetch previousClose for ${ticker}:`, error);
          return { ticker, prevClose: 0 };
        }
      });

      const prevCloseResults = await Promise.all(prevClosePromises);
      for (const { ticker, prevClose } of prevCloseResults) {
        if (prevClose > 0) {
          prevCloseBatchMap.set(ticker, prevClose);
        }
      }
      console.log(`✅ Batch fetched ${prevCloseBatchMap.size} previousClose values`);
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

      if (cachedStockData && cachedStockData.currentPrice && cachedStockData.closePrice) {
        // Použij cache dáta z stocks endpointu (najaktuálnejšie)
        currentPrice = cachedStockData.currentPrice;
        previousClose = cachedStockData.closePrice;
        const regularClose = regularCloseMap.get(ticker) || null;
        changePercent = cachedStockData.percentChange || computePercentChange(currentPrice, previousClose, session, regularClose);
        marketCap = cachedStockData.marketCap || 0;
        marketCapDiff = cachedStockData.marketCapDiff || 0;
        cacheHits++;
      } else {
        // Použi dáta z Ticker tabuľky (denormalized) - PRIORITA 1
        // Toto zabezpečuje konzistentnosť s /api/stocks endpointom
        const tickerInfoFromMap = tickerMap.get(ticker);
        if (tickerInfoFromMap && tickerInfoFromMap.lastPrice && tickerInfoFromMap.lastPrice > 0) {
          currentPrice = tickerInfoFromMap.lastPrice;
          previousClose = tickerInfoFromMap.latestPrevClose || 0;
          dbHits++;
        } else {
          // Fallback na SessionPrice/DailyRef ak Ticker nemá dáta
          const priceInfo = priceMap.get(ticker);
          previousClose = previousCloseMap.get(ticker) || 0;
          currentPrice = priceInfo?.price || 0;
          dbHits++;
        }

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
        marketCapDiff = (sharesOutstanding > 0 && previousClose > 0)
          ? computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding)
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

    // Zmenšíme payload - posielame len potrebné polia pre heatmapu
    const payload = results.map((s) => ({
      ticker: s.ticker,
      companyName: s.companyName,
      sector: s.sector,
      industry: s.industry,
      marketCap: s.marketCap,
      percentChange: s.percentChange,
      marketCapDiff: s.marketCapDiff,
      currentPrice: s.currentPrice, // Potrebné pre tooltip
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
