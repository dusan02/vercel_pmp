// Redis key patterns
export const REDIS_KEYS = {
    last: (session: string, symbol: string) => `last:${session}:${symbol}`,
    // New: date-based keys for rank indexes
    lastWithDate: (date: string, session: string, symbol: string) => `last:${date}:${session}:${symbol}`,
    heatmap: (session: string) => `heatmap:${session}`,
    heatmapWithDate: (date: string, session: string) => `heatmap:${date}:${session}`,
    // Rank indexes for server-side sorting
    rankPrice: (date: string, session: string) => `rank:price:${date}:${session}`,
    rankCap: (date: string, session: string) => `rank:cap:${date}:${session}`,
    rankCapDiff: (date: string, session: string) => `rank:capdiff:${date}:${session}`,
    rankChg: (date: string, session: string) => `rank:chg:${date}:${session}`, // alias for heatmap
    stats: (date: string, session: string) => `stats:${date}:${session}`,
    prevclose: (date: string) => `prevclose:${date}`, // YYYY-MM-DD
    universe: (type: string) => `universe:${type}`, // sp500, adrs:top200
    // Hot stock cache (unified between worker and API)
    stockData: (symbol: string) => `stock:pmp:${symbol}`,
} as const;

// TTL configuration
export const REDIS_TTL = {
    LIVE: 30, // 30 seconds for live session
    PRE_AFTER: 120, // 120 seconds for pre/after hours
    PREVCLOSE: 86400, // 24 hours for previous close
    UNIVERSE: 86400, // 24 hours for universe sets
} as const;

// Cache keys
export const CACHE_KEYS = {
    STOCK_DATA: 'stock_data',
    CACHE_STATUS: 'cache_status',
    LAST_UPDATE: 'last_update',
    STOCK_COUNT: 'stock_count'
} as const;

// Cache TTL (Time To Live) configuration
export const CACHE_TTL = {
    DEFAULT: 120, // 2 minutes
    FALLBACK: 60, // 1 minute for fallback data
    LONG: 300, // 5 minutes for stable data
    SHORT: 30, // 30 seconds for volatile data
} as const;

// --- Helper Functions ---

function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

// Helper function to generate cache keys with project prefix and simple hash
export function getCacheKey(project: string, ticker: string, type: string = 'price'): string {
    // UNIFIED: Use same pattern as REDIS_KEYS.stockData for hot stock data
    if (type === 'stock') {
        return REDIS_KEYS.stockData(ticker);
    }
    const key = `${type}:${project}:${ticker}`;
    const hash = simpleHash(key).substring(0, 8);
    return `${type}:${project}:${hash}:${ticker}`;
}

export function getCacheKeyForTickers(project: string, tickers: string[], type: string = 'batch'): string {
    const sortedTickers = [...tickers].sort();
    const key = `${type}:${project}:${sortedTickers.join(',')}`;
    const hash = simpleHash(key).substring(0, 12);
    return `${type}:${project}:${hash}`;
}

export function getProjectCacheKeys(project: string, type: string = 'price'): string {
    return `${type}:${project}:*`;
}
