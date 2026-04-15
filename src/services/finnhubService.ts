/**
 * Finnhub Service
 * 
 * Provides cached access to Finnhub API data with:
 * - Redis hot cache (TTL-based)
 * - Database persistent storage
 * - Automatic fallback chain: Redis → DB → API
 * - Background sync for 1000+ users optimization
 */

import { prisma } from '@/lib/db/prisma';
import { redisOps } from '@/lib/redis/enhancedOperations';
import { getFinnhubClient, FinnhubMetric, FinnhubProfile, FinnhubPriceTarget, FinnhubInsiderTransaction } from '@/lib/clients/finnhubClient';
import { Prisma } from '@prisma/client';

// Cache TTL configuration (in seconds)
const CACHE_TTL = {
    METRICS: 3600,        // 1 hour - metrics don't change often
    PROFILE: 86400,       // 24 hours - profile is stable
    PRICE_TARGET: 3600,   // 1 hour - analyst targets update periodically
    INSIDER: 1800,        // 30 minutes - insider transactions are important
};

// Redis key patterns
const REDIS_KEYS = {
    metrics: (symbol: string) => `finnhub:metrics:${symbol}`,
    profile: (symbol: string) => `finnhub:profile:${symbol}`,
    priceTarget: (symbol: string) => `finnhub:pt:${symbol}`,
    insider: (symbol: string) => `finnhub:insider:${symbol}`,
    lastSync: (symbol: string, type: string) => `finnhub:lastsync:${symbol}:${type}`,
};

// Use shared singleton from finnhubClient.ts (Bug #6 fix: no more duplicate instances)

/**
 * Check if cached data is stale (older than maxAge hours)
 */
function isStale(lastUpdate: Date | null, maxAgeHours: number): boolean {
    if (!lastUpdate) return true;
    const ageMs = Date.now() - lastUpdate.getTime();
    return ageMs > maxAgeHours * 60 * 60 * 1000;
}

/**
 * Get metrics from cache or database
 */
async function getCachedMetrics(symbol: string): Promise<FinnhubMetric | null> {
    // Try Redis first
    const redisKey = REDIS_KEYS.metrics(symbol);
    const cached = await redisOps.get(redisKey);
    if (cached) {
        try {
            return JSON.parse(cached) as FinnhubMetric;
        } catch {
            // Invalid cache, continue to DB
        }
    }

    // Try database
    const dbRecord = await prisma.finnhubMetrics.findUnique({
        where: { symbol },
    });

    if (dbRecord && !isStale(dbRecord.fetchedAt, 24)) { // DB cache valid for 24h
        const metrics: FinnhubMetric = {
            peRatio: dbRecord.peRatio,
            forwardPe: dbRecord.forwardPe,
            pbRatio: dbRecord.pbRatio,
            psRatio: dbRecord.psRatio,
            evEbitda: dbRecord.evEbitda,
            evSales: dbRecord.evSales,
            pegRatio: dbRecord.pegRatio,
            priceCashFlow: dbRecord.priceCashFlow,
            priceFreeCashFlow: dbRecord.priceFreeCashFlow,
            grossMargin: dbRecord.grossMargin,
            operatingMargin: dbRecord.operatingMargin,
            netMargin: dbRecord.netMargin,
            roe: dbRecord.roe,
            roa: dbRecord.roa,
            roic: dbRecord.roic,
            rote: dbRecord.rote,
            revenueGrowth: dbRecord.revenueGrowth,
            earningsGrowth: dbRecord.earningsGrowth,
            bookValueGrowth: dbRecord.bookValueGrowth,
            debtGrowth: dbRecord.debtGrowth,
            currentRatio: dbRecord.currentRatio,
            quickRatio: dbRecord.quickRatio,
            debtEquityRatio: dbRecord.debtEquityRatio,
            interestCoverage: dbRecord.interestCoverage,
            totalDebtToCapitalization: dbRecord.totalDebtToCapitalization,
            revenuePerShare: dbRecord.revenuePerShare,
            netIncomePerShare: dbRecord.netIncomePerShare,
            bookValuePerShare: dbRecord.bookValuePerShare,
            cashPerShare: dbRecord.cashPerShare,
            freeCashFlowPerShare: dbRecord.freeCashFlowPerShare,
            beta: dbRecord.beta,
            dividendYield: dbRecord.dividendYield,
            payoutRatio: dbRecord.payoutRatio,
            employees: dbRecord.employees,
            revenuePerEmployee: dbRecord.revenuePerEmployee,
            assetTurnover: dbRecord.assetTurnover,
            inventoryTurnover: dbRecord.inventoryTurnover,
            receivablesTurnover: dbRecord.receivablesTurnover,
        };

        // Populate Redis cache
        await redisOps.setEx(redisKey, CACHE_TTL.METRICS, JSON.stringify(metrics));
        return metrics;
    }

    return null;
}

