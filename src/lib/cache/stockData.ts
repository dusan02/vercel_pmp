import { getUniverse } from '../redis/operations';
import { getManyLastWithDate, getDateET } from '../redis/ranking';
import { detectSession, nowET, mapToRedisSession } from '../utils/timeUtils';
import { CACHE_KEYS } from '../redis/keys';

export interface CachedStockData {
    ticker: string;
    currentPrice: number;
    closePrice: number;
    percentChange: number;
    marketCapDiff: number;
    marketCap: number;
    lastUpdated: Date;
    companyName?: string; // Added this field as it's available in Redis
}

export class StockDataCache {
    // Removed in-memory cache to prevent stale data in serverless environment
    // and to ensure single source of truth (Redis)

    constructor() {
        // No initialization needed
    }

    /**
     * Get all stocks from Redis (via polygonWorker data)
     */
    async getAllStocks(): Promise<CachedStockData[]> {
        try {
            const etNow = nowET();
            const date = getDateET();
            const session = detectSession(etNow);

            // Map 'closed' to 'after' for Redis operations

            const redisSession = mapToRedisSession(session);

            // 1. Get Universe
            const tickers = await getUniverse('sp500');
            if (tickers.length === 0) {
                console.warn('⚠️ No tickers found in universe:sp500');
                return [];
            }

            // 2. Get Data from Redis
            const dataMap = await getManyLastWithDate(date, redisSession, tickers);

            // 3. Transform to CachedStockData
            const results: CachedStockData[] = [];

            for (const ticker of tickers) {
                const data = dataMap.get(ticker);
                if (data) {
                    // data structure from updateRankIndexes:
                    // { p, change_pct, cap, cap_diff, name, sector, industry }

                    const currentPrice = Number(data.p) || 0;
                    const percentChange = Number(data.change_pct) || 0;
                    const marketCap = Number(data.cap) || 0;
                    const marketCapDiff = Number(data.cap_diff) || 0;
                    const companyName = typeof data.name === 'string' ? data.name : undefined;

                    // Calculate close price derived from change
                    // price = close * (1 + change/100) -> close = price / (1 + change/100)
                    let closePrice = currentPrice;
                    if (percentChange !== 0) {
                        closePrice = currentPrice / (1 + percentChange / 100);
                    }

                    const stockEntry: CachedStockData = {
                        ticker,
                        currentPrice,
                        closePrice,
                        percentChange,
                        marketCapDiff,
                        marketCap,
                        lastUpdated: new Date()
                    };

                    if (companyName !== undefined) {
                        stockEntry.companyName = companyName;
                    }

                    results.push(stockEntry);
                }
            }

            return results.sort((a, b) => b.marketCap - a.marketCap);

        } catch (error) {
            console.error('Error getting all stocks from Redis:', error);
            return [];
        }
    }

    /**
     * Get single stock (async now!)
     */
    async getStock(ticker: string): Promise<CachedStockData | null> {
        try {
            const etNow = nowET();
            const date = getDateET();
            const session = detectSession(etNow);
            const redisSession = mapToRedisSession(session);

            const dataMap = await getManyLastWithDate(date, redisSession, [ticker]);
            const data = dataMap.get(ticker);

            if (!data) return null;

            const currentPrice = Number(data.p) || 0;
            const percentChange = Number(data.change_pct) || 0;
            const marketCap = Number(data.cap) || 0;
            const marketCapDiff = Number(data.cap_diff) || 0;
            const companyName = typeof data.name === 'string' ? data.name : undefined;

            let closePrice = currentPrice;
            if (percentChange !== 0) {
                closePrice = currentPrice / (1 + percentChange / 100);
            }

            const stockData: CachedStockData = {
                ticker,
                currentPrice,
                closePrice,
                percentChange,
                marketCapDiff,
                marketCap,
                lastUpdated: new Date()
            };

            if (companyName !== undefined) {
                stockData.companyName = companyName;
            }

            return stockData;
        } catch (error) {
            console.error(`Error getting stock ${ticker}:`, error);
            return null;
        }
    }

    // Legacy methods kept for compatibility but doing nothing or returning empty

    async updateCache(): Promise<void> {
        console.warn('⚠️ updateCache() is deprecated and does nothing. Data is fetched by polygonWorker.');
    }

    startBackgroundUpdates(): void {
        // No-op
    }

    stopBackgroundUpdates(): void {
        // No-op
    }

    async getCacheStatus(): Promise<{ count: number; lastUpdated: Date | null; isUpdating: boolean }> {
        // Fetch all to be accurate about what's in Redis
        const stocks = await this.getAllStocks();
        return {
            count: stocks.length,
            lastUpdated: new Date(),
            isUpdating: false
        };
    }

    getCompanyName(ticker: string): string {
        // Deprecated: should use companyName from CachedStockData
        return ticker;
    }
}

export const stockDataCache = new StockDataCache();
