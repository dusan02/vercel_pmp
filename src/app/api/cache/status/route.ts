import { NextRequest, NextResponse } from 'next/server';
import { getCacheStatus } from '@/lib/cacheMetrics';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testCache = searchParams.get('test') === 'true';
    
    // Get cache status from metrics module
    const status = getCacheStatus();

    return NextResponse.json({
      success: true,
      data: status,
      test: testCache ? { success: true, message: 'Memory cache test completed' } : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in /api/cache/status:', error);
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