/**
 * Save metrics to database and cache
 */
async function saveMetrics(symbol: string, metrics: FinnhubMetric): Promise<void> {
    const data = {
        peRatio: metrics.peRatio,
        forwardPe: metrics.forwardPe,
        pbRatio: metrics.pbRatio,
        psRatio: metrics.psRatio,
        evEbitda: metrics.evEbitda,
        evSales: metrics.evSales,
        pegRatio: metrics.pegRatio,
        priceCashFlow: metrics.priceCashFlow,
        priceFreeCashFlow: metrics.priceFreeCashFlow,
        grossMargin: metrics.grossMargin,
        operatingMargin: metrics.operatingMargin,
        netMargin: metrics.netMargin,
        roe: metrics.roe,
        roa: metrics.roa,
        roic: metrics.roic,
        rote: metrics.rote,
        revenueGrowth: metrics.revenueGrowth,
        earningsGrowth: metrics.earningsGrowth,
        bookValueGrowth: metrics.bookValueGrowth,
        debtGrowth: metrics.debtGrowth,
        currentRatio: metrics.currentRatio,
        quickRatio: metrics.quickRatio,
        debtEquityRatio: metrics.debtEquityRatio,
        interestCoverage: metrics.interestCoverage,
        totalDebtToCapitalization: metrics.totalDebtToCapitalization,
        revenuePerShare: metrics.revenuePerShare,
        netIncomePerShare: metrics.netIncomePerShare,
        bookValuePerShare: metrics.bookValuePerShare,
        cashPerShare: metrics.cashPerShare,
        freeCashFlowPerShare: metrics.freeCashFlowPerShare,
        beta: metrics.beta,
        dividendYield: metrics.dividendYield,
        payoutRatio: metrics.payoutRatio,
        employees: metrics.employees ?? null,
        revenuePerEmployee: metrics.revenuePerEmployee,
        assetTurnover: metrics.assetTurnover,
        inventoryTurnover: metrics.inventoryTurnover,
        receivablesTurnover: metrics.receivablesTurnover,
    };

    await prisma.finnhubMetrics.upsert({
        where: { symbol },
        update: {
            ...data,
            fetchedAt: new Date(),
        },
        create: {
            symbol,
            ...data,
        },
    });

    // Update Redis cache
    const redisKey = REDIS_KEYS.metrics(symbol);
    await redisOps.setEx(redisKey, CACHE_TTL.METRICS, JSON.stringify(metrics));
}

/**
 * Get profile from cache or database
 */
async function getCachedProfile(symbol: string): Promise<FinnhubProfile | null> {
    // Try Redis first
    const redisKey = REDIS_KEYS.profile(symbol);
    const cached = await redisOps.get(redisKey);
    if (cached) {
        try {
            return JSON.parse(cached) as FinnhubProfile;
        } catch {
            // Invalid cache
        }
    }

    // Try database
    const dbRecord = await prisma.finnhubProfile.findUnique({
        where: { symbol },
    });

    if (dbRecord && !isStale(dbRecord.fetchedAt, 168)) { // DB cache valid for 7 days
        const profile: FinnhubProfile = {
            name: dbRecord.name,
            ticker: dbRecord.symbol,
            isin: dbRecord.isin,
            cusip: dbRecord.cusip,
            exchange: dbRecord.exchange,
            currency: dbRecord.currency,
            country: dbRecord.country,
            ipo: dbRecord.ipoDate,
            marketCap: dbRecord.marketCap,
            shareOutstanding: dbRecord.shareOutstanding,
            logo: dbRecord.logo,
            phone: dbRecord.phone,
            weburl: dbRecord.weburl,
            finnhubIndustry: dbRecord.finnhubIndustry,
            finnhubSector: dbRecord.finnhubSector,
            ipoDate: dbRecord.ipoDate,
        };

        await redisOps.setEx(redisKey, CACHE_TTL.PROFILE, JSON.stringify(profile));
        return profile;
    }

    return null;
}

/**
 * Save profile to database and cache
 */
