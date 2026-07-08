import { prisma } from '@/lib/db/prisma';
import { computeMarketCap, computeMarketCapDiff, computePercentChange, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { detectSession, getLastTradingDay } from '@/lib/utils/timeUtils';
import { nowET, getDateET, createETDate } from '@/lib/utils/dateET';
import { getPricingState } from '@/lib/utils/pricingStateMachine';
import { calculatePercentChange } from '@/lib/utils/priceResolver';

import { StockData } from '@/lib/types';
import { SECTOR_INDUSTRY_OVERRIDES } from '@/data/sectorIndustryOverrides';
import { normalizeSectorIndustryPair } from '@/lib/utils/sectorIndustryValidator';

interface StockServiceResult {
  data: StockData[];
  errors: string[];
}

/**
 * Main entry point for stock data - SQL-first implementation using Ticker table
 * @deprecated Use getStocksList directly.
 */
export async function getStocksData(
  tickers: string[],
  project: string = 'pmp'
): Promise<StockServiceResult> {
  return getStocksList({ tickers });
}

/**
 * SQL-first efficient fetching for pagination and sorting
 */
export async function getStocksList(options: {
  limit?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  tickers?: string[];
}): Promise<StockServiceResult> {
  const { limit = 50, offset = 0, sort = 'marketCapDiff', order = 'desc', tickers } = options;

  try {
    // === FAST PATH: REDIS ===
    const { redisClient } = await import('@/lib/redis');
    if (redisClient && redisClient.isOpen) {
      const etNow = nowET();
      const session = detectSession(etNow);
      const { mapToRedisSession } = await import('@/lib/utils/timeUtils');
      const redisSession = mapToRedisSession(session);
      const dateET = getDateET(etNow);

      let symbolsToFetch: string[] = [];
      let isGlobalQuery = false;

      if (tickers && tickers.length > 0) {
        symbolsToFetch = tickers;
      } else {
        isGlobalQuery = true;
        const { getRankedSymbols } = await import('@/lib/redis/ranking');
        const sortMapping: Record<string, string> = {
          marketCap: 'cap',
          marketCapDiff: 'capdiff',
          percentChange: 'chg',
          currentPrice: 'price',
        };
        const field = sortMapping[sort] || 'capdiff';
        
        symbolsToFetch = await getRankedSymbols(dateET, redisSession, field as any, order, offset, limit);
      }

      if (symbolsToFetch.length > 0) {
        const { getManyLastWithDate } = await import('@/lib/redis/ranking');
        const { getPrevClose } = await import('@/lib/redis/operations');
        const [dataMap, prevCloseMap] = await Promise.all([
          getManyLastWithDate(dateET, redisSession, symbolsToFetch),
          getPrevClose(dateET, symbolsToFetch)
        ]);

        if (dataMap.size > 0) {
          const results: StockData[] = [];
          for (const sym of symbolsToFetch) {
            const data = dataMap.get(sym);
            if (data) {
              results.push({
                ticker: sym,
                companyName: data.name || '',
                sector: data.sector || 'Unknown',
                industry: data.industry || 'Unknown',
                logoUrl: `/logos/${sym.toLowerCase()}-32.webp`,
                currentPrice: Number(data.p) || 0,
                closePrice: Number(prevCloseMap.get(sym)) || 0,
                percentChange: Number(data.change_pct) || 0,
                marketCap: Number(data.cap) || 0,
                marketCapDiff: Number(data.cap_diff) || 0,
                lastUpdated: new Date().toISOString(),
                volume: Number(data.v) || 0,
                referenceUsed: 'previousClose',
                referencePrice: 0,
                isFrozen: false,
                isStale: false
              });
            }
          }

          // If tickers were requested, we need to manually sort the results in memory
          // since getManyLastWithDate doesn't guarantee the exact requested order
          // and we didn't use ZSET for explicit ticker arrays.
          if (!isGlobalQuery) {
            results.sort((a, b) => {
              let valA = a[sort as keyof StockData] as number;
              let valB = b[sort as keyof StockData] as number;
              // Fallback sorting logic
              if (valA === undefined) valA = 0;
              if (valB === undefined) valB = 0;
              
              if (order === 'asc') return valA - valB;
              return valB - valA;
            });
          }

          console.log(`🚀 [stockService] Fast path: Served ${results.length} stocks from Redis!`);

          // If specific tickers were requested but some are missing from Redis
          // (e.g. ETFs like QQQ/DIA not in universe), fall through to DB/Polygon
          // fallback for the missing ones instead of returning incomplete data.
          if (!isGlobalQuery && tickers && results.length < tickers.length) {
            const found = new Set(results.map(r => r.ticker));
            const missing = tickers.filter(t => !found.has(t));
            console.log(`🔄 [stockService] ${missing.length} tickers missing from Redis, falling through to DB/Polygon: ${missing.join(',')}`);
            // Don't return — fall through to slow path which will query DB + Polygon for missing tickers
            // But we need to keep our Redis results and merge them later
            // Simplest: set tickers to only the missing ones and continue to slow path
            // Then merge results at the end
            // For now, just fall through — the slow path will fetch ALL requested tickers from DB
            // and the Polygon fallback at the end handles any still-missing ones.
          } else {
            return { data: results, errors: [] };
          }
        }
      }
    }
    } catch (redisError) {
    console.error('⚠️ [stockService] Redis fast path failed, falling back to SQLite:', redisError);
  }

  // === FALLBACK: SLOW PATH (SQLite) ===
  const sortMapping: Record<string, string> = {
    marketCap: 'lastMarketCap',
    marketCapDiff: 'lastMarketCapDiff',
    percentChange: 'lastChangePct',
    currentPrice: 'lastPrice',
    ticker: 'symbol'
  };

  const dbSortColumn = sortMapping[sort] || 'lastMarketCapDiff';

  try {
    const etNow = nowET();
    const session = detectSession(etNow);
    const pricingState = getPricingState(etNow);

    const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const where = tickers && tickers.length > 0
      ? { symbol: { in: tickers } }
      : { 
          lastPrice: { gt: 0 },
          updatedAt: { gte: SEVEN_DAYS_AGO },
          lastPriceUpdated: { gte: TWENTY_FOUR_HOURS_AGO }
        };

    const effectiveLimit = (tickers && tickers.length > 0) ? undefined : (limit && limit > 0 ? limit : undefined);
    const effectiveOffset = (tickers && tickers.length > 0) ? undefined : offset;

    const stocks = await prisma.ticker.findMany({
      where,
      ...(effectiveLimit ? { take: effectiveLimit } : {}),
      ...(effectiveOffset !== undefined ? { skip: effectiveOffset } : {}),
      orderBy: { [dbSortColumn]: order },
      select: {
        symbol: true, name: true, sector: true, industry: true, logoUrl: true,
        lastPrice: true, lastChangePct: true, lastMarketCap: true, lastMarketCapDiff: true,
        latestPrevClose: true, latestPrevCloseDate: true, updatedAt: true,
        lastPriceUpdated: true, lastVolume: true, sharesOutstanding: true
      }
    });

    const symbols = stocks.map(s => s.symbol);

    const bestPriceBySymbol = new Map<string, { price: number; ts: Date; source: 'ticker' | 'session' }>();
    for (const s of stocks) {
      bestPriceBySymbol.set(s.symbol, { price: s.lastPrice || 0, ts: s.lastPriceUpdated ?? s.updatedAt, source: 'ticker' });
    }

    const isLargeQuery = stocks.length > 500;

    try {
      const dateET = getDateET(etNow);
      const today = createETDate(dateET);
      const lookback = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

      if (!isLargeQuery) {
        const sessionPrices = await prisma.sessionPrice.findMany({
          where: { symbol: { in: symbols }, date: { gte: lookback, lte: today } },
          orderBy: { lastTs: 'desc' },
          select: { symbol: true, lastPrice: true, lastTs: true }
        });

        const latestSpBySymbol = new Map<string, { price: number; ts: Date }>();
        for (const sp of sessionPrices) {
          if (!latestSpBySymbol.has(sp.symbol)) latestSpBySymbol.set(sp.symbol, { price: sp.lastPrice, ts: sp.lastTs });
        }

        const STALE_THRESHOLD_MS = 60 * 1000;
        for (const [symbol, sp] of latestSpBySymbol.entries()) {
          const existing = bestPriceBySymbol.get(symbol);
          if (existing && sp.ts.getTime() > existing.ts.getTime() + STALE_THRESHOLD_MS) {
            bestPriceBySymbol.set(symbol, { price: sp.price, ts: sp.ts, source: 'session' });
          } else if (!existing) {
            bestPriceBySymbol.set(symbol, { price: sp.price, ts: sp.ts, source: 'session' });
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ [stockService] SessionPrice fetch failed:', e instanceof Error ? e.message : String(e));
    }

    const priceBySymbol = new Map<string, number>();
    bestPriceBySymbol.forEach((v, k) => priceBySymbol.set(k, v.price || 0));

    const regularCloseBySymbol = new Map<string, number>();
    const prevCloseBySymbol = new Map<string, number>();
    const dateET = getDateET(etNow);
    const todayDateObj = createETDate(dateET);
    const lastTradingDayForQuery = getLastTradingDay(todayDateObj);

    if (!isLargeQuery) {
      const dailyRefs = await prisma.dailyRef.findMany({
        where: { symbol: { in: stocks.map(s => s.symbol) }, date: todayDateObj },
        select: { symbol: true, regularClose: true, previousClose: true, date: true }
      });
      dailyRefs.forEach(r => {
        if (new Date(r.date).getTime() === todayDateObj.getTime()) {
          if (r.regularClose && r.regularClose > 0) regularCloseBySymbol.set(r.symbol, r.regularClose);
          if (r.previousClose && r.previousClose > 0) prevCloseBySymbol.set(r.symbol, r.previousClose);
        }
      });
    }

    const tickersNeedingPrevClose = stocks.filter(s => {
      if ((priceBySymbol.get(s.symbol) || 0) === 0 || (prevCloseBySymbol.get(s.symbol) || 0) > 0) return false;
      if ((s.latestPrevClose || 0) === 0 || !s.latestPrevCloseDate) return true;
      return s.latestPrevCloseDate.getTime() < lastTradingDayForQuery.getTime();
    }).map(s => s.symbol);

    const onDemandPrevCloseMap = new Map<string, number>();

    if (!isLargeQuery && tickersNeedingPrevClose.length > 0) {
      try {
        const { fetchPreviousClosesBatchAndPersist } = await import('@/lib/utils/onDemandPrevClose');
        const onDemandResults = await fetchPreviousClosesBatchAndPersist(tickersNeedingPrevClose, getDateET(), { maxTickers: 50, timeoutBudget: 800, maxConcurrent: 5 });
        onDemandResults.forEach((prevClose, ticker) => onDemandPrevCloseMap.set(ticker, prevClose));
      } catch (error) {
        console.warn(`⚠️ On-demand prevClose fetch failed:`, error);
      }
    }

    const sharesFetchPromises = new Map<string, Promise<number>>();
    const sharesSourceMap = new Map<string, 'db' | 'polygon' | 'fallback' | 'missing'>();
    const onDemandSharesMap = new Map<string, number>();

    const tickersNeedingShares = stocks.filter(s => {
      const missingShares = !s.sharesOutstanding || s.sharesOutstanding === 0;
      if (!missingShares) sharesSourceMap.set(s.symbol, 'db');
      return (priceBySymbol.get(s.symbol) || 0) > 0 && (onDemandPrevCloseMap.get(s.symbol) || s.latestPrevClose || 0) > 0 && missingShares;
    }).map(s => s.symbol);

    if (!isLargeQuery && tickersNeedingShares.length > 0) {
      const startTime = Date.now();
      try {
        for (let i = 0; i < tickersNeedingShares.length; i += 5) {
          if (Date.now() - startTime >= 1000) break;
          const batch = tickersNeedingShares.slice(i, i + 5);
          await Promise.all(batch.map(async ticker => {
            if (!sharesFetchPromises.has(ticker)) {
              sharesFetchPromises.set(ticker, (async () => {
                try {
                  const shares = await getSharesOutstanding(ticker, priceBySymbol.get(ticker) || 0);
                  if (shares > 0) {
                    sharesSourceMap.set(ticker, 'polygon');
                    onDemandSharesMap.set(ticker, shares);
                    prisma.ticker.update({ where: { symbol: ticker }, data: { sharesOutstanding: shares } }).catch(() => {});
                    return shares;
                  }
                  sharesSourceMap.set(ticker, 'missing'); return 0;
                } catch { sharesSourceMap.set(ticker, 'fallback'); return 0; }
              })());
            }
            return await sharesFetchPromises.get(ticker)!;
          }));
        }
      } catch (error) {
        console.warn(`⚠️ On-demand shares fetch failed:`, error);
      }
    }

    const results: StockData[] = stocks.map(s => {
      const best = bestPriceBySymbol.get(s.symbol);
      const currentPrice = best?.price || 0;
      const onDemandPrev = onDemandPrevCloseMap.get(s.symbol) || 0;
      const dailyRefPrev = prevCloseBySymbol.get(s.symbol) || 0;

      let latestPrevCloseSafe = 0;
      if ((s.latestPrevClose || 0) > 0 && s.latestPrevCloseDate) {
        if (s.latestPrevCloseDate.getTime() >= lastTradingDayForQuery.getTime()) {
          latestPrevCloseSafe = s.latestPrevClose!;
        }
      }

      let previousClose = onDemandPrev > 0 ? onDemandPrev : dailyRefPrev > 0 ? dailyRefPrev : latestPrevCloseSafe;
      const sharesOutstanding = onDemandSharesMap.get(s.symbol) || (s.sharesOutstanding || 0);
      const regularClose = regularCloseBySymbol.get(s.symbol) || 0;
      const lastTs = best?.ts || (s.lastPriceUpdated || s.updatedAt);
      const lastUpdated = lastTs.toISOString();

      const isFrozen = !!pricingState.useFrozenPrice;
      const thresholdMin = session === 'live' ? 5 : session === 'pre' ? 30 : session === 'after' ? 30 : 60;
      const isStale = !isFrozen && currentPrice > 0 && (etNow.getTime() - lastTs.getTime()) > thresholdMin * 60_000;

      const pct = calculatePercentChange(currentPrice, session, previousClose > 0 ? previousClose : null, regularClose > 0 ? regularClose : null);
      let percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0) ? pct.changePct : 0;

      if (Math.abs(percentChange) > 50 && currentPrice > 0) {
        percentChange = 0; previousClose = 0;
      }

      let marketCap = (currentPrice > 0 && sharesOutstanding > 0) ? computeMarketCap(currentPrice, sharesOutstanding) : (s.lastMarketCap || 0);
      if (marketCap > 100_000) marketCap = marketCap / 1_000_000_000;

      let marketCapDiff = 0;
      const referencePrice = pct.reference.price || (regularClose > 0 ? regularClose : previousClose);

      if (currentPrice > 0 && referencePrice > 0 && sharesOutstanding > 0) {
        marketCapDiff = computeMarketCapDiff(currentPrice, referencePrice, sharesOutstanding);
      } else if (marketCap > 0 && pct.changePct !== 0 && pct.reference.price && pct.reference.price > 0) {
        marketCapDiff = marketCap * (pct.changePct / 100);
      } else if (marketCap > 0 && currentPrice > 0 && referencePrice > 0 && referencePrice !== currentPrice) {
        const calculatedPct = ((currentPrice - referencePrice) / referencePrice) * 100;
        if (calculatedPct !== 0) marketCapDiff = marketCap * (calculatedPct / 100);
      } else if (s.lastMarketCapDiff && s.lastMarketCapDiff !== 0) {
        marketCapDiff = s.lastMarketCapDiff;
      }

      if (!Number.isFinite(marketCapDiff)) {
        marketCapDiff = 0;
      } else if (marketCap > 0) {
        const capPct = marketCap < 1 ? Infinity : 0.50;
        if (!(marketCap < 1) && Math.abs(marketCapDiff) > marketCap * capPct) marketCapDiff = 0;
      }

      const _ov = SECTOR_INDUSTRY_OVERRIDES[s.symbol];
      return {
        ticker: s.symbol,
        companyName: _ov?.name || s.name || '',
        sector: _ov ? _ov.sector : normalizeSectorIndustryPair(s.sector, s.industry).sector,
        industry: _ov ? _ov.industry : normalizeSectorIndustryPair(s.sector, s.industry).industry,
        logoUrl: s.logoUrl || `/logos/${s.symbol.toLowerCase()}-32.webp`,
        currentPrice, closePrice: previousClose, percentChange, marketCap, marketCapDiff,
        lastUpdated, volume: s.lastVolume || 0, referenceUsed: pct.reference.used,
        referencePrice: pct.reference.price, isFrozen, isStale
      };
    });

    if (tickers && tickers.length > 0) {
      const foundTickers = new Set(results.map(r => r.ticker));
      const missingTickers = tickers.filter(t => !foundTickers.has(t));
      if (missingTickers.length > 0) {
        try {
          const { getPolygonClient } = await import('@/lib/clients/polygonClient');
          const client = getPolygonClient();
          if (client) {
            const polygonData = await client.fetchBatchSnapshot(missingTickers);
            polygonData.forEach(snap => {
              if (snap.ticker) {
                const currentPrice = snap.day?.c || snap.min?.c || (snap.lastTrade ? snap.lastTrade.p : 0);
                const previousClose = snap.prevDay?.c || 0;
                const percentChange = (currentPrice > 0 && previousClose > 0) ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
                results.push({
                  ticker: snap.ticker, currentPrice, closePrice: previousClose, percentChange,
                  marketCap: 0, marketCapDiff: 0, companyName: snap.ticker, logoUrl: `/logos/${snap.ticker.toLowerCase()}-32.webp`
                });
              }
            });
          }
        } catch (polyError) {
          console.warn('⚠️ StockService: Polygon batch fetch failed:', polyError);
        }
      }
    }

    return { data: results, errors: [] };
  } catch (error) {
    console.error('Error fetching stock list:', error);
    return { data: [], errors: [String(error)] };
  }
}

