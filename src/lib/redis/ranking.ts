/**
 * Rank Indexes - Server-side sorting with Redis ZSET
 * Provides fast sorting and pagination for market data
 */

import { redisClient } from './client';
import { REDIS_KEYS, REDIS_TTL } from './keys';
import { getDateET as getDateETFromUtils } from '@/lib/utils/dateET';

export type RankField = 'price' | 'cap' | 'capdiff' | 'chg' | 'zscore' | 'rvol';

export interface RankIndexData {
  symbol: string;
  price: number;
  marketCap: number;
  marketCapDiff: number;
  changePct: number;
  zscore?: number;
  rvol?: number;
  name?: string | undefined;
  sector?: string | undefined;
  industry?: string | undefined;
  [key: string]: any; // Allow additional fields
}

/**
 * Get date string in YYYY-MM-DD format (ET timezone)
 */
export function getDateET(): string {
  // IMPORTANT: Use ET calendar date derived via Intl (no localized string parsing).
  return getDateETFromUtils(new Date());
}

/**
 * Get rank index key for a field
 */
function getRankKey(field: RankField, date: string, session: string): string {
  switch (field) {
    case 'price':
      return REDIS_KEYS.rankPrice(date, session);
    case 'cap':
      return REDIS_KEYS.rankCap(date, session);
    case 'capdiff':
      return REDIS_KEYS.rankCapDiff(date, session);
    case 'chg':
      return REDIS_KEYS.rankChg(date, session);
    case 'zscore':
      return REDIS_KEYS.rankZScore(date, session);
    case 'rvol':
      return REDIS_KEYS.rankRVOL(date, session);
    default:
      throw new Error(`Unknown rank field: ${field}`);
  }
}

/**
 * Update rank indexes for a symbol
 * ATOMIC: Writes to all rank ZSETs and last:date:session:symbol in one MULTI/EXEC
 * Also updates stats cache (HSET stats:<date>:<session>)
 */
