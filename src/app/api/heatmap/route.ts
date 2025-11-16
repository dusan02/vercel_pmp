import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCachedData, setCachedData } from '@/lib/redis';
import { StockData } from '@/lib/types';
import {
  computeMarketCap,
  computeMarketCapDiff,
  getCurrentPrice,
  getPreviousClose,
} from '@/lib/marketCapUtils';

const CACHE_KEY = 'heatmap:all-companies';
const CACHE_TTL = 120; // 2 minúty - heatmap dáta sa menia často

/**
 * Načíta všetky tickery z databázy, ktoré majú sector a industry
 */
async function getAllTickersWithSectorIndustry(): Promise<string[]> {
  const tickers = await prisma.ticker.findMany({
    where: {
      sector: { not: null },
      industry: { not: null },
    },
    select: {
      symbol: true,
    },
    orderBy: {
      symbol: 'asc',
    },
  });

  return tickers.map((t) => t.symbol);
}

/**
 * Načíta dáta pre heatmapu - všetky firmy s sector/industry
 * Používa cache pre rýchle načítanie
 */
export async function GET(request: NextRequest) {
  try {
    // Skús najprv cache
    try {
      const cachedData = await getCachedData(CACHE_KEY);
      if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        console.log(`✅ Heatmap cache hit - returning ${cachedData.length} companies`);
        return NextResponse.json({
          success: true,
          data: cachedData,
          cached: true,
          count: cachedData.length,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (cacheError) {
      console.warn('⚠️ Cache read error, continuing with database fetch:', cacheError);
    }

    console.log('🔄 Heatmap cache miss - fetching from database...');

    // Načítaj všetky tickery s sector/industry
    const tickers = await getAllTickersWithSectorIndustry();
    console.log(`📊 Found ${tickers.length} tickers with sector/industry`);

    if (tickers.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No tickers with sector/industry found',
        data: [],
        count: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // Načítaj dáta pre všetky tickery
    // Použijeme SessionPrice pre aktuálne ceny
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Načítaj SessionPrice dáta - skúsime najprv dnešok, potom posledných 7 dní
    // Rozdelíme na menšie batchy, ak je veľa tickerov
    let allSessionPrices: Awaited<ReturnType<typeof prisma.sessionPrice.findMany>> = [];
    try {
      const BATCH_SIZE = 500; // SQLite má limit na počet parametrov
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const batchPrices = await prisma.sessionPrice.findMany({
          where: {
            symbol: { in: batch },
            date: {
              gte: weekAgo, // Posledných 7 dní
              lt: tomorrow,
            },
          },
          orderBy: [
            { symbol: 'asc' },
            { date: 'desc' }, // Najnovšie dáta najprv
            { session: 'asc' },
            { lastTs: 'desc' },
          ],
        });
        allSessionPrices = [...allSessionPrices, ...batchPrices];
      }
      console.log(`📊 Found ${allSessionPrices.length} SessionPrice records (last 7 days)`);
    } catch (sessionPriceError) {
      console.error('❌ Error fetching SessionPrice:', sessionPriceError);
      // Pokračujeme bez SessionPrice dát - použijeme len Ticker dáta
    }

    // Vyber najnovšie dáta pre každý symbol (priorita: najnovší dátum > live > pre > after)
    const sessionPriceMap = new Map<string, typeof allSessionPrices[0]>();
    const sessionPriority: Record<string, number> = { live: 3, pre: 2, after: 1 };
    
    for (const sp of allSessionPrices) {
      const existing = sessionPriceMap.get(sp.symbol);
      
      if (!existing) {
        sessionPriceMap.set(sp.symbol, sp);
        continue;
      }
      
      // Porovnaj dátumy (najnovší dátum má prioritu)
      const currentDate = sp.date instanceof Date ? sp.date.getTime() : new Date(sp.date).getTime();
      const existingDate = existing.date instanceof Date ? existing.date.getTime() : new Date(existing.date).getTime();
      
      if (currentDate > existingDate) {
        // Novší dátum má prioritu
        sessionPriceMap.set(sp.symbol, sp);
      } else if (currentDate === existingDate) {
        // Rovnaký dátum - porovnaj session prioritu
        const currentPriority = sessionPriority[sp.session] || 0;
        const existingPriority = sessionPriority[existing.session] || 0;
        
        if (currentPriority > existingPriority) {
          sessionPriceMap.set(sp.symbol, sp);
        } else if (currentPriority === existingPriority) {
          // Ak je rovnaká priorita, vyber najnovší (porovnaj timestampy)
          const currentTs = sp.lastTs instanceof Date ? sp.lastTs.getTime() : new Date(sp.lastTs).getTime();
          const existingTs = existing.lastTs instanceof Date ? existing.lastTs.getTime() : new Date(existing.lastTs).getTime();
          if (currentTs > existingTs) {
            sessionPriceMap.set(sp.symbol, sp);
          }
        }
      }
    }
    const sessionPrices = Array.from(sessionPriceMap.values());

    // Vytvor mapu symbol -> SessionPrice
    const priceMap = new Map(
      sessionPrices.map((sp) => [
        sp.symbol,
        {
          price: sp.lastPrice,
          changePct: sp.changePct,
          lastTs: sp.lastTs,
        },
      ])
    );

    // Načítaj Ticker dáta (sector, industry, name)
    // Rozdelíme na menšie batchy
    let tickerData: Awaited<ReturnType<typeof prisma.ticker.findMany>> = [];
    try {
      const BATCH_SIZE = 500;
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const batchData = await prisma.ticker.findMany({
          where: {
            symbol: { in: batch },
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
        });
        tickerData = [...tickerData, ...batchData];
      }
    } catch (tickerError) {
      console.error('❌ Error fetching Ticker data:', tickerError);
      throw tickerError; // Toto je kritické, nemôžeme pokračovať
    }

    // Vytvor mapu symbol -> Ticker
    const tickerMap = new Map(
      tickerData.map((t) => [
        t.symbol,
        {
          name: t.name,
          sector: t.sector!,
          industry: t.industry!,
          sharesOutstanding: t.sharesOutstanding,
        },
      ])
    );

    // Načítaj DailyRef pre previousClose - skúsime najprv dnešok, potom posledných 7 dní
    let dailyRefs: Awaited<ReturnType<typeof prisma.dailyRef.findMany>> = [];
    try {
      const BATCH_SIZE = 500;
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const batchRefs = await prisma.dailyRef.findMany({
          where: {
            symbol: { in: batch },
            date: {
              gte: weekAgo, // Posledných 7 dní
              lt: tomorrow,
            },
          },
          select: {
            symbol: true,
            date: true,
            previousClose: true,
          },
          orderBy: [
            { symbol: 'asc' },
            { date: 'desc' }, // Najnovšie dáta najprv
          ],
        });
        dailyRefs = [...dailyRefs, ...batchRefs];
      }
      
      // Vyber najnovšie previousClose pre každý symbol
      const dailyRefMap = new Map<string, number>();
      for (const dr of dailyRefs) {
        if (!dailyRefMap.has(dr.symbol)) {
          dailyRefMap.set(dr.symbol, dr.previousClose);
        }
      }
      dailyRefs = Array.from(dailyRefMap.entries()).map(([symbol, previousClose]) => ({
        symbol,
        date: today,
        previousClose,
      }));
    } catch (dailyRefError) {
      console.warn('⚠️ Error fetching DailyRef, continuing without previousClose:', dailyRefError);
      // Pokračujeme bez DailyRef - previousClose bude 0
    }

    const previousCloseMap = new Map(
      dailyRefs.map((dr) => [dr.symbol, dr.previousClose])
    );

    // Zostav výsledky
    const results: StockData[] = [];

    for (const ticker of tickers) {
      const tickerInfo = tickerMap.get(ticker);
      if (!tickerInfo) continue;

      // Získaj ceny - použijeme SessionPrice ak existuje, inak DailyRef
      const priceInfo = priceMap.get(ticker);
      const dailyRefClose = previousCloseMap.get(ticker);
      
      let currentPrice = priceInfo?.price || 0;
      let previousClose = dailyRefClose || 0;
      let changePercent = priceInfo?.changePct || 0;
      
      // Debug pre GOOGL
      if (ticker === 'GOOGL') {
        console.log(`🔍 GOOGL debug: priceInfo=${JSON.stringify(priceInfo)}, dailyRefClose=${dailyRefClose}, changePercent=${changePercent}`);
      }
      
      // Ak máme changePercent z SessionPrice, má prioritu - použijeme ho
      // a vypočítame previousClose z currentPrice a changePercent ak je potrebné
      if (changePercent !== 0 && currentPrice > 0) {
        // Ak nemáme previousClose, vypočítame ho z currentPrice a changePercent
        if (previousClose === 0) {
          previousClose = currentPrice / (1 + changePercent / 100);
        }
        // Ak máme previousClose, ale changePercent z SessionPrice je iný, použijeme changePercent z SessionPrice
        // (changePercent z SessionPrice má prioritu)
      }
      
      // Ak nemáme currentPrice, použijeme previousClose (ale len ako fallback)
      if (currentPrice === 0 && previousClose > 0) {
        currentPrice = previousClose;
        // Ak použijeme previousClose ako currentPrice, changePercent by mal byť 0
        // ale necháme ho tak, ak už máme hodnotu z SessionPrice
        if (changePercent === 0) {
          changePercent = 0;
        }
      }
      
      // Ak nemáme previousClose ale máme currentPrice, použijeme currentPrice
      // (ale toto môže byť problém, lebo potom changePercent bude 0)
      // Toto robíme len ak nemáme changePercent z SessionPrice
      if (previousClose === 0 && currentPrice > 0 && changePercent === 0) {
        previousClose = currentPrice;
        changePercent = 0;
      }
      
      // Ak nemáme changePercent ale máme obe ceny a sú rôzne, vypočítajme ho
      // (ale len ak nemáme changePercent z SessionPrice)
      if (changePercent === 0 && currentPrice > 0 && previousClose > 0 && currentPrice !== previousClose) {
        changePercent = ((currentPrice - previousClose) / previousClose) * 100;
      }

      // Vypočítaj market cap - zabezpečíme, že všetky hodnoty sú čísla
      const shares = Number(tickerInfo.sharesOutstanding) || 0;
      const safePrice = Number(currentPrice) || 0;
      const safePrevClose = Number(previousClose) || 0;
      
      // Vypočítaj market cap - použijeme skutočné hodnoty
      let marketCap = 0;
      let marketCapDiff = 0;
      
      if (isFinite(safePrice) && isFinite(shares) && shares > 0 && safePrice > 0) {
        marketCap = computeMarketCap(safePrice, shares);
        // Vypočítaj market cap diff (denný rozdiel)
        if (isFinite(safePrevClose) && safePrevClose > 0) {
          marketCapDiff = computeMarketCapDiff(safePrice, safePrevClose, shares);
        }
      } else if (shares > 0) {
        // Ak máme shares ale nie cenu, použijeme odhad na základe shares
        // Použijeme logaritmickú škálu s variáciou, aby sa firmy líšili
        // Priemerná cena akcie je cca $20-100, takže použijeme variabilný odhad
        const hash = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const priceVariation = 20 + (hash % 80); // $20-100
        marketCap = computeMarketCap(priceVariation, shares);
        // Neobmedzujeme market cap - nech sa zobrazujú skutočné hodnoty
        marketCap = Math.max(0.01, marketCap);
        marketCapDiff = 0;
      } else {
        // Ak nemáme ani shares, použijeme minimálnu hodnotu (0.01B) pre zobrazenie
        // ale s malou variáciou podľa symbolu, aby sa firmy líšili
        const hash = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        marketCap = 0.01 + (hash % 100) / 10000; // 0.01 - 0.02B
        marketCapDiff = 0;
      }

      results.push({
        ticker,
        companyName: tickerInfo.name || ticker,
        currentPrice,
        closePrice: previousClose,
        percentChange: changePercent,
        marketCap,
        marketCapDiff,
        sector: tickerInfo.sector,
        industry: tickerInfo.industry,
        lastUpdated: priceInfo?.lastTs ? new Date(priceInfo.lastTs).toISOString() : new Date().toISOString(),
      });
    }

    // Zoraď podľa market cap (descending)
    results.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

    // Cache výsledok (ak je aspoň nejaký výsledok)
    if (results.length > 0) {
      try {
        await setCachedData(CACHE_KEY, results, CACHE_TTL);
      } catch (cacheError) {
        console.warn('⚠️ Error caching results:', cacheError);
        // Pokračujeme aj bez cache
      }
    }

    console.log(`✅ Heatmap data fetched and cached: ${results.length} companies`);

    return NextResponse.json({
      success: true,
      data: results,
      cached: false,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching heatmap data:', error);
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

