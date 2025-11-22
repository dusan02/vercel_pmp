import { redisClient } from './client';
import { REDIS_KEYS, REDIS_TTL } from './keys';
import { PriceData } from '../types';

// --- Atomic Operations ---

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

// --- Helper Operations ---

/**
 * Set last price for a symbol in a session
 */
export async function setLast(
    session: 'pre' | 'live' | 'after',
    symbol: string,
    data: PriceData
): Promise<boolean> {
    try {
        if (!redisClient || !redisClient.isOpen) {
            return false;
        }

        const key = REDIS_KEYS.last(session, symbol);
        const ttl = session === 'live' ? REDIS_TTL.LIVE : REDIS_TTL.PRE_AFTER;
        const value = JSON.stringify(data);

        await redisClient.setEx(key, ttl, value);
        return true;
    } catch (error) {
        console.error(`Error setting last price for ${symbol}:`, error);
        return false;
    }
}

/**
 * Get last price for a symbol in a session
 */
export async function getLast(
    session: 'pre' | 'live' | 'after',
    symbol: string
): Promise<PriceData | null> {
    try {
        if (!redisClient || !redisClient.isOpen) {
            return null;
        }

        const key = REDIS_KEYS.last(session, symbol);
        const data = await redisClient.get(key);

        if (!data) return null;
        return JSON.parse(data.toString());
    } catch (error) {
        console.error(`Error getting last price for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get many last prices (batch operation)
 */
export async function getManyLast(
    session: 'pre' | 'live' | 'after',
    symbols: string[]
): Promise<Map<string, PriceData>> {
    const result = new Map<string, PriceData>();

    if (!redisClient || !redisClient.isOpen || symbols.length === 0) {
        return result;
    }

    try {
        // For large batches (>100), use pipeline for better performance
        if (symbols.length > 100) {
            const pipeline = redisClient.multi();
            symbols.forEach((symbol) => {
                const key = REDIS_KEYS.last(session, symbol);
                pipeline.get(key);
            });

            const results = await pipeline.exec();
            symbols.forEach((symbol, index) => {
                const [error, value] = results[index] || [null, null];
                if (!error && value) {
                    try {
                        result.set(symbol, JSON.parse(value.toString()));
                    } catch (e) {
                        console.error(`Error parsing price data for ${symbol}:`, e);
                    }
                }
            });
        } else {
            // For smaller batches, MGET is sufficient
            const keys = symbols.map((symbol) => REDIS_KEYS.last(session, symbol));
            const values = await redisClient.mGet(keys);

            symbols.forEach((symbol, index) => {
                const value = values[index];
                if (value) {
                    try {
                        result.set(symbol, JSON.parse(value.toString()));
                    } catch (e) {
                        console.error(`Error parsing price data for ${symbol}:`, e);
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error getting many last prices:', error);
    }

    return result;
}

/**
 * Update heatmap (sorted set by change percentage)
 */
// eslint-disable-next-line no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable @typescript-eslint/no-unused-vars
export async function updateHeatmap(
    session: 'pre' | 'live' | 'after',
    symbol: string,
    changePct: number
): Promise<boolean> {
    try {
        if (!redisClient || !redisClient.isOpen) {
            return false;
        }

        const key = REDIS_KEYS.heatmap(session);
        // Score = int(change_pct * 10000) for sorting
        const score = Math.round(changePct * 10000);

        await redisClient.zAdd(key, {
            score,
            value: symbol
        });

        return true;
    } catch (error) {
        console.error(`Error updating heatmap for ${symbol}:`, error);
        return false;
    }
}

/**
 * Get heatmap data (top/bottom movers)
 * Returns symbols sorted by change_pct (descending by default)
 */
export async function getHeatmap(
    session: 'pre' | 'live' | 'after',
    limit: number = 100,
    reverse: boolean = true
): Promise<string[]> {
    try {
        if (!redisClient || !redisClient.isOpen) {
            return [];
        }

        const key = REDIS_KEYS.heatmap(session);

        if (reverse) {
            // Top gainers (highest score = highest change_pct first)
            // zRange with REV gets highest scores first
            const result = await redisClient.zRange(key, -limit, -1, { REV: true });
            return result.map((r: any) => typeof r === 'string' ? r : r.value || r);
        } else {
            // Top losers (lowest score = lowest change_pct first)
            const result = await redisClient.zRange(key, 0, limit - 1);
            return result.map((r: any) => typeof r === 'string' ? r : r.value || r);
        }
    } catch (error) {
        console.error('Error getting heatmap:', error);
        return [];
    }
}

/**
 * Set previous close for a date
 */
export async function setPrevClose(
    date: string, // YYYY-MM-DD
    symbol: string,
    price: number
): Promise<boolean> {
    try {
        if (!redisClient || !redisClient.isOpen) {
            return false;
        }

        const key = REDIS_KEYS.prevclose(date);
        await redisClient.hSet(key, symbol, price.toString());
        await redisClient.expire(key, REDIS_TTL.PREVCLOSE);

        return true;
    } catch (error) {
        console.error(`Error setting previous close for ${symbol}:`, error);
        return false;
    }
}

/**
 * Get previous close for symbols
 */
export async function getPrevClose(
    date: string,
    symbols: string[]
): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    if (!redisClient || !redisClient.isOpen || symbols.length === 0) {
        return result;
    }

    try {
        const key = REDIS_KEYS.prevclose(date);
        const values = await redisClient.hmGet(key, symbols);

        symbols.forEach((symbol, index) => {
            const value = values[index];
            if (value) {
                const price = parseFloat(value.toString());
                if (!isNaN(price)) {
                    result.set(symbol, price);
                }
            }
        });
    } catch (error) {
        console.error('Error getting previous close:', error);
    }

    return result;
}

/**
 * Add symbol to universe set
 * Falls back to DB if Redis is not available
 */
export async function addToUniverse(
    type: string,
    symbol: string
): Promise<boolean> {
    try {
        if (redisClient && redisClient.isOpen) {
            const key = REDIS_KEYS.universe(type);
            await redisClient.sAdd(key, symbol);
            await redisClient.expire(key, REDIS_TTL.UNIVERSE);
        }

        // Also ensure ticker exists in DB (fallback)
        try {
            const { prisma } = await import('../db/prisma');
            await prisma.ticker.upsert({
                where: { symbol },
                update: {},
                create: { symbol, name: symbol } // Minimal data, can be enriched later
            });
        } catch (dbError) {
            // DB error is not critical, continue
            console.warn(`Could not upsert ticker ${symbol} to DB:`, dbError);
        }

        return true;
    } catch (error) {
        console.error(`Error adding ${symbol} to universe ${type}:`, error);
        return false;
    }
}

/**
 * Get universe set
 * Falls back to DB if Redis is not available
 */
export async function getUniverse(type: string): Promise<string[]> {
    try {
        if (redisClient && redisClient.isOpen) {
            const key = REDIS_KEYS.universe(type);
            const members = await redisClient.sMembers(key);
            if (members.length > 0) {
                return members.map((m: any) => m.toString());
            }
        }

        // Fallback to DB if Redis is not available or empty
        try {
            const { prisma } = await import('../db/prisma');
            const tickers = await prisma.ticker.findMany({
                select: { symbol: true },
                orderBy: { symbol: 'asc' }
            });

            if (tickers.length > 0) {
                console.warn(`⚠️ Universe ${type} empty in Redis, loaded ${tickers.length} tickers from DB`);
                // Bootstrap Redis with DB data (one-time)
                for (const ticker of tickers) {
                    await addToUniverse(type, ticker.symbol);
                }
                return tickers.map(t => t.symbol);
            }
        } catch (dbError) {
            console.error('Error getting universe from DB:', dbError);
        }

        // Final fallback: use default tickers
        try {
            const { getAllProjectTickers } = await import('../../data/defaultTickers');
            const defaultTickers = getAllProjectTickers('pmp');
            console.warn(`⚠️ Universe ${type} empty, using ${defaultTickers.length} default tickers`);
            // Bootstrap Redis with default tickers (one-time)
            for (const ticker of defaultTickers) {
                await addToUniverse(type, ticker);
            }
            return defaultTickers;
        } catch {
            return [];
        }
    } catch (error) {
        console.error(`Error getting universe ${type}:`, error);
        // Final fallback: use default tickers
        try {
            const { getAllProjectTickers } = await import('../../data/defaultTickers');
            return getAllProjectTickers('pmp');
        } catch {
            return [];
        }
    }
}

/**
 * Publish tick update to Redis Pub/Sub
 */
export async function publishTick(symbol: string, session: 'pre' | 'live' | 'after', data: PriceData): Promise<boolean> {
    try {
        if (!redisClient || !redisClient.isOpen) {
            return false;
        }

        const message = JSON.stringify({ symbol, session, ...data });
        await redisClient.publish('pmp:tick', message);
        return true;
    } catch (error) {
        console.error(`Error publishing tick for ${symbol}:`, error);
        return false;
    }
}

/**
 * Get multiple JSON values from Redis
 */
export async function mGetJson<T>(keys: string[]): Promise<Record<string, T>> {
    const result: Record<string, T> = {};
    if (keys.length === 0) return result;

    if (redisClient && redisClient.isOpen) {
        try {
            const values = await redisClient.mGet(keys);
            keys.forEach((key, index) => {
                const raw = values[index];
                if (raw) {
                    try {
                        result[key] = JSON.parse(raw.toString()) as T;
                    } catch (e) { }
                }
            });
            return result;
        } catch (e) { }
    }
    return result;
}

/**
 * Get multiple JSON values as Map
 */
export async function mGetJsonMap<T>(keys: string[]): Promise<Map<string, T>> {
    const record = await mGetJson<T>(keys);
    const map = new Map<string, T>();
    Object.entries(record).forEach(([key, value]) => {
        map.set(key, value);
    });
    return map;
}

// --- Generic Cache Operations (for backward compatibility) ---

import { CACHE_TTL } from './keys';

const inMemoryCache = new Map<string, any>();
const cacheTimestamps = new Map<string, number>();

export async function getCachedData(key: string) {
    try {
        if (redisClient && redisClient.isOpen) {
            const data = await redisClient.get(key);
            return data ? JSON.parse(data.toString()) : null;
        } else {
            // Use in-memory cache as fallback
            const data = inMemoryCache.get(key);
            const timestamp = cacheTimestamps.get(key);
            if (data && timestamp && Date.now() - timestamp < CACHE_TTL.DEFAULT * 1000) {
                return data;
            }
            return null;
        }
    } catch (err) {
        console.error('Cache get error:', err);
        return null;
    }
}

export async function setCachedData(key: string, data: any, ttl: number = CACHE_TTL.DEFAULT) {
    try {
        if (redisClient && redisClient.isOpen) {
            await redisClient.setEx(key, ttl, JSON.stringify(data));
        } else {
            // Use in-memory cache as fallback
            inMemoryCache.set(key, data);
            cacheTimestamps.set(key, Date.now());
        }
        return true;
    } catch (error) {
        console.error('Cache set error:', error);
        return false;
    }
}

export async function deleteCachedData(key: string) {
    try {
        if (redisClient && redisClient.isOpen) {
            await redisClient.del(key);
        } else {
            // Use in-memory cache as fallback
            inMemoryCache.delete(key);
            cacheTimestamps.delete(key);
        }
        return true;
    } catch (error) {
        console.error('Cache delete error:', error);
        return false;
    }
}