export async function updateRankIndexes(
  date: string,
  session: 'pre' | 'live' | 'after',
  data: RankIndexData,
  updateStats: boolean = true
): Promise<boolean> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    const { symbol, price, marketCap, marketCapDiff, changePct, zscore, rvol } = data;

    // Calculate scores
    const scoreChg = Math.round(changePct * 10000); // int(change_pct * 10000)
    const scorePrice = price;
    const scoreCap = marketCap;
    const scoreCapDiff = marketCapDiff;
    const scoreZScore = zscore ? Math.round(zscore * 10000) : 0;
    const scoreRVOL = rvol ? Math.round(rvol * 10000) : 0;

    // TTL based on session (same for all keys)
    const ttl = session === 'live' ? REDIS_TTL.LIVE : REDIS_TTL.PRE_AFTER;

    // ATOMIC: Use MULTI/EXEC for all operations
    const multi = redisClient.multi();

    // Set last:date:session:symbol with COMPACT data (only what we render)
    const lastKey = REDIS_KEYS.lastWithDate(date, session, symbol);
    const lastData = JSON.stringify({
      p: price,
      change_pct: changePct,
      cap: marketCap,
      cap_diff: marketCapDiff,
      name: data.name || undefined,
      sector: data.sector || undefined,
      industry: data.industry || undefined,
      z: zscore,
      v: rvol
      // Only essential fields - no extra data
    });
    multi.setEx(lastKey, ttl, lastData);

    // Also store in hash format for optimized API (stock:<SYM>)
    const stockHashKey = `stock:${symbol}`;
    multi.hSet(stockHashKey, {
      p: String(price),
      c: String(changePct),
      m: String(marketCap),
      d: String(marketCapDiff),
      z: String(zscore || 0),
      v: String(rvol || 0)
    });
    multi.expire(stockHashKey, ttl);

    // Update all rank ZSETs (atomic) - create both :asc and :desc variants
    // For desc, use negated scores for simpler ZRANGE queries
    const chgKeyAsc = getRankKey('chg', date, session) + ':asc';
    const chgKeyDesc = getRankKey('chg', date, session) + ':desc';
    const priceKeyAsc = getRankKey('price', date, session) + ':asc';
    const priceKeyDesc = getRankKey('price', date, session) + ':desc';
    const capKeyAsc = getRankKey('cap', date, session) + ':asc';
    const capKeyDesc = getRankKey('cap', date, session) + ':desc';
    const capdiffKeyAsc = getRankKey('capdiff', date, session) + ':asc';
    const capdiffKeyDesc = getRankKey('capdiff', date, session) + ':desc';

    // Asc: positive scores, Desc: negated scores (for simpler ZRANGE)
    multi.zAdd(chgKeyAsc, { score: scoreChg, value: symbol });
    multi.zAdd(chgKeyDesc, { score: -scoreChg, value: symbol });
    multi.zAdd(priceKeyAsc, { score: scorePrice, value: symbol });
    multi.zAdd(priceKeyDesc, { score: -scorePrice, value: symbol });
    multi.zAdd(capKeyAsc, { score: scoreCap, value: symbol });
    multi.zAdd(capKeyDesc, { score: -scoreCap, value: symbol });
    multi.zAdd(capdiffKeyAsc, { score: scoreCapDiff, value: symbol });
    multi.zAdd(capdiffKeyDesc, { score: -scoreCapDiff, value: symbol });

    // Set TTL on ZSETs
    multi.expire(chgKeyAsc, ttl);
    multi.expire(chgKeyDesc, ttl);
    multi.expire(priceKeyAsc, ttl);
    multi.expire(priceKeyDesc, ttl);
    multi.expire(capKeyAsc, ttl);
    multi.expire(capKeyDesc, ttl);
    multi.expire(capdiffKeyAsc, ttl);
    multi.expire(capdiffKeyDesc, ttl);

    // Increment version for ETag (one per sort field)
    multi.incr(`meta:${chgKeyAsc}:v`);
    multi.incr(`meta:${chgKeyDesc}:v`);
    multi.incr(`meta:${priceKeyAsc}:v`);
    multi.incr(`meta:${priceKeyDesc}:v`);
    multi.incr(`meta:${capKeyAsc}:v`);
    multi.incr(`meta:${capKeyDesc}:v`);
    multi.incr(`meta:${capdiffKeyAsc}:v`);
    multi.incr(`meta:${capdiffKeyDesc}:v`);

    // Update stats cache if needed (min/max tracking)
    if (updateStats) {
      const statsKey = REDIS_KEYS.stats(date, session);
      // Stats will be updated separately in worker after checking min/max
      // For now, just ensure stats key exists
      multi.expire(statsKey, ttl);
    }

    await multi.exec();
    return true;
  } catch (error) {
    console.error(`Error updating rank indexes for ${data.symbol}:`, error);
    return false;
  }
}

/**
 * Incremental batch update for rank indexes (optimized)
 * Updates multiple symbols at once with versioning for ETag
 */
