/**
 * Optimized Stocks API - Minimal payload + ETag/304 + Keyset pagination
 * 
 * GET /api/stocks/optimized?sort=mcap|chgPct|price&dir=asc|desc&limit=50&cursor=<score>|<score>:<symbol>&q=<prefix>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { redisClient } from '@/lib/redis';
import { getDateET } from '@/lib/rankIndexes';
import { detectSession, nowET } from '@/lib/timeUtils';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic'; // Allow dynamic rendering
export const runtime = 'nodejs';

type MinimalRow = { 
  t: string;  // ticker
  p: number;  // price
  c: number;  // changePct
  m: number;  // marketCap
  d?: number; // marketCapDiff (optional)
};

/**
 * Encode cursor: score or score:symbol
 */
function encCursor(score: number, sym?: string): string {
  return sym ? `${score}:${sym}` : String(score);
}

/**
 * Decode cursor: { score, sym? }
 */
function decCursor(c?: string | null): { score: number; sym?: string } | null {
  if (!c) return null;
  const [s, sym] = c.split(':');
  const score = Number(s);
  if (!Number.isFinite(score)) return null;
  return sym ? { score, sym } : { score };
}

/**
 * Get Redis ZSET key for rank index
 */
function getRankKey(
  sort: 'mcap' | 'chgPct' | 'price',
  date: string,
  session: string,
  dir: 'asc' | 'desc'
): string {
  const fieldMap: Record<string, string> = {
    mcap: 'capdiff', // Using capdiff as mcap proxy
    chgPct: 'chg',
    price: 'price'
  };
  const field = fieldMap[sort] || 'capdiff';
  return `rank:${field}:${date}:${session}:${dir}`;
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(req.url);
    
    // Parse query parameters
    const sortParam = searchParams.get('sort') || 'mcap';
    const sort = (['mcap', 'chgPct', 'price'].includes(sortParam) 
      ? sortParam 
      : 'mcap') as 'mcap' | 'chgPct' | 'price';
    
    const dirParam = searchParams.get('dir') || 'desc';
    const dir = (dirParam === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(1, limitParam), 200); // Max 200
    
    const q = (searchParams.get('q') || '').trim().toUpperCase();
    const cursor = decCursor(searchParams.get('cursor'));
    
    // Get date and session
    const date = getDateET();
    const etNow = nowET();
    const session = detectSession(etNow);
    
    // Get ZSET key
    const zKey = getRankKey(sort, date, session, dir);
    
    // Check ETag version
    const verKey = `meta:${zKey}:v`;
    let ver = '0';
    try {
      if (redisClient && redisClient.isOpen) {
        const verStr = await redisClient.get(verKey);
        if (verStr) ver = verStr;
      }
    } catch (e) {
      logger.warn({ err: e }, 'Could not get version for ETag');
    }
    
    // Get ranked symbols from ZSET
    let withScores: string[] = [];
    const isDesc = dir === 'desc';
    
    try {
      if (!redisClient || !redisClient.isOpen) {
        throw new Error('Redis not available');
      }
      
      if (!cursor) {
        // First page: use ZRANGE (desc uses negated scores, so always ZRANGE)
        const result = await redisClient.zRange(zKey, 0, limit - 1, { WITHSCORES: true });
        // Result format: array of objects with value and score, or flat array
        withScores = result.flatMap((r: any) => {
          if (typeof r === 'string') return [r];
          if (r && typeof r === 'object') {
            return [r.value || String(r), String(r.score || r)];
          }
          return [String(r)];
        });
      } else {
        // Next page: use ZRANGEBYSCORE with cursor
        // Note: For desc, scores are negated, so we use ZRANGEBYSCORE with proper bounds
        const s = cursor.score;
        const extra = limit + 20; // Get extra to filter
        
        if (isDesc) {
          // For desc with negated scores: cursor.score is negative, so we need <= cursor.score (more negative)
          const result = await redisClient.zRangeByScore(zKey, s, '-inf', {
            LIMIT: { offset: 0, count: extra },
            WITHSCORES: true
          });
          withScores = result.flatMap((r: any) => {
            if (typeof r === 'string') return [r];
            if (r && typeof r === 'object') {
              return [r.value || String(r), String(r.score || r)];
            }
            return [String(r)];
          });
        } else {
          // For asc: scores >= cursor.score
          const result = await redisClient.zRangeByScore(zKey, s, '+inf', {
            LIMIT: { offset: 0, count: extra },
            WITHSCORES: true
          });
          withScores = result.flatMap((r: any) => {
            if (typeof r === 'string') return [r];
            if (r && typeof r === 'object') {
              return [r.value || String(r), String(r.score || r)];
            }
            return [String(r)];
          });
        }
      }
    } catch (error) {
      logger.error({ err: error, zKey }, 'Error getting ranked symbols from ZSET');
      // Fallback: return empty with error
      return NextResponse.json(
        { rows: [], nextCursor: null, error: 'Redis unavailable' },
        { status: 503 }
      );
    }
    
    // Parse pairs: [symbol, score, symbol, score, ...]
    // Handle both flat array format and object format
    const pairs: Array<{ sym: string; score: number }> = [];
    for (let i = 0; i < withScores.length; i += 2) {
      const symRaw = withScores[i];
      const scoreRaw = withScores[i + 1];
      const sym = String(symRaw || '');
      const score = Number(scoreRaw || 0);
      if (sym && sym !== 'undefined' && Number.isFinite(score)) {
        pairs.push({ sym, score });
      }
    }
    
    // Tiebreaker: skip cursor entry if present
    let sliced = pairs;
    if (cursor?.sym) {
      sliced = pairs.filter(p => !(p.score === cursor.score && p.sym === cursor.sym));
    }
    
    // Prefix filter for search (q)
    if (q) {
      sliced = sliced.filter(p => p.sym.startsWith(q));
    }
    
    // Limit to requested size
    const pagePairs = sliced.slice(0, limit);
    
    // Get minimal payload from Redis hashes `stock:<SYM>`
    const rows: MinimalRow[] = [];
    
    if (pagePairs.length > 0 && redisClient && redisClient.isOpen) {
      try {
        // Batch get from Redis hashes using pipeline
        const pipe = redisClient.multi();
        for (const { sym } of pagePairs) {
          pipe.hGetAll(`stock:${sym}`);
        }
        const results = await pipe.exec();
        
        for (let i = 0; i < pagePairs.length; i++) {
          const pair = pagePairs[i];
          if (!pair) continue;
          const { sym } = pair;
          const result = results?.[i];
          
          if (result && Array.isArray(result) && result[1] && typeof result[1] === 'object') {
            const h = result[1] as Record<string, string>;
            const row: MinimalRow = {
              t: sym,
              p: Number(h.p || 0),
              c: Number(h.c || 0),
              m: Number(h.m || 0)
            };
            if (h.d !== undefined) {
              row.d = Number(h.d);
            }
            rows.push(row);
          } else {
            // Fallback: try to get from last:date:session:symbol (legacy format)
            try {
              const lastKey = `last:${date}:${session}:${sym}`;
              const lastValue = await redisClient.get(lastKey);
              if (lastValue) {
                const lastData = JSON.parse(lastValue as string);
                const row: MinimalRow = {
                  t: sym,
                  p: Number(lastData.p || lastData.price || 0),
                  c: Number(lastData.change_pct || lastData.changePct || 0),
                  m: Number(lastData.cap || lastData.marketCap || 0)
                };
                if (lastData.cap_diff !== undefined) {
                  row.d = Number(lastData.cap_diff);
                }
                rows.push(row);
              } else {
                // No data available
                rows.push({
                  t: sym,
                  p: 0,
                  c: 0,
                  m: 0
                });
              }
            } catch (fallbackError) {
              logger.warn({ sym, err: fallbackError }, 'Could not get stock data');
              rows.push({
                t: sym,
                p: 0,
                c: 0,
                m: 0
              });
            }
          }
        }
      } catch (error) {
        logger.error({ err: error }, 'Error fetching stock data from Redis');
        // Return minimal rows with just tickers
        rows.push(...pagePairs.map(p => ({
          t: p.sym,
          p: 0,
          c: 0,
          m: 0
        })));
      }
    }
    
    // Calculate ETag
    const etagInput = JSON.stringify({ ver, n: rows.length, f: rows[0]?.t, l: rows.at(-1)?.t });
    const etag = createHash('sha1').update(etagInput).digest('hex');
    
    // Check If-None-Match
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch === etag) {
      const duration = Date.now() - startTime;
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'ETag': etag,
          'X-Query-Duration-ms': duration.toString()
        }
      });
    }
    
    // Calculate next cursor
    const lastPair = pagePairs[pagePairs.length - 1];
    const nextCursor = lastPair
      ? encCursor(lastPair.score, lastPair.sym)
      : null;
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json(
      { rows, nextCursor },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'ETag': etag,
          'Content-Type': 'application/json',
          'X-Query-Duration-ms': duration.toString(),
          'X-Data-Count': rows.length.toString()
        }
      }
    );
    
  } catch (error) {
    logger.error({ err: error }, 'Optimized stocks API error');
    
    return NextResponse.json(
      { rows: [], nextCursor: null, error: 'Internal server error' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}

