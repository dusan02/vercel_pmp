/**
 * Polygon snapshot fetcher.
 *
 * Fetches batch snapshots from Polygon API with circuit breaker,
 * retry logic, and rate limiting.
 */

import { withRetry } from '@/lib/api/rateLimiter';
import { polygonCircuitBreaker, sleep, PolygonSnapshot } from './shared';

export async function fetchPolygonSnapshot(
  tickers: string[],
  apiKey: string
): Promise<PolygonSnapshot[]> {
  if (polygonCircuitBreaker.isOpen) {
    console.warn('⚠️ Polygon circuit breaker is OPEN, skipping API calls');
    return [];
  }

  const envBatchSize = parseInt(process.env.POLYGON_MAX_BATCH_SIZE || '100', 10);
  const batchSize = Math.min(100, Math.max(1, envBatchSize));
  const batchDelay = parseInt(process.env.POLYGON_BATCH_DELAY_MS || '1000', 10);

  const results: PolygonSnapshot[] = [];
  const totalBatches = Math.ceil(tickers.length / batchSize);

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const tickersParam = batch.join(',');
    const batchNum = Math.floor(i / batchSize) + 1;

    try {
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${apiKey}`;
      console.log(`📥 Polygon snapshot batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);

      const response = await withRetry(async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok && res.status === 429) {
          throw new Error(`Rate limited: ${res.status}`);
        }
        return res;
      });

      if (!response.ok) {
        polygonCircuitBreaker.recordFailure();
        console.error(`Polygon API error: ${response.status} ${response.statusText}`);
        continue;
      }

      polygonCircuitBreaker.recordSuccess();
      const data = await response.json();
      if (data.tickers && Array.isArray(data.tickers)) {
        results.push(...data.tickers);
      } else if (data.results && Array.isArray(data.results)) {
        results.push(...data.results);
      }

      if (i + batchSize < tickers.length) {
        await sleep(batchDelay);
      }
    } catch (error) {
      polygonCircuitBreaker.recordFailure();
      console.error(`Error fetching batch ${i}-${i + batchSize}:`, error);
    }
  }

  return results;
}

/**
 * Calculate expected cumulative volume at current time using linear interpolation.
 * Uses per-ticker volume profile from Redis, with linear fallback for new stocks.
 */
export async function calculateExpectedVolume(
  symbol: string,
  timeStr: string,
  fullDayAvg20d: number
): Promise<number | null> {
  try {
    const { redisClient } = await import('@/lib/redis');
    const profileKey = `volume_profile:${symbol}`;
    const profile = await redisClient.hGetAll(profileKey);

    if (!profile || Object.keys(profile).length === 0) {
      const timeParts = timeStr.split(':');
      const h = Number(timeParts[0]);
      const m = Number(timeParts[1]);
      const minsSinceOpen = Math.max(0, (h * 60 + m) - (9 * 60 + 30));
      if (minsSinceOpen <= 0) return fullDayAvg20d * 0.01;
      const linearWeight = Math.min(1, minsSinceOpen / 390);
      return fullDayAvg20d * linearWeight;
    }

    const buckets = Object.keys(profile).sort();
    const currentMins = timeStr.split(':').reduce((acc, v, i) => acc + Number(v) * (i === 0 ? 60 : 1), 0);

    let prevBucketIdx = -1;
    let nextBucketIdx = -1;

    for (let i = 0; i < buckets.length; i++) {
      const bucketStr = buckets[i];
      if (!bucketStr) continue;
      const bucketParts = bucketStr.split(':');
      const bh = Number(bucketParts[0]);
      const bm = Number(bucketParts[1]);
      const bMins = bh * 60 + bm;
      if (bMins <= currentMins) prevBucketIdx = i;
      if (bMins > currentMins && nextBucketIdx === -1) {
        nextBucketIdx = i;
        break;
      }
    }

    if (prevBucketIdx === -1) {
      const firstKey = buckets[0];
      return firstKey !== undefined ? Number(profile[firstKey]) || null : null;
    }
    if (nextBucketIdx === -1) {
      const lastKey = buckets[buckets.length - 1];
      return lastKey !== undefined ? Number(profile[lastKey]) || null : null;
    }

    const b1 = buckets[prevBucketIdx];
    const b2 = buckets[nextBucketIdx];
    if (!b1 || !b2) return null;

    const v1Val = profile[b1];
    const v2Val = profile[b2];
    if (v1Val === undefined || v2Val === undefined) return null;

    const v1 = Number(v1Val);
    const v2 = Number(v2Val);

    const m1Parts = b1.split(':');
    const m1Hour = Number(m1Parts[0]);
    const m1Min = Number(m1Parts[1]);
    if (isNaN(m1Hour) || isNaN(m1Min)) return null;
    const m1 = m1Hour * 60 + m1Min;

    const m2Parts = b2.split(':');
    const m2Hour = Number(m2Parts[0]);
    const m2Min = Number(m2Parts[1]);
    if (isNaN(m2Hour) || isNaN(m2Min)) return null;
    const m2 = m2Hour * 60 + m2Min;

    const ratio = (currentMins - m1) / (m2 - m1);
    return v1 + ratio * (v2 - v1);
  } catch {
    return null;
  }
}
