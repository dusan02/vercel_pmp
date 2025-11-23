import { NextRequest, NextResponse } from 'next/server';
import { getStocksData } from '@/lib/server/stockService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const project = searchParams.get('project') || 'pmp';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : null;

    if (!tickersParam) {
      return NextResponse.json(
        { error: 'Tickers parameter is required' },
        { status: 400 }
      );
    }

    let tickerList = tickersParam.split(',').map(t => t.trim().toUpperCase());

    // Apply limit if specified
    if (limit && limit > 0) {
      tickerList = tickerList.slice(0, limit);
      console.log(`🔍 Applied limit: ${limit}, processing ${tickerList.length} tickers`);
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      console.error('❌ Polygon API key not configured');
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

    console.log(`🔍 Fetching stocks for project: ${project}, tickers: ${tickerList.length}`);

    const { data, errors } = await getStocksData(tickerList, project);

    console.log(`✅ Returning ${data.length} stocks for project ${project}`);

    const response: any = {
      success: true,
      data,
      source: 'hybrid', // redis + db
      project,
      count: data.length,
      timestamp: new Date().toISOString()
    };

    if (errors.length > 0) {
      response.warnings = errors;
      response.partial = true;
      response.message = `Successfully fetched ${data.length} stocks, but encountered ${errors.length} errors`;
    }

    return NextResponse.json(response);

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
