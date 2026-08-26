import { getProjectTickers } from '@/data/defaultTickers';

interface YahooEarningsItem {
  symbol: string;
  company: string;
  eventName: string;
  earningsCallTime: string; // 'BMO' | 'AMC' | 'DMT'
  epsEstimate: number | null;
  reportedEps: number | null;
  surprise: number | null;
  marketCap: string | null;
}

interface YahooEarningsResponse {
  earnings: YahooEarningsItem[];
  totalFound: number;
  date: string;
}

interface ProcessedEarnings {
  preMarket: string[];
  afterMarket: string[];
  totalFound: number;
  date: string;
  items?: EarningsItemFull[];
}

interface EarningsItemFull {
  ticker: string;
  companyName: string;
  time: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprise: number | null;
  surprisePercent: number | null;
}

/**
 * Manuálne test dáta na základe Yahoo Finance kalendára pre 4. august 2025
 */
function getManualTestData(_date: string): YahooEarningsItem[] {
  // Na základe Yahoo Finance kalendára z obrázka
  const testData: YahooEarningsItem[] = [
    {
      symbol: 'PLTR',
      company: 'Palantir Technologies Inc.',
      eventName: 'Q2 2025 Earnings Announcement',
      earningsCallTime: 'AMC',
      epsEstimate: null,
      reportedEps: null,
      surprise: null,
      marketCap: '365.06B'
    },
    {
      symbol: 'MELI',
      company: 'MercadoLibre, Inc.',
      eventName: 'Q2 2025 Earnings Announcement',
      earningsCallTime: 'AMC',
      epsEstimate: null,
      reportedEps: null,
      surprise: null,
      marketCap: '121.34B'
    },
    {
      symbol: 'VRTX',
      company: 'Vertex Pharmaceuticals Incorporated',
      eventName: 'Q2 2025 Earnings Announcement',
      earningsCallTime: 'AMC',
      epsEstimate: null,
      reportedEps: null,
      surprise: null,
      marketCap: null
    },
    {
      symbol: 'WMB',
      company: 'The Williams Companies, Inc.',
      eventName: 'Q2 2025 Earnings Announcement',
      earningsCallTime: 'AMC',
      epsEstimate: null,
      reportedEps: null,
      surprise: null,
      marketCap: null
    },
    {
      symbol: 'SPG',
      company: 'Simon Property Group, Inc.',
      eventName: 'Q2 2025 Earnings Announcement',
      earningsCallTime: 'AMC',
      epsEstimate: null,
      reportedEps: null,
      surprise: null,
      marketCap: null
    },
    {
      symbol: 'AXON',
      company: 'Axon Enterprise, Inc.',
      eventName: 'Q2 2025 Earnings Announcement',
      earningsCallTime: 'AMC',
      epsEstimate: null,
      reportedEps: null,
      surprise: null,
      marketCap: null
    },
    {
      symbol: 'OKE',
      company: 'ONEOK, Inc.',
      eventName: 'Q2 2025 Earnings Announcement',
      earningsCallTime: 'AMC',
      epsEstimate: null,
      reportedEps: null,
      surprise: null,
      marketCap: null
    },
    {
      symbol: 'FANG',
      company: 'Diamondback Energy, Inc.',
      eventName: 'Q2 2025 Earnings Announcement',
      earningsCallTime: 'AMC',
      epsEstimate: null,
      reportedEps: null,
      surprise: null,
      marketCap: null
    }
  ];

  return testData;
}

/**
 * Získa earnings kalendár z Yahoo Finance pre daný dátum (web scraping)
 */
