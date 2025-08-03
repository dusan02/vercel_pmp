import { NextRequest, NextResponse } from 'next/server';
import { getDefaultTickers, getProjectTickers } from '@/data/defaultTickers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get('project') || 'pmp';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : null;

    console.log(`🔍 Getting default tickers for project: ${project}, limit: ${limit || 'none'}`);

    const tickers = getProjectTickers(project, limit || undefined);

    return NextResponse.json({
      success: true,
      data: tickers,
      project,
      count: tickers.length,
      limit: limit || null,
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