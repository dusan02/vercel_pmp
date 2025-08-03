import { NextRequest, NextResponse } from 'next/server';
import { redisClient, deleteCachedData } from '@/lib/redis';

export async function POST(request: NextRequest) {
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

    const { key } = await request.json();
    let deletedCount = 0;

    if (key) {
      // Delete specific key
      const success = await deleteCachedData(key);
      deletedCount = success ? 1 : 0;
    } else {
      // Delete all keys
      if (redisClient && redisClient.isOpen) {
        const keys = await redisClient.keys('*');
        if (keys.length > 0) {
          await redisClient.del(keys);
          deletedCount = keys.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: key ? `Key "${key}" invalidated` : 'All cache keys invalidated',
      deletedCount,
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