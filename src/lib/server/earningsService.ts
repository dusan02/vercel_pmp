import { computePercentChange, computeMarketCapDiff, getSharesOutstanding, computeMarketCap } from '@/lib/utils/marketCapUtils';
import { getAllProjectTickers } from '@/data/defaultTickers';
import { detectSession, nowET } from '@/lib/utils/timeUtils';
import { prisma } from '@/lib/db/prisma';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { getFinnhubClient, FinnhubEarningsItem, FinnhubEarningsResponse } from '@/lib/clients/finnhubClient';

// FinnhubEarningsResponse is imported from finnhubClient.ts (Bug #4 fix: removed duplicate definition)

export interface EarningsData {
    ticker: string;
    companyName: string;
    marketCap: number | null;
    epsEstimate: number | null;
    epsActual: number | null;
    revenueEstimate: number | null;
    revenueActual: number | null;
    epsSurprisePercent: number | null;
    revenueSurprisePercent: number | null;
    percentChange: number | null;
    marketCapDiff: number | null;
    time: string;
    date: string;
}

export interface ProcessedEarningsResponse {
    success: boolean;
    data: {
        preMarket: EarningsData[];
        afterMarket: EarningsData[];
    };
    message?: string;
    cached?: boolean;
}

// --- Caching ---

// Cache pre earnings data (1 hodina)
const earningsCache = new Map<string, { data: ProcessedEarningsResponse; timestamp: number }>();

// Cache pre today's earnings with shorter TTL for real-time updates
const todayEarningsCache = new Map<string, { data: ProcessedEarningsResponse; timestamp: number }>();

function getCachedEarnings(date: string): ProcessedEarningsResponse | null {
    const today = new Date().toISOString().split('T')[0];
    const isToday = date === today;

    if (isToday) {
        // Use shorter cache for today's earnings (5 minutes)
        const cached = todayEarningsCache.get(date);
        if (cached && Date.now() - cached.timestamp < 300000) { // 5 minút
            return { ...cached.data, cached: true };
        }
    } else {
        // Use longer cache for historical data (1 hodina)
        const cached = earningsCache.get(date);
        if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hodina
            return { ...cached.data, cached: true };
        }
    }
    return null;
}

function setCachedEarnings(date: string, data: ProcessedEarningsResponse): void {
    const today = new Date().toISOString().split('T')[0];
    const isToday = date === today;

    if (isToday) {
        todayEarningsCache.set(date, { data, timestamp: Date.now() });
    } else {
        earningsCache.set(date, { data, timestamp: Date.now() });
    }
}

// --- Fetching Logic ---

async function fetchEarningsData(date: string): Promise<{ earningsCalendar: FinnhubEarningsItem[] }> {
    const client = getFinnhubClient();
    const data = await client.fetchEarningsCalendar(date, date);
    return data || { earningsCalendar: [] };
}

async function fetchUpdatedEarningsData(ticker: string, date: string): Promise<{ epsActual: number | null; revenueActual: number | null } | null> {
    const client = getFinnhubClient();
    const data = await client.fetchEarningsCalendar(date, date, ticker);
    
    if (!data?.earningsCalendar?.[0]) {
        return null;
    }
    
    const earnings = data.earningsCalendar[0];
    return {
        epsActual: earnings.epsActual,
        revenueActual: earnings.revenueActual
    };
}

