/**
 * Universe Helpers - Manage tracked tickers (SP500 + International)
 * 
 * Provides functions to get and manage the universe of tracked tickers
 * for bulk data loading (500-600 tickers total)
 */

import { getUniverse, addToUniverse } from '../redis/operations';
import { getAllProjectTickers } from '@/data/defaultTickers';
import { getInternationalNYSETickers } from '@/data/internationalTickers';
import { logger } from './logger';

export const UNIVERSE_TYPES = {
  SP500: 'sp500',
  INTERNATIONAL: 'international_nyse',
  ALL: 'all'
} as const;

export type UniverseType = typeof UNIVERSE_TYPES[keyof typeof UNIVERSE_TYPES];

/**
 * Get all tracked tickers (SP500 + default tickers)
 * This combines SP500 tickers from universe with default tickers
 * 
 * @returns Array of ticker symbols (up to 600)
 */
export async function getAllTrackedTickers(): Promise<string[]> {
  try {
    // Get SP500 tickers from Redis universe
    const sp500Tickers = await getUniverse(UNIVERSE_TYPES.SP500);

    // Get all default tickers (includes all tiers: pmp, standard, extended, extendedPlus)
    const defaultTickers = getAllProjectTickers('pmp');

    // Combine and deduplicate
    const allTickers = new Set<string>();

    // Add SP500 tickers
    sp500Tickers.forEach(ticker => allTickers.add(ticker));

    // Add default tickers
    defaultTickers.forEach(ticker => allTickers.add(ticker));

    // Add international NYSE tickers (100 tickers)
    const internationalTickers = getInternationalNYSETickers();
    internationalTickers.forEach(ticker => allTickers.add(ticker));

    const tickersArray = Array.from(allTickers);

    logger.debug('Loaded tracked tickers', {
      sp500Count: sp500Tickers.length,
      defaultCount: defaultTickers.length,
      internationalCount: internationalTickers.length,
      totalCount: tickersArray.length
    });

    // Limit to 600 tickers (SP500: 500 + International: 100)
    return tickersArray.slice(0, 600);
  } catch (error) {
    logger.error('Error getting tracked tickers', error);

    // Fallback to default tickers only
    return getAllProjectTickers('pmp');
  }
}

/**
 * Get tickers by universe type
 * 
 * @param type - Universe type (sp500, international_nyse, all)
 * @returns Array of ticker symbols
 */
export async function getTickersByUniverseType(type: UniverseType): Promise<string[]> {
  switch (type) {
    case UNIVERSE_TYPES.SP500:
      return getUniverse(UNIVERSE_TYPES.SP500);

    case UNIVERSE_TYPES.INTERNATIONAL:
      // Get from Redis universe, fallback to static list
      const redisInternational = await getUniverse(UNIVERSE_TYPES.INTERNATIONAL);
      if (redisInternational.length > 0) {
        return redisInternational;
      }
      // Fallback to static list if Redis is empty
      return getInternationalNYSETickers();

    case UNIVERSE_TYPES.ALL:
      return getAllTrackedTickers();

    default:
      return [];
  }
}

/**
 * Add tickers to universe
 * 
 * @param type - Universe type
 * @param tickers - Array of ticker symbols
 */
export async function addTickersToUniverse(
  type: UniverseType,
  tickers: string[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const ticker of tickers) {
    const result = await addToUniverse(type, ticker);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  logger.info('Added tickers to universe', {
    type,
    success,
    failed,
    total: tickers.length
  });

  return { success, failed };
}

/**
 * Get count of tickers in universe
 * 
 * @param type - Universe type
 * @returns Count of tickers
 */
export async function getUniverseCount(type: UniverseType): Promise<number> {
  const tickers = await getTickersByUniverseType(type);
  return tickers.length;
}

