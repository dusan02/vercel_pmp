import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_TICKERS } from '@/data/defaultTickers';

// Create a Set for O(1) lookup performance - ALL 360 TICKERS FROM ALL TIERS
const allTickers = [
  ...DEFAULT_TICKERS.pmp,        // Premium tier (50)
  ...DEFAULT_TICKERS.standard,   // Standard tier (100)
  ...DEFAULT_TICKERS.extended,   // Extended tier (150)
  ...DEFAULT_TICKERS.extendedPlus // Extended+ tier (60)
];
const TRACKED_TICKERS_SET = new Set(allTickers);

// Enhanced types based on blueprint
interface EarningsRow {
  ticker: string;
  companyName: string;
  logo: string;
  marketCap: number;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  percentChange: number | null;
  marketCapDiff: number | null;
  reportTime: 'BMO' | 'AMC';
  fiscalPeriod: string;
  reportDate: string;
}

interface EarningsCalendar {
  date: string;
  preMarket: EarningsRow[];
  afterMarket: EarningsRow[];
  cached?: boolean;
  partial?: boolean;
  message?: string;
}

interface PolygonEarningsData {
  ticker: string;
  company_name: string;
  market_cap: number;
  fiscal_period: string;
  report_date: string;
  report_time: 'BMO' | 'AMC' | 'DMT';
  estimate?: {
    eps?: number;
    revenue?: number;
  };
  actual?: {
    eps?: number;
    revenue?: number;
  };
}

interface PolygonResponse {
  results: PolygonEarningsData[];
  status: string;
}

// Cache interface (simplified for now, can be enhanced with Redis)
const earningsCache = new Map<string, { data: EarningsCalendar; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedEarnings(date: string): EarningsCalendar | null {
  const cached = earningsCache.get(date);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.data, cached: true };
  }
  return null;
}

function setCachedEarnings(date: string, data: EarningsCalendar): void {
  earningsCache.set(date, { data, timestamp: Date.now() });
}

// Mock data for fallback
function getMockEarningsData(date: string): EarningsCalendar {
  return {
    date,
    preMarket: [
      {
        ticker: 'PLTR',
        companyName: 'Palantir Technologies Inc.',
        logo: 'https://logo.clearbit.com/pltr.com',
        marketCap: 45000000000,
        epsEstimate: 0.08,
        epsActual: 0.09,
        revenueEstimate: 600000000,
        revenueActual: 620000000,
        percentChange: 12.5,
        marketCapDiff: 5000000000,
        reportTime: 'BMO',
        fiscalPeriod: 'Q2 2024',
        reportDate: date
      },
      {
        ticker: 'MUFG',
        companyName: 'Mitsubishi UFJ Financial Group',
        logo: 'https://logo.clearbit.com/mufg.com',
        marketCap: 120000000000,
        epsEstimate: 0.15,
        epsActual: 0.17,
        revenueEstimate: 8000000000,
        revenueActual: 8200000000,
        percentChange: 8.2,
        marketCapDiff: 9000000000,
        reportTime: 'BMO',
        fiscalPeriod: 'Q2 2024',
        reportDate: date
      }
    ],
    afterMarket: [
      {
        ticker: 'MELI',
        companyName: 'MercadoLibre Inc.',
        logo: 'https://logo.clearbit.com/mercadolibre.com',
        marketCap: 85000000000,
        epsEstimate: 1.20,
        epsActual: 1.35,
        revenueEstimate: 4200000000,
        revenueActual: 4500000000,
        percentChange: 15.8,
        marketCapDiff: 12000000000,
        reportTime: 'AMC',
        fiscalPeriod: 'Q2 2024',
        reportDate: date
      },
      {
        ticker: 'NVDA',
        companyName: 'NVIDIA Corporation',
        logo: 'https://logo.clearbit.com/nvidia.com',
        marketCap: 2800000000000,
        epsEstimate: 4.50,
        epsActual: 4.85,
        revenueEstimate: 28000000000,
        revenueActual: 30000000000,
        percentChange: 7.8,
        marketCapDiff: 200000000000,
        reportTime: 'AMC',
        fiscalPeriod: 'Q2 2024',
        reportDate: date
      }
    ],
    cached: true,
    partial: true,
    message: 'Showing mock data - API temporarily unavailable'
  };
}