async function fetchCurrentPrice(ticker: string): Promise<{ currentPrice: number; previousClose: number } | null> {
    // Bug #5: Polygon key should be in env (hardcoded fallback only for dev)
    const apiKey = process.env.POLYGON_API_KEY || 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
    if (!process.env.POLYGON_API_KEY && process.env.NODE_ENV === 'production') {
        console.error('❌ POLYGON_API_KEY env variable is not set in production!');
    }
    if (!apiKey) return null;

    try {
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
        const snapshotResponse = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(5000)
        });

        if (!snapshotResponse.ok) return null;

        const snapshotData = await snapshotResponse.json();

        let currentPrice = 0;
        if (snapshotData?.ticker?.lastTrade?.p && snapshotData.ticker.lastTrade.p > 0) {
            currentPrice = snapshotData.ticker.lastTrade.p;
        } else if (snapshotData?.ticker?.min?.c && snapshotData.ticker.min.c > 0) {
            currentPrice = snapshotData.ticker.min.c;
        } else if (snapshotData?.ticker?.day?.c && snapshotData.ticker.day.c > 0) {
            currentPrice = snapshotData.ticker.day.c;
        } else if (snapshotData?.ticker?.prevDay?.c && snapshotData.ticker.prevDay.c > 0) {
            currentPrice = snapshotData.ticker.prevDay.c;
        } else {
            return null;
        }

        const prevCloseUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${apiKey}`;
        const prevCloseResponse = await fetch(prevCloseUrl, {
            signal: AbortSignal.timeout(5000)
        });

        if (!prevCloseResponse.ok) return null;

        const prevCloseData = await prevCloseResponse.json();
        const previousClose = prevCloseData?.results?.[0]?.c;

        if (!previousClose || previousClose <= 0) return null;

        return {
            currentPrice,
            previousClose
        };
    } catch (error) {
        return null;
    }
}


function processAllEarningsData(
    earningsData: FinnhubEarningsResponse
): { preMarket: EarningsData[]; afterMarket: EarningsData[] } {
    const preMarket: EarningsData[] = [];
    const afterMarket: EarningsData[] = [];

    if (!earningsData.earningsCalendar) {
        return { preMarket, afterMarket };
    }

    for (const earning of earningsData.earningsCalendar) {
        const earningsItem: EarningsData = {
            ticker: earning.symbol,
            companyName: earning.symbol,
            marketCap: null,
            epsEstimate: earning.epsEstimate,
            epsActual: earning.epsActual,
            revenueEstimate: earning.revenueEstimate,
            revenueActual: earning.revenueActual,
            epsSurprisePercent: earning.surprisePercent || null,
            revenueSurprisePercent: null,
            percentChange: null,
            marketCapDiff: null,
            time: earning.time || 'unknown',
            date: earning.date
        };

        if (earning.time === 'bmo') {
            preMarket.push(earningsItem);
        } else {
            afterMarket.push(earningsItem);
        }
    }

    return { preMarket, afterMarket };
}

async function enrichEarningsData(earnings: EarningsData[]): Promise<EarningsData[]> {
    const etNow = nowET();
    const session = detectSession(etNow);

    const regularCloseMap = new Map<string, number>();
    if (session === 'after' || session === 'closed') {
        try {
            const tickers = earnings.map(e => e.ticker);
            const dateET = getDateET(etNow);
            const dateObj = createETDate(dateET);
            const dailyRefs = await prisma.dailyRef.findMany({
                where: {
                    symbol: { in: tickers },
                    date: dateObj
                },
                select: { symbol: true, regularClose: true }
            });
            dailyRefs.forEach(ref => {
                if (ref.regularClose && ref.regularClose > 0) {
                    regularCloseMap.set(ref.symbol, ref.regularClose);
                }
            });
        } catch (error) {
            console.warn('Failed to load regular closes:', error);
        }
    }

    const CONCURRENCY_LIMIT = 5;
    const enriched: EarningsData[] = [];

    for (let i = 0; i < earnings.length; i += CONCURRENCY_LIMIT) {
        const batch = earnings.slice(i, i + CONCURRENCY_LIMIT);
        const batchPromises = batch.map(async (earning) => {
            try {
                const [priceData, updatedEarnings] = await Promise.all([
                    fetchCurrentPrice(earning.ticker),
                    fetchUpdatedEarningsData(earning.ticker, earning.date)
                ]);

                const shares = await getSharesOutstanding(earning.ticker, priceData?.currentPrice);

                let companyName = earning.companyName;
                let marketCap = null;

                if (priceData && shares > 0) {
                    marketCap = computeMarketCap(priceData.currentPrice, shares);
                }

                if (companyName === earning.ticker) {
                    try {
                        const apiKey = process.env.POLYGON_API_KEY || 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
                        const referenceUrl = `https://api.polygon.io/v3/reference/tickers/${earning.ticker}?apiKey=${apiKey}`;
                        const refResponse = await fetch(referenceUrl, { signal: AbortSignal.timeout(3000) });
                        if (refResponse.ok) {
                            const refData = await refResponse.json();
                            companyName = refData.results?.name || companyName;
                        }
                    } catch (e) { }
                }

                let percentChange = null;
                let marketCapDiff = null;

                if (priceData && priceData.previousClose > 0) {
                    try {
                        const regularClose = regularCloseMap.get(earning.ticker) || null;
                        percentChange = computePercentChange(priceData.currentPrice, priceData.previousClose, session, regularClose);

                        if (shares > 0) {
                            marketCapDiff = computeMarketCapDiff(priceData.currentPrice, priceData.previousClose, shares);
                        }
                    } catch (calcError) {
                        console.error(`Error calculating price data for ${earning.ticker}:`, calcError);
                    }
                }

                const finalEpsActual = updatedEarnings && updatedEarnings.epsActual !== null ? updatedEarnings.epsActual : earning.epsActual;
                const finalRevenueActual = updatedEarnings && updatedEarnings.revenueActual !== null ? updatedEarnings.revenueActual : earning.revenueActual;

                return {
                    ...earning,
                    companyName,
                    marketCap,
                    epsActual: finalEpsActual,
                    revenueActual: finalRevenueActual,
                    percentChange,
                    marketCapDiff
                };
            } catch (error) {
                console.error(`Error enriching data for ${earning.ticker}:`, error);
                return {
                    ...earning,
                    marketCap: null,
                    percentChange: null,
                    marketCapDiff: null
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        enriched.push(...batchResults);
    }

    return enriched;
}

