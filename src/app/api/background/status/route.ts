import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // In Edge Runtime, background service is not available
    // Return a simplified status response
    const status = {
      isRunning: false,
      lastUpdate: new Date().toISOString(),
      nextUpdate: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2 minutes from now
      updateInterval: 2 * 60 * 1000, // 2 minutes
      message: 'Background service not available in Edge Runtime'
    };

    const stats = {
      totalUpdates: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      lastError: null,
      averageUpdateTime: 0,
      cacheHitRate: 0
    };

    return NextResponse.json({
      success: true,
      data: {
        status,
        stats,
        environment: 'Edge Runtime',
        note: 'Background service runs in Node.js environment only'
      }
    });

  } catch (error) {
    console.error('Error getting background service status:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get background service status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 