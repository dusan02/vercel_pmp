/**
 * Centralized TypeScript types and interfaces for the application
 */

// Stock data quality levels
export type DataQuality = 'delayed_15m' | 'rest' | 'snapshot';
export type DataSource = 'polygon' | 'rest' | 'snapshot' | 'delayed_15m';

// Market sessions
export type MarketSession = 'pre' | 'live' | 'after' | 'closed';

// Main stock data interface
export interface StockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  companyName?: string;
  sector?: string;
  industry?: string;
  logoUrl?: string;
  volume?: number;
  timestamp?: Date;
  lastUpdated?: string;
  quality?: DataQuality;
  source?: DataSource;
  as_of?: string;
}

// Price data structure for Redis/cache
export interface PriceData {
  p: number; // price
  change: number; // percent change
  ts: number; // timestamp
  source: DataSource;
  quality: DataQuality;
}

// WebSocket price update
export interface PriceUpdate {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  percentChange: number;
  marketCap: number;
  marketCapDiff: number;
  timestamp: number;
}

// Batch price update for WebSocket
export interface BatchPriceUpdate {
  updates: PriceUpdate[];
  timestamp: number;
}

// Polygon API response types
export interface PolygonSnapshot {
  ticker: string;
  day?: {
    c: number; // close
    h: number; // high
    l: number; // low
    o: number; // open
    v: number; // volume
  };
  lastTrade?: {
    p: number; // price
    t: number; // timestamp
  };
  lastQuote?: {
    p: number; // price
    t: number; // timestamp
  };
  prevDay?: {
    c: number; // previous close
  };
  min?: {
    c: number; // minute close
  };
}

export interface PolygonV2Response {
  status: string;
  ticker?: PolygonSnapshot;
}

// Earnings data
export interface EarningsData {
  ticker: string;
  companyName?: string;
  estimate_eps?: number;
  actual_eps?: number;
  estimate_revenue?: number;
  actual_revenue?: number;
  percent_change?: number;
  date: string;
  time?: string;
}

export interface EarningsResponse {
  success: boolean;
  data: EarningsData[];
  error?: string;
}

// Loading states
export interface LoadingStates {
  favorites: boolean;
  earnings: boolean;
  top50Stocks: boolean;
  remainingStocks: boolean;
  background: boolean;
}

// Loading phases
export interface LoadingPhase {
  phase1: 'favorites' | 'loading' | 'complete';
  phase2: 'earnings' | 'loading' | 'complete';
  phase3: 'top50' | 'loading' | 'complete';
  phase4: 'remaining' | 'lazy' | 'loading' | 'complete';
}

// Cached stock data
export interface CachedStockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  lastUpdated: Date;
}

// API response wrapper - unified definition
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  cached?: boolean;
  cacheAge?: number;
  duration?: number;
  count?: number;
  [key: string]: unknown;
}

// Ingest result from worker
export interface IngestResult {
  ticker: string;
  success: boolean;
  price?: number;
  changePct?: number;
  error?: string;
}

// Redis client types
export type RedisClient = {
  isOpen: boolean;
  get(key: string): Promise<string | null>;
  setEx(key: string, ttl: number, value: string): Promise<void>;
  del(key: string): Promise<number>;
  mGet(keys: string[]): Promise<(string | null)[]>;
  multi(): RedisMulti;
  subscribe(channel: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
};

export type RedisMulti = {
  setEx(key: string, ttl: number, value: string): RedisMulti;
  zAdd(key: string, data: { score: number; value: string }): RedisMulti;
  exec(): Promise<Array<[Error | null, unknown]>>;
};

