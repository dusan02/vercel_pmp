import { NextRequest, NextResponse } from 'next/server';
import { getStocksData } from '@/lib/server/stockService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const project = searchParams.get('project') || 'pmp';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : null;
    const sort = searchParams.get('sort') || 'marketCapDiff';
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;
    const getAll = searchParams.get('getAll') === 'true'; // New parameter to get all stocks from DB

    // If getAll is true, fetch all stocks from database with sorting
    if (getAll) {
      const { getStocksList } = await import('@/lib/server/stockService');
      const { data, errors } = await getStocksList({
        ...(limit ? { limit } : {}),
        offset,
        sort,
        order
      });

      return NextResponse.json({
        success: true,
        data,
        source: 'database',
        project,
        count: data.length,
        sort,
        order,
        timestamp: new Date().toISOString(),
        ...(errors.length > 0 && { warnings: errors })
      });
    }

    // Original logic for specific tickers
    if (!tickersParam) {
      return NextResponse.json(
        { error: 'Tickers parameter is required when getAll is not true' },
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
    console.log(`🔍 ROUTE: About to call getStocksData with tickers=${tickerList.join(',')}`);

    const { data, errors } = await getStocksData(tickerList, project);

    console.log(`🔍 ROUTE: getStocksData returned ${data.length} stocks, ${errors.length} errors`);
    console.log(`✅ Returning ${data.length} stocks for project ${project}`);

    const response: any = {
      success: true,
      data,
      source: 'database', // SQL-first architecture - data from Ticker table
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
