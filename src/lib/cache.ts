import { getCachedData, setCachedData, getCacheStatus, setCacheStatus, CACHE_KEYS } from './redis';
import { dbHelpers, runTransaction, initializeDatabase } from './database';
import { createBackgroundService } from './backgroundService';
import { recordCacheHit, recordCacheMiss, recordApiCall } from './prometheus';
import { 
  getSharesOutstanding, 
  computeMarketCap, 
  computeMarketCapDiff, 
  getCurrentPrice, 
  getPreviousClose, 
  validatePriceChange,
  computePercentChange,
  logCalculationData,
  getMarketStatus
} from './marketCapUtils';

// Market session detection utility
function getMarketSession(): 'pre-market' | 'market' | 'after-hours' | 'closed' {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const hour = easternTime.getHours();
  const minute = easternTime.getMinutes();
  const day = easternTime.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Weekend check - show after-hours from Friday close until Monday pre-market
  if (day === 0 || day === 6) return 'after-hours'; // Sunday or Saturday
  if (day === 1 && hour < 4) return 'after-hours'; // Monday before 4 AM
  
  // Weekday sessions (Eastern Time)
  if (hour < 4) return 'closed';
  if (hour < 9 || (hour === 9 && minute < 30)) return 'pre-market';
  if (hour < 16) return 'market';
  if (hour < 20) return 'after-hours';
  return 'closed';
}

interface CachedStockData {
  ticker: string;
  currentPrice: number;  // Renamed from preMarketPrice - works for all sessions
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  lastUpdated: Date;
}

class StockDataCache {
  private cache: Map<string, CachedStockData> = new Map();
  private isUpdating = false;
  private updateInterval: NodeJS.Timeout | null = null;

  // Top 200 US companies by market cap
  private readonly TICKERS = [
    'NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOGL', 'GOOG', 'META', 'AVGO', 'BRK.A', 'BRK.B', 'TSLA',
    'JPM', 'WMT', 'LLY', 'ORCL', 'V', 'MA', 'NFLX', 'XOM', 'COST', 'JNJ', 'HD', 'PLTR',
    'PG', 'BAC', 'ABBV', 'CVX', 'KO', 'AMD', 'GE', 'CSCO', 'TMUS', 'WFC', 'CRM',
    'PM', 'IBM', 'UNH', 'MS', 'GS', 'INTU', 'LIN', 'ABT', 'AXP', 'BX', 'DIS', 'MCD',
    'RTX', 'NOW', 'MRK', 'CAT', 'T', 'PEP', 'UBER', 'BKNG', 'TMO', 'VZ', 'SCHW', 'ISRG',
    'QCOM', 'C', 'TXN', 'BA', 'BLK', 'ACN', 'SPGI', 'AMGN', 'ADBE', 'BSX', 'SYK',
    'ETN', 'AMAT', 'ANET', 'NEE', 'DHR', 'HON', 'TJX', 'PGR', 'GILD', 'DE', 'PFE', 'COF',
    'KKR', 'PANW', 'UNP', 'APH', 'LOW', 'LRCX', 'MU', 'ADP', 'CMCSA', 'COP', 'KLAC',
    'VRTX', 'MDT', 'SNPS', 'NKE', 'CRWD', 'ADI', 'WELL', 'CB', 'ICE', 'SBUX', 'TT',
    'SO', 'CEG', 'PLD', 'DASH', 'AMT', 'MO', 'MMC', 'CME', 'CDNS', 'LMT', 'BMY', 'WM',
    'PH', 'COIN', 'DUK', 'RCL', 'MCO', 'MDLZ', 'DELL', 'TDG', 'CTAS', 'INTC', 'MCK',
    'ABNB', 'GD', 'ORLY', 'APO', 'SHW', 'HCA', 'EMR', 'NOC', 'MMM', 'FTNT', 'EQIX',
    'CI', 'UPS', 'FI', 'HWM', 'AON', 'PNC', 'CVS', 'RSG', 'AJG', 'ITW', 'MAR', 'ECL',
    'MSI', 'USB', 'WMB', 'BK', 'CL', 'NEM', 'PYPL', 'JCI', 'ZTS', 'VST', 'EOG', 'CSX',
    'ELV', 'ADSK', 'APD', 'AZO', 'HLT', 'WDAY', 'SPG', 'NSC', 'KMI', 'TEL', 'FCX',
    'CARR', 'PWR', 'REGN', 'ROP', 'CMG', 'DLR', 'MNST', 'TFC', 'TRV', 'AEP', 'NXPI',
    'AXON', 'URI', 'COR', 'FDX', 'NDAQ', 'AFL', 'GLW', 'FAST', 'MPC', 'SLB', 'SRE',
    'PAYX', 'PCAR', 'MET', 'BDX', 'OKE', 'DDOG',
    // International companies
    'TSM', 'SAP', 'ASML', 'BABA', 'TM', 'AZN', 'HSBC', 'NVS', 'SHEL',
    'HDB', 'RY', 'NVO', 'ARM', 'SHOP', 'MUFG', 'PDD', 'UL',
    'SONY', 'TTE', 'BHP', 'SAN', 'TD', 'SPOT', 'UBS', 'IBN', 'SNY',
    'BUD', 'BTI', 'BN', 'SMFG', 'ENB', 'RELX', 'TRI', 'RACE',
    'BBVA', 'SE', 'BP', 'NTES', 'BMO', 'RIO', 'GSK', 'MFG', 'INFY',
    'CP', 'BCS', 'NGG', 'BNS', 'ING', 'EQNR', 'CM', 'CNQ', 'LYG',
    'AEM', 'DB', 'NU', 'CNI', 'DEO', 'NWG', 'AMX', 'MFC',
    'E', 'WCN', 'SU', 'TRP', 'PBR', 'HMC', 'GRMN', 'CCEP', 'ALC', 'TAK'
  ];