async function fetchYahooFinanceEarnings(date: string): Promise<YahooEarningsResponse> {
  try {
    // Pre testovanie použijeme manuálne dáta
    if (date === '2025-08-04') {
      console.log(`📡 Using manual test data for ${date}`);
      const testData = getManualTestData(date);
      return {
        earnings: testData,
        totalFound: testData.length,
        date
      };
    }

    // Yahoo Finance earnings calendar URL
    // Yahoo Finance používa URL ako: https://finance.yahoo.com/calendar/earnings?day=2025-08-04
    const url = `https://finance.yahoo.com/calendar/earnings?day=${date}`;

    console.log(`📡 Fetching Yahoo Finance earnings from: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance web scraping error: ${response.status}`);
    }

    const html = await response.text();

    // Parse HTML a extrahuj earnings data
    const earnings = parseYahooFinanceHTML(html, date);

    return {
      earnings,
      totalFound: earnings.length,
      date
    };

  } catch (error) {
    console.error('❌ Error fetching Yahoo Finance earnings:', error);
    throw error;
  }
}

/**
 * Parsuje Yahoo Finance HTML a extrahuje earnings data
 */
function parseYahooFinanceHTML(html: string, date: string): YahooEarningsItem[] {
  try {
    const earnings: YahooEarningsItem[] = [];

    // Hľadáme tabuľku s earnings dátami
    // Yahoo Finance používa React komponenty, takže data sú v JSON formáte v HTML

    // Skúsime nájsť JSON data v HTML
    const jsonMatches = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/);
    if (jsonMatches && jsonMatches[1]) {
      try {
        const initialState = JSON.parse(jsonMatches[1]);
        console.log('✅ Found initial state in HTML');

        // Hľadáme earnings data v initial state
        const earningsData = extractEarningsFromInitialState(initialState);
        if (earningsData.length > 0) {
          return earningsData;
        }
      } catch (parseError) {
        console.log('⚠️ Could not parse initial state JSON');
      }
    }

    // Fallback: skúsime nájsť earnings data v iných častiach HTML
    const earningsMatches = html.match(/"earningsCalendar":\s*(\[.*?\])/);
    if (earningsMatches && earningsMatches[1]) {
      try {
        const earningsArray = JSON.parse(earningsMatches[1]);
        console.log(`📊 Found ${earningsArray.length} earnings in HTML`);

        for (const item of earningsArray) {
          if (item.symbol) {
            earnings.push({
              symbol: item.symbol,
              company: item.company || item.shortName || '',
              eventName: item.eventName || 'Earnings Announcement',
              earningsCallTime: item.earningsCallTime || item.time || 'AMC',
              epsEstimate: item.epsEstimate || null,
              reportedEps: item.reportedEps || item.epsActual || null,
              surprise: item.surprise || null,
              marketCap: item.marketCap || null
            });
          }
        }
      } catch (parseError) {
        console.log('⚠️ Could not parse earnings data from HTML');
      }
    }

    console.log(`📊 Parsed ${earnings.length} earnings from Yahoo Finance HTML`);
    return earnings;

  } catch (error) {
    console.error('❌ Error parsing Yahoo Finance HTML:', error);
    return [];
  }
}

/**
 * Extrahuje earnings data z initial state
 */
function extractEarningsFromInitialState(state: any): YahooEarningsItem[] {
  const earnings: YahooEarningsItem[] = [];

  try {
    // Hľadáme earnings data v rôznych častiach initial state
    const possiblePaths = [
      'earningsCalendar',
      'calendar.earnings',
      'earnings',
      'data.earningsCalendar',
      'calendar.data.earnings'
    ];

    for (const path of possiblePaths) {
      const data = getNestedValue(state, path);
      if (data && Array.isArray(data)) {
        console.log(`✅ Found earnings data at path: ${path}`);

        for (const item of data) {
          if (item.symbol) {
            earnings.push({
              symbol: item.symbol,
              company: item.company || item.shortName || '',
              eventName: item.eventName || 'Earnings Announcement',
              earningsCallTime: item.earningsCallTime || item.time || 'AMC',
              epsEstimate: item.epsEstimate || null,
              reportedEps: item.reportedEps || item.epsActual || null,
              surprise: item.surprise || null,
              marketCap: item.marketCap || null
            });
          }
        }
        break;
      }
    }

  } catch (error) {
    console.error('❌ Error extracting earnings from initial state:', error);
  }

  return earnings;
}

/**
 * Pomocná funkcia pre získanie nested hodnoty z objektu
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Kontroluje, ktoré z našich tickerov majú earnings v daný deň (Yahoo Finance)
 */
