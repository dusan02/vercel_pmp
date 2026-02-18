/**
 * Shared types for the Polygon worker pipeline.
 * Extracted from polygonWorker.ts for reuse across modules.
 */

export interface PolygonSnapshot {
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

export interface IngestResult {
    symbol: string;
    price: number;
    changePct: number;
    timestamp: Date;
    quality: 'delayed_15m' | 'rest' | 'snapshot';
    success: boolean;
    error?: string;
}

export interface NormalizedSnapshot {
    price: number;
    changePct: number;
    timestamp: Date;
    quality: 'delayed_15m' | 'rest' | 'snapshot';
    source: string;
    isStale: boolean;
    reference: {
        used: 'previousClose' | 'regularClose' | null;
        price: number | null;
    };
}
