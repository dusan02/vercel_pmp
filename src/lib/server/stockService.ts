import { prisma } from '@/lib/db/prisma';
import { computeMarketCap, computeMarketCapDiff, computePercentChange } from '@/lib/utils/marketCapUtils';

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
        sharesOutstanding: true // Required for dynamic marketCapDiff calculation
      }
    });

    const results: StockData[] = stocks.map(s => {
      const currentPrice = s.lastPrice || 0;
      const previousClose = s.latestPrevClose || 0;
      const sharesOutstanding = s.sharesOutstanding || 0;

      // VŽDY počítať percentChange z aktuálnych hodnôt pre konzistentnosť s heatmapou
      const percentChange = (currentPrice > 0 && previousClose > 0)
        ? computePercentChange(currentPrice, previousClose)
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
        lastUpdated: s.updatedAt.toISOString()
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

