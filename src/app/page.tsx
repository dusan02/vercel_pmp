'use client';

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useSortableData, SortKey } from '@/hooks/useSortableData';
import { formatBillions } from '@/lib/format';

import CompanyLogo from '@/components/CompanyLogo';
import { useFavorites } from '@/hooks/useFavorites';
import { Activity, Loader2 } from 'lucide-react';

import TodaysEarnings from '@/components/TodaysEarnings';
import { useLazyLoading } from '@/hooks/useLazyLoading';

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
  console.log('🏠 HomePage component rendering');
  
  // State for stock data
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'gainers' | 'losers' | 'movers' | 'custom'>('all');
  const [backgroundStatus, setBackgroundStatus] = useState<{
    isRunning: boolean;
    lastUpdate: string;
    nextUpdate: string;
  } | null>(null);
  
  // Use cookie-based favorites (no authentication needed)
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  // Market session detection with simplified logic
  // Helper function to check if it's weekend or holiday
  const isWeekendOrHoliday = () => {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Check if it's a US market holiday
    const isMarketHoliday = (date: Date): boolean => {
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
    
    // Check if it's weekend
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
    
    // Check if it's a market holiday
    const isHoliday = isMarketHoliday(easternTime);
    
    return isWeekend || isHoliday;
  };

  const getCurrentMarketStatus = () => {
    const now = new Date();
    // Get current time in Eastern Time (handles EST/EDT automatically)  
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const hours = easternTime.getHours();
    const minutes = easternTime.getMinutes();
    const currentTimeInMinutes = hours * 60 + minutes;
    const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Check if it's a US market holiday
    const isMarketHoliday = (date: Date): boolean => {
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
    
    // Check if it's weekend
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
    
    // Check if it's a market holiday
    const isHoliday = isMarketHoliday(easternTime);
    
         // Return simplified status
     if (isWeekend) {
       const options: Intl.DateTimeFormatOptions = { 
         month: 'long', 
         day: 'numeric', 
         year: 'numeric' 
       };
       const dateString = easternTime.toLocaleDateString('en-US', options);
       return `Weekend - ${dateString} (USA)`;
     } else if (isHoliday) {
       return 'Market holiday';
     } else if (currentTimeInMinutes >= preMarketStart && currentTimeInMinutes < marketStart) {
       return 'Pre-market hours';
     } else if (currentTimeInMinutes >= marketStart && currentTimeInMinutes < marketEnd) {
       return 'Market open';
     } else if (currentTimeInMinutes >= marketEnd && currentTimeInMinutes < afterHoursEnd) {
       return 'After-hours';
     } else {
       return 'After-hours'; // Late night hours (8 PM - 4 AM)
     }
  };

  const [currentSession, setCurrentSession] = useState(getCurrentMarketStatus());
  const [isWeekendOrHolidayState, setIsWeekendOrHolidayState] = useState(isWeekendOrHoliday());

  // Update current session and weekend/holiday status every minute
  useEffect(() => {
    const updateSession = () => {
      setCurrentSession(getCurrentMarketStatus());
      setIsWeekendOrHolidayState(isWeekendOrHoliday());
    };
    
    // Update immediately and then every minute
    updateSession();
    const sessionInterval = setInterval(updateSession, 60000); // Every 60 seconds
    
    return () => clearInterval(sessionInterval);
  }, []);

  // Fetch background service status
  const fetchBackgroundStatus = async () => {
    try {
      const response = await fetch('/api/background/status', {
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (!response.ok) {
        // Don't log errors for 404/500 - this is expected in Edge Runtime
        if (response.status !== 404 && response.status !== 500) {
          console.log('Background status API not ready yet, will retry...');
        }
        return;
      }
      
      const data = await response.json();
      if (data.success && data.data?.status) {
        setBackgroundStatus(data.data.status);
      }
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          // Timeout - don't log this as it's expected
          return;
        }
        if (error.message.includes('fetch')) {
          // Network error - don't log this as it's expected in Edge Runtime
          return;
        }
      }
      
      // Only log unexpected errors
      console.log('Background status check completed');
    }
  };

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

  const fetchStockData = async (refresh = false) => {
    try {
      console.log('🚀 Starting fetchStockData, refresh:', refresh);
      
      // Use new centralized API endpoint with project detection
      // Get project from window.location only if available (client-side)
      let project = 'pmp'; // default
      if (typeof window !== 'undefined') {
        project = window.location.hostname.includes('premarketprice.com') ? 'pmp' : 
                  window.location.hostname.includes('capmovers.com') ? 'cm' :
                  window.location.hostname.includes('gainerslosers.com') ? 'gl' :
                  window.location.hostname.includes('stockcv.com') ? 'cv' : 'pmp';
      }
      
      console.log('🔍 Detected project:', project);
      
      // 🚀 OPTIMIZATION: Load tickers and stocks data in parallel
      const [tickersResponse, stocksResponse] = await Promise.all([
        fetch(`/api/tickers/default?project=${project}&limit=3000`),
        fetch(`/api/stocks?tickers=NVDA,MSFT,AAPL,GOOGL,AMZN,META,TSLA,BRK.B,AVGO,LLY&project=${project}&limit=10&t=${Date.now()}`, {
          cache: 'no-store'
        })
      ]);

      console.log('🔍 Tickers response status:', tickersResponse.status);
      console.log('🔍 Stocks response status:', stocksResponse.status);

      const [tickersData, stocksResult] = await Promise.all([
        tickersResponse.json(),
        stocksResponse.json()
      ]);

      console.log('🔍 Tickers data:', tickersData);
      console.log('🔍 Stocks result:', stocksResult);

      const tickers = tickersData.success ? tickersData.data : ['AAPL', 'MSFT', 'GOOGL', 'NVDA'];
      
      // 🚀 OPTIMIZATION: If we have initial data, show it immediately
      if (stocksResult.data && stocksResult.data.length > 0) {
        console.log('✅ Quick initial data loaded:', stocksResult.data.length, 'stocks');
        setStockData(stocksResult.data);
        setError(null);
      }

      // 🚀 OPTIMIZATION: Load full data in background
      const fullStocksResponse = await fetch(`/api/stocks?tickers=${tickers.join(',')}&project=${project}&limit=3000&t=${Date.now()}`, {
        cache: 'no-store'
      });
      const fullResult = await fullStocksResponse.json();
      
      console.log('API response:', fullResult);
      console.log('Stock data length:', fullResult.data?.length);
      
      // Check if API returned an error
      if (!fullStocksResponse.ok || fullResult.error) {
        console.log('API error:', fullResult.error || fullResult.message);
        setError(fullResult.message || 'API temporarily unavailable. Please try again later.');
        if (!stocksResult.data || stocksResult.data.length === 0) {
          setStockData(mockStocks);
        }
        return;
      }
      
      // Check if we have valid data
      if (fullResult.data && fullResult.data.length > 0) {
        console.log('✅ Received real data from API:', fullResult.data.length, 'stocks');
        console.log('🔍 DEBUG: First stock data:', JSON.stringify(fullResult.data[0], null, 2));
        console.log('🔍 DEBUG: First stock currentPrice type:', typeof fullResult.data[0].currentPrice);
        console.log('🔍 DEBUG: First stock currentPrice value:', fullResult.data[0].currentPrice);
        
        // 💡 FIX: Ensure all numeric fields are actually numbers with validation
        const normalised = fullResult.data.map((s: any) => {
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
        if (fullResult.data.length > 20) {
          // Real data available (260+ stocks)
          setStockData(normalised);
          setError(null);
          console.log('✅ Real data loaded:', normalised.length, 'stocks');
        } else if (fullResult.data.length > 0) {
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
        console.log('⚠️ API response OK but no data yet, data length:', fullResult.data?.length);
        console.log('API message:', fullResult.message);
        
        // If cache is updating, show loading message instead of error
        if (fullResult.message && (fullResult.message.includes('cache') || fullResult.message.includes('Cache'))) {
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
      if (fullResult.cacheStatus) {
        console.log('Cache status:', fullResult.cacheStatus);
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

  // 🚀 OPTIMIZATION: Load data and background status in parallel
  useEffect(() => {
    console.log('🔄 useEffect triggered - loading initial data');
    console.log('🔍 Window object available:', typeof window !== 'undefined');
    
    const loadInitialData = async () => {
      try {
        console.log('🚀 Starting loadInitialData');
        await Promise.all([
          fetchStockData(false),
          fetchBackgroundStatus()
        ]);
        console.log('✅ loadInitialData completed');
      } catch (error) {
        console.error('❌ Error loading initial data:', error);
      }
    };

    loadInitialData();
  }, []); // Empty dependency array for initial load only

  // Background status check
  useEffect(() => {
    // Start background status check immediately (non-blocking)
    fetchBackgroundStatus();
    const interval = setInterval(fetchBackgroundStatus, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

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

  // Filter stocks based on various criteria
  const filteredStocks = stockData.filter(stock => {
    // Search filter
    const matchesSearch = stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCompanyName(stock.ticker).toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    // Favorites-only filter
    if (favoritesOnly && !isFavorite(stock.ticker)) return false;
    
    // Category filter
    switch (filterCategory) {
      case 'gainers':
        return stock.percentChange > 0;
      case 'losers':
        return stock.percentChange < 0;
      case 'movers':
        return Math.abs(stock.percentChange) > 2; // Stocks with >2% movement
      case 'custom':
        return favorites.some(fav => fav.ticker === stock.ticker);
      default:
        return true;
    }
  });
  
  const { sorted: favoriteStocksSorted, sortKey: favSortKey, ascending: favAscending, requestSort: requestFavSort } = 
    useSortableData(favoriteStocks, "marketCap", false);
  const { sorted: allStocksSorted, sortKey: allSortKey, ascending: allAscending, requestSort: requestAllSort } = 
    useSortableData(filteredStocks, "marketCap", false);

  // Lazy loading hook
  const {
    displayLimit,
    isLoading: lazyLoading,
    hasMore,
    reset: resetLazyLoading
  } = useLazyLoading({
    initialLimit: 30,
    incrementSize: 30,
    totalItems: allStocksSorted.length,
    threshold: 200
  });

  // Reset lazy loading when filters change
  useEffect(() => {
    resetLazyLoading();
  }, [searchTerm, favoritesOnly, filterCategory, resetLazyLoading]);

  // Get only the stocks to display based on lazy loading
  const displayedStocks = allStocksSorted.slice(0, displayLimit);

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
                             <p>Track pre-market movements of top 300+ companies globally.</p>
                             <ul className="features-list">
                 <li>Monitor changes</li>
                 <li>Market cap fluctuations</li>
                 <li>Build your watchlist</li>
                 {!isWeekendOrHolidayState && <li>Watch earnings date movements</li>}
               </ul>
            </div>
          </div>
                     <div className="actions-section">
             {/* Trading Hours Info Box */}
             <div className="trading-hours-box">
               <h3 className="trading-hours-title">Market Status</h3>
               <div className="trading-hours-content">
                                   <div className="hours-main">
                    <strong>
                      {currentSession}
                    </strong>
                  </div>
                  <div className="hours-subtitle">
                    <span>
                      {currentSession === 'Market open' ? 'Regular trading hours (9:30 AM - 4:00 PM EST)' :
                       currentSession === 'Pre-market hours' ? 'Pre-market hours (4:00 AM - 9:30 AM EST)' :
                       currentSession === 'After-hours' ? (isWeekendOrHoliday() ? '' : 'After-hours trading (4:00 PM - 8:00 PM EST)') :
                       currentSession === 'Weekend' ? 'Next trading day: Monday' :
                       currentSession === 'Market holiday' ? 'Market closed for holiday' :
                       (isWeekendOrHoliday() ? '' : 'After-hours trading (8:00 PM - 4:00 AM EST)')}
                    </span>
                  </div>
               </div>
             </div>

             {/* Background Status */}
             {backgroundStatus && (
               <div className="background-status">
                 <Activity size={14} className={backgroundStatus.isRunning ? 'text-green-600' : 'text-red-600'} />
                 <span className="text-xs text-gray-600">
                   {backgroundStatus.isRunning ? 'Auto-updating every 2 minutes' : 'Auto refresh'}
                 </span>
               </div>
             )}
           </div>
        </div>
      </header>

             {/* Today's Earnings Section */}
       <TodaysEarnings />

       {favoriteStocks.length > 0 && (
        <section className="favorites" aria-labelledby="favorites-heading">
          <h2 id="favorites-heading" data-icon="⭐">Favorites</h2>
          <table>
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
                    <div className="logo-container">
                      <CompanyLogo ticker={stock.ticker} size={32} />
                    </div>
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
          <div className="controls-container">
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
            
            <div className="filter-controls">
              <label className="favorites-toggle">
                <input
                  type="checkbox"
                  checked={favoritesOnly}
                  onChange={(e) => setFavoritesOnly(e.target.checked)}
                />
                <span>Favorites Only</span>
              </label>
              
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as any)}
                className="category-filter"
                aria-label="Filter by category"
              >
                <option value="all">All Stocks</option>
                <option value="gainers">Gainers</option>
                <option value="losers">Losers</option>
                <option value="movers">Movers (&gt;2%)</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            
            <div className="stock-count">
              Showing: {displayedStocks.length} of {filteredStocks.length} stocks
              {hasMore && (
                <span className="text-xs text-gray-500 ml-2">
                  (Scroll for more)
                </span>
              )}
            </div>
          </div>
        </div>

        <table>
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
            {displayedStocks.map((stock) => {
              const isFavorited = isFavorite(stock.ticker);
              return (
                <tr key={stock.ticker}>
                  <td>
                    <div className="logo-container">
                      <CompanyLogo ticker={stock.ticker} size={32} />
                    </div>
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

        {/* Loading indicator for lazy loading */}
        {lazyLoading && (
          <div className="loading-indicator">
            <Loader2 className="animate-spin" size={20} />
            <span>Načítavam ďalšie akcie...</span>
          </div>
        )}

        {/* End of list indicator */}
        {!hasMore && displayedStocks.length > 0 && (
          <div className="end-of-list">
            <span>Všetky akcie sú zobrazené</span>
          </div>
        )}


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