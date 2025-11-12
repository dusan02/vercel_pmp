/**
 * Market API - Server-side sorted listing with Redis ZSET indexes
 * Provides <100ms responses for 100-600 rows
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import {
  getRankedSymbols,
  getRankCount,
  getRankMinMax,
  getManyLastWithDate,
  getDateET,
  getStatsFromCache,
  type RankField
} from '@/lib/rankIndexes';
import { mapToRedisSession, detectSession } from '@/lib/timeUtils';

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(req.url);
    
    // Parse query parameters
    const sort = (searchParams.get('sort') ?? 'chg') as RankField;
    const order = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc';
    const limit = Math.min(Number(searchParams.get('limit') ?? 100), 600);
    const cursor = Number(searchParams.get('cursor') ?? 0);
    const sessionParam = searchParams.get('session') ?? 'live';
    
    // Map session to Redis-compatible session
    // Handle 'closed' -> use 'after' (last available data) or detect current session
    let mappedSession = sessionParam as 'pre' | 'live' | 'after' | 'closed';
    if (mappedSession === 'closed') {
      // For closed, use 'after' (last available data) or detect current session
      const currentSession = detectSession();
      mappedSession = currentSession === 'closed' ? 'after' : mapToRedisSession(currentSession) || 'after';
    }
    
    const session = mapToRedisSession(mappedSession);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 400 }
      );
    }

    // Get date in ET timezone (YYYY-MM-DD)
    const date = getDateET();

    // Get ranked symbols
    const symbols = await getRankedSymbols(date, session, sort, order, cursor, limit);
    
    if (symbols.length === 0) {
      return NextResponse.json({
        date,
        session: sessionParam,
        total: 0,
        items: [],
        stats: {},
        nextCursor: 0
      }, {
        headers: {
          'Cache-Control': session === 'live' ? 'no-store' : 'public, s-maxage=15, stale-while-revalidate=30'
        }
      });
    }

    // Get total count
    const total = await getRankCount(date, session, sort);

    // MGET last:date:session:symbol for batch
    const lastData = await getManyLastWithDate(date, session, symbols);
    
    // Build items array
    const items = symbols
      .map(symbol => {
        const data = lastData.get(symbol);
        if (!data || data.p == null) return null;
        
        return {
          symbol,
          p: data.p,
          change_pct: data.change_pct ?? 0,
          cap: data.cap ?? 0,
          cap_diff: data.cap_diff ?? 0,
          name: data.name,
          sector: data.sector,
          industry: data.industry,
          ...data
        };
      })
      .filter(Boolean);

    // Get stats from cache (HSET) - faster than 4x ZSET operations
    let stats = await getStatsFromCache(date, session);
    
    // Fallback to ZSET min/max if cache not available
    if (!stats) {
      const [priceStats, capStats, capdiffStats, chgStats] = await Promise.all([
        getRankMinMax(date, session, 'price'),
        getRankMinMax(date, session, 'cap'),
        getRankMinMax(date, session, 'capdiff'),
        getRankMinMax(date, session, 'chg')
      ]);

      // Convert chg score back to percentage
      stats = {
        price: priceStats,
        cap: capStats,
        capdiff: capdiffStats,
        chg: {
          min: chgStats.min ? { sym: chgStats.min.sym, v: chgStats.min.v / 10000 } : null,
          max: chgStats.max ? { sym: chgStats.max.sym, v: chgStats.max.v / 10000 } : null
        }
      };
    }

    const duration = Date.now() - startTime;
    console.log(`[METRICS] /api/market: ${duration}ms, ${items.length} items, sort: ${sort}, order: ${order}, cursor: ${cursor}`);

    return NextResponse.json({
      date,
      session: sessionParam,
      total,
      items,
      stats: stats || {
        price: { min: null, max: null },
        cap: { min: null, max: null },
        capdiff: { min: null, max: null },
        chg: { min: null, max: null }
      },
      nextCursor: cursor + items.length
    }, {
      headers: {
        'Cache-Control': session === 'live' 
          ? 'no-store' 
          : 'public, s-maxage=15, stale-while-revalidate=30',
        'X-Response-Time': `${duration}ms`,
        'X-Session': sessionParam,
        'X-Date': date
      }
    });
  } catch (error) {
    console.error('[ERROR] /api/market failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market data', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

