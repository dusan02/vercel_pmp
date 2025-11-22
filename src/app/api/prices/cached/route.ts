import { NextRequest, NextResponse } from 'next/server';
import { stockDataCache } from '@/lib/cache';

export const dynamic = 'force-dynamic'; // Ensure no static caching

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get('tickers');

    // If specific tickers requested
    if (tickers) {
      const tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
      const results = [];

      for (const ticker of tickerList) {
        const stock = await stockDataCache.getStock(ticker);
        if (stock) {
          results.push(stock);
        }
      }

      return NextResponse.json({
        success: true,
        data: results,
        source: 'redis',
        timestamp: new Date().toISOString(),
        count: results.length
      });
    }

    // Get all stocks
    const allStocks = await stockDataCache.getAllStocks();

    return NextResponse.json({
      success: true,
      data: allStocks,
      source: 'redis',
      timestamp: new Date().toISOString(),
      count: allStocks.length
    });

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