import { NextRequest, NextResponse } from 'next/server';
import { stockDataCache } from '@/lib/cache';

/**
 * DEPRECATED: This endpoint has been replaced by /api/stocks
 * Use /api/stocks instead (reads from Redis/DB with better caching)
 */
export async function GET(request: NextRequest) {
  console.log('🚀 /api/prices/cached route called at:', new Date().toISOString());
  
  try {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get('tickers');
    const refresh = searchParams.get('refresh') === 'true';
    const forceUpdate = searchParams.get('forceUpdate') === 'true';

    console.log('🔍 Request params:', { tickers, refresh, forceUpdate });

    // Hardcoded API key for reliability (avoids .env.local issues)
    const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
    console.log('🔍 API Key loaded:', apiKey ? 'Yes' : 'No');
    
    // Test API call to see what's happening
    console.log('🔍 Testing Polygon API call...');
    try {
      const testUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apikey=${apiKey}`;
      const testResponse = await fetch(testUrl);
      console.log('🔍 Test API response status:', testResponse.status);
      if (!testResponse.ok) {
        const errorBody = await testResponse.text();
        console.error('❌ Test API call failed:', {
          status: testResponse.status,
          body: errorBody,
          url: testUrl
        });
        return NextResponse.json({ error: 'API key invalid or expired' }, { status: 401 });
      } else {
        console.log('✅ Test API call successful');
        const testData = await testResponse.json();
        console.log('🔍 Test API response data:', JSON.stringify(testData, null, 2));
      }
    } catch (error) {
      console.error('❌ Test API call exception:', error);
      return NextResponse.json({ error: 'API connection failed' }, { status: 500 });
    }

    // Get current cache status
    const cacheStatus = await stockDataCache.getCacheStatus();
    console.log('📊 Current cache status:', cacheStatus);
    
    // Manual force update trigger
    if (forceUpdate) {
      console.log('🔄 Manual cache update triggered');
      try {
        await stockDataCache.updateCache();
        console.log('✅ Manual cache update completed');
      } catch (error) {
        console.error('❌ Manual cache update failed:', error);
        return NextResponse.json({ error: 'Manual cache update failed' }, { status: 500 });
      }
    }
    
    // If cache is empty or has only demo data (20 stocks), trigger background update
    if ((cacheStatus.count === 0 || cacheStatus.count <= 20) && !cacheStatus.isUpdating) {
      console.log(`Cache has ${cacheStatus.count} stocks (likely demo data), triggering background update...`);
      // Don't await - let it run in background
      stockDataCache.updateCache().catch(err => console.error('Background cache update failed:', err));
    } else if (refresh && !cacheStatus.isUpdating) {
      console.log('Refresh requested, updating cache in background...');
      // Don't await - let it run in background for refresh requests too
      stockDataCache.updateCache().catch(err => console.error('Background cache refresh failed:', err));
    }

    // Return deprecation warning with redirect info
    return NextResponse.json(
      {
        error: 'This endpoint has been deprecated',
        message: 'Please use /api/stocks instead',
        alternative: '/api/stocks',
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

    // Legacy code below (kept for reference, not executed)
    /*
    if (tickers) {
      // Return specific tickers
      const tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
      const results = tickerList
        .map(ticker => stockDataCache.getStock(ticker))
        .filter(Boolean);

      return NextResponse.json({
        success: true,
        data: results,
        source: 'cache',
        timestamp: new Date().toISOString(),
        cacheStatus,
        message: refresh ? 'Cache refreshed and data returned' : 'Data from cache'
      });
    } else {
      // Return all stocks
      const allStocks = await stockDataCache.getAllStocks();
      console.log('📦 Returning', allStocks.length, 'stocks from cache');
      console.log('📦 First stock from cache:', allStocks[0]);
      
      // If no cached data available or only demo data, return demo data with update message
      if (allStocks.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          source: 'cache',
          timestamp: new Date().toISOString(),
          cacheStatus,
          message: 'Cache is updating in background, please wait...'
        });
      }
      
      // If we have demo data (20 stocks), show message that real data is loading
      const message = allStocks.length <= 20 
        ? 'Loading real data in background... (showing demo data)'
        : refresh ? 'Cache refreshing in background' : 'All data from cache';
      
      return NextResponse.json({
        success: true,
        data: allStocks,
        source: 'cache',
        timestamp: new Date().toISOString(),
        cacheStatus,
        message
      });
    }
    */

  } catch (error) {
    console.error('Cached API Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 