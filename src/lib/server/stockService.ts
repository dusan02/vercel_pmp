import { prisma } from '@/lib/db/prisma';
import { computeMarketCap, computeMarketCapDiff, computePercentChange, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { detectSession } from '@/lib/utils/timeUtils';
import { nowET, getDateET, createETDate } from '@/lib/utils/dateET';
import { getPricingState } from '@/lib/utils/pricingStateMachine';
import { calculatePercentChange } from '@/lib/utils/priceResolver';

import { StockData } from '@/lib/types';

interface StockServiceResult {
  data: StockData[];
  errors: string[];
}

/**
 * Main entry point for stock data - SQL-first implementation using Ticker table
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

  // Map sort keys to DB columns
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

    const where = tickers && tickers.length > 0 ? { symbol: { in: tickers } } : {};

    // Only apply limit if no specific tickers are requested
    // When tickers are specified, return all requested tickers (respecting the ticker list, not the limit)
    const effectiveLimit = (tickers && tickers.length > 0)
      ? undefined  // No limit when specific tickers are requested
      : (limit && limit > 0 ? limit : undefined);  // Apply limit only when fetching all tickers

    const stocks = await prisma.ticker.findMany({
      where,
      ...(effectiveLimit ? { take: effectiveLimit } : {}),
      skip: offset,
      orderBy: {
        [dbSortColumn]: order
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        logoUrl: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
        lastMarketCapDiff: true,
        latestPrevClose: true,
        updatedAt: true,
        lastPriceUpdated: true,
        sharesOutstanding: true // Required for dynamic marketCapDiff calculation
      }
    });

    // Regular close is only needed after-hours / closed sessions (for correct reference + % change)
    const regularCloseBySymbol = new Map<string, number>();
    if (session === 'after' || session === 'closed') {
      const dateET = getDateET(etNow);
      const dateObj = createETDate(dateET);
      const dailyRefs = await prisma.dailyRef.findMany({
        where: {
          symbol: { in: stocks.map(s => s.symbol) },
          date: dateObj
        },
        select: { symbol: true, regularClose: true }
      });
      dailyRefs.forEach(r => {
        if (r.regularClose && r.regularClose > 0) {
          regularCloseBySymbol.set(r.symbol, r.regularClose);
        }
      });
    }

    // On-demand prevClose fetch for tickers missing previousClose (API-safe for /api/stocks)
    const tickersNeedingPrevClose = stocks
      .filter(s => (s.lastPrice || 0) > 0 && (s.latestPrevClose || 0) === 0)
      .map(s => s.symbol);
    
    const onDemandPrevCloseMap = new Map<string, number>();
    if (tickersNeedingPrevClose.length > 0) {
      try {
        const { fetchPreviousClosesBatchAndPersist } = await import('@/lib/utils/onDemandPrevClose');
        const today = getDateET();
        // For /api/stocks, we can be more generous (smaller datasets, 10-50 tickers typical)
        const onDemandResults = await fetchPreviousClosesBatchAndPersist(
          tickersNeedingPrevClose,
          today,
          {
            maxTickers: 50,        // Cap at 50 (usually less)
            timeoutBudget: 800,     // 800ms budget (more generous than heatmap)
            maxConcurrent: 5
          }
        );
        onDemandResults.forEach((prevClose, ticker) => {
          onDemandPrevCloseMap.set(ticker, prevClose);
        });
        console.log(`✅ On-demand fetched ${onDemandPrevCloseMap.size} prevClose for /api/stocks`);
      } catch (error) {
        console.warn(`⚠️ On-demand prevClose fetch failed in stockService:`, error);
      }
    }

    // On-demand sharesOutstanding fetch for tickers missing shares (needed for marketCapDiff calculation)
    const tickersNeedingShares = stocks
      .filter(s => {
        const hasPrice = (s.lastPrice || 0) > 0;
        const hasPrevClose = (onDemandPrevCloseMap.get(s.symbol) || s.latestPrevClose || 0) > 0;
        const missingShares = !s.sharesOutstanding || s.sharesOutstanding === 0;
        return hasPrice && hasPrevClose && missingShares;
      })
      .map(s => s.symbol);
    
    const onDemandSharesMap = new Map<string, number>();
    if (tickersNeedingShares.length > 0) {
      try {
        // Fetch shares in parallel (with limit to avoid rate limits)
        const maxConcurrent = 5;
        const sharesPromises: Promise<void>[] = [];
        
        for (let i = 0; i < tickersNeedingShares.length; i += maxConcurrent) {
          const batch = tickersNeedingShares.slice(i, i + maxConcurrent);
          const batchPromises = batch.map(async (ticker) => {
            try {
              const shares = await getSharesOutstanding(ticker);
              if (shares > 0) {
                onDemandSharesMap.set(ticker, shares);
                // Persist to DB for future use (async, don't wait)
                prisma.ticker.update({
                  where: { symbol: ticker },
                  data: { sharesOutstanding: shares }
                }).catch(err => {
                  console.warn(`⚠️ Failed to persist sharesOutstanding for ${ticker}:`, err);
                });
              }
            } catch (error) {
              console.warn(`⚠️ Failed to fetch sharesOutstanding for ${ticker}:`, error);
            }
          });
          sharesPromises.push(...batchPromises);
          // Wait for batch to complete before starting next batch
          await Promise.all(batchPromises);
        }
        
        console.log(`✅ On-demand fetched ${onDemandSharesMap.size} sharesOutstanding for /api/stocks`);
      } catch (error) {
        console.warn(`⚠️ On-demand sharesOutstanding fetch failed in stockService:`, error);
      }
    }

    const results: StockData[] = stocks.map(s => {
      const currentPrice = s.lastPrice || 0;
      // Use on-demand prevClose if available, otherwise fallback to DB value
      const previousClose = onDemandPrevCloseMap.get(s.symbol) || (s.latestPrevClose || 0);
      // Use on-demand sharesOutstanding if available, otherwise fallback to DB value
      const sharesOutstanding = onDemandSharesMap.get(s.symbol) || (s.sharesOutstanding || 0);
      const regularClose = regularCloseBySymbol.get(s.symbol) || 0;

      const lastTs = s.lastPriceUpdated || s.updatedAt;
      const lastUpdated = lastTs.toISOString();

      const isFrozen = !!pricingState.useFrozenPrice;
      const thresholdMin = session === 'live' ? 1 : 5;
      const ageMs = etNow.getTime() - lastTs.getTime();
      const isStale = !isFrozen && currentPrice > 0 && ageMs > thresholdMin * 60_000;

      // VŽDY počítať percentChange z aktuálnych hodnôt pre konzistentnosť s heatmapou
      const pct = calculatePercentChange(
        currentPrice,
        session,
        previousClose > 0 ? previousClose : null,
        regularClose > 0 ? regularClose : null
      );

      const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
        ? pct.changePct
        : (s.lastChangePct || 0);

      // VŽDY počítať marketCapDiff z aktuálnych hodnôt pre konzistentnosť
      const marketCapDiff = (currentPrice > 0 && previousClose > 0 && sharesOutstanding > 0)
        ? computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding)
        : ((s.lastMarketCapDiff && s.lastMarketCapDiff !== 0)
          ? s.lastMarketCapDiff
          : 0);

      // Vypočítaj market cap z aktuálnych hodnôt
      const marketCap = (currentPrice > 0 && sharesOutstanding > 0)
        ? computeMarketCap(currentPrice, sharesOutstanding)
        : (s.lastMarketCap || 0);

      // Persist calculated marketCapDiff to DB if we have all required values
      // This ensures the value is available for future requests
      if (currentPrice > 0 && previousClose > 0 && sharesOutstanding > 0 && marketCapDiff !== 0) {
        prisma.ticker.update({
          where: { symbol: s.symbol },
          data: { 
            lastMarketCapDiff: marketCapDiff,
            lastMarketCap: marketCap
          }
        }).catch(err => {
          console.warn(`⚠️ Failed to persist marketCapDiff for ${s.symbol}:`, err);
        });
      }

      return {
        ticker: s.symbol,
        companyName: s.name || '',
        sector: s.sector || '',
        industry: s.industry || '',
        logoUrl: s.logoUrl || `/logos/${s.symbol.toLowerCase()}-32.webp`,
        currentPrice,
        closePrice: previousClose,
        percentChange,
        marketCap,
        marketCapDiff,
        lastUpdated,
        referenceUsed: pct.reference.used,
        referencePrice: pct.reference.price,
        isFrozen,
        isStale
      };
    });

    // Fallback for missing tickers (e.g. indices SPY, QQQ which might not be in DB during dev)
    if (tickers && tickers.length > 0) {
      const foundTickers = new Set(results.map(r => r.ticker));
      const missingTickers = tickers.filter(t => !foundTickers.has(t));

      if (missingTickers.length > 0) {
        try {
          // Dynamic import to avoid circular deps if any, though client is safe
          const { getPolygonClient } = await import('@/lib/clients/polygonClient');
          const client = getPolygonClient();

          if (client) {
            const polygonData = await client.fetchBatchSnapshot(missingTickers);

            polygonData.forEach(snap => {
              if (snap.ticker) {
                // Determine current price (close of day, or last min close, or last trade)
                // Use optional chaining to safely access nested properties
                const currentPrice = snap.day?.c || snap.min?.c || (snap.lastTrade ? snap.lastTrade.p : 0);
                const previousClose = snap.prevDay?.c || 0;

                const percentChange = (currentPrice > 0 && previousClose > 0)
                  ? ((currentPrice - previousClose) / previousClose) * 100
                  : 0;

                results.push({
                  ticker: snap.ticker,
                  currentPrice,
                  closePrice: previousClose,
                  percentChange,
                  marketCap: 0, // Indices don't have market cap usually or we don't know it
                  marketCapDiff: 0,
                  companyName: snap.ticker, // Fallback
                  logoUrl: `/logos/${snap.ticker.toLowerCase()}-32.webp`
                });
              }
            });
          }
        } catch (polyError) {
          console.error('Failed to fetch missing tickers from Polygon:', polyError);
        }
      }
    }

    return { data: results, errors: [] };

  } catch (error) {
    console.error('Error fetching stock list:', error);
    return { data: [], errors: [String(error)] };
  }
}