// Enhanced data processing with better error handling
function processEarningsData(rawData: PolygonEarningsData[]): EarningsCalendar {
  const preMarket: EarningsRow[] = [];
  const afterMarket: EarningsRow[] = [];
  
  try {
    for (const item of rawData) {
      // Validate required fields
      if (!item.ticker || !item.company_name) {
        console.warn('⚠️ Skipping item with missing required fields:', item);
        continue;
      }
      
      // Filter to tracked tickers
      if (!TRACKED_TICKERS_SET.has(item.ticker)) {
        continue;
      }
      
      // Classify BMO vs AMC
      const isBMO = item.report_time === 'BMO';
      
      const earningsRow: EarningsRow = {
        ticker: item.ticker,
        companyName: item.company_name,
        logo: `https://logo.clearbit.com/${item.ticker.toLowerCase()}.com`,
        marketCap: item.market_cap || 0,
        epsEstimate: item.estimate?.eps || null,
        epsActual: item.actual?.eps || null,
        revenueEstimate: item.estimate?.revenue || null,
        revenueActual: item.actual?.revenue || null,
        percentChange: null, // Will be calculated separately
        marketCapDiff: null, // Will be calculated separately
        reportTime: isBMO ? 'BMO' : 'AMC',
        fiscalPeriod: item.fiscal_period || '',
        reportDate: item.report_date || ''
      };
      
      if (isBMO) {
        preMarket.push(earningsRow);
      } else {
        afterMarket.push(earningsRow);
      }
    }
  } catch (error) {
    console.error('❌ Error processing earnings data:', error);
    // Return empty result if processing fails
    return {
      date: new Date().toISOString().split('T')[0]!,
      preMarket: [],
      afterMarket: [],
      message: 'Error processing earnings data'
    };
  }
  
  return {
    date: rawData[0]?.report_date || new Date().toISOString().split('T')[0]!,
    preMarket,
    afterMarket
  };
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Enhanced earnings calendar API called');
    
    const { searchParams } = new URL(request.url);
    let date = searchParams.get('date');
    
    console.log('🔍 Date parameter:', date);
    
    // Validate and format date
    if (!date) {
      const now = new Date();
      const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
      date = easternTime.toISOString().split('T')[0]!;
    } else {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return NextResponse.json({ 
          error: 'Invalid date format. Use YYYY-MM-DD',
          date: date
        }, { status: 400 });
      }
    }
    
    // Check cache first (but skip if it's mock data)
    const cachedData = getCachedEarnings(date);
    if (cachedData && !cachedData.partial) {
      console.log('✅ Serving cached earnings data for:', date);
      return NextResponse.json(cachedData);
    }
    
    // Clear any cached mock data
    if (cachedData && cachedData.partial) {
      console.log('🗑️ Clearing cached mock data for:', date);
      earningsCache.delete(date);
    }
    
    const apiKey = process.env.POLYGON_API_KEY || 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
    console.log('🔑 API Key (first 10 chars):', apiKey.substring(0, 10) + '...');
    console.log('🔑 API Key length:', apiKey.length);
    
    // Get earnings calendar for the specified date
    // Use the basic Polygon API endpoint for earnings calendar
    const url = `https://api.polygon.io/v2/reference/calendar/earnings?apiKey=${apiKey}&date=${date}&limit=1000`;
    
    console.log('🔍 Fetching earnings calendar for:', date);
    console.log('🔍 API URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Polygon API Error:', response.status, response.statusText, errorBody);
      
      // Enhanced error handling with specific messages
      let errorMessage = 'Unable to fetch earnings data from Polygon.io';
      if (response.status === 401) {
        errorMessage = 'Invalid API key - please check your Polygon.io API key';
      } else if (response.status === 403) {
        errorMessage = 'API access denied - earnings data requires premium plan';
        // Return mock data for testing when API access is denied
        console.log('🔄 Returning mock data due to API access restrictions...');
        const mockData = getMockEarningsData(date);
        return NextResponse.json(mockData);
      } else if (response.status === 429) {
        errorMessage = 'API rate limit exceeded - please try again later';
      } else if (response.status === 404) {
        errorMessage = 'Earnings data not found for this date';
        // Return mock data for testing when API is not available
        console.log('🔄 Returning mock data for testing...');
        const mockData = getMockEarningsData(date);
        return NextResponse.json(mockData);
      }
      
      return NextResponse.json({
        error: `API Error: ${response.status}`,
        message: errorMessage,
        details: errorBody,
        status: response.status
      }, { status: response.status });
    }
    
    let data: PolygonResponse;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('❌ Error parsing JSON response:', parseError);
      return NextResponse.json({
        error: 'JSON Parse Error',
        message: 'Unable to parse API response',
        details: parseError instanceof Error ? parseError.message : 'Unknown parse error'
      }, { status: 500 });
    }
    
    if (!data.results || !Array.isArray(data.results)) {
      console.log('📅 No earnings data available for date:', date);
      const emptyResult: EarningsCalendar = {
        date,
        preMarket: [],
        afterMarket: [],
        message: 'No earnings data available for this date'
      };
      setCachedEarnings(date, emptyResult);
      return NextResponse.json(emptyResult);
    }
    
    // Process and filter the data
    const processedData = processEarningsData(data.results);
    
    console.log(`✅ Processed ${processedData.preMarket.length} pre-market and ${processedData.afterMarket.length} after-market earnings for ${date}`);
    console.log(`✅ Filtered from ${data.results.length} total results to ${processedData.preMarket.length + processedData.afterMarket.length} tracked tickers`);
    console.log(`🔍 Raw Results Count:`, data.results?.length);
    console.log(`🔍 Tracked Tickers Found:`, data.results?.filter(r => TRACKED_TICKERS_SET.has(r.ticker)).length);
    console.log(`🔍 Tracked Tickers:`, data.results?.filter(r => TRACKED_TICKERS_SET.has(r.ticker)).map(r => r.ticker));
    console.log(`🔍 Total Tracked Tickers Set Size:`, TRACKED_TICKERS_SET.size);
    console.log(`🔍 Sample Tracked Tickers:`, Array.from(TRACKED_TICKERS_SET).slice(0, 10));
    
    // Cache the result
    setCachedEarnings(date, processedData);
    
    return NextResponse.json(processedData);
    
  } catch (error) {
    console.error('❌ Unexpected error in earnings calendar API:', error);
    
    return NextResponse.json({
      error: 'Unexpected Error',
      message: 'An unexpected error occurred while fetching earnings data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 