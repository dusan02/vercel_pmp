import { NextRequest, NextResponse } from 'next/server';
import { getAllProjectTickers } from '@/data/defaultTickers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get('project') || 'pmp';
    const limitParam = searchParams.get('limit');
    const limit = limitParam !== null ? parseInt(limitParam) : null;
    // Handle invalid numbers (NaN)
    const finalLimit = isNaN(limit!) ? null : limit;

    console.log(`🔍 Getting all project tickers for project: ${project}, limit: ${finalLimit !== null ? finalLimit : 'none'}`);

    const tickers = getAllProjectTickers(project);
    
    // Handle negative or zero limits
    let limitedTickers: string[];
    if (finalLimit !== null && finalLimit <= 0) {
      limitedTickers = [];
    } else if (finalLimit !== null) {
      limitedTickers = tickers.slice(0, finalLimit);
    } else {
      limitedTickers = tickers;
    }

    return NextResponse.json({
      success: true,
      data: limitedTickers,
      project,
      count: limitedTickers.length,
      totalAvailable: tickers.length,
      limit: finalLimit,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in /api/tickers/default:', error);
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