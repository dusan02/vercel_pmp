/**
 * Centralized Finnhub API client
 * Provides unified interface for all Finnhub API calls with caching support
 */

import { withRetry, circuitBreaker } from '@/lib/api/rateLimiter';

// Circuit breaker for Finnhub API
const finnhubCircuitBreaker = circuitBreaker('finnhub', 5, 2, 60000);

// API Key from environment or fallback (for development)
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';

export interface FinnhubClientConfig {
    apiKey?: string;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
}

export interface FetchOptions {
    timeout?: number;
    signal?: AbortSignal;
}

// --- Finnhub Response Types ---

export interface FinnhubMetric {
    // Valuation ratios
    peRatio: number | null;
    forwardPe: number | null;
    pbRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
    evSales: number | null;
    pegRatio: number | null;
    priceCashFlow: number | null;
    priceFreeCashFlow: number | null;
    
    // Profitability
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    roe: number | null;
    roa: number | null;
    roic: number | null;
    rote: number | null;
    
    // Growth
    revenueGrowth: number | null;
    earningsGrowth: number | null;
    bookValueGrowth: number | null;
    debtGrowth: number | null;
    
    // Financial Health
    currentRatio: number | null;
    quickRatio: number | null;
    debtEquityRatio: number | null;
    interestCoverage: number | null;
    totalDebtToCapitalization: number | null;
    
    // Per Share
    revenuePerShare: number | null;
    netIncomePerShare: number | null;
    bookValuePerShare: number | null;
    cashPerShare: number | null;
    freeCashFlowPerShare: number | null;
    
    // Other
    beta: number | null;
    dividendYield: number | null;
    payoutRatio: number | null;
    employees: number | null;
    revenuePerEmployee: number | null;
    assetTurnover: number | null;
    inventoryTurnover: number | null;
    receivablesTurnover: number | null;
}

export interface FinnhubProfile {
    name: string | null;
    ticker: string;
    isin: string | null;
    cusip: string | null;
    exchange: string | null;
    currency: string | null;
    country: string | null;
    ipo: string | null;
    marketCap: number | null;
    shareOutstanding: number | null;
    logo: string | null;
    phone: string | null;
    weburl: string | null;
    finnhubIndustry: string | null;
    finnhubSector: string | null;
    ipoDate: string | null;
}

export interface FinnhubPriceTarget {
    symbol: string;
    targetHigh: number | null;
    targetLow: number | null;
    targetMean: number | null;
    targetMedian: number | null;
    numberOfAnalysts: number | null;
    currentPrice: number | null;
}

export interface FinnhubEarningsItem {
    symbol: string;
    date: string;
    epsActual: number | null;
    epsEstimate: number | null;
    revenueActual: number | null;
    revenueEstimate: number | null;
    time: string;
    surprise: number | null;
    surprisePercent: number | null;
}

export interface FinnhubEarningsResponse {
    earningsCalendar: FinnhubEarningsItem[];
}

export interface FinnhubInsiderTransaction {
    symbol: string;
    change: number;
    filingDate: string;
    transactionDate: string;
    transactionCode: string;
}

export interface FinnhubInstitutionalOwnership {
    symbol: string;
    atDate: string;
    holdings: Array<{
        name: string;
        shares: number;
        change: number;
        percentPortfolio: number;
    }>;
}

/**
 * Centralized Finnhub API client
 */
export class FinnhubClient {
    private apiKey: string;
    private timeout: number;
    private retries: number;
    private retryDelay: number;

    constructor(config: FinnhubClientConfig = {}) {
        this.apiKey = config.apiKey || FINNHUB_API_KEY;
        this.timeout = config.timeout || 10000;
        this.retries = config.retries || 3;
        this.retryDelay = config.retryDelay || 1000;
    }

