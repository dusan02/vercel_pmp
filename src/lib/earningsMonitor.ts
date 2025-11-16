import { getProjectTickers } from '@/data/defaultTickers';

interface FinnhubEarningsItem {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  symbol: string;
  time: string; // 'bmo' | 'amc' | 'dmt'
  surprise: number | null;
  surprisePercent: number | null;
}

interface FinnhubEarningsResponse {
  earningsCalendar: FinnhubEarningsItem[];
}

interface ProcessedEarnings {
  preMarket: string[];
  afterMarket: string[];
  totalFound: number;
  date: string;
}

/**
 * Získa earnings kalendár z Finnhub API pre daný dátum
 */
async function fetchFinnhubEarningsCalendar(date: string): Promise<FinnhubEarningsResponse> {
  const apiKey = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${date}&to=${date}&token=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching Finnhub earnings calendar:', error);
    throw error;
  }
}

/**
 * Kontroluje, ktoré z našich tickerov majú earnings v daný deň
 */
export async function checkEarningsForOurTickers(date: string, project: string = 'pmp'): Promise<ProcessedEarnings> {
  try {
    console.log(`🔍 Checking earnings for ${date}...`);
    
    // Získaj naše tickery
    const ourTickers = getProjectTickers(project);
    console.log(`📊 Our tickers count: ${ourTickers.length}`);
    
    // Získaj earnings kalendár z Finnhub
    const earningsData = await fetchFinnhubEarningsCalendar(date);
    console.log(`📅 Total earnings in Finnhub: ${earningsData.earningsCalendar?.length || 0}`);
    
    // Debug: vypíš prvých 10 tickerov z Finnhub
    const firstTickers = earningsData.earningsCalendar?.slice(0, 10).map(e => e.symbol) || [];
    console.log(`🔍 First 10 tickers from Finnhub:`, firstTickers);
    
    // Filtruj len naše tickery
    const ourEarnings = earningsData.earningsCalendar?.filter(
      earning => ourTickers.includes(earning.symbol)
    ) || [];
    
    console.log(`✅ Found ${ourEarnings.length} earnings for our tickers`);
    
    // Rozdeľ podľa času reportovania
    const preMarket: string[] = [];
    const afterMarket: string[] = [];
    
    for (const earning of ourEarnings) {
      if (earning.time === 'bmo') {
        preMarket.push(earning.symbol);
      } else if (earning.time === 'amc' || earning.time === 'dmt') {
        afterMarket.push(earning.symbol);
      } else {
        // Ak nie je špecifikovaný čas, pridaj do after market
        afterMarket.push(earning.symbol);
      }
    }
    
    const result: ProcessedEarnings = {
      preMarket,
      afterMarket,
      totalFound: ourEarnings.length,
      date
    };
    
    console.log(`📊 Earnings breakdown for ${date}:`, {
      preMarket: preMarket.length,
      afterMarket: afterMarket.length,
      total: ourEarnings.length,
      preMarketTickers: preMarket,
      afterMarketTickers: afterMarket
    });
    
    return result;
    
  } catch (error) {
    console.error('❌ Error checking earnings for our tickers:', error);
    throw error;
  }
}

/**
 * Automatické monitorovanie - volá sa každú minútu po polnoci
 */
export async function startEarningsMonitoring(project: string = 'pmp'): Promise<void> {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const today = (easternTime.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]) as string;
  
  try {
    console.log(`🕛 Starting earnings monitoring for ${today}...`);
    
    const earnings = await checkEarningsForOurTickers(today, project);
    
    if (earnings.totalFound > 0) {
      console.log(`🎉 Found ${earnings.totalFound} earnings for today!`);
      console.log(`🌅 Pre-market: ${earnings.preMarket.join(', ')}`);
      console.log(`🌙 After-market: ${earnings.afterMarket.join(', ')}`);
      
      // Tu môžeme pridať notifikácie alebo ďalšie akcie
      // napr. odoslanie emailu, push notifikáciu, atď.
    } else {
      console.log(`📭 No earnings found for our tickers today`);
    }
    
  } catch (error) {
    console.error('❌ Error in earnings monitoring:', error);
  }
}

/**
 * Funkcia pre manuálne spustenie monitorovania
 */
export async function manualEarningsCheck(date?: string, project: string = 'pmp'): Promise<ProcessedEarnings> {
  const checkDate = (date || new Date().toISOString().split('T')[0]) as string;
  return await checkEarningsForOurTickers(checkDate, project);
}

/**
 * Kontrola, či je čas na monitorovanie (00:00-06:00 EST)
 */
export function shouldMonitorEarnings(): boolean {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const hour = easternTime.getHours();
  
  // Monitoruj len medzi 00:00-06:00 EST
  return hour >= 0 && hour < 6;
} 