import { NextRequest, NextResponse } from 'next/server';
import { checkEarningsForOurTickers } from '@/lib/clients/yahooFinanceScraper';
import { computePercentChange, computeMarketCapDiff, getSharesOutstanding, getCurrentPrice, getPreviousClose, computeMarketCap } from '@/lib/utils/marketCapUtils';

interface EarningsData {
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

interface ProcessedEarningsResponse {
  success: boolean;
  data: {
    preMarket: EarningsData[];
    afterMarket: EarningsData[];
  };
  message?: string;
  cached?: boolean;
}

// Cache pre earnings data
const earningsCache = new Map<string, { data: ProcessedEarningsResponse; timestamp: number }>();

function getCachedEarnings(date: string): ProcessedEarningsResponse | null {
  const cached = earningsCache.get(date);
  if (cached && Date.now() - cached.timestamp < 300000) { // 5 minút
    console.log(`✅ Cache hit for ${date}, returning cached data`);
    return { ...cached.data, cached: true };
  }
  console.log(`🔄 Cache miss for ${date}, will fetch fresh data`);
  return null;
}

function setCachedEarnings(date: string, data: ProcessedEarningsResponse): void {
  earningsCache.set(date, { data, timestamp: Date.now() });
}

/**
 * Získa kompletný zoznam tickerov zo všetkých tierov
 */
function getAllTickers(): string[] {
  const { DEFAULT_TICKERS } = require('@/data/defaultTickers');

  const allTickers = new Set<string>();

  // Pridaj všetky tickery zo všetkých tierov
  Object.values(DEFAULT_TICKERS).forEach((tier) => {
    if (Array.isArray(tier)) {
      tier.forEach(ticker => allTickers.add(ticker));
    }
  });

  return Array.from(allTickers);
}

/**
 * Získa earnings data pre všetky tickery z Yahoo Finance
 */
async function getYahooFinanceEarnings(date: string): Promise<ProcessedEarningsResponse> {
  try {
    console.log(`🔍 Getting Yahoo Finance earnings for ${date}...`);

    // Získaj všetky tickery
    const allTickers = getAllTickers();
    console.log(`📊 Total tickers to check: ${allTickers.length}`);

    // Použij náš Yahoo Finance scraper pre všetky tier
    const yahooResult = await checkEarningsForOurTickers(date, 'all');

    // Ak Yahoo Finance nefunguje, skús Finnhub
    if (yahooResult.totalFound === 0) {
      console.log(`⚠️ Yahoo Finance returned 0 results, trying Finnhub...`);
      const { checkEarningsForOurTickers: checkFinnhub } = await import('@/lib/earningsMonitor');
      const finnhubResult = await checkFinnhub(date, 'pmp');

      // Kombinuj výsledky zo všetkých tierov
      const combinedResult = await combineAllTierResults(date);
      return combinedResult;
    }

    // Kombinuj výsledky zo všetkých tierov
    const combinedResult = await combineAllTierResults(date);
    return combinedResult;

  } catch (error) {
    console.error('❌ Error getting Yahoo Finance earnings:', error);
    throw error;
  }
}

/**
 * Kombinuje výsledky zo všetkých tierov
 */
async function combineAllTierResults(date: string): Promise<ProcessedEarningsResponse> {
  const tiers = ['pmp', 'standard', 'extended', 'extendedPlus'];
  const allPreMarket: string[] = [];
  const allAfterMarket: string[] = [];

  for (const tier of tiers) {
    try {
      const result = await checkEarningsForOurTickers(date, tier);
      allPreMarket.push(...result.preMarket);
      allAfterMarket.push(...result.afterMarket);
    } catch (error) {
      console.log(`⚠️ Error checking tier ${tier}:`, error);
    }
  }

  // Odstráň duplikáty
  const uniquePreMarket = [...new Set(allPreMarket)];
  const uniqueAfterMarket = [...new Set(allAfterMarket)];

  console.log(`📊 Combined results: ${uniquePreMarket.length} pre-market, ${uniqueAfterMarket.length} after-market`);

  // Konvertuj na EarningsData format
  const preMarketData = await convertToEarningsData(uniquePreMarket, date, 'bmo');
  const afterMarketData = await convertToEarningsData(uniqueAfterMarket, date, 'amc');

  return {
    success: true,
    data: {
      preMarket: preMarketData,
      afterMarket: afterMarketData
    },
    message: `Found ${uniquePreMarket.length + uniqueAfterMarket.length} earnings for today (refreshing every 5 minutes)`
  };
}

/**
 * Konvertuje tickery na EarningsData format
 */
async function convertToEarningsData(tickers: string[], date: string, time: string): Promise<EarningsData[]> {
  const earningsData: EarningsData[] = [];
  const apiKey = process.env.POLYGON_API_KEY;

  for (const ticker of tickers) {
    try {
      console.log(`🔍 Processing ${ticker} for earnings data...`);

      // 1. Získaj shares a prevClose
      const [sharesOutstanding, prevClose, companyData, finnhubData] = await Promise.all([
        getSharesOutstanding(ticker),
        getPreviousClose(ticker),
        fetchPolygonCompanyData(ticker),
        fetchFinnhubEarningsData(ticker, date)
      ]);

      // 2. Získaj snapshot data z Polygonu
      let currentPrice: number | null = null;
      let snapshotData: unknown = null;
      try {
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${apiKey}`;
        const snapshotResponse = await fetch(snapshotUrl, { signal: AbortSignal.timeout(10000) });
        if (snapshotResponse.ok) {
          snapshotData = await snapshotResponse.json();
          currentPrice = getCurrentPrice(snapshotData);
        } else {
          console.error(`❌ Snapshot API error for ${ticker}: ${snapshotResponse.status} ${snapshotResponse.statusText}`);
        }
      } catch (err) {
        console.error(`❌ Error fetching snapshot for ${ticker}:`, err);
      }
      if (!currentPrice) {
        console.error(`❌ No valid price found in snapshot data for ${ticker}:`, JSON.stringify(snapshotData, null, 2));
      }

      // 3. Výpočty
      const marketCap = (sharesOutstanding && currentPrice)
        ? computeMarketCap(currentPrice, sharesOutstanding)
        : null;
      const percentChange = (currentPrice && prevClose)
        ? computePercentChange(currentPrice, prevClose)
        : null;
      const marketCapDiff = (currentPrice && prevClose && sharesOutstanding)
        ? computeMarketCapDiff(currentPrice, prevClose, sharesOutstanding)
        : null;

      earningsData.push({
        ticker,
        companyName: companyData?.companyName || ticker,
        marketCap,
        epsEstimate: finnhubData?.epsEstimate || null,
        epsActual: finnhubData?.epsActual || null,
        revenueEstimate: finnhubData?.revenueEstimate || null,
        revenueActual: finnhubData?.revenueActual || null,
        epsSurprisePercent: finnhubData?.epsActual && finnhubData?.epsEstimate ?
          ((finnhubData.epsActual - finnhubData.epsEstimate) / finnhubData.epsEstimate) * 100 : null,
        revenueSurprisePercent: finnhubData?.revenueActual && finnhubData?.revenueEstimate ?
          ((finnhubData.revenueActual - finnhubData.revenueEstimate) / finnhubData.revenueEstimate) * 100 : null,
        percentChange,
        marketCapDiff,
        time,
        date
      });
    } catch (error) {
      console.log(`⚠️ Error processing ${ticker}:`, error);
      // Pridaj základné dáta aj pri chybe
      earningsData.push({
        ticker,
        companyName: ticker,
        marketCap: null,
        epsEstimate: null,
        epsActual: null,
        revenueEstimate: null,
        revenueActual: null,
        epsSurprisePercent: null,
        revenueSurprisePercent: null,
        percentChange: null,
        marketCapDiff: null,
        time,
        date
      });
    }
  }

  return earningsData;
}

/**
 * Získa EPS a Revenue dáta z Finnhub API
 */
async function fetchFinnhubEarningsData(ticker: string, date: string): Promise<{ epsEstimate: number | null; epsActual: number | null; revenueEstimate: number | null; revenueActual: number | null } | null> {
  const apiKey = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';

  try {
    // Získaj earnings dáta pre konkrétny ticker a dátum
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${date}&to=${date}&symbol=${ticker}&token=${apiKey}`;

    console.log(`🔍 Fetching Finnhub earnings for ${ticker} on ${date}...`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn(`⚠️ Failed to fetch Finnhub earnings for ${ticker}:`, response.statusText);
      return null;
    }

    const data = await response.json();
    const earnings = data.earningsCalendar?.[0];

    if (earnings) {
      const result = {
        epsEstimate: earnings.epsEstimate,
        epsActual: earnings.epsActual,
        revenueEstimate: earnings.revenueEstimate,
        revenueActual: earnings.revenueActual
      };
      console.log(`✅ Finnhub earnings for ${ticker}:`, result);
      return result;
    }

    console.log(`⚠️ No Finnhub earnings data found for ${ticker}`);
    return null;
  } catch (error) {
    console.error(`❌ Error fetching Finnhub earnings for ${ticker}:`, error);
    return null;
  }
}

/**
 * Získa company data z Polygon API
 */
async function fetchPolygonCompanyData(ticker: string): Promise<{ companyName: string; marketCap: number } | null> {
  try {
    const envApiKey = process.env.POLYGON_API_KEY;
    const apiKey = envApiKey || 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
    const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;

    console.log(`🔍 Fetching Polygon company data for ${ticker}...`);
    console.log(`🔑 API Key: ${envApiKey ? 'from env' : 'using fallback'}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`❌ Polygon API error for ${ticker}: ${response.status}`);
      throw new Error(`Polygon API error: ${response.status}`);
    }

    const data = await response.json();

    const result = {
      companyName: data.results?.name || ticker,
      marketCap: data.results?.market_cap || 0
    };

    console.log(`✅ Polygon data for ${ticker}:`, result);
    return result;

  } catch (error) {
    console.error(`❌ Error fetching Polygon company data for ${ticker}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const date = (dateParam || new Date().toISOString().split('T')[0]) as string;
    const refresh = searchParams.get('refresh') === 'true';

    console.log(`🔍 Yahoo Finance earnings request:`, { date, refresh });

    // Skontroluj cache
    if (!refresh) {
      const cached = getCachedEarnings(date);
      if (cached) {
        console.log(`✅ Returning cached earnings data for ${date}`);
        return NextResponse.json(cached);
      }
    }

    // Vynuluj cache pre debugging
    console.log(`🔄 Clearing cache for ${date} to fetch fresh data`);
    earningsCache.delete(date);

    // Získaj nové dáta
    const result = await getYahooFinanceEarnings(date);

    // Ulož do cache
    setCachedEarnings(date, result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Error in Yahoo Finance earnings API:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: {
        preMarket: [],
        afterMarket: []
      }
    }, { status: 500 });
  }
} 