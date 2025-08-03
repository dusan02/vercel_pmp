'use client';

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useSortableData, SortKey } from '@/hooks/useSortableData';
import { formatBillions } from '@/lib/format';

import CompanyLogo from '@/components/CompanyLogo';
import { useFavorites } from '@/hooks/useFavorites';
import { Activity } from 'lucide-react';
import EarningsCalendar from '@/components/EarningsCalendar';

interface StockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  lastUpdated?: string;
}

// Using SortKey from useSortableData hook

export default function HomePage() {
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [backgroundStatus, setBackgroundStatus] = useState<{
    isRunning: boolean;
    lastUpdate: string;
    nextUpdate: string;
  } | null>(null);
  
  // Use cookie-based favorites (no authentication needed)
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  // Market session detection
  const getCurrentMarketSession = () => {
    const now = new Date();
    // Get current time in Eastern Time (handles EST/EDT automatically)  
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const hours = easternTime.getHours();
    const minutes = easternTime.getMinutes();
    const currentTimeInMinutes = hours * 60 + minutes;
    const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Check if it's a US market holiday
    const isMarketHoliday = (date: Date): boolean => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // getMonth() is 0-indexed
      const day = date.getDate();
      const dayOfWeek = date.getDay();
      
      // Fixed date holidays
      if (month === 1 && day === 1) return true; // New Year's Day
      if (month === 7 && day === 4) return true; // Independence Day
      if (month === 12 && day === 25) return true; // Christmas Day
      
      // MLK Day - 3rd Monday in January
      if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
      
      // Presidents' Day - 3rd Monday in February  
      if (month === 2 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
      
      // Memorial Day - Last Monday in May
      if (month === 5 && dayOfWeek === 1 && day >= 25) return true;
      
      // Labor Day - 1st Monday in September
      if (month === 9 && dayOfWeek === 1 && day <= 7) return true;
      
      // Thanksgiving - 4th Thursday in November
      if (month === 11 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;
      
      return false;
    };
    
    // Market sessions in minutes from 00:00 ET
    const preMarketStart = 4 * 60; // 4:00 AM
    const marketStart = 9 * 60 + 30; // 9:30 AM  
    const marketEnd = 16 * 60; // 4:00 PM
    const afterHoursEnd = 20 * 60; // 8:00 PM
    const midDay = 12 * 60; // 12:00 PM (noon)
    
    // Check if market is closed (weekends or holidays)
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
    const isHoliday = isMarketHoliday(easternTime);
    
    if (isWeekend || isHoliday) {
      // Market is closed during weekends and holidays
      // From Friday market close until Monday pre-market, show after-hours
      if (dayOfWeek === 0) { // Sunday
        return 'after-hours'; // Whole Sunday is after-hours
      } else if (dayOfWeek === 6) { // Saturday  
        return 'after-hours'; // Whole Saturday is after-hours
      } else if (dayOfWeek === 1 && currentTimeInMinutes < preMarketStart) { // Monday before 4 AM
        return 'after-hours'; // Monday night hours (00:00 - 04:00) are still after-hours
      } else if (currentTimeInMinutes >= preMarketStart && currentTimeInMinutes < afterHoursEnd) {
        return 'after-hours'; // Holiday during trading hours - show after-hours
      } else {
        return 'closed'; // Late night hours
      }
    }
    
    // Regular trading day logic
    if (currentTimeInMinutes >= preMarketStart && currentTimeInMinutes < marketStart) {
      return 'pre-market';
    } else if (currentTimeInMinutes >= marketStart && currentTimeInMinutes < marketEnd) {
      return 'market-hours';
    } else if (currentTimeInMinutes >= marketEnd && currentTimeInMinutes < afterHoursEnd) {
      return 'after-hours';
    } else {
      return 'closed'; // Market is closed
    }
  };

  const [currentSession, setCurrentSession] = useState(getCurrentMarketSession());

  // Update current session every minute
  useEffect(() => {
    const updateSession = () => {
      setCurrentSession(getCurrentMarketSession());
    };
    
    // Update immediately and then every minute
    updateSession();
    const sessionInterval = setInterval(updateSession, 60000); // Every 60 seconds
    
    return () => clearInterval(sessionInterval);
  }, []);

  // Fetch background service status
  useEffect(() => {
    const fetchBackgroundStatus = async () => {
      try {
        const response = await fetch('/api/background/status');
        if (!response.ok) {
          console.log('Background status API not ready yet, will retry...');
          return;
        }
        const data = await response.json();
        if (data.success && data.data.status) {
          setBackgroundStatus(data.data.status);
        }
      } catch (error) {
        console.log('Background status API not ready yet, will retry...', error.message);
      }
    };

    // Start background status check immediately (non-blocking)
    fetchBackgroundStatus();
    const interval = setInterval(fetchBackgroundStatus, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);


  // Mock data for demonstration
  const mockStocks: StockData[] = [
    { ticker: 'NVDA', currentPrice: 176.36, closePrice: 177.87, percentChange: -0.22, marketCapDiff: -9.52, marketCap: 4231 },
    { ticker: 'MSFT', currentPrice: 512.09, closePrice: 533.50, percentChange: -0.08, marketCapDiff: -3.06, marketCap: 3818 },
    { ticker: 'AAPL', currentPrice: 212.14, closePrice: 207.57, percentChange: -0.89, marketCapDiff: -28.60, marketCap: 3194 },
    { ticker: 'AMZN', currentPrice: 231.47, closePrice: 182.31, percentChange: -0.57, marketCapDiff: -14.01, marketCap: 2457 },
    { ticker: 'GOOGL', currentPrice: 195.13, closePrice: 192.63, percentChange: 1.32, marketCapDiff: 14.84, marketCap: 2336 },
    { ticker: 'META', currentPrice: 709.81, closePrice: 717.59, percentChange: -1.09, marketCapDiff: -16.98, marketCap: 1792 },
    { ticker: 'AVGO', currentPrice: 298.67, closePrice: 294.31, percentChange: 1.48, marketCapDiff: 20.55, marketCap: 1365 },
    { ticker: 'BRK.B', currentPrice: 380.40, closePrice: 378.89, percentChange: 0.40, marketCapDiff: 1.6, marketCap: 300 }
  ];

  useEffect(() => {
    // Load cached data immediately for fast page load
    console.log('🚀 App starting, loading cached data...');
    
    const initializeData = async () => {
      // Load cached data first (fast)
      console.log('📊 Loading cached data for instant display...');
      fetchStockData(false); // Use cache first for speed
    };
    
    initializeData();
    
    // Auto-refresh every 30 seconds to ensure data is up to date
    const interval = setInterval(() => {
      fetchStockData(false);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchStockData = async (refresh = false) => {
    setLoading(true);
    setError(null); // Clear any previous errors
    console.log('🔄 Fetching stock data...');

    try {
      // Use new centralized API endpoint with project detection
      const project = window.location.hostname.includes('premarketprice.com') ? 'pmp' : 
                     window.location.hostname.includes('capmovers.com') ? 'cm' :
                     window.location.hostname.includes('gainerslosers.com') ? 'gl' :
                     window.location.hostname.includes('stockcv.com') ? 'cv' : 'pmp';
      
      // Get default tickers for the project
      const tickersResponse = await fetch(`/api/tickers/default?project=${project}&limit=50`);
      const tickersData = await tickersResponse.json();
      const tickers = tickersData.success ? tickersData.data : ['AAPL', 'MSFT', 'GOOGL', 'NVDA'];
      
      const response = await fetch(`/api/stocks?tickers=${tickers.join(',')}&project=${project}&limit=50&t=${Date.now()}`, {
        cache: 'no-store'
      });
      const result = await response.json();
      console.log('API response:', result);
      console.log('Stock data length:', result.data?.length);
      
      // Check if API returned an error
      if (!response.ok || result.error) {
        console.log('API error:', result.error || result.message);
        setError(result.message || 'API temporarily unavailable. Please try again later.');
        setStockData(mockStocks);
        return;
      }
      
      // Check if we have valid data
      if (result.data && result.data.length > 0) {
        console.log('✅ Received real data from API:', result.data.length, 'stocks');
        console.log('🔍 DEBUG: First stock data:', JSON.stringify(result.data[0], null, 2));
        console.log('🔍 DEBUG: First stock currentPrice type:', typeof result.data[0].currentPrice);
        console.log('🔍 DEBUG: First stock currentPrice value:', result.data[0].currentPrice);
        
        // 💡 FIX: Ensure all numeric fields are actually numbers with validation
        const normalised = result.data.map((s: any) => {
          const currentPrice = Number(s.currentPrice);
          const closePrice = Number(s.closePrice);
          const percentChange = Number(s.percentChange);
          const marketCapDiff = Number(s.marketCapDiff);
          const marketCap = Number(s.marketCap);
          
          // Validate each field
          if (!isFinite(currentPrice) || currentPrice === 0) {
            console.warn(`⚠️ Invalid currentPrice for ${s.ticker}:`, s.currentPrice, '-> using fallback');
          }
          
          return {
            ...s,
            currentPrice: isFinite(currentPrice) && currentPrice > 0 ? currentPrice : 0,
            closePrice: isFinite(closePrice) && closePrice > 0 ? closePrice : currentPrice,
            percentChange: isFinite(percentChange) ? percentChange : 0,
            marketCapDiff: isFinite(marketCapDiff) ? marketCapDiff : 0,
            marketCap: isFinite(marketCap) && marketCap > 0 ? marketCap : 0,
          };
        });
        
        console.log('🔍 DEBUG: After normalisation - first stock currentPrice:', normalised[0].currentPrice, typeof normalised[0].currentPrice);
        
        // Enhanced fallback strategy
        if (result.data.length > 20) {
          // Real data available (260+ stocks)
          setStockData(normalised);
          setError(null);
          console.log('✅ Real data loaded:', normalised.length, 'stocks');
        } else if (result.data.length > 0) {
          // Demo data available, but show loading message
          setStockData(normalised);
          setError('Loading real data in background... (showing demo data)');
          console.log('⚠️ Demo data loaded:', normalised.length, 'stocks');
        } else {
          // No data at all, use mock
          setStockData(mockStocks);
          setError('API temporarily unavailable - using demo data');
          console.log('❌ No data, using mock stocks');
        }
      } else {
        // No data from API, but API is working - might be loading
        console.log('⚠️ API response OK but no data yet, data length:', result.data?.length);
        console.log('API message:', result.message);
        
        // If cache is updating, show loading message instead of error
        if (result.message && (result.message.includes('cache') || result.message.includes('Cache'))) {
          setError('Auto-updating every 2 minutes - Loading fresh data... Please wait.');
          // Keep existing data if we have it, otherwise use mock
          if (stockData.length === 0) {
            setStockData(mockStocks);
          }
        } else {
          setStockData(mockStocks);
          setError('Using demo data - API temporarily unavailable. To get live data, please set up your Polygon.io API key. See ENV_SETUP.md for instructions.');
        }
      }
      
      // Log cache status
      if (result.cacheStatus) {
        console.log('Cache status:', result.cacheStatus);
      }
    } catch (err) {
      console.log('API error, using mock data:', err);
      setError('Using demo data - API temporarily unavailable. To get live data, please set up your Polygon.io API key. See ENV_SETUP.md for instructions.');
      // Fallback to mock data
      setStockData(mockStocks);
    } finally {
      setLoading(false);
    }
  };

  const favoriteStocks = stockData.filter(stock => favorites.some(fav => fav.ticker === stock.ticker));
  
  // Company name mapping for search
  const getCompanyName = (ticker: string): string => {
    const companyNames: Record<string, string> = {
      'NVDA': 'NVIDIA', 'MSFT': 'Microsoft', 'AAPL': 'Apple', 'AMZN': 'Amazon', 'GOOGL': 'Alphabet', 'GOOG': 'Alphabet',
      'META': 'Meta', 'AVGO': 'Broadcom', 'BRK.A': 'Berkshire Hathaway', 'BRK.B': 'Berkshire Hathaway', 'TSLA': 'Tesla', 'JPM': 'JPMorgan Chase',
      'WMT': 'Walmart', 'LLY': 'Eli Lilly', 'ORCL': 'Oracle', 'V': 'Visa', 'MA': 'Mastercard', 'NFLX': 'Netflix',
      'XOM': 'ExxonMobil', 'COST': 'Costco', 'JNJ': 'Johnson & Johnson', 'HD': 'Home Depot', 'PLTR': 'Palantir',
      'PG': 'Procter & Gamble', 'BAC': 'Bank of America', 'ABBV': 'AbbVie', 'CVX': 'Chevron', 'KO': 'Coca-Cola',
      'AMD': 'Advanced Micro Devices', 'GE': 'General Electric', 'CSCO': 'Cisco', 'TMUS': 'T-Mobile', 'WFC': 'Wells Fargo',
      'CRM': 'Salesforce', 'PM': 'Philip Morris', 'IBM': 'IBM', 'UNH': 'UnitedHealth', 'MS': 'Morgan Stanley',
      'GS': 'Goldman Sachs', 'INTU': 'Intuit', 'LIN': 'Linde', 'ABT': 'Abbott', 'AXP': 'American Express',
      'BX': 'Blackstone', 'DIS': 'Disney', 'MCD': 'McDonald\'s', 'RTX': 'Raytheon', 'NOW': 'ServiceNow',
      'MRK': 'Merck', 'CAT': 'Caterpillar', 'T': 'AT&T', 'PEP': 'PepsiCo', 'UBER': 'Uber', 'BKNG': 'Booking',
      'TMO': 'Thermo Fisher', 'VZ': 'Verizon', 'SCHW': 'Charles Schwab', 'ISRG': 'Intuitive Surgical',
      'QCOM': 'Qualcomm', 'C': 'Citigroup', 'TXN': 'Texas Instruments', 'BA': 'Boeing', 'BLK': 'BlackRock',
      'GEV': 'GE Vernova', 'ACN': 'Accenture', 'SPGI': 'S&P Global', 'AMGN': 'Amgen', 'ADBE': 'Adobe',
      'BSX': 'Boston Scientific', 'SYK': 'Stryker', 'ETN': 'Eaton', 'AMAT': 'Applied Materials', 'ANET': 'Arista Networks',
      'NEE': 'NextEra Energy', 'DHR': 'Danaher', 'HON': 'Honeywell', 'TJX': 'TJX Companies', 'PGR': 'Progressive',
      'GILD': 'Gilead Sciences', 'DE': 'Deere', 'PFE': 'Pfizer', 'COF': 'Capital One', 'KKR': 'KKR',
      'PANW': 'Palo Alto Networks', 'UNP': 'Union Pacific', 'APH': 'Amphenol', 'LOW': 'Lowe\'s', 'LRCX': 'Lam Research',
      'MU': 'Micron Technology', 'ADP': 'Automatic Data Processing', 'CMCSA': 'Comcast', 'COP': 'ConocoPhillips',
      'KLAC': 'KLA Corporation', 'VRTX': 'Vertex Pharmaceuticals', 'MDT': 'Medtronic', 'SNPS': 'Synopsys',
      'NKE': 'Nike', 'CRWD': 'CrowdStrike', 'ADI': 'Analog Devices', 'WELL': 'Welltower', 'CB': 'Chubb',
      'ICE': 'Intercontinental Exchange', 'SBUX': 'Starbucks', 'TT': 'Trane Technologies', 'SO': 'Southern Company',
      'CEG': 'Constellation Energy', 'PLD': 'Prologis', 'DASH': 'DoorDash', 'AMT': 'American Tower',
      'MO': 'Altria', 'MMC': 'Marsh & McLennan', 'CME': 'CME Group', 'CDNS': 'Cadence Design Systems',
      'LMT': 'Lockheed Martin', 'BMY': 'Bristol-Myers Squibb', 'WM': 'Waste Management', 'PH': 'Parker-Hannifin',
      'COIN': 'Coinbase', 'DUK': 'Duke Energy', 'RCL': 'Royal Caribbean', 'MCO': 'Moody\'s', 'MDLZ': 'Mondelez',
      'DELL': 'Dell Technologies', 'TDG': 'TransDigm', 'CTAS': 'Cintas', 'INTC': 'Intel', 'MCK': 'McKesson',
      'ABNB': 'Airbnb', 'GD': 'General Dynamics', 'ORLY': 'O\'Reilly Automotive', 'APO': 'Apollo Global Management',
      'SHW': 'Sherwin-Williams', 'HCA': 'HCA Healthcare', 'EMR': 'Emerson Electric', 'NOC': 'Northrop Grumman',
      'MMM': '3M', 'FTNT': 'Fortinet', 'EQIX': 'Equinix', 'CI': 'Cigna', 'UPS': 'United Parcel Service',
      'FI': 'Fiserv', 'HWM': 'Howmet Aerospace', 'AON': 'Aon', 'PNC': 'PNC Financial', 'CVS': 'CVS Health',
      'RSG': 'Republic Services', 'AJG': 'Arthur J. Gallagher', 'ITW': 'Illinois Tool Works', 'MAR': 'Marriott',
      'ECL': 'Ecolab', 'MSI': 'Motorola Solutions', 'USB': 'U.S. Bancorp', 'WMB': 'Williams Companies',
      'BK': 'Bank of New York Mellon', 'CL': 'Colgate-Palmolive', 'NEM': 'Newmont', 'PYPL': 'PayPal',
      'JCI': 'Johnson Controls', 'ZTS': 'Zoetis', 'VST': 'Vistra', 'EOG': 'EOG Resources', 'CSX': 'CSX',
      'ELV': 'Elevance Health', 'ADSK': 'Autodesk', 'APD': 'Air Products', 'AZO': 'AutoZone', 'HLT': 'Hilton',
      'WDAY': 'Workday', 'SPG': 'Simon Property Group', 'NSC': 'Norfolk Southern', 'KMI': 'Kinder Morgan',
      'TEL': 'TE Connectivity', 'FCX': 'Freeport-McMoRan', 'CARR': 'Carrier Global', 'PWR': 'Quanta Services',
      'REGN': 'Regeneron Pharmaceuticals', 'ROP': 'Roper Technologies', 'CMG': 'Chipotle Mexican Grill',
      'DLR': 'Digital Realty Trust', 'MNST': 'Monster Beverage', 'TFC': 'Truist Financial', 'TRV': 'Travelers',
      'AEP': 'American Electric Power', 'NXPI': 'NXP Semiconductors', 'AXON': 'Axon Enterprise', 'URI': 'United Rentals',
      'COR': 'Cencora', 'FDX': 'FedEx', 'NDAQ': 'Nasdaq', 'AFL': 'Aflac', 'GLW': 'Corning', 'FAST': 'Fastenal',
      'MPC': 'Marathon Petroleum', 'SLB': 'Schlumberger', 'SRE': 'Sempra Energy', 'PAYX': 'Paychex',
      'PCAR': 'PACCAR', 'MET': 'MetLife', 'BDX': 'Becton Dickinson', 'OKE': 'ONEOK', 'DDOG': 'Datadog',
      // International companies
      'TSM': 'Taiwan Semiconductor', 'SAP': 'SAP SE', 'ASML': 'ASML Holding', 'BABA': 'Alibaba Group', 'TM': 'Toyota Motor',
      'AZN': 'AstraZeneca', 'HSBC': 'HSBC Holdings', 'NVS': 'Novartis', 'SHEL': 'Shell',
      'HDB': 'HDFC Bank', 'RY': 'Royal Bank of Canada', 'NVO': 'Novo Nordisk', 'ARM': 'ARM Holdings',
      'SHOP': 'Shopify', 'MUFG': 'Mitsubishi UFJ Financial', 'PDD': 'Pinduoduo', 'UL': 'Unilever',
      'SONY': 'Sony Group', 'TTE': 'TotalEnergies', 'BHP': 'BHP Group', 'SAN': 'Banco Santander', 'TD': 'Toronto-Dominion Bank',
      'SPOT': 'Spotify', 'UBS': 'UBS Group', 'IBN': 'ICICI Bank', 'SNY': 'Sanofi',
      'BUD': 'Anheuser-Busch InBev', 'BTI': 'British American Tobacco', 'BN': 'Brookfield',
      'SMFG': 'Sumitomo Mitsui Financial', 'ENB': 'Enbridge', 'RELX': 'RELX Group', 'TRI': 'Thomson Reuters', 'RACE': 'Ferrari',
      'BBVA': 'Banco Bilbao Vizcaya', 'SE': 'Sea Limited', 'BP': 'BP', 'NTES': 'NetEase', 'BMO': 'Bank of Montreal',
      'RIO': 'Rio Tinto', 'GSK': 'GlaxoSmithKline', 'MFG': 'Mizuho Financial', 'INFY': 'Infosys',
      'CP': 'Canadian Pacific', 'BCS': 'Barclays', 'NGG': 'National Grid', 'BNS': 'Bank of Nova Scotia', 'ING': 'ING Group',
      'EQNR': 'Equinor', 'CM': 'Canadian Imperial Bank', 'CNQ': 'Canadian Natural Resources', 'LYG': 'Lloyds Banking Group',
      'AEM': 'Agnico Eagle Mines', 'DB': 'Deutsche Bank', 'NU': 'Nu Holdings', 'CNI': 'Canadian National Railway',
      'DEO': 'Diageo', 'NWG': 'NatWest Group', 'AMX': 'America Movil', 'MFC': 'Manulife Financial',
      'E': 'Eni', 'WCN': 'Waste Connections', 'SU': 'Suncor Energy', 'TRP': 'TC Energy', 'PBR': 'Petrobras',
      'HMC': 'Honda Motor', 'GRMN': 'Garmin', 'CCEP': 'Coca-Cola Europacific', 'ALC': 'Alcon', 'TAK': 'Takeda Pharmaceutical'
    };
    return companyNames[ticker] || ticker;
  };

  // Filter by search term
  const filteredStocks = stockData.filter(stock => 
    stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getCompanyName(stock.ticker).toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const { sorted: favoriteStocksSorted, sortKey: favSortKey, ascending: favAscending, requestSort: requestFavSort } = 
    useSortableData(favoriteStocks, "marketCap", false);
  const { sorted: allStocksSorted, sortKey: allSortKey, ascending: allAscending, requestSort: requestAllSort } = 
    useSortableData(filteredStocks, "marketCap", false);

  // DEBUG: Log stockData changes
  useEffect(() => {
    if (stockData.length > 0) {
      console.log('🔍 STOCKDATA STATE UPDATE:', stockData.length, 'stocks');
      console.log('🔍 FIRST STOCK IN STATE:', stockData[0]);
      console.log('🔍 FIRST STOCK currentPrice:', stockData[0].currentPrice, typeof stockData[0].currentPrice);
    }
  }, [stockData]);



  const renderSortIcon = (key: SortKey, currentSortKey: SortKey, ascending: boolean) => {
    if (key === currentSortKey) {
      return ascending ? <ChevronUp size={14} className="inline ml-1" /> : <ChevronDown size={14} className="inline ml-1" />;
    }
    return null;
  };



  return (
    <main className="container">
      <header className="header" aria-label="Main site header">
        {/* Top Row: Brand + Market Indicators */}
        <div className="header-top">
          <div className="brand-section">
            <h1 className="brand">
              Pre<span className="brand--bold">MarketPrice</span><span className="brand--accent">.com</span>
            </h1>

            <div className="description-section">
              <h3 className="visually-hidden">Stock Tracking Platform Description</h3>
              <p>Track pre-market movements of top 300 companies globally.</p>
              <ul className="features-list">
                <li>Monitor changes</li>
                <li>Market cap fluctuations</li>
                <li>Build your watchlist</li>
              </ul>
            </div>
          </div>
                     <div className="actions-section">
             {/* Trading Hours Info Box */}
             <div className="trading-hours-box">
               <h3 className="trading-hours-title">⏰ Market Hours</h3>
               <div className="trading-hours-content">
                 <div className="hours-main">
                   <strong>Live prices: 4:00 AM - 8:00 PM EST</strong>
                 </div>
                 <ul className="hours-list">
                   <li className={`hours-item pre-market ${currentSession === 'pre-market' ? 'active' : 'inactive'}`}>
                     <span className="bullet">•</span>
                     <span className="session-name">Pre-market</span>
                     <span className="session-time">4:00 - 9:30 AM</span>
                   </li>
                   <li className={`hours-item market-hours ${currentSession === 'market-hours' ? 'active' : 'inactive'}`}>
                     <span className="bullet">•</span>
                     <span className="session-name">Market hours</span>
                     <span className="session-time">9:30 AM - 4:00 PM</span>
                   </li>
                   <li className={`hours-item after-hours ${currentSession === 'after-hours' ? 'active' : 'inactive'}`}>
                     <span className="bullet">•</span>
                     <span className="session-name">After-hours</span>
                     <span className="session-time">4:00 - 8:00 PM</span>
                   </li>
                 </ul>
               </div>
             </div>

             {/* Background Status */}
             {backgroundStatus && (
               <div className="background-status">
                 <Activity size={14} className={backgroundStatus.isRunning ? 'text-green-600' : 'text-red-600'} />
                 <span className="text-xs text-gray-600">
                   {backgroundStatus.isRunning ? 'Auto-updating every 2 minutes' : 'Manual mode'}
                 </span>
               </div>
             )}
           </div>
        </div>
      </header>

      {/* Earnings Calendar Section */}
      <EarningsCalendar />

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
          <br />
          <small>Showing demo data for testing purposes.</small>
        </div>
      )}

      {favoriteStocks.length > 0 && (
        <section className="favorites" aria-labelledby="favorites-heading">
          <h2 id="favorites-heading" data-icon="⭐">Favorites</h2>
          <table aria-describedby="favorites-description">
            <caption id="favorites-description">
              Your favorite stocks with current prices and market cap changes
            </caption>
            <thead>
            <tr>
              <th>Logo</th>
              <th onClick={() => requestFavSort("ticker" as SortKey)} className="sortable">
                Ticker
                {renderSortIcon("ticker", favSortKey, favAscending)}
              </th>
              <th>Company Name</th>
              <th onClick={() => requestFavSort("marketCap" as SortKey)} className="sortable">
                Market Cap&nbsp;(B)
                {renderSortIcon("marketCap", favSortKey, favAscending)}
              </th>
              <th onClick={() => requestFavSort("currentPrice" as SortKey)} className="sortable">
                Current Price ($)
                {renderSortIcon("currentPrice", favSortKey, favAscending)}
              </th>
              <th onClick={() => requestFavSort("percentChange" as SortKey)} className="sortable">
                % Change
                {renderSortIcon("percentChange", favSortKey, favAscending)}
              </th>
              <th onClick={() => requestFavSort("marketCapDiff" as SortKey)} className="sortable">
                Market Cap Diff (B $)
                {renderSortIcon("marketCapDiff", favSortKey, favAscending)}
              </th>
              <th>Favorites</th>
              </tr>
            </thead>
            <tbody>
              {favoriteStocksSorted.map((stock) => (
                <tr key={stock.ticker}>
                  <td>
                    <CompanyLogo ticker={stock.ticker} size={32} />
                  </td>
                  <td><strong>{stock.ticker}</strong></td>
                  <td className="company-name">{getCompanyName(stock.ticker)}</td>
                  <td>{formatBillions(stock.marketCap)}</td>
                  <td>
                    {/* 💡 Type-safe rendering with Number conversion */}
                    {isFinite(Number(stock.currentPrice)) 
                      ? Number(stock.currentPrice).toFixed(2) 
                      : '0.00'}
                  </td>
                  <td className={stock.percentChange >= 0 ? 'positive' : 'negative'}>
                    {stock.percentChange >= 0 ? '+' : ''}{stock.percentChange?.toFixed(2) || '0.00'}%
                  </td>
                  <td className={stock.marketCapDiff >= 0 ? 'positive' : 'negative'}>
                    {stock.marketCapDiff >= 0 ? '+' : ''}{stock.marketCapDiff?.toFixed(2) || '0.00'}
                  </td>
                  <td>
                    <button 
                      className={`favorite-btn ${isFavorite(stock.ticker) ? 'favorited' : ''}`}
                      onClick={() => toggleFavorite(stock.ticker)}
                      title={isFavorite(stock.ticker) ? "Remove from favorites" : "Add to favorites"}
                    >
                      {isFavorite(stock.ticker) ? '★' : '☆'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="all-stocks" aria-labelledby="all-stocks-heading">
        <div className="section-header">
          <h2 id="all-stocks-heading" data-icon="📊">All Stocks</h2>
          <div className="search-container">
            <input
              type="text"
              placeholder="Find company"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
              aria-label="Search stocks by company name or ticker"
            />
          </div>
        </div>

        <table aria-describedby="all-stocks-description">
          <caption id="all-stocks-description">
            Stock data with current prices and market movements
          </caption>
          <thead>
            <tr>
              <th>Logo</th>
              <th onClick={() => requestAllSort("ticker" as SortKey)} className="sortable">
                Ticker
                {renderSortIcon("ticker", allSortKey, allAscending)}
              </th>
              <th>Company Name</th>
              <th onClick={() => requestAllSort("marketCap" as SortKey)} className="sortable">
                Market Cap&nbsp;(B)
                {renderSortIcon("marketCap", allSortKey, allAscending)}
              </th>
              <th onClick={() => requestAllSort("currentPrice" as SortKey)} className="sortable">
                Current Price ($)
                {renderSortIcon("currentPrice", allSortKey, allAscending)}
              </th>
              <th onClick={() => requestAllSort("percentChange" as SortKey)} className="sortable">
                % Change
                {renderSortIcon("percentChange", allSortKey, allAscending)}
              </th>
              <th onClick={() => requestAllSort("marketCapDiff" as SortKey)} className="sortable">
                Market Cap Diff (B $)
                {renderSortIcon("marketCapDiff", allSortKey, allAscending)}
              </th>
              <th>Favorites</th>
            </tr>
          </thead>
          <tbody>
            {allStocksSorted.map((stock) => {
              const isFavorited = isFavorite(stock.ticker);
              return (
                <tr key={stock.ticker}>
                  <td>
                    <CompanyLogo ticker={stock.ticker} size={32} />
                  </td>
                  <td><strong>{stock.ticker}</strong></td>
                  <td className="company-name">{getCompanyName(stock.ticker)}</td>
                  <td>{formatBillions(stock.marketCap)}</td>
                  <td>
                    {/* 💡 Type-safe rendering with Number conversion */}
                    {isFinite(Number(stock.currentPrice)) 
                      ? Number(stock.currentPrice).toFixed(2) 
                      : '0.00'}
                  </td>
                  <td className={stock.percentChange >= 0 ? 'positive' : 'negative'}>
                    {stock.percentChange >= 0 ? '+' : ''}{stock.percentChange?.toFixed(2) || '0.00'}%
                  </td>
                  <td className={stock.marketCapDiff >= 0 ? 'positive' : 'negative'}>
                    {stock.marketCapDiff >= 0 ? '+' : ''}{stock.marketCapDiff?.toFixed(2) || '0.00'}
                  </td>
                  <td>
                    <button 
                      className={`favorite-btn ${isFavorited ? 'favorited' : ''}`}
                      onClick={() => toggleFavorite(stock.ticker)}
                      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isFavorited ? '★' : '☆'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>


      </section>

      <footer className="footer" aria-label="Site footer">
        <p>Data provided by Polygon.io • Powered by Next.js</p>
        <p className="disclaimer">
          Data is for informational purposes only. We are not responsible for its accuracy.
        </p>
        <p>
          Need help? Contact us: 
          <a href="mailto:support@premarketprice.com" className="support-email">
            support@premarketprice.com
          </a>
        </p>
      </footer>
     </main>
   );
 } 