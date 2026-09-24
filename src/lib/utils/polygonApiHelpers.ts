/**
 * Polygon API Helper Functions
 * Shared functions for fetching data from Polygon API
 */

import { withRetry } from '@/lib/api/rateLimiter';
import { getDateET } from './dateET';

/**
 * Fetch Polygon snapshot for current price
 */
export async function fetchPolygonSnapshot(ticker: string, apiKey: string): Promise<any> {
  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
    const response = await withRetry(async () => fetch(url));
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    // Single ticker endpoint returns { ticker: {...} }, but also handle batch format as fallback
    return data.ticker || data.tickers?.[0] || null;
  } catch (error) {
    console.error(`Error fetching Polygon snapshot for ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch previous close from Polygon API
 */
export async function fetchPolygonPreviousClose(
  ticker: string,
  apiKey: string,
  date: string
): Promise<{ close: number | null; timestamp: number | null; tradingDay: string | null }> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${date}/${date}?adjusted=true&apiKey=${apiKey}`;
    const response = await withRetry(async () => fetch(url));

    if (!response.ok) {
      return { close: null, timestamp: null, tradingDay: null };
    }

    const data = await response.json();
    const result = data?.results?.[0];

    if (result && result.c && result.c > 0) {
      const timestamp = result.t;
      const timestampDate = timestamp ? new Date(timestamp) : null;
      const tradingDay = timestampDate ? getDateET(timestampDate) : null;

      return {
        close: result.c,
        timestamp: timestamp || null,
        tradingDay: tradingDay || null
      };
    }

    return { close: null, timestamp: null, tradingDay: null };
  } catch (error) {
    console.error(`Error fetching Polygon previous close for ${ticker}:`, error);
    return { close: null, timestamp: null, tradingDay: null };
  }
}
