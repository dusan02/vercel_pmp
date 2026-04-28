/**
 * Polygon Worker - Batch ingest stock data
 * 
 * This worker:
 * 1. Fetches snapshot/aggs from Polygon API (batch 60-80 tickers)
 * 2. Normalizes data
 * 3. Upserts to DB (only if newer timestamp)
 * 4. Writes to Redis (hot cache)
 * 5. Publishes to Redis Pub/Sub for WebSocket updates
 */

import {
  setPrevClose,
  getPrevClose,
  publishTick,
  getUniverse,
  addToUniverse,
  atomicUpdatePrice
} from '@/lib/redis/operations';
import { redisClient } from '@/lib/redis';
import { recordSuccess, recordFailure } from '../healthMonitor';
import { PriceData } from '@/lib/types';
import { detectSession, isMarketOpen, isMarketHoliday, mapToRedisSession, getLastTradingDay, getTradingDay } from '@/lib/utils/timeUtils';
import { nowET, getDateET, createETDate, isWeekendET, toET } from '@/lib/utils/dateET';
import { resolveEffectivePrice, calculatePercentChange } from '@/lib/utils/priceResolver';
import { getPricingState, canOverwritePrice, getPreviousCloseTTL, PriceState } from '@/lib/utils/pricingStateMachine';
import { withRetry, circuitBreaker } from '@/lib/api/rateLimiter';
// DLQ import - commented out to avoid startup issues
// import { addToDLQ } from '@/lib/dlq';
import { updateRankIndexes, updateStatsCache, getRankMinMax } from '@/lib/redis/ranking';
import { computeMarketCap, computeMarketCapDiff, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { getPolygonClient } from '@/lib/clients/polygonClient';
import { prisma } from '@/lib/db/prisma';
import { processBatchWithConcurrency } from '@/lib/batchProcessor';
import type { MarketSession } from '@/lib/types';

// Circuit breaker for Polygon API
const polygonCircuitBreaker = circuitBreaker('polygon', 5, 2, 60000);

// In tests we must not wait for rate-limit sleeps (keeps integration tests fast & deterministic)
const __IS_TEST__ = process.env.NODE_ENV === 'test';
const sleep = (ms: number) => (__IS_TEST__ ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms)));

interface PolygonSnapshot {
  ticker: string;
  day?: {
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
  };
  prevDay?: {
    c: number; // previous close
  };
  min?: {
    av: number; // average price
    t: number; // timestamp
    c?: number; // close price (for pre-market/after-hours)
    o?: number; // open price
    h?: number; // high price
    l?: number; // low price
    v?: number; // volume
  };
  lastQuote?: {
    p: number; // price
    t: number; // timestamp
  };
  lastTrade?: {
    p: number; // price
    t: number; // timestamp
  };
}

interface IngestResult {
  symbol: string;
  price: number;
  changePct: number;
  timestamp: Date;
  quality: 'delayed_15m' | 'rest' | 'snapshot';
  success: boolean;
  error?: string;
}

/**
 * Fetch snapshot data from Polygon API (batch) with retry and circuit breaker
 */
export { polygonCircuitBreaker, __IS_TEST__, sleep };
export type { PolygonSnapshot };