  // Company names mapping
  private readonly companyNames: Record<string, string> = {
    'NVDA': 'NVIDIA', 'MSFT': 'Microsoft', 'AAPL': 'Apple', 'AMZN': 'Amazon', 'GOOGL': 'Alphabet', 'GOOG': 'Alphabet',
    'META': 'Meta Platforms', 'AVGO': 'Broadcom', 'BRK.A': 'Berkshire Hathaway', 'BRK.B': 'Berkshire Hathaway', 'TSLA': 'Tesla',
    'JPM': 'JPMorgan Chase', 'WMT': 'Walmart', 'LLY': 'Eli Lilly', 'ORCL': 'Oracle', 'V': 'Visa', 'MA': 'Mastercard',
    'NFLX': 'Netflix', 'XOM': 'Exxon Mobil', 'COST': 'Costco', 'JNJ': 'Johnson & Johnson', 'HD': 'Home Depot', 'PLTR': 'Palantir',
    'PG': 'Procter & Gamble', 'BAC': 'Bank of America', 'ABBV': 'AbbVie', 'CVX': 'Chevron', 'KO': 'Coca-Cola', 'AMD': 'Advanced Micro Devices',
    'GE': 'General Electric', 'CSCO': 'Cisco Systems', 'TMUS': 'T-Mobile US', 'WFC': 'Wells Fargo', 'CRM': 'Salesforce', 'PM': 'Philip Morris',
    'IBM': 'IBM', 'UNH': 'UnitedHealth Group', 'MS': 'Morgan Stanley', 'GS': 'Goldman Sachs', 'INTU': 'Intuit', 'LIN': 'Linde',
    'ABT': 'Abbott Laboratories', 'AXP': 'American Express', 'BX': 'Blackstone', 'DIS': 'Walt Disney', 'MCD': 'McDonald\'s', 'RTX': 'Raytheon Technologies',
    'NOW': 'ServiceNow', 'MRK': 'Merck', 'CAT': 'Caterpillar', 'T': 'AT&T', 'PEP': 'PepsiCo', 'UBER': 'Uber Technologies',
    'BKNG': 'Booking Holdings', 'TMO': 'Thermo Fisher Scientific', 'VZ': 'Verizon', 'SCHW': 'Charles Schwab', 'ISRG': 'Intuitive Surgical', 'QCOM': 'Qualcomm',
    'C': 'Citigroup', 'TXN': 'Texas Instruments', 'BA': 'Boeing', 'BLK': 'BlackRock', 'ACN': 'Accenture', 'SPGI': 'S&P Global',
    'AMGN': 'Amgen', 'ADBE': 'Adobe', 'BSX': 'Boston Scientific', 'SYK': 'Stryker', 'ETN': 'Eaton', 'AMAT': 'Applied Materials',
    'ANET': 'Arista Networks', 'NEE': 'NextEra Energy', 'DHR': 'Danaher', 'HON': 'Honeywell', 'TJX': 'TJX Companies', 'PGR': 'Progressive',
    'GILD': 'Gilead Sciences', 'DE': 'Deere & Company', 'PFE': 'Pfizer', 'COF': 'Capital One', 'KKR': 'KKR & Co', 'PANW': 'Palo Alto Networks',
    'UNP': 'Union Pacific', 'APH': 'Amphenol', 'LOW': 'Lowe\'s', 'LRCX': 'Lam Research', 'MU': 'Micron Technology', 'ADP': 'Automatic Data Processing',
    'CMCSA': 'Comcast', 'COP': 'ConocoPhillips', 'KLAC': 'KLA Corporation', 'VRTX': 'Vertex Pharmaceuticals', 'MDT': 'Medtronic', 'SNPS': 'Synopsys',
    'NKE': 'Nike', 'CRWD': 'CrowdStrike', 'ADI': 'Analog Devices', 'WELL': 'Welltower', 'CB': 'Chubb', 'ICE': 'Intercontinental Exchange',
    'SBUX': 'Starbucks', 'TT': 'Trane Technologies', 'SO': 'Southern Company', 'CEG': 'Constellation Energy', 'PLD': 'Prologis', 'DASH': 'DoorDash',
    'AMT': 'American Tower', 'MO': 'Altria Group', 'MMC': 'Marsh & McLennan', 'CME': 'CME Group', 'CDNS': 'Cadence Design Systems', 'LMT': 'Lockheed Martin',
    'BMY': 'Bristol-Myers Squibb', 'WM': 'Waste Management', 'PH': 'Parker-Hannifin', 'COIN': 'Coinbase Global', 'DUK': 'Duke Energy', 'RCL': 'Royal Caribbean',
    'MCO': 'Moody\'s', 'MDLZ': 'Mondelez International', 'DELL': 'Dell Technologies', 'TDG': 'TransDigm Group', 'CTAS': 'Cintas', 'INTC': 'Intel',
    'MCK': 'McKesson', 'ABNB': 'Airbnb', 'GD': 'General Dynamics', 'ORLY': 'O\'Reilly Automotive', 'APO': 'Apollo Global Management', 'SHW': 'Sherwin-Williams',
    'HCA': 'HCA Healthcare', 'EMR': 'Emerson Electric', 'NOC': 'Northrop Grumman', 'MMM': '3M', 'FTNT': 'Fortinet', 'EQIX': 'Equinix',
    'CI': 'Cigna', 'UPS': 'United Parcel Service', 'FI': 'Fiserv', 'HWM': 'Howmet Aerospace', 'AON': 'Aon', 'PNC': 'PNC Financial Services',
    'CVS': 'CVS Health', 'RSG': 'Republic Services', 'AJG': 'Arthur J. Gallagher', 'ITW': 'Illinois Tool Works', 'MAR': 'Marriott International', 'ECL': 'Ecolab',
    'MSI': 'Motorola Solutions', 'USB': 'U.S. Bancorp', 'WMB': 'Williams Companies', 'BK': 'Bank of New York Mellon', 'CL': 'Colgate-Palmolive', 'NEM': 'Newmont',
    'PYPL': 'PayPal', 'JCI': 'Johnson Controls', 'ZTS': 'Zoetis', 'VST': 'Vistra', 'EOG': 'EOG Resources', 'CSX': 'CSX',
    'ELV': 'Elevance Health', 'ADSK': 'Autodesk', 'APD': 'Air Products and Chemicals', 'AZO': 'AutoZone', 'HLT': 'Hilton Worldwide', 'WDAY': 'Workday',
    'SPG': 'Simon Property Group', 'NSC': 'Norfolk Southern', 'KMI': 'Kinder Morgan', 'TEL': 'TE Connectivity', 'FCX': 'Freeport-McMoRan', 'CARR': 'Carrier Global',
    'PWR': 'Quanta Services', 'REGN': 'Regeneron Pharmaceuticals', 'ROP': 'Roper Technologies', 'CMG': 'Chipotle Mexican Grill', 'DLR': 'Digital Realty Trust', 'MNST': 'Monster Beverage',
    'TFC': 'Truist Financial', 'TRV': 'Travelers Companies', 'AEP': 'American Electric Power', 'NXPI': 'NXP Semiconductors', 'AXON': 'Axon Enterprise', 'URI': 'United Rentals',
    'COR': 'Cencora', 'FDX': 'FedEx', 'NDAQ': 'Nasdaq', 'AFL': 'Aflac', 'GLW': 'Corning', 'FAST': 'Fastenal',
    'MPC': 'Marathon Petroleum', 'SLB': 'Schlumberger', 'SRE': 'Sempra Energy', 'PAYX': 'Paychex', 'PCAR': 'PACCAR', 'MET': 'MetLife',
    'BDX': 'Becton Dickinson', 'OKE': 'ONEOK', 'DDOG': 'Datadog',
    // International companies
    'TSM': 'Taiwan Semiconductor', 'SAP': 'SAP SE', 'ASML': 'ASML Holding', 'BABA': 'Alibaba Group', 'TM': 'Toyota Motor', 'AZN': 'AstraZeneca',
    'HSBC': 'HSBC Holdings', 'NVS': 'Novartis', 'SHEL': 'Shell', 'HDB': 'HDFC Bank', 'RY': 'Royal Bank of Canada', 'NVO': 'Novo Nordisk',
    'ARM': 'ARM Holdings', 'SHOP': 'Shopify', 'MUFG': 'Mitsubishi UFJ Financial', 'PDD': 'Pinduoduo', 'UL': 'Unilever', 'SONY': 'Sony Group',
    'TTE': 'TotalEnergies', 'BHP': 'BHP Group', 'SAN': 'Banco Santander', 'TD': 'Toronto-Dominion Bank', 'SPOT': 'Spotify Technology', 'UBS': 'UBS Group',
    'IBN': 'ICICI Bank', 'SNY': 'Sanofi', 'BUD': 'Anheuser-Busch InBev', 'BTI': 'British American Tobacco', 'BN': 'Danone', 'SMFG': 'Sumitomo Mitsui Financial',
    'ENB': 'Enbridge', 'RELX': 'RELX Group', 'TRI': 'Thomson Reuters', 'RACE': 'Ferrari', 'BBVA': 'Banco Bilbao Vizcaya', 'SE': 'Sea Limited',
    'BP': 'BP', 'NTES': 'NetEase', 'BMO': 'Bank of Montreal', 'RIO': 'Rio Tinto', 'GSK': 'GlaxoSmithKline', 'MFG': 'Mizuho Financial',
    'INFY': 'Infosys', 'CP': 'Canadian Pacific Railway', 'BCS': 'Barclays', 'NGG': 'National Grid', 'BNS': 'Bank of Nova Scotia', 'ING': 'ING Group',
    'EQNR': 'Equinor', 'CM': 'Canadian Imperial Bank', 'CNQ': 'Canadian Natural Resources', 'LYG': 'Lloyds Banking Group', 'AEM': 'Agnico Eagle Mines', 'DB': 'Deutsche Bank',
    'NU': 'Nu Holdings', 'CNI': 'Canadian National Railway', 'DEO': 'Diageo', 'NWG': 'NatWest Group', 'AMX': 'America Movil', 'MFC': 'Manulife Financial',
    'E': 'Eni', 'WCN': 'Waste Connections', 'SU': 'Suncor Energy', 'TRP': 'TC Energy', 'PBR': 'Petrobras', 'HMC': 'Honda Motor',
    'GRMN': 'Garmin', 'CCEP': 'Coca-Cola Europacific Partners', 'ALC': 'Alcon', 'TAK': 'Takeda Pharmaceutical'
  };

