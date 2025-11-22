import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPrice } from '@/lib/utils/marketCapUtils';

export async function GET(request: NextRequest) {
  console.log('🧪 Test cache endpoint called');

  try {
    const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
    const testTickers = ['AAPL', 'MSFT', 'GOOGL', 'NVDA'];

    const results = [];

    for (const ticker of testTickers) {
      try {
        console.log(`🧪 Testing ${ticker}...`);

        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          results.push({
            ticker,
            error: `HTTP ${response.status}: ${response.statusText}`,
            price: null
          });
          continue;
        }

        const data = await response.json();

        if (data.status !== 'OK') {
          results.push({
            ticker,
            error: `Invalid status: ${data.status}`,
            price: null
          });
          continue;
        }

        // Test the price extraction
        const price = getCurrentPrice(data);

        results.push({
          ticker,
          success: true,
          price,
          lastTrade: data.ticker?.lastTrade?.p,
          minPrice: data.ticker?.min?.c,
          dayClose: data.ticker?.day?.c,
          prevDayClose: data.ticker?.prevDay?.c,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        results.push({
          ticker,
          error: error instanceof Error ? error.message : 'Unknown error',
          price: null
        });
      }
    }

    return NextResponse.json({
      testResults: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Test cache error:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 