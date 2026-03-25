import { NextRequest, NextResponse } from 'next/server';
import { getStocksData } from '@/lib/server/stockService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const project = searchParams.get('project') || 'pmp';
    const limitParam = searchParams.get('limit');
    const sort = searchParams.get('sort') || 'marketCapDiff';
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
    const offsetParam = searchParams.get('offset');
    const getAll = searchParams.get('getAll') === 'true';

    // Validate and parse numeric parameters
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam))) : null;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam)) : 0;

    // Validate sort parameter
    const validSorts = ['marketCapDiff', 'marketCap', 'changePct', 'name', 'symbol'];
    const validatedSort = validSorts.includes(sort) ? sort : 'marketCapDiff';

    // Validate order parameter
    const validatedOrder = ['asc', 'desc'].includes(order) ? order : 'desc';

    // If getAll is true, fetch all stocks from database with sorting
    if (getAll) {
      const { getStocksList } = await import('@/lib/server/stockService');
      const { data, errors } = await getStocksList({
        ...(limit ? { limit } : {}),
        offset,
        sort: validatedSort,
        order: validatedOrder
      });

      return NextResponse.json({
        success: true,
        data,
        source: 'database',
        project,
        count: data.length,
        sort: validatedSort,
        order: validatedOrder,
        timestamp: new Date().toISOString(),
        ...(errors.length > 0 && { warnings: errors })
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30'
        }
      });
    }

    // Original logic for specific tickers
    if (!tickersParam && !getAll) {
      // If neither tickers nor getAll is provided, default to getAll=true behavior
      // to avoid 400 errors from health checks or empty calls
      const { getStocksList } = await import('@/lib/server/stockService');
      const { data, errors } = await getStocksList({
        ...(limit ? { limit } : {}),
        offset,
        sort: validatedSort,
        order: validatedOrder
      });

      return NextResponse.json({
        success: true,
        data,
        source: 'database',
        project,
        count: data.length,
        sort: validatedSort,
        order: validatedOrder,
        timestamp: new Date().toISOString(),
        ...(errors.length > 0 && { warnings: errors })
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30'
        }
      });
    }

    if (!tickersParam) {
      // This case is actually handled by the block above if !getAll,
      // but keeping it for completeness if the logic flow changes.
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

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30'
      }
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
