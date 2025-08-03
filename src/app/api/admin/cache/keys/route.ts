import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis';

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

    if (!redisClient || !redisClient.isOpen) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'Redis not available, using memory cache'
      });
    }

    // Get all cache keys
    const keys = await redisClient.keys('*');
    const cacheKeys = [];

    // Get details for each key
    for (const key of keys.slice(0, 100)) { // Limit to first 100 keys
      try {
        const ttl = await redisClient.ttl(key);
        const value = await redisClient.get(key);
        const size = value ? Buffer.byteLength(value, 'utf8') : 0;

        cacheKeys.push({
          key,
          ttl,
          size,
          lastAccessed: new Date().toISOString() // Redis doesn't track this by default
        });
      } catch (error) {
        console.error(`Error getting details for key ${key}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      data: cacheKeys,
      total: keys.length,
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