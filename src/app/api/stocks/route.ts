import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData, getCacheKey } from '@/lib/redis';
import { getCurrentPrice, getPreviousClose, getSharesOutstanding, computeMarketCap, computeMarketCapDiff, computePercentChange } from '@/lib/marketCapUtils';

interface StockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCap: number;
  marketCapDiff: number;
  lastUpdated: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get('tickers');
    const project = searchParams.get('project') || 'pmp';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : null;

    if (!tickers) {
      return NextResponse.json(
        { error: 'Tickers parameter is required' },
        { status: 400 }
      );
    }

    let tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
    
    // Apply limit if specified
    if (limit && limit > 0) {
      tickerList = tickerList.slice(0, limit);
      console.log(`🔍 Applied limit: ${limit}, processing ${tickerList.length} tickers`);
    }
    const apiKey = process.env.POLYGON_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Polygon API key not configured' },
        { status: 500 }
      );
    }

    console.log(`🔍 Fetching stocks for project: ${project}, tickers: ${tickerList.join(',')}`);

    const results: StockData[] = [];

    // Process tickers in parallel
    const promises = tickerList.map(async (ticker) => {
      try {
        // Try to get from cache first
        const cacheKey = getCacheKey(project, ticker, 'stock');
        const cachedData = await getCachedData(cacheKey);

        if (cachedData) {
          console.log(`✅ Cache hit for ${ticker} in project ${project}`);
          results.push(cachedData);
          return;
        }

        console.log(`🔄 Cache miss for ${ticker} in project ${project}, fetching from Polygon...`);

        // Fetch fresh data from Polygon
        const shares = await getSharesOutstanding(ticker);
        const prevClose = await getPreviousClose(ticker);
        
        // Get snapshot data from Polygon.io v2 API
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
        const snapshotResponse = await fetch(snapshotUrl, {
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (!snapshotResponse.ok) {
          console.error(`Failed to fetch data for ${ticker}:`, snapshotResponse.statusText);
          return null;
        }

        const snapshotData = await snapshotResponse.json();

        // Get current price using robust fallback logic
        const currentPrice = getCurrentPrice(snapshotData);
        
        // Calculate derived values
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
        console.log(`✅ Fetched and cached ${ticker} for project ${project}`);

      } catch (error) {
        console.error(`❌ Error processing ${ticker}:`, error);
        return null;
      }
    });

    await Promise.all(promises);

    // Filter out null results
    const validResults = results.filter(result => result !== null);

    console.log(`✅ Returning ${validResults.length} stocks for project ${project}`);

    return NextResponse.json({
      success: true,
      data: validResults,
      source: 'polygon',
      project,
      count: validResults.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in /api/stocks:', error);
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