  // Share counts are now fetched dynamically from Polygon API
  // See marketCapUtils.ts for implementation

  constructor() {
    // Initialize database
    initializeDatabase();
    
    // Initialize background service
    const backgroundService = createBackgroundService(this);
    
    // Start background service
    backgroundService.start().catch(console.error);
    
    // Initialize with demo data immediately
    this.initializeWithDemoData();
    
    this.startBackgroundUpdates();
  }

  async updateCache(): Promise<void> {
    if (this.isUpdating) {
      console.log('Update already in progress, skipping...');
      return;
    }

    this.isUpdating = true;
    console.log('Starting cache update...');

    try {
                           // Hardcoded API key for reliability (avoids .env.local issues)
        const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
        console.log('API Key loaded:', apiKey ? 'Yes' : 'No');
             const batchSize = 15; // Reduced batch size for better reliability
       let results: CachedStockData[] = [];

               // Test first API call to see exact error
        console.log('🔍 Testing API call for first ticker...');
        const testUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/NVDA?apikey=${apiKey}`;
        const testResponse = await fetch(testUrl);
        console.log('Test response status:', testResponse.status);
        if (!testResponse.ok) {
          const testErrorBody = await testResponse.text();
          console.error('❌ Test API call failed:', {
            status: testResponse.status,
            body: testErrorBody,
            url: testUrl,
          });
          
          console.error('Polygon API test failed:', {
            status: testResponse.status,
            statusText: testResponse.statusText,
            body: testErrorBody,
            url: testUrl,
          });
          
          recordApiCall('polygon', 'snapshot', 'error');
        } else {
          console.log('✅ Test API call successful');
          const testData = await testResponse.json();
          console.log('Test data structure:', JSON.stringify(testData, null, 2));
          recordApiCall('polygon', 'snapshot', 'success');
        }

       // Process tickers in parallel groups with smart throttling
       const parallelGroups = 4; // Number of parallel Promise.allSettled groups
       const groupSize = Math.ceil(this.TICKERS.length / parallelGroups);
       
       for (let groupIndex = 0; groupIndex < parallelGroups; groupIndex++) {
         const groupStart = groupIndex * groupSize;
         const groupEnd = Math.min(groupStart + groupSize, this.TICKERS.length);
         const groupTickers = this.TICKERS.slice(groupStart, groupEnd);
         
         console.log(`🚀 Processing group ${groupIndex + 1}/${parallelGroups} (${groupTickers.length} tickers)`);
         
         // Add delay between groups to respect rate limits
         if (groupIndex > 0) {
           console.log(`⏳ Rate limiting: waiting 250ms between groups...`);
           await new Promise(resolve => setTimeout(resolve, 250));
         }
         
         // Process group in smaller batches
         for (let i = 0; i < groupTickers.length; i += batchSize) {
           const batch = groupTickers.slice(i, i + batchSize);
           
           // Add delay between batches within group
           if (i > 0) {
             console.log(`⏳ Rate limiting: waiting 200ms between batches...`);
             await new Promise(resolve => setTimeout(resolve, 200));
           }
        
        const batchPromises = batch.map(async (ticker) => {
          try {
            // Helper function for retry logic
            const fetchWithRetry = async (url: string, options: any = {}) => {
              const maxRetries = 3;
              let lastError: any;
              
              for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                  console.log(`🔍 Fetching ${ticker} (attempt ${attempt}/${maxRetries})`);
                  
                  const response = await fetch(url, {
                    ...options,
                    signal: AbortSignal.timeout(30000) // 30 second timeout for Vercel
                  });
                  
                  if (response.ok) {
                    return response;
                  }
                  
                  // If not OK, throw error to trigger retry
                  const errorBody = await response.text();
                  throw new Error(`HTTP ${response.status}: ${errorBody}`);
                  
                } catch (error) {
                  lastError = error;
                  console.warn(`⚠️ Attempt ${attempt} failed for ${ticker}:`, error);
                  
                  if (attempt < maxRetries) {
                    // Wait before retry (exponential backoff)
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.log(`⏳ Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                  }
                }
              }
              
              throw lastError;
            };
            
                        // Get shares outstanding from Polygon API with caching
            const shares = await getSharesOutstanding(ticker);
            
            // Get previous close from Polygon aggregates with adjusted=true
            const prevClose = await getPreviousClose(ticker);
            
            // Get current price using modern snapshot API (includes pre-market, after-hours)
            const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
            const snapshotResponse = await fetchWithRetry(snapshotUrl);

            if (!snapshotResponse.ok) {
              const errorBody = await snapshotResponse.text();
              console.error(`❌ Polygon API failed for ${ticker} (snapshot):`, {
                status: snapshotResponse.status,
                body: errorBody,
                url: snapshotUrl,
              });
              return null;
            }

            const snapshotData = await snapshotResponse.json();
            console.log(`📊 Snapshot data for ${ticker}:`, JSON.stringify(snapshotData, null, 2));
            
            // Validate snapshot status
            if (snapshotData.status !== 'OK') {
              console.warn(`❌ Invalid snapshot status for ${ticker}: ${snapshotData.status}`);
              return null;
            }

            // Get current price using consistent source
            const currentPrice = getCurrentPrice(snapshotData);
            
            // Enhanced validation - check for null/undefined/zero prices
            if (!currentPrice || currentPrice === 0 || !isFinite(currentPrice)) {
              console.error(`⚠️ Invalid currentPrice for ${ticker}:`, currentPrice);
              console.error(`📊 Snapshot data:`, JSON.stringify(snapshotData, null, 2));
              return null;
            }
            
            // Additional validation - check for reasonable price range
            if (currentPrice < 0.01 || currentPrice > 1000000) {
              console.error(`⚠️ Price out of reasonable range for ${ticker}: $${currentPrice}`);
              return null;
            }
            
            // Validate price data for extreme changes
            validatePriceChange(currentPrice, prevClose);
            
            // Get market session - use Polygon's snapshot type if available, otherwise fallback to time-based
            let marketSession = getMarketSession(); // Fallback
            let sessionLabel = 'Regular';
            
            // Use Polygon's snapshot type for more accurate session detection
            if (snapshotData.ticker?.type) {
              switch (snapshotData.ticker.type) {
                case 'pre':
                  marketSession = 'pre-market';
                  sessionLabel = 'Pre-Market';
                  break;
                case 'post':
                  marketSession = 'after-hours';
                  sessionLabel = 'After-Hours';
                  break;
                case 'regular':
                  marketSession = 'market';
                  sessionLabel = 'Market';
                  break;
                default:
                  sessionLabel = 'Closed';
              }
            }
            
            // Reference price already determined above using single-source-of-truth approach
            
            // If no Polygon session type, determine session label based on data availability
            if (!snapshotData.ticker?.type) {
              if (snapshotData.ticker?.min?.c && snapshotData.ticker.min.c > 0) {
                // We have real-time minute data
                switch (marketSession) {
                  case 'pre-market':
                    sessionLabel = 'Pre-Market';
                    break;
                  case 'market':
                    sessionLabel = 'Market';
                    break;
                  case 'after-hours':
                    sessionLabel = 'After-Hours';
                    break;
                  default:
                    sessionLabel = 'Live';
                }
              } else if (snapshotData.ticker?.day?.c && snapshotData.ticker.day.c > 0) {
                sessionLabel = 'Market Close';
              } else {
                sessionLabel = 'Previous Close';
              }
            }
            
            // Edge case protection
            
            // 1. Check for negative prices (penny stock glitches)
            if (prevClose < 0.01) {
              console.warn(`⚠️ Suspiciously low previous close for ${ticker}: $${prevClose}, skipping`);
              return null;
            }
            
            // 2. Check for trading halts (stale lastTrade timestamp)
            if (snapshotData.ticker?.lastTrade?.t) {
              const tradeAgeMs = Date.now() - (snapshotData.ticker.lastTrade.t / 1000000); // Convert nanoseconds to ms
              if (tradeAgeMs > 120000 && snapshotData.ticker.type === 'regular') { // 2 minutes old during market hours
                console.warn(`⚠️ Possible trading halt for ${ticker}: last trade ${Math.round(tradeAgeMs/1000)}s ago`);
                // Continue processing but mark in logs
              }
            }
            
            // Calculate percent change using Decimal.js for precision
            const percentChange = computePercentChange(currentPrice, prevClose);
            
            // 3. Check for extreme percentage changes (possible stock splits)
            if (Math.abs(percentChange) > 40) {
              console.warn(`⚠️ Extreme price change for ${ticker}: ${percentChange.toFixed(2)}% - possible stock split or data error`);
              // Continue processing but log warning
            }
            
            console.log(`📊 ${sessionLabel} session for ${ticker}: $${currentPrice} vs ref $${prevClose} (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%)`);
            
            // Get market status for reference
            const marketStatus = await getMarketStatus();
            console.log(`📈 Market status: ${marketStatus.market} (${marketStatus.serverTime})`);
            
            // Calculate market cap and diff using centralized utilities with Decimal.js precision
            const finalMarketCap = computeMarketCap(currentPrice, shares);
            const marketCapDiff = computeMarketCapDiff(currentPrice, prevClose, shares);
            
            // Log detailed calculation data for debugging
            logCalculationData(ticker, currentPrice, prevClose, shares, finalMarketCap, marketCapDiff, percentChange);

            const stockData = {
              ticker,
              currentPrice: Math.round(currentPrice * 100) / 100,  // Renamed from preMarketPrice
              closePrice: Math.round(prevClose * 100) / 100,
              percentChange: Math.round(percentChange * 100) / 100,
              marketCapDiff: Math.round(marketCapDiff * 100) / 100,
              marketCap: Math.round(finalMarketCap * 100) / 100,
              lastUpdated: new Date()
            };

            console.log(`✅ Successfully fetched data for ${ticker}: $${currentPrice} (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%)`);

            // Save to database
            try {
              const companyName = this.companyNames[ticker] || ticker;
              const shareCount = shares;
              
              runTransaction(() => {
                // Update stock info
                dbHelpers.upsertStock.run(
                  ticker,
                  companyName,
                  finalMarketCap * 1_000_000_000, // Convert back to actual market cap
                  shareCount,
                  new Date().toISOString()
                );

                                 // Add price history with session info
                 dbHelpers.addPriceHistory.run(
                   ticker,
                   currentPrice,
                   snapshotData.ticker?.day?.v || 0, // Volume from snapshot
                  new Date().toISOString()
                );
              });
            } catch (dbError) {
              console.error(`Database error for ${ticker}:`, dbError);
              console.error('Database error for', ticker, ':', dbError);
            }

            return stockData;

          } catch (error) {
            console.error(`Error processing ${ticker}:`, error);
            console.error('Error processing stock', ticker, ':', error);
            return null;
          }
        });

           const batchResults = await Promise.allSettled(batchPromises);
           
           // Process settled results
           batchResults.forEach((result, index) => {
             if (result.status === 'fulfilled' && result.value) {
               results.push(result.value);
             } else if (result.status === 'rejected') {
               console.error(`❌ Failed to process ${batch[index]}:`, result.reason);
             }
           });
         }
       }

      // Update in-memory cache
      this.cache.clear();
      results.forEach(stock => {
        this.cache.set(stock.ticker, stock);
      });

      // Validate results completeness
      const successRate = (results.length / this.TICKERS.length) * 100;
      const isPartial = successRate < 90;
      
      if (isPartial) {
        console.warn(`⚠️ Partial update: only ${results.length}/${this.TICKERS.length} stocks (${successRate.toFixed(1)}%) processed successfully`);
      }
      
      // If no results at all, use demo data as fallback
      if (results.length === 0) {
        console.warn('⚠️ No API data received, using demo data as fallback');
        results = this.getDemoData();
      }

      // Update Redis cache
      try {
        await setCachedData(CACHE_KEYS.STOCK_DATA, results);
        await setCacheStatus({
          count: results.length,
          lastUpdated: new Date(),
          isUpdating: false,
          isPartial: isPartial
        });
        console.log(`✅ Redis cache updated with ${results.length} stocks at ${new Date().toISOString()}`);
      } catch (error) {
        console.error('Failed to update Redis cache:', error);
      }

      console.log(`Cache updated with ${results.length} stocks at ${new Date().toISOString()}`);

    } catch (error) {
      console.error('Cache update failed:', error);
      console.error('Cache update failed:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  startBackgroundUpdates(): void {
    // Update every 2 minutes (optimal balance: performance + cost)
    this.updateInterval = setInterval(() => {
      // Only update if we don't have real data yet (more than 20 stocks)
      this.getCacheStatus().then(status => {
        if (status.count <= 20) {
          console.log('🔄 Background update: cache has demo data, updating...');
          this.updateCache();
        } else {
          console.log('✅ Background update: cache has real data, skipping...');
        }
      });
    }, 2 * 60 * 1000);

    // Initial update
    this.updateCache();
  }

  stopBackgroundUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  async getAllStocks(): Promise<CachedStockData[]> {
    try {
      // Try to get from Redis first
      const cachedData = await getCachedData(CACHE_KEYS.STOCK_DATA);
      if (cachedData) {
        recordCacheHit('redis');
        return cachedData.sort((a: CachedStockData, b: CachedStockData) => b.marketCap - a.marketCap);
      }
      
      recordCacheMiss('redis');
      // Fallback to in-memory cache
      return Array.from(this.cache.values()).sort((a, b) => b.marketCap - a.marketCap);
    } catch (error) {
      console.error('Error getting cached data:', error);
      console.error('Error getting cached data:', error);
      recordCacheMiss('redis');
      return Array.from(this.cache.values()).sort((a, b) => b.marketCap - a.marketCap);
    }
  }

  getStock(ticker: string): CachedStockData | null {
    return this.cache.get(ticker) || null;
  }

  getCompanyName(ticker: string): string {
    return this.companyNames[ticker] || ticker;
  }

  private initializeWithDemoData(): void {
    console.log('🔄 Initializing cache with demo data...');
    const demoStocks = this.getDemoData();
    
    // Add demo data to in-memory cache
    demoStocks.forEach(stock => {
      this.cache.set(stock.ticker, stock);
    });
    
    console.log(`✅ Cache initialized with ${demoStocks.length} demo stocks`);
  }

  private getDemoData(): CachedStockData[] {
    console.log('🔄 Generating demo data as fallback...');
    const demoStocks: CachedStockData[] = [];
    
    // Create demo data for top 20 stocks
    const demoPrices = [
      { ticker: 'AAPL', price: 150.25, change: 0.85 },
      { ticker: 'MSFT', price: 320.50, change: -1.20 },
      { ticker: 'GOOGL', price: 280.75, change: 2.15 },
      { ticker: 'AMZN', price: 135.80, change: -0.45 },
      { ticker: 'NVDA', price: 450.30, change: 3.25 },
      { ticker: 'TSLA', price: 240.90, change: -2.10 },
      { ticker: 'META', price: 290.45, change: 1.75 },
      { ticker: 'BRK.A', price: 520000, change: 0.50 },
      { ticker: 'JPM', price: 145.60, change: -0.80 },
      { ticker: 'V', price: 245.30, change: 0.95 },
      { ticker: 'WMT', price: 165.40, change: 0.30 },
      { ticker: 'JNJ', price: 155.20, change: -0.60 },
      { ticker: 'PG', price: 145.80, change: 0.25 },
      { ticker: 'HD', price: 320.90, change: 1.45 },
      { ticker: 'MA', price: 380.25, change: -1.15 },
      { ticker: 'UNH', price: 520.75, change: 2.80 },
      { ticker: 'BAC', price: 32.45, change: -0.90 },
      { ticker: 'XOM', price: 95.60, change: 0.75 },
      { ticker: 'PFE', price: 28.90, change: -1.20 },
      { ticker: 'ABBV', price: 145.30, change: 0.85 }
    ];
    
    demoPrices.forEach(({ ticker, price, change }) => {
      const closePrice = price / (1 + change / 100);
      // Use estimated share counts for demo data
      const estimatedShares = 1000000000; // 1B shares as fallback
      const marketCapInBillions = (price * estimatedShares) / 1000000000; // Convert to billions
      
      demoStocks.push({
        ticker,
        currentPrice: Math.round(price * 100) / 100, // Round to 2 decimal places
        closePrice: Math.round(closePrice * 100) / 100, // Round to 2 decimal places
        percentChange: Math.round(change * 100) / 100, // Round to 2 decimal places
        marketCapDiff: Math.round((price - closePrice) * estimatedShares / 1000000000 * 100) / 100, // Round to 2 decimal places
        marketCap: Math.round(marketCapInBillions * 100) / 100, // Store in billions, rounded to 2 decimal places
        lastUpdated: new Date()
      });
    });
    
    console.log(`✅ Generated ${demoStocks.length} demo stocks`);
    return demoStocks;
  }

  async getCacheStatus(): Promise<{ count: number; lastUpdated: Date | null; isUpdating: boolean }> {
    try {
      // Try to get from Redis first
      const cachedStatus = await getCacheStatus();
      if (cachedStatus) {
        return cachedStatus;
      }
      
      // Fallback to in-memory cache
      const stocks = await this.getAllStocks();
      const lastUpdated = stocks.length > 0 ? stocks[0].lastUpdated : null;
      
      return {
        count: stocks.length,
        lastUpdated,
        isUpdating: this.isUpdating
      };
    } catch (error) {
      console.error('Error getting cache status:', error);
      console.error('Error getting cache status:', error);
      return {
        count: 0,
        lastUpdated: null,
        isUpdating: this.isUpdating
      };
    }
  }
}

// Singleton instance
export const stockDataCache = new StockDataCache(); 