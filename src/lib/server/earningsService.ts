import { computePercentChange, computeMarketCapDiff, getSharesOutstanding, computeMarketCap } from '@/lib/utils/marketCapUtils';
import { getAllProjectTickers } from '@/data/defaultTickers';
import { detectSession, nowET } from '@/lib/utils/timeUtils';
import { prisma } from '@/lib/db/prisma';
import { getDateET, createETDate } from '@/lib/utils/dateET';

// --- Interfaces ---

interface FinnhubEarningsResponse {
    earningsCalendar: Array<{
        date: string;
        epsActual: number | null;
        epsEstimate: number | null;
        revenueActual: number | null;
        revenueEstimate: number | null;
        symbol: string;
        time: string;
        surprise: number | null;
        surprisePercent: number | null;
    }>;
}

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

async function fetchEarningsData(date: string): Promise<FinnhubEarningsResponse> {
    const apiKey = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${date}&to=${date}&token=${apiKey}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(10000) // 10s timeout
        });

        if (!response.ok) {
            if (response.status === 500) {
                console.warn(`⚠️ Finnhub API returned 500 for date ${date} - returning empty earnings`);
                return { earningsCalendar: [] };
            }
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error(`Finnhub API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (!data || typeof data !== 'object') {
            console.warn(`⚠️ Invalid Finnhub API response for date ${date} - returning empty earnings`);
            return { earningsCalendar: [] };
        }

        if (!Array.isArray(data.earningsCalendar)) {
            console.warn(`⚠️ Finnhub API response missing earningsCalendar array for date ${date} - returning empty earnings`);
            return { earningsCalendar: [] };
        }

        return data;
    } catch (error) {
        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
            console.warn(`⚠️ Finnhub API timeout for date ${date} - returning empty earnings`);
            return { earningsCalendar: [] };
        }
        console.error(`❌ Error fetching Finnhub earnings for date ${date}:`, error);
        throw error;
    }
}

async function fetchUpdatedEarningsData(ticker: string, date: string): Promise<{ epsActual: number | null; revenueActual: number | null } | null> {
    const apiKey = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';

    try {
        const url = `https://finnhub.io/api/v1/calendar/earnings?from=${date}&to=${date}&symbol=${ticker}&token=${apiKey}`;

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const earnings = data.earningsCalendar?.[0];

        if (earnings) {
            return {
                epsActual: earnings.epsActual,
                revenueActual: earnings.revenueActual
            };
        }

        return null;
    } catch (error) {
        return null;
    }
}

async function fetchCurrentPrice(ticker: string): Promise<{ currentPrice: number; previousClose: number } | null> {
    const apiKey = process.env.POLYGON_API_KEY || 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
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

async function fetchPolygonCompanyData(ticker: string): Promise<{ companyName: string; marketCap: number } | null> {
    const apiKey = process.env.POLYGON_API_KEY || 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

    try {
        const referenceUrl = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;
        const referenceResponse = await fetch(referenceUrl, {
            signal: AbortSignal.timeout(5000)
        });

        if (!referenceResponse.ok) return null;

        const referenceData = await referenceResponse.json();
        const companyName = referenceData.results?.name || ticker;

        const [shares, priceData] = await Promise.all([
            getSharesOutstanding(ticker),
            fetchCurrentPrice(ticker)
        ]);

        if (!priceData || !shares) return null;

        const marketCap = computeMarketCap(priceData.currentPrice, shares);

        return {
            companyName,
            marketCap
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
    const enriched: EarningsData[] = [];

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

    for (const earning of earnings) {
        try {
            const [companyData, priceData, updatedEarnings] = await Promise.all([
                fetchPolygonCompanyData(earning.ticker),
                fetchCurrentPrice(earning.ticker),
                fetchUpdatedEarningsData(earning.ticker, earning.date)
            ]);

            let percentChange = null;
            let marketCapDiff = null;

            if (priceData && priceData.previousClose > 0) {
                try {
                    const regularClose = regularCloseMap.get(earning.ticker) || null;
                    percentChange = computePercentChange(priceData.currentPrice, priceData.previousClose, session, regularClose);

                    if (companyData) {
                        const shares = await getSharesOutstanding(earning.ticker);
                        marketCapDiff = computeMarketCapDiff(priceData.currentPrice, priceData.previousClose, shares);
                    }
                } catch (calcError) {
                    console.error(`Error calculating price data for ${earning.ticker}:`, calcError);
                }
            }

            const finalEpsActual = updatedEarnings && updatedEarnings.epsActual !== null ? updatedEarnings.epsActual : earning.epsActual;
            const finalRevenueActual = updatedEarnings && updatedEarnings.revenueActual !== null ? updatedEarnings.revenueActual : earning.revenueActual;

            const enrichedEarning = {
                ...earning,
                companyName: companyData?.companyName || earning.companyName,
                marketCap: companyData?.marketCap || null,
                epsActual: finalEpsActual,
                revenueActual: finalRevenueActual,
                percentChange,
                marketCapDiff
            };

            enriched.push(enrichedEarning);
        } catch (error) {
            console.error(`Error enriching data for ${earning.ticker}:`, error);
            const fallbackEarning = {
                ...earning,
                marketCap: null,
                percentChange: null,
                marketCapDiff: null
            };
            enriched.push(fallbackEarning);
        }
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
