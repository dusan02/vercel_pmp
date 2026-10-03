/**
 * Finnhub Service
 *
 * Provides cached access to Finnhub /stock/metric data with:
 * - Redis hot cache (TTL-based)
 * - Database persistent storage
 * - Automatic fallback chain: Redis → DB → API
 */

import { prisma } from '@/lib/db/prisma';
import { redisOps } from '@/lib/redis/enhancedOperations';
import { getFinnhubClient, FinnhubMetric } from '@/lib/clients/finnhubClient';

// Cache TTL configuration (in seconds)
const CACHE_TTL = {
    METRICS: 3600,        // 1 hour - metrics don't change often
};

// Redis key patterns
const REDIS_KEYS = {
    metrics: (symbol: string) => `finnhub:metrics:${symbol}`,
};

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
            week52High: dbRecord.week52High,
            week52Low: dbRecord.week52Low,
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
    // Position of the latest price inside the 52w range (0 = at low, 100 =
    // at high; can be <0 / >100 when price just broke out). Drives the
    // screener's "52W Position" filter — one extra ticker read per save.
    let week52Position: number | null = null;
    if (metrics.week52High != null && metrics.week52Low != null && metrics.week52High > metrics.week52Low) {
        const t = await prisma.ticker.findUnique({ where: { symbol }, select: { lastPrice: true } });
        const price = t?.lastPrice;
        if (price != null && price > 0) {
            const pos = ((price - metrics.week52Low) / (metrics.week52High - metrics.week52Low)) * 100;
            // Plausibility window — Finnhub occasionally reports the 52w
            // range in the wrong share-class units (BRK.B gets BRK.A's
            // ~$800K range vs its ~$500 price → position ≈ -645). Beyond
            // ~-25%/+150% the range is stale or mismatched; store null
            // rather than let garbage top the "near 52w low" sort.
            week52Position = pos >= -25 && pos <= 150 ? pos : null;
        }
    }
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
        week52High: metrics.week52High,
        week52Low: metrics.week52Low,
        week52Position,
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
}
