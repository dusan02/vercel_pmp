import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: This endpoint has been replaced by /api/stocks
 * Use /api/stocks instead (reads from Redis/DB, not Polygon API)
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { 
      error: 'This endpoint has been deprecated',
      message: 'Please use /api/stocks instead',
      migration: 'https://github.com/your-repo/wiki/api-migration'
    },
    { 
      status: 410, // Gone
      headers: {
        'Cache-Control': 'no-store',
        'X-Deprecated': 'true',
        'X-Alternative': '/api/stocks'
      }
    }
  );
}

// Legacy code below (kept for reference, not executed)
/*
interface StockData {
  ticker: string;
  preMarketPrice: number;
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
}

interface PolygonV2Response {
  ticker: {
    ticker: string;
    todaysChangePerc: number;
    todaysChange: number;
    updated: number;
    day: {
      o: number;
      h: number;
      l: number;
      c: number;
      v: number;
      vw: number;
    };
    prevDay: {
      o: number;
      h: number;
      l: number;
      c: number;
      v: number;
      vw: number;
    };
  };
}

export async function GET_LEGACY(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get('tickers');

    if (!tickers) {
      return NextResponse.json(
        { error: 'Tickers parameter is required' },
        { status: 400 }
      );
    }

    const tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
    const apiKey = process.env.POLYGON_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Polygon API key not configured' },
        { status: 500 }
      );
    }

    const results: StockData[] = [];

    // Process tickers in parallel
    const promises = tickerList.map(async (ticker) => {
      try {
        // Get shares outstanding from Polygon API with caching
        const shares = await getSharesOutstanding(ticker);
        
        // Get previous close from Polygon aggregates with adjusted=true
        const prevClose = await getPreviousClose(ticker);
        
        // Get snapshot data from Polygon.io v2 API
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
        const snapshotResponse = await fetch(snapshotUrl);
        
        if (!snapshotResponse.ok) {
          console.error(`Failed to fetch data for ${ticker}:`, snapshotResponse.statusText);
          return null;
        }

        const snapshotData: PolygonV2Response = await snapshotResponse.json();

        // Get current price using ONLY lastTrade.p (no fallbacks)
        const currentPrice = getCurrentPrice(snapshotData);
        
        // Validate price data for extreme changes
        validatePriceChange(currentPrice, prevClose);
        
        // Get market status for reference
        const marketStatus = await getMarketStatus();
        console.log(`📈 Market status: ${marketStatus.market} (${marketStatus.serverTime})`);
        
        // Calculate percent change using Decimal.js for precision
        const percentChange = computePercentChange(currentPrice, prevClose);
        
        // Calculate market cap and diff using centralized utilities with Decimal.js precision
        const marketCap = computeMarketCap(currentPrice, shares);
        const marketCapDiff = computeMarketCapDiff(currentPrice, prevClose, shares);
        
        // Log detailed calculation data for debugging
        logCalculationData(ticker, currentPrice, prevClose, shares, marketCap, marketCapDiff, percentChange);

        const stockData = {
          ticker,
          preMarketPrice: Math.round(currentPrice * 100) / 100,
          closePrice: Math.round(prevClose * 100) / 100,
          percentChange: Math.round(percentChange * 100) / 100,
          marketCapDiff: Math.round(marketCapDiff * 100) / 100,
          marketCap: Math.round(marketCap * 100) / 100
        };

        return stockData;

      } catch (error) {
        console.error(`Error processing ${ticker}:`, error);
        return null;
      }
    });

    const stockDataArray = await Promise.all(promises);
    
    // Filter out null results and add to results array
    stockDataArray.forEach(data => {
      if (data) {
        results.push(data);
      }
    });

    return NextResponse.json(results);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
*/ 