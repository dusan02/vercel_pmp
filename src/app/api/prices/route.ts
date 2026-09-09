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