async function saveProfile(symbol: string, profile: FinnhubProfile): Promise<void> {
    const data = {
        name: profile.name,
        isin: profile.isin,
        cusip: profile.cusip,
        exchange: profile.exchange,
        currency: profile.currency,
        country: profile.country,
        ipoDate: profile.ipoDate,
        marketCap: profile.marketCap,
        shareOutstanding: profile.shareOutstanding,
        logo: profile.logo,
        phone: profile.phone,
        weburl: profile.weburl,
        finnhubIndustry: profile.finnhubIndustry,
        finnhubSector: profile.finnhubSector,
    };

    await prisma.finnhubProfile.upsert({
        where: { symbol },
        update: {
            ...data,
            fetchedAt: new Date(),
        },
        create: {
            symbol,
            ...data,
        },
    });

    const redisKey = REDIS_KEYS.profile(symbol);
    await redisOps.setEx(redisKey, CACHE_TTL.PROFILE, JSON.stringify(profile));
}

/**
 * Get price target from cache or database
 */
async function getCachedPriceTarget(symbol: string): Promise<FinnhubPriceTarget | null> {
    const redisKey = REDIS_KEYS.priceTarget(symbol);
    const cached = await redisOps.get(redisKey);
    if (cached) {
        try {
            return JSON.parse(cached) as FinnhubPriceTarget;
        } catch {
            // Invalid cache
        }
    }

    const dbRecord = await prisma.finnhubPriceTarget.findUnique({
        where: { symbol },
    });

    if (dbRecord && !isStale(dbRecord.fetchedAt, 24)) {
        const priceTarget: FinnhubPriceTarget = {
            symbol: dbRecord.symbol,
            targetHigh: dbRecord.targetHigh,
            targetLow: dbRecord.targetLow,
            targetMean: dbRecord.targetMean,
            targetMedian: dbRecord.targetMedian,
            numberOfAnalysts: dbRecord.numberOfAnalysts,
            currentPrice: dbRecord.currentPrice,
        };

        await redisOps.setEx(redisKey, CACHE_TTL.PRICE_TARGET, JSON.stringify(priceTarget));
        return priceTarget;
    }

    return null;
}

/**
 * Save price target to database and cache
 */
async function savePriceTarget(symbol: string, priceTarget: FinnhubPriceTarget): Promise<void> {
    const data = {
        targetHigh: priceTarget.targetHigh,
        targetLow: priceTarget.targetLow,
        targetMean: priceTarget.targetMean,
        targetMedian: priceTarget.targetMedian,
        numberOfAnalysts: priceTarget.numberOfAnalysts,
        currentPrice: priceTarget.currentPrice,
    };

    await prisma.finnhubPriceTarget.upsert({
        where: { symbol },
        update: {
            ...data,
            fetchedAt: new Date(),
        },
        create: {
            symbol,
            ...data,
        },
    });

    const redisKey = REDIS_KEYS.priceTarget(symbol);
    await redisOps.setEx(redisKey, CACHE_TTL.PRICE_TARGET, JSON.stringify(priceTarget));
}

// ============================================================================
// Public Service Methods
// ============================================================================

export class FinnhubService {
    
    /**
     * Get stock metrics with full caching chain
     * Priority: Redis → Database → API
     */
    static async getMetrics(symbol: string, forceRefresh = false): Promise<FinnhubMetric | null> {
        symbol = symbol.toUpperCase().trim();

        if (!forceRefresh) {
            const cached = await getCachedMetrics(symbol);
            if (cached) {
                console.log(`✅ [FinnhubService] Metrics cache hit for ${symbol}`);
                return cached;
            }
        }

        console.log(`🌐 [FinnhubService] Fetching metrics from API for ${symbol}`);
        const client = getFinnhubClient();
        const metrics = await client.fetchMetrics(symbol);

        if (metrics) {
            await saveMetrics(symbol, metrics);
            console.log(`💾 [FinnhubService] Saved metrics for ${symbol}`);
        }

        return metrics;
    }

    /**
     * Get company profile with full caching chain
     */
    static async getProfile(symbol: string, forceRefresh = false): Promise<FinnhubProfile | null> {
        symbol = symbol.toUpperCase().trim();

        if (!forceRefresh) {
            const cached = await getCachedProfile(symbol);
            if (cached) {
                return cached;
            }
        }

        const client = getFinnhubClient();
        const profile = await client.fetchProfile(symbol);

        if (profile) {
            await saveProfile(symbol, profile);
        }

        return profile;
    }

    /**
     * Get analyst price target with full caching chain
     */
    static async getPriceTarget(symbol: string, forceRefresh = false): Promise<FinnhubPriceTarget | null> {
        symbol = symbol.toUpperCase().trim();

        if (!forceRefresh) {
            const cached = await getCachedPriceTarget(symbol);
            if (cached) {
                return cached;
            }
        }

        const client = getFinnhubClient();
        const priceTarget = await client.fetchPriceTarget(symbol);

        if (priceTarget) {
            await savePriceTarget(symbol, priceTarget);
        }

        return priceTarget;
    }

