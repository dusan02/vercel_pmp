import { prisma } from '@/lib/db/prisma';
import { computeMarketCap, computeMarketCapDiff } from '@/lib/utils/marketCapUtils';

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
      take: effectiveLimit,
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

    const results: StockData[] = stocks.map(s => ({
      ticker: s.symbol,
      companyName: s.name || '',
      sector: s.sector || '',
      industry: s.industry || '',
      // Use DB logoUrl if present, otherwise construct it
      logoUrl: s.logoUrl || `/logos/${s.symbol.toLowerCase()}-32.webp`,
      currentPrice: s.lastPrice || 0,
      closePrice: s.latestPrevClose || 0,
      percentChange: s.lastChangePct || 0,
      marketCap: s.lastMarketCap || 0,
      // Calculate marketCapDiff dynamically if not in DB or if it's 0 but prices differ
      marketCapDiff: (s.lastMarketCapDiff && s.lastMarketCapDiff !== 0) 
        ? s.lastMarketCapDiff 
        : ((s.lastPrice && s.latestPrevClose && s.lastPrice !== s.latestPrevClose && s.sharesOutstanding && s.sharesOutstanding > 0)
          ? computeMarketCapDiff(s.lastPrice, s.latestPrevClose, s.sharesOutstanding)
          : 0),
      lastUpdated: s.updatedAt.toISOString()
    }));

    return { data: results, errors: [] };

  } catch (error) {
    console.error('Error fetching stock list:', error);
    return { data: [], errors: [String(error)] };
  }
}

