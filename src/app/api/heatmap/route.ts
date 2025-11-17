import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis';
import { StockData } from '@/lib/types';
import { computeMarketCap, computeMarketCapDiff, computePercentChange } from '@/lib/marketCapUtils';

const CACHE_KEY = 'heatmap:all-companies';
const CACHE_TTL = 30; // 30 sekúnd - kratší TTL pre aktuálnejšie dáta
const CACHE_VERSION_KEY = 'heatmap:version';

/**
 * Heatmap endpoint - načítava dáta priamo z DB (SessionPrice, DailyRef, Ticker)
 * Rýchlejšie ako volanie /api/stocks s 3000 tickermi (500-1000ms vs 10+ minút)
 * Používa Redis cache (30s TTL) pre aktuálnejšie dáta
 * Podporuje force refresh cez query parameter: ?force=true
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Skontroluj, či chceme force refresh (bypass cache)
    const forceRefresh = request.nextUrl.searchParams.get('force') === 'true';
    
    // 1. Skús cache + ETag support (iba ak nie je force refresh)
    const ifNoneMatch = request.headers.get('if-none-match');
    
    // Skip cache ak je force refresh
    if (!forceRefresh) {
      try {
        const cachedData = await getCachedData(CACHE_KEY);
        const { getCachedData: getVersion } = await import('@/lib/redis');
        const cachedVersion = await getVersion(CACHE_VERSION_KEY);
        const etag = cachedVersion ? `"h-${cachedVersion}"` : null;
        
        if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
          // ETag match - vráť 304 Not Modified
          if (ifNoneMatch && etag && ifNoneMatch === etag) {
            console.log(`✅ Heatmap ETag match - returning 304 (${Date.now() - startTime}ms)`);
            return new NextResponse(null, { status: 304 });
          }
          
          console.log(`✅ Heatmap cache hit - returning ${cachedData.length} companies (${Date.now() - startTime}ms)`);
          const headers: HeadersInit = {};
          if (etag) {
            headers['ETag'] = etag;
          }
          
          return NextResponse.json({
            success: true,
            data: cachedData,
            cached: true,
            count: cachedData.length,
            timestamp: new Date().toISOString(),
          }, { headers });
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
      const prismaModule = await import('@/lib/prisma');
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
    
    // Získaj všetky tickery s sector/industry
    let tickers;
    try {
      tickers = await prisma.ticker.findMany({
        where: {
          sector: { not: null },
          industry: { not: null },
        },
        select: {
          symbol: true,
          name: true,
          sector: true,
          industry: true,
          sharesOutstanding: true,
        },
        take: 3000, // Limit na rozumný počet
      });
      console.log(`📊 Found ${tickers.length} tickers with sector/industry`);
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
      console.warn('⚠️ No tickers with sector/industry found');
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
        sector: t.sector!,
        industry: t.industry!,
        sharesOutstanding: t.sharesOutstanding,
      }])
    );

    // Načítaj SessionPrice (posledné ceny) - berieme najnovšie pre každý ticker
    // Použijeme 7 dní pre lepšie pokrytie (vrátane víkendov a starších dát)
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7); // Posledných 7 dní

    console.log(`📅 Date range: ${weekAgo.toISOString()} to ${tomorrow.toISOString()} (last 7 days)`);

    // Získaj všetky SessionPrice (bez distinct - Prisma distinct nefunguje takto)
    let allSessionPrices;
    try {
      allSessionPrices = await prisma.sessionPrice.findMany({
        where: {
          symbol: { in: tickerSymbols },
          date: { gte: weekAgo, lt: tomorrow },
        },
        orderBy: [
          { lastTs: 'desc' },
          { session: 'asc' }, // live < pre < after (alphabetically)
        ],
      });
      console.log(`💰 Found ${allSessionPrices.length} SessionPrice records`);
    } catch (dbError) {
      console.error('❌ Error fetching SessionPrice:', dbError);
      allSessionPrices = [];
    }

    // Získaj najnovšie SessionPrice pre každý ticker (manuálne distinct)
    // Prioritizujeme novšie dáta - berieme najnovšie lastTs
    const sessionPriceMap = new Map<string, typeof allSessionPrices[0]>();
    for (const sp of allSessionPrices) {
      const existing = sessionPriceMap.get(sp.symbol);
      if (!existing || (sp.lastTs && existing.lastTs && sp.lastTs > existing.lastTs)) {
        sessionPriceMap.set(sp.symbol, sp);
      }
    }

    const sessionPrices = Array.from(sessionPriceMap.values());
    
    // Kontrola aktuálnosti dát - počet záznamov z poslednej hodiny
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    const recentPrices = sessionPrices.filter(sp => {
      if (!sp.lastTs) return false;
      try {
        const lastTsDate = new Date(sp.lastTs);
        return lastTsDate >= oneHourAgo;
      } catch {
        return false;
      }
    });
    console.log(`💰 Unique SessionPrice records: ${sessionPrices.length} (${recentPrices.length} from last hour)`);

    // Získaj všetky DailyRef (bez distinct)
    let allDailyRefs;
    try {
      allDailyRefs = await prisma.dailyRef.findMany({
        where: {
          symbol: { in: tickerSymbols },
          date: { gte: weekAgo, lt: tomorrow },
        },
        orderBy: {
          date: 'desc',
        },
      });
      console.log(`📊 Found ${allDailyRefs.length} DailyRef records`);
    } catch (dbError) {
      console.error('❌ Error fetching DailyRef:', dbError);
      allDailyRefs = [];
    }

    // Získaj najnovšie DailyRef pre každý ticker (manuálne distinct)
    const dailyRefMap = new Map<string, typeof allDailyRefs[0]>();
    for (const dr of allDailyRefs) {
      if (!dailyRefMap.has(dr.symbol)) {
        dailyRefMap.set(dr.symbol, dr);
      }
    }

    const dailyRefs = Array.from(dailyRefMap.values());
    console.log(`📊 Unique DailyRef records: ${dailyRefs.length}`);

    // Vytvor mapy pre rýchle lookup
    const priceMap = new Map<string, { price: number; changePct: number }>();
    for (const sp of sessionPrices) {
      if (!priceMap.has(sp.symbol)) {
        priceMap.set(sp.symbol, {
          price: sp.lastPrice,
          changePct: sp.changePct,
        });
      }
    }

    const previousCloseMap = new Map<string, number>();
    for (const dr of dailyRefs) {
      if (!previousCloseMap.has(dr.symbol)) {
        previousCloseMap.set(dr.symbol, dr.previousClose);
      }
    }

    // 3. Vypočítaj dáta pre každý ticker
    const results: StockData[] = [];
    let skippedNoPrice = 0;
    let skippedNoMarketCap = 0;
    let processed = 0;

    for (const ticker of tickerSymbols) {
      // Odstráň GOOG - v heatmape chceme iba GOOGL
      if (ticker === 'GOOG') {
        continue;
      }

      const tickerInfo = tickerMap.get(ticker);
      if (!tickerInfo) continue;

      // Získaj ceny
      const priceInfo = priceMap.get(ticker);
      const previousClose = previousCloseMap.get(ticker) || 0;
      
      let currentPrice = priceInfo?.price || 0;
      let changePercent = priceInfo?.changePct || 0;

      // Ak máme changePercent z SessionPrice, má prioritu
      // Ak nemáme changePercent ale máme obe ceny, vypočítajme ho
      if (changePercent === 0 && currentPrice > 0 && previousClose > 0 && currentPrice !== previousClose) {
        changePercent = computePercentChange(currentPrice, previousClose);
      }

      // Ak nemáme currentPrice, použijeme previousClose (fallback)
      if (currentPrice === 0 && previousClose > 0) {
        currentPrice = previousClose;
        if (changePercent === 0) {
          changePercent = 0;
        }
      }

      // Preskoč tickery bez ceny
      if (currentPrice === 0) {
        skippedNoPrice++;
        continue;
      }

      // Vypočítaj market cap
      const sharesOutstanding = tickerInfo.sharesOutstanding || 0;
      const marketCap = computeMarketCap(currentPrice, sharesOutstanding);
      
      // Preskoč tickery bez market cap
      if (marketCap <= 0) {
        skippedNoMarketCap++;
        continue;
      }

      // Vypočítaj market cap diff
      const previousMarketCap = computeMarketCap(previousClose, sharesOutstanding);
      const marketCapDiff = computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding);

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

    console.log(`✅ Processed ${processed} tickers, skipped ${skippedNoPrice} (no price), ${skippedNoMarketCap} (no market cap)`);

    if (results.length === 0) {
      console.warn('⚠️ No results after processing - possible causes:');
      console.warn(`  - No SessionPrice records found for ${tickerSymbols.length} tickers`);
      console.warn(`  - No DailyRef records found`);
      console.warn(`  - All tickers skipped due to missing price or market cap`);
      console.warn(`  - Date range: ${weekAgo.toISOString()} to ${tomorrow.toISOString()}`);
    }

    // Zoraď podľa market cap desc
    results.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

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
    }));

    console.log(`✅ Filtered to ${payload.length} companies with valid data`);
    
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
        await setCachedData(CACHE_KEY, payload, CACHE_TTL);
        
        // Ulož verziu pre ETag (inkrementálne číslo)
        const { getCachedData: getVersion, setCachedData: setVersion } = await import('@/lib/redis');
        const currentVersion = await getVersion(CACHE_VERSION_KEY);
        const newVersion = currentVersion ? parseInt(currentVersion) + 1 : 1;
        await setVersion(CACHE_VERSION_KEY, newVersion.toString(), CACHE_TTL);
        
        const etag = `"h-${newVersion}"`;
        
        const duration = Date.now() - startTime;
        console.log(`✅ Heatmap data fetched from DB and cached: ${payload.length} companies (v${newVersion}) in ${duration}ms`);

        return NextResponse.json({
          success: true,
          data: payload,
          cached: false,
          count: payload.length,
          timestamp: new Date().toISOString(),
        }, {
          headers: {
            'ETag': etag,
          },
        });
      } catch (cacheError) {
        console.warn('⚠️ Error caching heatmap results:', cacheError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Heatmap data fetched from DB: ${payload.length} companies in ${duration}ms`);

    return NextResponse.json({
      success: true,
      data: payload,
      cached: false,
      count: payload.length,
      timestamp: new Date().toISOString(),
    });
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
  }
}