export async function incUpdateRanks(
  updates: Array<{
    sym: string;
    price?: number;
    chg?: number;
    mcap?: number;
    mcapDiff?: number;
  }>,
  date: string,
  session: 'pre' | 'live' | 'after'
): Promise<boolean> {
  try {
    if (!redisClient || !redisClient.isOpen || updates.length === 0) {
      return false;
    }

    const ttl = session === 'live' ? REDIS_TTL.LIVE : REDIS_TTL.PRE_AFTER;
    const multi = redisClient.multi();

    // Update hash payloads (stock:<SYM>)
    for (const u of updates) {
      const h: Record<string, string> = {};
      if (u.price !== undefined) h.p = String(u.price);
      if (u.chg !== undefined) h.c = String(u.chg);
      if (u.mcap !== undefined) h.m = String(u.mcap);
      if (u.mcapDiff !== undefined) h.d = String(u.mcapDiff);

      if (Object.keys(h).length > 0) {
        multi.hSet(`stock:${u.sym}`, h);
        multi.expire(`stock:${u.sym}`, ttl);
      }
    }

    // Update ZSET scores (both asc and desc variants)
    for (const u of updates) {
      if (u.mcap !== undefined) {
        multi.zAdd(`rank:capdiff:${date}:${session}:asc`, { score: u.mcap, value: u.sym });
        multi.zAdd(`rank:capdiff:${date}:${session}:desc`, { score: -u.mcap, value: u.sym });
      }
      if (u.chg !== undefined) {
        const scoreChg = Math.round(u.chg * 10000);
        multi.zAdd(`rank:chg:${date}:${session}:asc`, { score: scoreChg, value: u.sym });
        multi.zAdd(`rank:chg:${date}:${session}:desc`, { score: -scoreChg, value: u.sym });
      }
      if (u.price !== undefined) {
        multi.zAdd(`rank:price:${date}:${session}:asc`, { score: u.price, value: u.sym });
        multi.zAdd(`rank:price:${date}:${session}:desc`, { score: -u.price, value: u.sym });
      }
    }

    // Increment versions for ETag (once per batch, not per symbol)
    multi.incr(`meta:rank:capdiff:${date}:${session}:asc:v`);
    multi.incr(`meta:rank:capdiff:${date}:${session}:desc:v`);
    multi.incr(`meta:rank:chg:${date}:${session}:asc:v`);
    multi.incr(`meta:rank:chg:${date}:${session}:desc:v`);
    multi.incr(`meta:rank:price:${date}:${session}:asc:v`);
    multi.incr(`meta:rank:price:${date}:${session}:desc:v`);

    await multi.exec();
    return true;
  } catch (error) {
    console.error('Error in incremental rank update:', error);
    return false;
  }
}

/**
 * Update stats cache (min/max for all fields)
 * Should be called after checking if new value is min/max
 */
export async function updateStatsCache(
  date: string,
  session: 'pre' | 'live' | 'after',
  field: RankField,
  symbol: string,
  value: number,
  isMin: boolean,
  isMax: boolean
): Promise<boolean> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    const statsKey = REDIS_KEYS.stats(date, session);
    const ttl = session === 'live' ? REDIS_TTL.LIVE : REDIS_TTL.PRE_AFTER;

    const multi = redisClient.multi();

    if (isMin) {
      multi.hSet(statsKey, `${field}_min_sym`, symbol);
      multi.hSet(statsKey, `${field}_min_v`, value.toString());
    }
    if (isMax) {
      multi.hSet(statsKey, `${field}_max_sym`, symbol);
      multi.hSet(statsKey, `${field}_max_v`, value.toString());
    }

    multi.expire(statsKey, ttl);
    await multi.exec();

    return true;
  } catch (error) {
    console.error(`Error updating stats cache:`, error);
    return false;
  }
}

/**
 * Get stats from cache (HSET stats:<date>:<session>)
 */
export async function getStatsFromCache(
  date: string,
  session: 'pre' | 'live' | 'after'
): Promise<{
  price: { min: { sym: string; v: number } | null; max: { sym: string; v: number } | null };
  cap: { min: { sym: string; v: number } | null; max: { sym: string; v: number } | null };
  capdiff: { min: { sym: string; v: number } | null; max: { sym: string; v: number } | null };
  chg: { min: { sym: string; v: number } | null; max: { sym: string; v: number } | null };
} | null> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return null;
    }

    const statsKey = REDIS_KEYS.stats(date, session);
    const stats = await redisClient.hGetAll(statsKey);

    if (!stats || Object.keys(stats).length === 0) {
      return null;
    }

    const parseStat = (field: RankField) => {
      const minSym = stats[`${field}_min_sym`];
      const minV = stats[`${field}_min_v`];
      const maxSym = stats[`${field}_max_sym`];
      const maxV = stats[`${field}_max_v`];

      return {
        min: minSym && minV ? { sym: minSym, v: Number(minV) } : null,
        max: maxSym && maxV ? { sym: maxSym, v: Number(maxV) } : null
      };
    };

    const price = parseStat('price');
    const cap = parseStat('cap');
    const capdiff = parseStat('capdiff');
    const chg = parseStat('chg');

    // Convert chg score back to percentage
    return {
      price,
      cap,
      capdiff,
      chg: {
        min: chg.min ? { sym: chg.min.sym, v: chg.min.v / 10000 } : null,
        max: chg.max ? { sym: chg.max.sym, v: chg.max.v / 10000 } : null
      }
    };
  } catch (error) {
    console.error(`Error getting stats from cache:`, error);
    return null;
  }
}

