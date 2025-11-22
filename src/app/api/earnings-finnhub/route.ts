import { NextRequest, NextResponse } from 'next/server';
import { computePercentChange, computeMarketCapDiff, getSharesOutstanding, getCurrentPrice, computeMarketCap } from '@/lib/utils/marketCapUtils';
import { getAllProjectTickers } from '@/data/defaultTickers';

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

// Získaj vaše tickery z existujúceho systému
function getYourTickers(): string[] {
  // Použijem vaše existujúce tickery z defaultTickers.ts
  return [
    'NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK.B', 'AVGO', 'LLY',
    'JPM', 'WMT', 'ORCL', 'V', 'MA', 'NFLX', 'XOM', 'COST', 'JNJ', 'HD',
    'PLTR', 'PG', 'ABBV', 'BAC', 'CVX', 'KO', 'GE', 'AMD', 'TMUS', 'CSCO',
    'PM', 'WFC', 'CRM', 'IBM', 'MS', 'ABT', 'GS', 'MCD', 'INTU', 'UNH',
    'RTX', 'DIS', 'AXP', 'CAT', 'MRK', 'T', 'PEP', 'NOW'
  ];
}

async function fetchEarningsData(date: string): Promise<FinnhubEarningsResponse> {
  const apiKey = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${date}&to=${date}&token=${apiKey}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000) // Zvýšený timeout na 10s
    });

    if (!response.ok) {
      // Ak Finnhub API vráti 500, vráť prázdne dáta namiesto error
      if (response.status === 500) {
        console.warn(`⚠️ Finnhub API returned 500 for date ${date} - returning empty earnings`);
        return { earningsCalendar: [] };
      }

      // Pre ostatné chyby (401, 429, atď.) hádž error
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Finnhub API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Validácia response štruktúry
    if (!data || typeof data !== 'object') {
      console.warn(`⚠️ Invalid Finnhub API response for date ${date} - returning empty earnings`);
      return { earningsCalendar: [] };
    }

    // Zabezpeč, že earningsCalendar je pole
    if (!Array.isArray(data.earningsCalendar)) {
      console.warn(`⚠️ Finnhub API response missing earningsCalendar array for date ${date} - returning empty earnings`);
      return { earningsCalendar: [] };
    }

    return data;
  } catch (error) {
    // Ak je to network error alebo timeout, vráť prázdne dáta
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
      console.warn(`⚠️ Finnhub API timeout for date ${date} - returning empty earnings`);
      return { earningsCalendar: [] };
    }

    // Pre ostatné chyby hádž error
    console.error(`❌ Error fetching Finnhub earnings for date ${date}:`, error);
    throw error;
  }
}

async function fetchUpdatedEarningsData(ticker: string, date: string): Promise<{ epsActual: number | null; revenueActual: number | null } | null> {
  const apiKey = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';

  try {
    // Try to get updated earnings data for specific ticker
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${date}&to=${date}&symbol=${ticker}&token=${apiKey}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn(`Failed to fetch updated earnings for ${ticker}:`, response.statusText);
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
    console.error(`Error fetching updated earnings for ${ticker}:`, error);
    return null;
  }
}

async function fetchPolygonCompanyData(ticker: string): Promise<{ companyName: string; marketCap: number } | null> {
  const apiKey = process.env.POLYGON_API_KEY || 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

  try {
    // Get company info from Polygon reference API
    const referenceUrl = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;
    const referenceResponse = await fetch(referenceUrl, {
      signal: AbortSignal.timeout(5000)
    });

    if (!referenceResponse.ok) {
      console.error(`Failed to fetch reference data for ${ticker}:`, referenceResponse.statusText);
      return null;
    }

    const referenceData = await referenceResponse.json();
    const companyName = referenceData.results?.name || ticker;

    // Get current price and shares to calculate market cap
    const [shares, priceData] = await Promise.all([
      getSharesOutstanding(ticker),
      fetchCurrentPrice(ticker)
    ]);

    if (!priceData) {
      console.error(`Missing price data for ${ticker}`);
      return null;
    }

    if (!shares) {
      console.error(`Missing shares data for ${ticker}`);
      return null;
    }

    // Calculate market cap in billions
    const marketCap = computeMarketCap(priceData.currentPrice, shares);

    return {
      companyName,
      marketCap
    };
  } catch (error) {
    console.error(`Error fetching Polygon company data for ${ticker}:`, error);
    return null;
  }
}

