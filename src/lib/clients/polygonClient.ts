/**
 * Centralized Polygon.io API client
 * Provides unified interface for all Polygon API calls
 */

import { PolygonSnapshot, PolygonV2Response } from '../types';
import { getCurrentPrice } from '../utils/marketCapUtils';

export interface PolygonClientConfig {
  apiKey: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface FetchSnapshotOptions {
  timeout?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
}

/**
 * Centralized Polygon API client
 */
export class PolygonClient {
  private apiKey: string;
  private timeout: number;
  private retries: number;
  private retryDelay: number;

  constructor(config: PolygonClientConfig) {
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 10000;
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Fetch single ticker snapshot
   */
  async fetchSnapshot(
    ticker: string,
    options: FetchSnapshotOptions = {}
  ): Promise<PolygonV2Response | null> {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${this.apiKey}`;

    return this.fetchWithRetry<PolygonV2Response>(
      url,
      options.timeout || this.timeout,
      options.signal,
      options.cache
    );
  }

  /**
   * Fetch multiple tickers snapshot (batch)
   */
  async fetchBatchSnapshot(
    tickers: string[],
    options: FetchSnapshotOptions = {}
  ): Promise<PolygonSnapshot[]> {
    if (tickers.length === 0) return [];

    const batchSize = 60; // Polygon allows up to 100, but we use 60 for safety
    const results: PolygonSnapshot[] = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const tickersParam = batch.join(',');
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${this.apiKey}`;

      try {
        const data = await this.fetchWithRetry<{ tickers?: PolygonSnapshot[]; results?: PolygonSnapshot[] }>(
          url,
          options.timeout || this.timeout,
          options.signal,
          options.cache
        );

        if (data) {
          // Polygon returns 'tickers' array, not 'results'
          if (data.tickers && Array.isArray(data.tickers)) {
            results.push(...data.tickers);
          } else if (data.results && Array.isArray(data.results)) {
            // Fallback for other endpoints
            results.push(...data.results);
          }
        }

        // Rate limiting: Polygon free tier allows 5 calls/minute
        if (i + batchSize < tickers.length) {
          await new Promise(resolve => setTimeout(resolve, 15000)); // 15s delay
        }
      } catch (error) {
        console.error(`Error fetching batch ${i}-${i + batchSize}:`, error);
      }
    }

    return results;
  }

  /**
   * Fetch previous close price
   */
  async fetchPreviousClose(
    ticker: string,
    options: FetchSnapshotOptions = {}
  ): Promise<number | null> {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${this.apiKey}`;

    try {
      const data = await this.fetchWithRetry<{ results?: Array<{ c?: number }> }>(
        url,
        options.timeout || this.timeout,
        options.signal,
        options.cache
      );

      const firstResult = data?.results?.[0];
      if (firstResult?.c) {
        return firstResult.c;
      }
    } catch (error) {
      console.error(`Error fetching previous close for ${ticker}:`, error);
    }

    return null;
  }

  /**
   * Get current price from snapshot with fallback logic
   */
  getCurrentPriceFromSnapshot(snapshot: PolygonV2Response): number | null {
    if (!snapshot.ticker) return null;
    return getCurrentPrice(snapshot);
  }

  /**
   * Fetch news for a ticker
   */
  async fetchNews(
    ticker: string,
    limit: number = 5
  ): Promise<any[]> {
    const url = `https://api.polygon.io/v2/reference/news?ticker=${ticker}&limit=${limit}&apiKey=${this.apiKey}`;

    try {
      const data = await this.fetchWithRetry<{ results?: any[] }>(url, this.timeout);
      return data?.results || [];
    } catch (error) {
      console.error(`Error fetching news for ${ticker}:`, error);
      return [];
    }
  }

  /**
   * Generic fetch with retry logic
   */
  private async fetchWithRetry<T>(
    url: string,
    timeout: number,
    signal?: AbortSignal,
    cache?: RequestCache
  ): Promise<T | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        if (signal) {
          signal.addEventListener('abort', () => controller.abort());
        }

        const response = await fetch(url, {
          signal: controller.signal,
          cache: cache || 'no-store',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429 && attempt < this.retries - 1) {
            // Rate limited - wait longer before retry
            await new Promise(resolve => setTimeout(resolve, this.retryDelay * (attempt + 2)));
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate Polygon API response
        if (data.status && data.status !== 'OK') {
          throw new Error(`Polygon API error: ${data.status}`);
        }

        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on abort
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.retries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * (attempt + 1)));
        }
      }
    }

    console.error(`Failed to fetch after ${this.retries} attempts:`, url, lastError);
    return null;
  }
}

/**
 * Create a Polygon client instance from environment
 */
export function createPolygonClient(): PolygonClient | null {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ POLYGON_API_KEY not configured');
    return null;
  }

  return new PolygonClient({
    apiKey,
    timeout: 10000,
    retries: 3,
    retryDelay: 1000,
  });
}

/**
 * Singleton instance (lazy initialized)
 */
let polygonClientInstance: PolygonClient | null = null;

/**
 * Get or create Polygon client singleton
 */
export function getPolygonClient(): PolygonClient | null {
  if (!polygonClientInstance) {
    polygonClientInstance = createPolygonClient();
  }
  return polygonClientInstance;
}