/**
 * Get ranked symbols with pagination
 */
export async function getRankedSymbols(
  date: string,
  session: 'pre' | 'live' | 'after',
  field: RankField,
  order: 'asc' | 'desc' = 'desc',
  cursor: number = 0,
  limit: number = 100
): Promise<string[]> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return [];
    }

    const key = getRankKey(field, date, session);
    const end = cursor + limit - 1;

    if (order === 'desc') {
      const result = await redisClient.zRange(key, cursor, end, { REV: true });
      return result.map((r: any) => typeof r === 'string' ? r : r.value || r);
    } else {
      const result = await redisClient.zRange(key, cursor, end);
      return result.map((r: any) => typeof r === 'string' ? r : r.value || r);
    }
  } catch (error) {
    console.error(`Error getting ranked symbols:`, error);
    return [];
  }
}

/**
 * Get total count of symbols in rank index
 */
export async function getRankCount(
  date: string,
  session: 'pre' | 'live' | 'after',
  field: RankField
): Promise<number> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return 0;
    }

    const key = getRankKey(field, date, session);
    return await redisClient.zCard(key);
  } catch (error) {
    console.error(`Error getting rank count:`, error);
    return 0;
  }
}

/**
 * Get min/max stats for a field
 */
export async function getRankMinMax(
  date: string,
  session: 'pre' | 'live' | 'after',
  field: RankField
): Promise<{ min: { sym: string; v: number } | null; max: { sym: string; v: number } | null }> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return { min: null, max: null };
    }

    const key = getRankKey(field, date, session);

    // Get min (first in ascending order)
    const minRange = await redisClient.zRange(key, 0, 0, { WITHSCORES: true });
    // Get max (first in descending order)
    const maxRange = await redisClient.zRange(key, -1, -1, { REV: true, WITHSCORES: true });

    const min = minRange.length >= 2
      ? { sym: minRange[0] as string, v: Number(minRange[1]) }
      : null;

    const max = maxRange.length >= 2
      ? { sym: maxRange[0] as string, v: Number(maxRange[1]) }
      : null;

    return { min, max };
  } catch (error) {
    console.error(`Error getting rank min/max:`, error);
    return { min: null, max: null };
  }
}

/**
 * Get last data for multiple symbols (batch MGET)
 */
export async function getManyLastWithDate(
  date: string,
  session: 'pre' | 'live' | 'after',
  symbols: string[]
): Promise<Map<string, any>> {
  const result = new Map<string, any>();

  if (!redisClient || !redisClient.isOpen || symbols.length === 0) {
    return result;
  }

  try {
    const keys = symbols.map(sym => REDIS_KEYS.lastWithDate(date, session, sym));
    const values = await redisClient.mGet(keys);

    symbols.forEach((symbol, index) => {
      const value = values[index];
      if (value) {
        try {
          const data = JSON.parse(value.toString());
          result.set(symbol, data);
        } catch (e) {
          console.error(`Error parsing data for ${symbol}:`, e);
        }
      }
    });
  } catch (error) {
    console.error('Error getting many last with date:', error);
  }

  return result;
}

