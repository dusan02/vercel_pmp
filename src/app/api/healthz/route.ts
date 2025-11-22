export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { checkRedisHealth } from '@/lib/redis';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  // Simplified health check with timeout
  const health: any = {
    redis: 'ok',
    db: 'ok',
    timestamp: new Date().toISOString()
  };

  // Redis check with timeout (2 seconds)
  try {
    const redisCheckPromise = checkRedisHealth();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis check timeout')), 2000)
    );

    const redisHealth = await Promise.race([redisCheckPromise, timeoutPromise]) as any;
    if (redisHealth?.status !== 'healthy') {
      health.redis = 'error';
    }
  } catch (error) {
    health.redis = 'error';
  }

  // Database check with timeout (2 seconds)
  try {
    const dbCheckPromise = prisma.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB check timeout')), 2000)
    );

    await Promise.race([dbCheckPromise, timeoutPromise]);
    health.db = 'ok';
  } catch (error) {
    health.db = 'error';
  }

  // Return 200 even if Redis is down (degraded mode is acceptable)
  // Only return 503 if database is down (critical)
  const statusCode = health.db === 'ok' ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}

