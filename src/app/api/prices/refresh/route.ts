import { NextRequest, NextResponse } from 'next/server';
import { stockDataCache } from '@/lib/cache';

/**
 * DEPRECATED: This endpoint has been replaced by /api/stocks
 * Use /api/stocks instead (automatic refresh from Redis/DB)
 */
export async function POST(request: NextRequest) {
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
  try {
    const cacheStatus = await stockDataCache.getCacheStatus();
    
    // Check if update is already in progress
    if (cacheStatus.isUpdating) {
      return NextResponse.json({
        message: 'Cache update already in progress',
        cacheStatus
      }, { status: 202 });
    }

    // Start background update
    stockDataCache.updateCache();

    return NextResponse.json({
      message: 'Cache update started',
      cacheStatus
    });

  } catch (error) {
    console.error('Refresh API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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
  try {
    const cacheStatus = await stockDataCache.getCacheStatus();
    
    return NextResponse.json({
      cacheStatus,
      message: 'Cache status retrieved'
    });

  } catch (error) {
    console.error('Cache Status API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
  */
} 