async function fetchCurrentPrice(ticker: string): Promise<{ currentPrice: number; previousClose: number } | null> {
  const apiKey = process.env.POLYGON_API_KEY || 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
  if (!apiKey) {
    console.error('Polygon API key not configured');
    return null;
  }

  try {
    // Get snapshot data from Polygon.io v2 API
    const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
    const snapshotResponse = await fetch(snapshotUrl, {
      signal: AbortSignal.timeout(5000)
    });

    if (!snapshotResponse.ok) {
      console.error(`Failed to fetch snapshot for ${ticker}:`, snapshotResponse.statusText);
      return null;
    }

    const snapshotData = await snapshotResponse.json();

    // Get current price using Polygon's snapshot data
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
      console.error(`No valid current price found for ${ticker}`);
      return null;
    }

    // Get previous close from Polygon aggregates
    const prevCloseUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${apiKey}`;
    const prevCloseResponse = await fetch(prevCloseUrl, {
      signal: AbortSignal.timeout(5000)
    });

    if (!prevCloseResponse.ok) {
      console.error(`Failed to fetch previous close for ${ticker}:`, prevCloseResponse.statusText);
      return null;
    }

    const prevCloseData = await prevCloseResponse.json();
    const previousClose = prevCloseData?.results?.[0]?.c;

    if (!previousClose || previousClose <= 0) {
      console.error(`No valid previous close found for ${ticker}`);
      return null;
    }

    return {
      currentPrice,
      previousClose
    };
  } catch (error) {
    console.error(`Error fetching price for ${ticker}:`, error);
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
      companyName: earning.symbol, // Will be enriched later
      marketCap: null, // Will be enriched later
      epsEstimate: earning.epsEstimate,
      epsActual: earning.epsActual,
      revenueEstimate: earning.revenueEstimate,
      revenueActual: earning.revenueActual,
      epsSurprisePercent: earning.surprisePercent || null,
      revenueSurprisePercent: null,
      percentChange: null, // Will be enriched later
      marketCapDiff: null, // Will be enriched later
      time: earning.time || 'unknown',
      date: earning.date
    };

    // Rozdeľ podľa času (bmo = before market open, amc = after market close)
    if (earning.time === 'bmo') {
      preMarket.push(earningsItem);
    } else {
      // amc alebo unknown - pridaj do after market
      afterMarket.push(earningsItem);
    }
  }

  return { preMarket, afterMarket };
}

function processEarningsData(
  earningsData: FinnhubEarningsResponse,
  yourTickers: string[]
): { preMarket: EarningsData[]; afterMarket: EarningsData[] } {
  const preMarket: EarningsData[] = [];
  const afterMarket: EarningsData[] = [];

  // Filtruj len vaše tickery
  const filteredEarnings = earningsData.earningsCalendar.filter(
    earning => yourTickers.includes(earning.symbol)
  );

  // Rozdeľ podľa času
  for (const earning of filteredEarnings) {
    const earningsItem: EarningsData = {
      ticker: earning.symbol,
      companyName: '', // Budeme dopĺňať z Polygon API
      marketCap: null, // Budeme dopĺňať z Polygon API
      epsEstimate: earning.epsEstimate,
      epsActual: earning.epsActual,
      revenueEstimate: earning.revenueEstimate,
      revenueActual: earning.revenueActual,
      epsSurprisePercent: earning.surprisePercent,
      revenueSurprisePercent: null, // Finnhub nemá revenue surprise percent
      percentChange: null, // Budeme dopĺňať z Polygon API
      marketCapDiff: null, // Budeme dopĺňať z Polygon API
      time: earning.time || 'unknown',
      date: earning.date
    };

    if (earning.time === 'bmo') {
      preMarket.push(earningsItem);
    } else if (earning.time === 'amc') {
      afterMarket.push(earningsItem);
    } else {
      // Ak nie je špecifikovaný čas, pridaj do after market
      afterMarket.push(earningsItem);
    }
  }

  return { preMarket, afterMarket };
}

async function enrichEarningsData(earnings: EarningsData[]): Promise<EarningsData[]> {
  const enriched: EarningsData[] = [];

  for (const earning of earnings) {
    try {
      console.log(`🔍 Fetching data for ${earning.ticker}...`);
      const [companyData, priceData, updatedEarnings] = await Promise.all([
        fetchPolygonCompanyData(earning.ticker),
        fetchCurrentPrice(earning.ticker),
        fetchUpdatedEarningsData(earning.ticker, earning.date)
      ]);

      let percentChange = null;
      let marketCapDiff = null;

      if (priceData && priceData.previousClose > 0) {
        try {
          // Use precise calculation functions from marketCapUtils
          percentChange = computePercentChange(priceData.currentPrice, priceData.previousClose);

          if (companyData) {
            // Calculate market cap diff using shares outstanding and price change
            const shares = await getSharesOutstanding(earning.ticker);
            marketCapDiff = computeMarketCapDiff(priceData.currentPrice, priceData.previousClose, shares);
          }

          console.log(`📊 ${earning.ticker} Polygon data:`, {
            currentPrice: priceData.currentPrice,
            previousClose: priceData.previousClose,
            percentChange,
            marketCapDiff,
            marketCap: companyData?.marketCap
          });
        } catch (calcError) {
          console.error(`Error calculating price data for ${earning.ticker}:`, calcError);
          // Keep null values if calculation fails
        }
      } else {
        console.warn(`⚠️ No valid price data for ${earning.ticker}`);
      }

      // Use updated earnings data if available
      const finalEpsActual = updatedEarnings && updatedEarnings.epsActual !== null ? updatedEarnings.epsActual : earning.epsActual;
      const finalRevenueActual = updatedEarnings && updatedEarnings.revenueActual !== null ? updatedEarnings.revenueActual : earning.revenueActual;

      // Ensure we have valid data before pushing
      const enrichedEarning = {
        ...earning,
        companyName: companyData?.companyName || earning.companyName,
        marketCap: companyData?.marketCap || null, // Use null instead of 0 if not available
        epsActual: finalEpsActual,
        revenueActual: finalRevenueActual,
        percentChange,
        marketCapDiff
      };

      // Log if we got updated earnings data
      if (updatedEarnings && (updatedEarnings.epsActual !== null || updatedEarnings.revenueActual !== null)) {
        console.log(`✅ Got updated earnings data for ${earning.ticker}:`, {
          epsActual: updatedEarnings.epsActual,
          revenueActual: updatedEarnings.revenueActual
        });
      }

      enriched.push(enrichedEarning);
    } catch (error) {
      console.error(`Error enriching data for ${earning.ticker}:`, error);
      // Still add the earning with null values for price data
      const fallbackEarning = {
        ...earning,
        marketCap: null, // Use null instead of 0
        percentChange: null,
        marketCapDiff: null
      };
      enriched.push(fallbackEarning);
    }
  }

  return enriched;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const date = (dateParam || new Date().toISOString().split('T')[0]) as string;
  const refresh = searchParams.get('refresh') === 'true';

  try {
    console.log('🔍 Fetching Finnhub earnings for date:', date, refresh ? '(forced refresh)' : '');

    // Skontroluj cache (skip if refresh=true)
    if (!refresh) {
      const cached = getCachedEarnings(date);
      if (cached) {
        console.log('✅ Returning cached earnings data');
        return NextResponse.json(cached);
      }
    }

    // Získaj všetky earnings data z Finnhub
    let earningsData: FinnhubEarningsResponse;
    try {
      earningsData = await fetchEarningsData(date);
      console.log('📊 Total earnings count from Finnhub:', earningsData.earningsCalendar?.length || 0);
    } catch (error) {
      // Ak fetchEarningsData hádže error (nie 500), vráť prázdne dáta s warning
      console.warn(`⚠️ Failed to fetch earnings from Finnhub for date ${date}:`, error);
      earningsData = { earningsCalendar: [] };
    }

    // Filter only our tracked tickers
    const ourTickers = new Set(getAllProjectTickers('pmp'));
    const filteredEarnings = {
      ...earningsData,
      earningsCalendar: (earningsData.earningsCalendar || []).filter(e => e && e.symbol && ourTickers.has(e.symbol))
    };

    // Spracuj earnings data
    const processed = processAllEarningsData(filteredEarnings);
    console.log('📊 Processed earnings:', {
      preMarket: processed.preMarket.length,
      afterMarket: processed.afterMarket.length
    });

    // Obohať dáta o company profiles (s error handling)
    let enrichedPreMarket: EarningsData[];
    let enrichedAfterMarket: EarningsData[];

    try {
      enrichedPreMarket = await enrichEarningsData(processed.preMarket);
      enrichedAfterMarket = await enrichEarningsData(processed.afterMarket);
    } catch (enrichError) {
      console.warn('⚠️ Error enriching earnings data, using unenriched data:', enrichError);
      // Použij neobohatené dáta ak enrich zlyhá
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
        ? `Found ${enrichedPreMarket.length + enrichedAfterMarket.length} earnings for today (refreshing every 5 minutes)`
        : `Found ${enrichedPreMarket.length + enrichedAfterMarket.length} earnings for ${date}`
    };

    // Cache výsledok
    setCachedEarnings(date, result);

    console.log('✅ Returning earnings data:', result.message);
    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Error in /api/earnings-finnhub:', error);

    // Ak je to Finnhub API error (500), vráť prázdne dáta namiesto 500 error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('Finnhub API error: 500')) {
      console.warn('⚠️ Finnhub API returned 500 - returning empty earnings data instead of error');
      const today = new Date().toISOString().split('T')[0];
      const isToday = date === today;

      return NextResponse.json({
        success: true,
        data: {
          preMarket: [],
          afterMarket: []
        },
        message: isToday
          ? 'No earnings data available (Finnhub API temporarily unavailable)'
          : `No earnings data available for ${date} (Finnhub API temporarily unavailable)`,
        cached: false
      });
    }

    // Pre ostatné chyby vráť error response
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 