    /**
     * Fetch with retry and circuit breaker
     */
    private async fetchWithRetry<T>(
        url: string,
        timeout: number,
        signal?: AbortSignal
    ): Promise<T | null> {
        // Check circuit breaker
        if (finnhubCircuitBreaker.isOpen) {
            console.warn('⚠️ Finnhub circuit breaker is OPEN, skipping API call');
            return null;
        }

        try {
            const response = await withRetry(async () => {
                const res = await fetch(url, {
                    signal: signal || AbortSignal.timeout(timeout),
                    headers: {
                        'Accept': 'application/json',
                    },
                });

                if (!res.ok) {
                    if (res.status === 429) {
                        throw new Error(`Rate limited: ${res.status}`);
                    }
                    // For 4xx errors (except 429), don't retry - it's a client error
                    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
                        console.warn(`⚠️ Finnhub client error ${res.status}: ${url}`);
                        return null;
                    }
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }

                return res;
            }, this.retries, this.retryDelay);

            if (!response) {
                return null;
            }

            finnhubCircuitBreaker.recordSuccess();
            return await response.json() as T;
        } catch (error) {
            finnhubCircuitBreaker.recordFailure();
            console.error(`❌ Finnhub API error for ${url}:`, error);
            return null;
        }
    }

    /**
     * Fetch stock metrics (60+ financial ratios)
     * Endpoint: /stock/metric
     */
    async fetchMetrics(symbol: string, options: FetchOptions = {}): Promise<FinnhubMetric | null> {
        const url = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${this.apiKey}`;
        const data = await this.fetchWithRetry<{ metric: Record<string, number | null> }>(
            url,
            options.timeout || this.timeout,
            options.signal
        );

        if (!data?.metric) return null;

        const m = data.metric;
        return {
            // Valuation
            peRatio: m['peNormalizedAnnual'] ?? m['peBasicExclExtraTTM'] ?? m['peExclExtraAnnual'] ?? null,
            forwardPe: m['peNormalizedAnnual'] ?? null,
            pbRatio: m['pbAnnual'] ?? m['pbQuarterly'] ?? null,
            psRatio: m['psTTM'] ?? m['psAnnual'] ?? null,
            evEbitda: m['enterpriseValueOverEbitda'] ?? null,
            evSales: m['evSales'] ?? null,
            pegRatio: m['pegRatio'] ?? null,
            priceCashFlow: m['payoutRatioTTM'] ?? null,
            priceFreeCashFlow: m['ptbv'] ?? null, // Using proxy
            
            // Profitability
            grossMargin: m['grossMarginAnnual'] ?? m['grossMarginTTM'] ?? null,
            operatingMargin: m['operatingMarginAnnual'] ?? m['operatingMarginTTM'] ?? null,
            netMargin: m['netProfitMarginAnnual'] ?? m['netProfitMarginTTM'] ?? null,
            roe: m['roeTTM'] ?? m['roeAnnual'] ?? null,
            roa: m['roaTTM'] ?? m['roaAnnual'] ?? null,
            roic: m['roicTTM'] ?? null,
            rote: m['roteTTM'] ?? null,
            
            // Growth
            revenueGrowth: m['revenueGrowth3Y'] ?? m['revenueGrowth5Y'] ?? null,
            earningsGrowth: m['epsGrowth3Y'] ?? m['epsGrowth5Y'] ?? null,
            bookValueGrowth: m['bookValuePerShareGrowth5Y'] ?? null,
            debtGrowth: m['totalDebtToEquityGrowth5Y'] ?? null,
            
            // Financial Health
            currentRatio: m['currentRatioAnnual'] ?? m['currentRatioQuarterly'] ?? null,
            quickRatio: m['quickRatioAnnual'] ?? m['quickRatioQuarterly'] ?? null,
            debtEquityRatio: m['totalDebtToEquityAnnual'] ?? m['totalDebtToEquityQuarterly'] ?? null,
            interestCoverage: m['interestCoverage'] ?? null,
            totalDebtToCapitalization: m['totalDebtToCapitalizationAnnual'] ?? null,
            
            // Per Share
            revenuePerShare: m['revenuePerShareTTM'] ?? null,
            netIncomePerShare: m['netIncomePerShareTTM'] ?? null,
            bookValuePerShare: m['bookValuePerShareAnnual'] ?? m['bookValuePerShareQuarterly'] ?? null,
            cashPerShare: m['cashPerShareAnnual'] ?? m['cashPerShareQuarterly'] ?? null,
            freeCashFlowPerShare: m['freeCashFlowPerShareTTM'] ?? null,
            
            // Other
            beta: m['beta'] ?? null,
            dividendYield: m['dividendYieldIndicatedAnnual'] ?? m['dividendYield5Y'] ?? null,
            payoutRatio: m['payoutRatioAnnual'] ?? m['payoutRatioTTM'] ?? null,
            employees: m['employees'] ?? null,
            revenuePerEmployee: m['revenuePerEmployee'] ?? null,
            assetTurnover: m['assetTurnoverAnnual'] ?? m['assetTurnoverTTM'] ?? null,
            inventoryTurnover: m['inventoryTurnoverAnnual'] ?? null,
            receivablesTurnover: m['receivablesTurnoverAnnual'] ?? null,
        };
    }

    /**
     * Fetch company profile
     * Endpoint: /stock/profile2
     */
    async fetchProfile(symbol: string, options: FetchOptions = {}): Promise<FinnhubProfile | null> {
        const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${this.apiKey}`;
        const data = await this.fetchWithRetry<FinnhubProfile>(
            url,
            options.timeout || this.timeout,
            options.signal
        );

        if (!data) return null;

        return {
            ...data,
            ticker: symbol,
        };
    }

    /**
     * Fetch price target (analyst consensus)
     * Endpoint: /stock/price-target
     */
    async fetchPriceTarget(symbol: string, options: FetchOptions = {}): Promise<FinnhubPriceTarget | null> {
        const url = `https://finnhub.io/api/v1/stock/price-target?symbol=${symbol}&token=${this.apiKey}`;
        return await this.fetchWithRetry<FinnhubPriceTarget>(
            url,
            options.timeout || this.timeout,
            options.signal
        );
    }

    /**
     * Fetch earnings calendar
     * Endpoint: /calendar/earnings
     */
    async fetchEarningsCalendar(from: string, to: string, symbol?: string, options: FetchOptions = {}): Promise<FinnhubEarningsResponse | null> {
        let url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${this.apiKey}`;
        if (symbol) {
            url += `&symbol=${symbol}`;
        }

        const data = await this.fetchWithRetry<FinnhubEarningsResponse>(
            url,
            options.timeout || this.timeout,
            options.signal
        );

        if (!data) return { earningsCalendar: [] };

        return data;
    }

    /**
     * Fetch insider transactions
     * Endpoint: /stock/insider-transactions
     */
    async fetchInsiderTransactions(symbol: string, from: string, to: string, options: FetchOptions = {}): Promise<FinnhubInsiderTransaction[] | null> {
        const url = `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${symbol}&from=${from}&to=${to}&token=${this.apiKey}`;
        const data = await this.fetchWithRetry<{ data: FinnhubInsiderTransaction[] }>(
            url,
            options.timeout || this.timeout,
            options.signal
        );

        return data?.data || null;
    }

    /**
     * Fetch institutional ownership
     * Endpoint: /stock/institutional-ownership
     */
    async fetchInstitutionalOwnership(symbol: string, options: FetchOptions = {}): Promise<FinnhubInstitutionalOwnership | null> {
        const url = `https://finnhub.io/api/v1/stock/institutional-ownership?symbol=${symbol}&token=${this.apiKey}`;
        const data = await this.fetchWithRetry<FinnhubInstitutionalOwnership>(
            url,
            options.timeout || this.timeout,
            options.signal
        );

        return data;
    }
}

// Singleton instance for convenience
let globalClient: FinnhubClient | null = null;

export function getFinnhubClient(config?: FinnhubClientConfig): FinnhubClient {
    if (!globalClient || config) {
        globalClient = new FinnhubClient(config);
    }
    return globalClient;
}

export function resetFinnhubClient(): void {
    globalClient = null;
}
