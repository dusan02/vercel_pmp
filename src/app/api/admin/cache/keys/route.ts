import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Basic admin check (in production, you'd want proper authentication)
    const { searchParams } = new URL(request.url);
    const adminKey = searchParams.get('admin_key');
    
    if (process.env.NODE_ENV === 'production' && adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Redis is not available in Edge Runtime
    return NextResponse.json({
      success: true,
      data: [],
      message: 'Redis not available in Edge Runtime, using memory cache',
      total: 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in /api/admin/cache/keys:', error);
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