export async function checkYahooFinanceEarningsForOurTickers(date: string, project: string = 'pmp'): Promise<ProcessedEarnings> {
  try {
    console.log(`🔍 Checking Yahoo Finance earnings for ${date}...`);

    // Získaj naše tickery
    const ourTickers = getProjectTickers(project);
    console.log(`📊 Our tickers count: ${ourTickers.length}`);

    // Získaj earnings kalendár z Yahoo Finance
    const earningsData = await fetchYahooFinanceEarnings(date);
    console.log(`📅 Total earnings in Yahoo Finance: ${earningsData.totalFound}`);

    // Debug: vypíš prvých 10 tickerov z Yahoo Finance
    const firstTickers = earningsData.earnings.slice(0, 10).map(e => e.symbol);
    console.log(`🔍 First 10 tickers from Yahoo Finance:`, firstTickers);

    // Filtruj len naše tickery
    const ourEarnings = earningsData.earnings.filter(
      earning => ourTickers.includes(earning.symbol)
    );

    console.log(`✅ Found ${ourEarnings.length} earnings for our tickers`);

    // Rozdeľ podľa času reportovania
    const preMarket: string[] = [];
    const afterMarket: string[] = [];
    const items: EarningsItemFull[] = [];

    for (const earning of ourEarnings) {
      const rawTime = earning.earningsCallTime?.toUpperCase() || 'AMC';
      const normalizedTime = rawTime === 'BMO' || rawTime === 'BEFORE MARKET OPEN' ? 'bmo'
        : rawTime === 'DMT' ? 'dmt' : 'amc';
      if (normalizedTime === 'bmo') {
        preMarket.push(earning.symbol);
      } else {
        afterMarket.push(earning.symbol);
      }
      items.push({
        ticker: earning.symbol,
        companyName: earning.company || earning.symbol,
        time: normalizedTime,
        epsEstimate: earning.epsEstimate ?? null,
        epsActual: earning.reportedEps ?? null,
        revenueEstimate: null, // Yahoo scraper doesn't extract revenue
        revenueActual: null,
        surprise: earning.surprise ?? null,
        surprisePercent: null, // Yahoo scraper doesn't extract surprise %
      });
    }

    const result: ProcessedEarnings = {
      preMarket,
      afterMarket,
      totalFound: ourEarnings.length,
      date,
      items
    };

    console.log(`📊 Yahoo Finance earnings breakdown for ${date}:`, {
      preMarket: preMarket.length,
      afterMarket: afterMarket.length,
      total: ourEarnings.length,
      preMarketTickers: preMarket,
      afterMarketTickers: afterMarket
    });

    return result;

  } catch (error) {
    console.error('❌ Error checking Yahoo Finance earnings for our tickers:', error);
    throw error;
  }
}

/**
 * Kombinovaná funkcia - skúsi Yahoo Finance, ak zlyhá, použije Finnhub
 */
export async function checkEarningsForOurTickers(date: string, project: string = 'pmp'): Promise<ProcessedEarnings> {
  try {
    console.log(`🔍 Checking earnings for ${date} (Yahoo Finance + Finnhub fallback)...`);

    // Skús Yahoo Finance najprv
    try {
      const yahooResult = await checkYahooFinanceEarningsForOurTickers(date, project);
      if (yahooResult.totalFound > 0) {
        console.log(`✅ Yahoo Finance found ${yahooResult.totalFound} earnings`);
        return yahooResult;
      }
      console.log(`⚠️ Yahoo Finance found 0 earnings, trying Finnhub fallback...`);
    } catch (error) {
      console.log(`⚠️ Yahoo Finance failed, trying Finnhub...`);
    }

    // Fallback na Finnhub
    const { checkEarningsForOurTickers: checkFinnhub } = await import('../earningsMonitor');
    const finnhubResult = await checkFinnhub(date, project);
    console.log(`✅ Finnhub found ${finnhubResult.totalFound} earnings`);
    return finnhubResult;

  } catch (error) {
    console.error('❌ Error checking earnings for our tickers:', error);
    throw error;
  }
} 