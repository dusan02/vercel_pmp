import { NextRequest, NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Cache invalidation endpoint - use POST method',
    timestamp: new Date().toISOString()
  });
}

export async function POST(request: NextRequest) {
  try {
    // Admin auth via header — query params leak into nginx/browser logs
    const adminKey = request.headers.get('x-admin-key');

    if (process.env.NODE_ENV === 'production' && adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Key parameter not needed since cache invalidation is not available

    // Cache invalidation is not available in Edge Runtime
    return NextResponse.json({
      success: true,
      message: 'Cache invalidation not available in Edge Runtime',
      deletedCount: 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in /api/admin/cache/invalidate:', error);
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