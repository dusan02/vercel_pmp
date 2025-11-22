import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { getCacheKey } from '@/lib/redis/keys';
import { getSharesOutstanding, getPreviousClose, getCurrentPrice, computePercentChange, computeMarketCap, computeMarketCapDiff } from '@/lib/utils/marketCapUtils';

interface StockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCap: number;
  marketCapDiff: number;
  sector?: string;
  industry?: string;
  lastUpdated: string;
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const project = 'pmp';
  const apiKey = process.env.POLYGON_API_KEY;

  // Dummy ticker list for now, should be replaced with actual universe
  const tickerList = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN'];

  try {
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Polygon API key not configured',
          message: 'Please configure POLYGON_API_KEY environment variable',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }

    const results: StockData[] = [];
    const errors: string[] = [];

    // Process tickers in parallel with rate limiting
    const promises = tickerList.map(async (ticker, index) => {
      try {
        // Add delay between requests to avoid rate limiting
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Try to get from cache first
        const cacheKey = getCacheKey(project, ticker, 'stock');
        const cachedData = await getCachedData(cacheKey);

        if (cachedData) {
          results.push(cachedData);
          return;
        }

        // Fetch fresh data from Polygon
        const shares = await getSharesOutstanding(ticker);
        const prevClose = await getPreviousClose(ticker);

        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
        const snapshotResponse = await fetch(snapshotUrl, {
          signal: AbortSignal.timeout(5000),
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'PremarketPrice/1.0'
          }
        });

        if (!snapshotResponse.ok) {
          errors.push(`${ticker}: HTTP ${snapshotResponse.status}`);
          return;
        }

        const snapshotData = await snapshotResponse.json();
        const currentPrice = getCurrentPrice(snapshotData);

        if (currentPrice === null || currentPrice === undefined) {
          errors.push(`${ticker}: No valid price data`);
          return;
        }

        const percentChange = computePercentChange(currentPrice, prevClose);
        const marketCap = computeMarketCap(currentPrice, shares);
        const marketCapDiff = computeMarketCapDiff(currentPrice, prevClose, shares);

        const stockData: StockData = {
          ticker,
          currentPrice,
          closePrice: prevClose,
          percentChange,
          marketCap,
          marketCapDiff,
          lastUpdated: new Date().toISOString()
        };

        // Cache the result for 2 minutes
        await setCachedData(cacheKey, stockData, 120);
        results.push(stockData);

      } catch (error) {
        errors.push(`${ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    await Promise.all(promises);

    const duration = Date.now() - startTime;

    // Sort by marketCapDiff descending
    results.sort((a, b) => (b.marketCapDiff || 0) - (a.marketCapDiff || 0));

    // Calculate stats
    const stats = results.length > 0 ? {
      total: results.length,
      minMarketCapDiff: Math.min(...results.map(s => s.marketCapDiff || 0)),
      maxMarketCapDiff: Math.max(...results.map(s => s.marketCapDiff || 0)),
      updatedAt: new Date().toISOString()
    } : {
      total: 0,
      minMarketCapDiff: 0,
      maxMarketCapDiff: 0,
      updatedAt: new Date().toISOString()
    };

    const response: any = {
      success: true,
      data: results,
      source: 'polygon',
      project,
      count: results.length,
      stats,
      duration,
      timestamp: new Date().toISOString()
    };

    if (errors.length > 0) {
      response.warnings = errors;
      response.partial = true;
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'X-Data-Count': results.length.toString()
      }
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
