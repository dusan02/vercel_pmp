'use client';

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, WifiOff } from 'lucide-react';
import { useSortableData, SortKey } from '@/hooks/useSortableData';
import { formatBillions } from '@/lib/format';

import CompanyLogo from '@/components/CompanyLogo';
import TodaysEarningsFinnhub from '@/components/TodaysEarningsFinnhub';
import { PullToRefresh } from '@/components/PullToRefresh';
import { SwipeableTableRow } from '@/components/SwipeableTableRow';
import { BottomNavigation } from '@/components/BottomNavigation';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { PerformanceOptimizer } from '@/components/PerformanceOptimizer';
import { MobileTester } from '@/components/MobileTester';

import { useFavorites } from '@/hooks/useFavorites';
import { usePWA } from '@/hooks/usePWA';
import { Loader2 } from 'lucide-react';

import { useLazyLoading } from '@/hooks/useLazyLoading';
import { getCompanyName } from '@/lib/companyNames';

interface StockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  sector?: string;
  industry?: string;
  lastUpdated?: string;
}

// Loading states for different sections
interface LoadingStates {
  favorites: boolean;
  earnings: boolean;
  allStocks: boolean;
  background: boolean;
}

export default function HomePage() {
  console.log('🏠 HomePage component rendering');
  
  // State for stock data
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    favorites: false,
    earnings: false,
    allStocks: false,
    background: false
  });
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'gainers' | 'losers' | 'movers' | 'bigMovers'>('all');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [backgroundStatus, setBackgroundStatus] = useState<{
    isRunning: boolean;
    lastUpdate: string;
    nextUpdate: string;
  } | null>(null);
  
  // Mobile navigation state
  const [activeSection, setActiveSection] = useState<'home' | 'favorites' | 'earnings' | 'allStocks'>('home');
  
  // Use cookie-based favorites (no authentication needed)
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  // PWA functionality
  const { isOnline, isOfflineReady, isLoading: pwaLoading } = usePWA();
  
  // Client-side rendering state
  const [isClient, setIsClient] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Set isClient to true once on client
  useEffect(() => {
    setIsClient(true);
    setHasHydrated(true);
  }, []);

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
    if (dayOfWeek === 0 || dayOfWeek === 6) return true;
    
    // Check if it's a holiday
    return isMarketHoliday(easternTime);
  };

  // FAB action functions
  const handleQuickSearch = () => {
    // Focus on search input
    const searchInput = document.querySelector('.search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleQuickFavorite = () => {
    // Scroll to favorites section
    const favoritesSection = document.querySelector('.favorites');
    if (favoritesSection) {
      favoritesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleAddStock = () => {
    // For now, just show a message - could be expanded to add custom stocks
    alert('Add Stock functionality coming soon!');
  };

  // Handle section navigation
  const handleSectionChange = (section: 'home' | 'favorites' | 'earnings' | 'allStocks') => {
    setActiveSection(section);
    
    // Scroll to appropriate section
    switch (section) {
      case 'home':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'favorites':
        const favoritesSection = document.querySelector('.favorites');
        if (favoritesSection) {
          favoritesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        break;
      case 'earnings':
        const earningsSection = document.querySelector('.todays-earnings');
        if (earningsSection) {
          earningsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        break;
      case 'allStocks':
        // Scroll to All Stocks section
        const allStocksSection = document.querySelector('.all-stocks');
        if (allStocksSection) {
          allStocksSection.scrollIntoView({ behavior: 'smooth' });
        }
        break;
    }
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
    setLoadingStates(prev => ({ ...prev, background: true }));
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
    } finally {
      setLoadingStates(prev => ({ ...prev, background: false }));
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

  // 🚀 OPTIMIZED: Load favorites data first (priority 1)
  const fetchFavoritesData = async () => {
    setLoadingStates(prev => ({ ...prev, favorites: true }));
    try {
      console.log('🚀 Loading favorites data (priority 1)');
      
      // Get project from window.location only if available (client-side)
      let project = 'pmp'; // default
      if (typeof window !== 'undefined') {
        project = window.location.hostname.includes('premarketprice.com') ? 'pmp' : 
                  window.location.hostname.includes('capmovers.com') ? 'cm' :
                  window.location.hostname.includes('gainerslosers.com') ? 'gl' :
                  window.location.hostname.includes('stockcv.com') ? 'cv' : 'pmp';
      }
      
      // Load only favorite tickers first
      const favoriteTickers = favorites.map(fav => fav.ticker);
      if (favoriteTickers.length > 0) {
        const response = await fetch(`/api/stocks?tickers=${favoriteTickers.join(',')}&project=${project}&limit=50&t=${Date.now()}`, {
          cache: 'no-store'
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.data && result.data.length > 0) {
            console.log('✅ Favorites data loaded:', result.data.length, 'stocks');
            setStockData(prev => {
              // Merge with existing data, avoiding duplicates
              const existingTickers = new Set(prev.map(s => s.ticker));
              const newStocks = result.data.filter((s: StockData) => !existingTickers.has(s.ticker));
              return [...prev, ...newStocks];
            });
          }
        }
      }
    } catch (error) {
      console.error('Error loading favorites data:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, favorites: false }));
    }
  };

  // 🚀 OPTIMIZED: Load all stocks data (priority 2 - lazy loaded)
  const fetchAllStocksData = async () => {
    setLoadingStates(prev => ({ ...prev, allStocks: true }));
    try {
      console.log('🚀 Loading all stocks data (priority 2)');
      
      // Get project from window.location only if available (client-side)
      let project = 'pmp'; // default
      if (typeof window !== 'undefined') {
        project = window.location.hostname.includes('premarketprice.com') ? 'pmp' : 
                  window.location.hostname.includes('capmovers.com') ? 'cm' :
                  window.location.hostname.includes('gainerslosers.com') ? 'gl' :
                  window.location.hostname.includes('stockcv.com') ? 'cv' : 'pmp';
      }
      
      // Load tickers and stocks data in parallel
      const [tickersResponse, stocksResponse] = await Promise.all([
        fetch(`/api/tickers/default?project=${project}&limit=3000`),
        fetch(`/api/stocks?tickers=NVDA,MSFT,AAPL,GOOGL,AMZN,META,TSLA,BRK.B,AVGO,LLY&project=${project}&limit=10&t=${Date.now()}`, {
          cache: 'no-store'
        })
      ]);

      const [tickersData, stocksResult] = await Promise.all([
        tickersResponse.json(),
        stocksResponse.json()
      ]);

      const tickers = tickersData.success ? tickersData.data : ['AAPL', 'MSFT', 'GOOGL', 'NVDA'];
      
      // Show initial data immediately if available
      if (stocksResult.data && stocksResult.data.length > 0) {
        console.log('✅ Quick initial data loaded:', stocksResult.data.length, 'stocks');
        setStockData(prev => {
          const existingTickers = new Set(prev.map(s => s.ticker));
          const newStocks = stocksResult.data.filter((s: StockData) => !existingTickers.has(s.ticker));
          return [...prev, ...newStocks];
        });
        setError(null);
      }

      // Load full data in background
      const fullStocksResponse = await fetch(`/api/stocks?tickers=${tickers.join(',')}&project=${project}&limit=3000&t=${Date.now()}`, {
        cache: 'no-store'
      });
      const fullResult = await fullStocksResponse.json();
      
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
        
        // Debug: Check if sector data is present
        const stocksWithSectors = fullResult.data.filter((s: any) => s.sector);
        console.log('🔍 Debug - Stocks with sector data:', stocksWithSectors.length);
        if (stocksWithSectors.length > 0) {
          console.log('🔍 Debug - Sample stocks with sectors:', stocksWithSectors.slice(0, 3).map((s: any) => ({ ticker: s.ticker, sector: s.sector })));
        }
        
        // Normalize data
        const normalised = fullResult.data.map((s: any) => {
          const currentPrice = Number(s.currentPrice);
          const closePrice = Number(s.closePrice);
          const percentChange = Number(s.percentChange);
          const marketCapDiff = Number(s.marketCapDiff);
          const marketCap = Number(s.marketCap);
          
          return {
            ...s,
            currentPrice: isFinite(currentPrice) && currentPrice > 0 ? currentPrice : 0,
            closePrice: isFinite(closePrice) && closePrice > 0 ? closePrice : currentPrice,
            percentChange: isFinite(percentChange) ? percentChange : 0,
            marketCapDiff: isFinite(marketCapDiff) ? marketCapDiff : 0,
            marketCap: isFinite(marketCap) && marketCap > 0 ? marketCap : 0,
          };
        });
        
        // Enhanced fallback strategy
        if (fullResult.data.length > 20) {
          setStockData(normalised);
          setError(null);
          console.log('✅ Real data loaded:', normalised.length, 'stocks');
        } else if (fullResult.data.length > 0) {
          setStockData(normalised);
          setError('Loading real data in background... (showing demo data)');
          console.log('⚠️ Demo data loaded:', normalised.length, 'stocks');
        } else {
          setStockData(mockStocks);
          setError('API temporarily unavailable - using demo data');
          console.log('❌ No data, using mock stocks');
        }
      } else {
        console.log('⚠️ API response OK but no data yet, data length:', fullResult.data?.length);
        
        if (fullResult.message && (fullResult.message.includes('cache') || fullResult.message.includes('Cache'))) {
          setError('Auto-updating every 2 minutes - Loading fresh data... Please wait.');
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
      setStockData(mockStocks);
    } finally {
      setLoadingStates(prev => ({ ...prev, allStocks: false }));
    }
  };

  // Create a loadData function that can be used by PullToRefresh
  const loadData = async () => {
    try {
      setError(null);
      await fetchFavoritesData();
      await Promise.all([
        fetchBackgroundStatus(),
      ]);
      setTimeout(() => {
        fetchAllStocksData();
      }, 100);
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data. Please try again.');
    }
  };

  // 🚀 OPTIMIZED: Prioritized loading sequence
  useEffect(() => {
    console.log('🔄 useEffect triggered - starting prioritized loading');
    loadData();
  }, [favorites]); // Re-run when favorites change

  // Background status check
  useEffect(() => {
    // Start background status check immediately (non-blocking)
    fetchBackgroundStatus();
    const interval = setInterval(fetchBackgroundStatus, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const favoriteStocks = stockData.filter(stock => favorites.some(fav => fav.ticker === stock.ticker));
  
  // Get unique sectors for the dropdown
  const uniqueSectors = Array.from(new Set(stockData
    .map(stock => stock.sector)
    .filter(sector => sector && sector.trim() !== '')
  )).sort();
  
  // Debug: Log sector data
  console.log('🔍 Debug - Total stockData length:', stockData.length);
  console.log('🔍 Debug - stockData with sectors:', stockData.filter(stock => stock.sector).map(stock => ({ ticker: stock.ticker, sector: stock.sector })));
  console.log('🔍 Debug - uniqueSectors:', uniqueSectors);
  console.log('🔍 Debug - uniqueSectors length:', uniqueSectors.length);
  
  // Filter stocks based on various criteria
  const filteredStocks = stockData.filter(stock => {
    // Search filter
    const matchesSearch = stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCompanyName(stock.ticker).toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    // Favorites-only filter
    if (favoritesOnly && !isFavorite(stock.ticker)) return false;
    
    // Sector filter
    if (selectedSector !== 'all' && stock.sector !== selectedSector) return false;
    
    // Category filter
    switch (filterCategory) {
      case 'gainers':
        return stock.percentChange > 0;
      case 'losers':
        return stock.percentChange < 0;
      case 'movers':
        return Math.abs(stock.percentChange) > 2; // Stocks with >2% movement
      case 'bigMovers':
        return Math.abs(stock.marketCapDiff) > 10; // Stocks with >10B$ market cap difference
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

  // Display only the limited number of stocks
  const displayedStocks = allStocksSorted.slice(0, displayLimit);

  // Reset lazy loading when filters change
  useEffect(() => {
    resetLazyLoading();
  }, [searchTerm, favoritesOnly, filterCategory, selectedSector, resetLazyLoading]);

  const renderSortIcon = (key: SortKey, currentSortKey: SortKey, ascending: boolean) => {
    if (key !== currentSortKey) return null;
    return ascending ? <ChevronUp size={16} /> : <ChevronDown size={16} />;
  };

  const SectionLoader = ({ section }: { section: keyof LoadingStates }) => (
    <div className="loading-indicator">
      <Loader2 className="animate-spin" size={16} />
      <span>Loading {section}...</span>
    </div>
  );

  return (
    <>
      {/* PWA Status Bar */}
      <div className="pwa-status-bar"></div>
      
      {/* Offline Indicator - only render on client */}
      {isClient && hasHydrated && !isOnline && (
        <div className="offline-indicator">
          <WifiOff size={16} />
          <span>You're offline - using cached data</span>
        </div>
      )}
      
      <PerformanceOptimizer
        enableMonitoring={process.env.NODE_ENV === 'development'}
        enableLazyLoading={true}
        enableImageOptimization={true}
      >
        <MobileTester
          enableTesting={process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_MOBILE_TESTING === 'true'}
          showDeviceFrame={true}
        >
          <PullToRefresh onRefresh={loadData}>
        <main className="container">
          {/* Header Section */}
          <header className="header">
            <div className="header-top">
              <div className="brand-section">
                <h1 className="brand">
                  <span className="brand--bold">PreMarket</span>
                  <span className="brand--accent">Price</span>
                  <span className="brand--bold">.com</span>
                </h1>
                
                <div className="trading-hours-info">
                  <p>
                    📈 Track pre-market movements and earnings calendar of 300+ global companies
                  </p>
                </div>
              </div>

              <div className="market-indicators-section">
                <div className="market-indicators">
                  <div className="market-indicator">
                    <div className="indicator-header">
                      <h3 className="indicator-name">S&P 500</h3>
                      <span className="indicator-symbol">SPY</span>
                    </div>
                    <div className="indicator-values">
                      <div className="indicator-price">$4,123.45</div>
                      <div className="indicator-change positive">
                        <span>+0.85%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="market-indicator">
                    <div className="indicator-header">
                      <h3 className="indicator-name">NASDAQ</h3>
                      <span className="indicator-symbol">QQQ</span>
                    </div>
                    <div className="indicator-values">
                      <div className="indicator-price">$3,456.78</div>
                      <div className="indicator-change positive">
                        <span>+1.23%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="market-indicator">
                    <div className="indicator-header">
                      <h3 className="indicator-name">DOW</h3>
                      <span className="indicator-symbol">DIA</span>
                    </div>
                    <div className="indicator-values">
                      <div className="indicator-price">$32,456.78</div>
                      <div className="indicator-change negative">
                        <span>-0.45%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="header-bottom">
              <div className="description-section">
                <p>
                  Real-time pre-market stock data, earnings calendar, and market analysis. 
                  Track your favorite stocks and stay ahead of market movements.
                </p>
              </div>
              

            </div>
          </header>

          {/* Error Display */}
          {error && (
            <div className="error" role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Favorites Section */}
          {favoriteStocks.length > 0 && (
            <section className="favorites">
              <div className="section-header">
                <h2 data-icon="⭐">Favorites ({favoriteStocks.length})</h2>
              </div>
              
              {loadingStates.favorites ? (
                <SectionLoader section="favorites" />
              ) : (
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
                        Market Cap
                        {renderSortIcon("marketCap", favSortKey, favAscending)}
                      </th>
                      <th onClick={() => requestFavSort("currentPrice" as SortKey)} className="sortable">
                        Current Price
                        {renderSortIcon("currentPrice", favSortKey, favAscending)}
                      </th>
                      <th onClick={() => requestFavSort("percentChange" as SortKey)} className="sortable">
                        % Change
                        {renderSortIcon("percentChange", favSortKey, favAscending)}
                      </th>
                      <th onClick={() => requestFavSort("marketCapDiff" as SortKey)} className="sortable">
                        Market Cap Diff
                        {renderSortIcon("marketCapDiff", favSortKey, favAscending)}
                      </th>
                      <th>Favorites</th>
                    </tr>
                  </thead>
                  <tbody>
                    {favoriteStocksSorted.map((stock) => {
                      const isFavorited = isFavorite(stock.ticker);
                      return (
                        <SwipeableTableRow
                          key={stock.ticker}
                          onToggleFavorite={() => toggleFavorite(stock.ticker)}
                          isFavorite={isFavorited}
                        >
                          <td>
                            <div className="logo-container">
                              <CompanyLogo ticker={stock.ticker} size={32} />
                            </div>
                          </td>
                          <td><strong>{stock.ticker}</strong></td>
                          <td className="company-name">{getCompanyName(stock.ticker)}</td>
                          <td>{formatBillions(stock.marketCap)}</td>
                          <td>
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
                        </SwipeableTableRow>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {/* Today's Earnings Section */}
          <section className="todays-earnings">
            <div className="section-header">
              <h2 data-icon="📅">Today's Earnings</h2>
            </div>
            
            {loadingStates.earnings ? (
              <SectionLoader section="earnings" />
            ) : (
              <TodaysEarningsFinnhub />
            )}
          </section>

          {/* All Stocks Section */}
          <section className="all-stocks">
            <div className="section-header">
              <h2 data-icon="📊">All Stocks</h2>
              
              <div className="search-container">
                <input
                  type="text"
                  placeholder="Search by ticker or company name..."
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
                  <option value="bigMovers">Movers &gt; 10 B $</option>
                </select>
                
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="sector-filter"
                  aria-label="Filter by sector"
                >
                  <option value="all">
                    {uniqueSectors.length > 0 
                      ? `All Sectors (${uniqueSectors.length} available)` 
                      : 'All Sectors (loading...)'}
                  </option>
                  {uniqueSectors.map(sector => (
                    <option key={sector} value={sector}>{sector}</option>
                  ))}
                </select>
              </div>
              
              <div className="stock-count">
                {loadingStates.allStocks ? (
                  <span className="text-sm text-gray-500">Loading stocks...</span>
                ) : (
                  <div className="stock-count-content">
                    <span className="stock-count-main">
                      Showing: {displayedStocks.length} of {filteredStocks.length} stocks
                    </span>
                    {hasMore && (
                      <span className="stock-count-hint">
                        (Scroll for more)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {loadingStates.allStocks ? (
              <SectionLoader section="allStocks" />
            ) : (
              <>
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
                        Market Cap
                        {renderSortIcon("marketCap", allSortKey, allAscending)}
                      </th>
                      <th onClick={() => requestAllSort("currentPrice" as SortKey)} className="sortable">
                        Current Price
                        {renderSortIcon("currentPrice", allSortKey, allAscending)}
                      </th>
                      <th onClick={() => requestAllSort("percentChange" as SortKey)} className="sortable">
                        % Change
                        {renderSortIcon("percentChange", allSortKey, allAscending)}
                      </th>
                      <th onClick={() => requestAllSort("marketCapDiff" as SortKey)} className="sortable">
                        Market Cap Diff
                        {renderSortIcon("marketCapDiff", allSortKey, allAscending)}
                      </th>
                      <th>Favorites</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedStocks.map((stock) => {
                      const isFavorited = isFavorite(stock.ticker);
                      return (
                        <SwipeableTableRow
                          key={stock.ticker}
                          onToggleFavorite={() => toggleFavorite(stock.ticker)}
                          isFavorite={isFavorited}
                        >
                          <td>
                            <div className="logo-container">
                              <CompanyLogo ticker={stock.ticker} size={32} />
                            </div>
                          </td>
                          <td><strong>{stock.ticker}</strong></td>
                          <td className="company-name">{getCompanyName(stock.ticker)}</td>
                          <td>{formatBillions(stock.marketCap)}</td>
                          <td>
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
                        </SwipeableTableRow>
                      );
                    })}
                  </tbody>
                </table>

                {/* End of list indicator */}
                {!hasMore && displayedStocks.length > 0 && (
                  <div className="end-of-list">
                    <span>Všetky akcie sú zobrazené</span>
                  </div>
                )}
              </>
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
          </PullToRefresh>
        </MobileTester>
      </PerformanceOptimizer>

      {/* Mobile Navigation Components */}
      <BottomNavigation 
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
      
      <FloatingActionButton
        onSearch={handleQuickSearch}
        onQuickFavorite={handleQuickFavorite}
        onAddStock={handleAddStock}
      />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </>
  );
} 