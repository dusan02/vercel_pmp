/**
 * Atomic Redis operations using MULTI/EXEC
 */

import { redisClient } from './redis';
import { REDIS_KEYS, REDIS_TTL } from './redisHelpers';
import { PriceData } from './types';

/**
 * Atomically update last price and heatmap
 */
export async function atomicUpdatePrice(
  session: 'pre' | 'live' | 'after',
  symbol: string,
  data: PriceData,
  changePct: number
): Promise<boolean> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    const key = REDIS_KEYS.last(session, symbol);
    const heatmapKey = REDIS_KEYS.heatmap(session);
    const ttl = session === 'live' ? REDIS_TTL.LIVE : REDIS_TTL.PRE_AFTER;
    const score = Math.round(changePct * 10000);

    // Use MULTI/EXEC for atomicity
    const multi = redisClient.multi();
    multi.setEx(key, ttl, JSON.stringify(data));
    multi.zAdd(heatmapKey, { score, value: symbol });
    
    await multi.exec();
    return true;
  } catch (error) {
    console.error(`Error in atomic update for ${symbol}:`, error);
    return false;
  }
}