// --- Main Exported Function ---

export async function getEarningsForDate(date: string, forceRefresh = false): Promise<ProcessedEarningsResponse> {
    console.log(`🔍 [Service] Fetching earnings for date: ${date}${forceRefresh ? ' (forced refresh)' : ''}`);

    if (!forceRefresh) {
        const cached = getCachedEarnings(date);
        if (cached) {
            console.log('✅ [Service] Returning cached earnings data');
            return cached;
        }
    }

    let earningsData: FinnhubEarningsResponse;
    try {
        earningsData = await fetchEarningsData(date);
        console.log(`📊 [Service] Raw earnings count: ${earningsData.earningsCalendar?.length || 0}`);
    } catch (error) {
        console.warn(`⚠️ [Service] Failed to fetch earnings from Finnhub for date ${date}:`, error);
        earningsData = { earningsCalendar: [] };
    }

    const ourTickers = new Set(getAllProjectTickers('pmp'));
    const filteredEarnings = {
        ...earningsData,
        earningsCalendar: (earningsData.earningsCalendar || []).filter(e => e && e.symbol && ourTickers.has(e.symbol))
    };

    const processed = processAllEarningsData(filteredEarnings);

    let enrichedPreMarket: EarningsData[];
    let enrichedAfterMarket: EarningsData[];

    try {
        enrichedPreMarket = await enrichEarningsData(processed.preMarket);
        enrichedAfterMarket = await enrichEarningsData(processed.afterMarket);
    } catch (enrichError) {
        console.warn('⚠️ [Service] Error enriching earnings data, using unenriched data:', enrichError);
        enrichedPreMarket = processed.preMarket;
        enrichedAfterMarket = processed.afterMarket;
    }

    const today = new Date().toISOString().split('T')[0];
    const isToday = date === today;

    const result: ProcessedEarningsResponse = {
        success: true,
        data: {
            preMarket: enrichedPreMarket,
            afterMarket: enrichedAfterMarket
        },
        message: isToday
            ? `Found ${enrichedPreMarket.length + enrichedAfterMarket.length} earnings for today`
            : `Found ${enrichedPreMarket.length + enrichedAfterMarket.length} earnings for ${date}`
    };

    setCachedEarnings(date, result);
    return result;
}