    /**
     * Batch fetch metrics for multiple symbols
     * Optimized for background sync
     */
    static async batchGetMetrics(symbols: string[], concurrency = 5): Promise<Map<string, FinnhubMetric>> {
        const results = new Map<string, FinnhubMetric>();
        
        // Process in batches
        for (let i = 0; i < symbols.length; i += concurrency) {
            const batch = symbols.slice(i, i + concurrency);
            const batchPromises = batch.map(async (symbol) => {
                try {
                    const metrics = await this.getMetrics(symbol);
                    if (metrics) {
                        results.set(symbol, metrics);
                    }
                } catch (error) {
                    console.warn(`⚠️ [FinnhubService] Failed to fetch metrics for ${symbol}:`, error);
                }
            });

            await Promise.all(batchPromises);

            // Rate limiting delay between batches
            if (i + concurrency < symbols.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }

    /**
     * Background sync for popular tickers
     * Call this from cron job to pre-warm cache
     */
    static async backgroundSync(symbols: string[]): Promise<{ success: number; failed: number }> {
        console.log(`🔄 [FinnhubService] Starting background sync for ${symbols.length} symbols`);
        
        let success = 0;
        let failed = 0;

        // Check which symbols need refresh (older than 12 hours)
        const symbolsToRefresh: string[] = [];
        
        for (const symbol of symbols) {
            const dbRecord = await prisma.finnhubMetrics.findUnique({
                where: { symbol },
                select: { fetchedAt: true },
            });

            if (!dbRecord || isStale(dbRecord.fetchedAt, 12)) {
                symbolsToRefresh.push(symbol);
            }
        }

        if (symbolsToRefresh.length === 0) {
            console.log(`⏭️ [FinnhubService] All ${symbols.length} symbols are fresh, skipping sync`);
            return { success: symbols.length, failed: 0 };
        }

        console.log(`📊 [FinnhubService] Refreshing ${symbolsToRefresh.length} stale symbols`);

        // Process in batches of 5 with 1 second delay
        for (let i = 0; i < symbolsToRefresh.length; i += 5) {
            const batch = symbolsToRefresh.slice(i, i + 5);
            
            await Promise.all(batch.map(async (symbol) => {
                try {
                    const metrics = await this.getMetrics(symbol, true);
                    if (metrics) {
                        success++;
                    } else {
                        failed++;
                    }
                } catch {
                    failed++;
                }
            }));

            if (i + 5 < symbolsToRefresh.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`✅ [FinnhubService] Background sync complete: ${success} success, ${failed} failed`);
        return { success, failed };
    }

    /**
     * Get combined analysis data (metrics + price target)
     * Single call for Analysis section
     */
    static async getAnalysisData(symbol: string): Promise<{
        metrics: FinnhubMetric | null;
        priceTarget: FinnhubPriceTarget | null;
        profile: FinnhubProfile | null;
    }> {
        symbol = symbol.toUpperCase().trim();

        // Fetch all in parallel
        const [metrics, priceTarget, profile] = await Promise.all([
            this.getMetrics(symbol),
            this.getPriceTarget(symbol),
            this.getProfile(symbol),
        ]);

        return { metrics, priceTarget, profile };
    }

    /**
     * Clear cache for a symbol (useful after data updates)
     */
    static async clearCache(symbol: string): Promise<void> {
        symbol = symbol.toUpperCase().trim();
        
        const keys = [
            REDIS_KEYS.metrics(symbol),
            REDIS_KEYS.profile(symbol),
            REDIS_KEYS.priceTarget(symbol),
        ];

        await Promise.all(keys.map(key => redisOps.del(key)));
        console.log(`🧹 [FinnhubService] Cleared cache for ${symbol}`);
    }

    /**
     * Get cache statistics
     */
    static async getCacheStats(): Promise<{
        dbMetrics: number;
        dbProfiles: number;
        dbPriceTargets: number;
    }> {
        const [metrics, profiles, priceTargets] = await Promise.all([
            prisma.finnhubMetrics.count(),
            prisma.finnhubProfile.count(),
            prisma.finnhubPriceTarget.count(),
        ]);

        return {
            dbMetrics: metrics,
            dbProfiles: profiles,
            dbPriceTargets: priceTargets,
        };
    }
}

// Export individual functions for convenience
export const getFinnhubMetrics = FinnhubService.getMetrics.bind(FinnhubService);
export const getFinnhubProfile = FinnhubService.getProfile.bind(FinnhubService);
export const getFinnhubPriceTarget = FinnhubService.getPriceTarget.bind(FinnhubService);
export const getFinnhubAnalysisData = FinnhubService.getAnalysisData.bind(FinnhubService);
