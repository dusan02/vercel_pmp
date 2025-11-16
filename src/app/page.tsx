'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSortableData } from '@/hooks/useSortableData';
import { PullToRefresh } from '@/components/PullToRefresh';
import { SwipeableTableRow } from '@/components/SwipeableTableRow';
import { PerformanceOptimizer } from '@/components/PerformanceOptimizer';
import { MobileTester } from '@/components/MobileTester';
import { PageHeader } from '@/components/PageHeader';
import { PortfolioSection } from '@/components/PortfolioSection';
import { FavoritesSection } from '@/components/FavoritesSection';
import { AllStocksSection } from '@/components/AllStocksSection';
import { SectionIcon } from '@/components/SectionIcon';
import TodaysEarningsFinnhub from '@/components/TodaysEarningsFinnhub';

import { useFavorites } from '@/hooks/useFavorites';
import { usePortfolio } from '@/hooks/usePortfolio';
import { usePWA } from '@/hooks/usePWA';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import CookieConsent from '@/components/CookieConsent';

import { useLazyLoading } from '@/hooks/useLazyLoading';
import { getCompanyName } from '@/lib/companyNames';
import { useWebSocket } from '@/hooks/useWebSocket';
import { PriceUpdate } from '@/lib/websocket-server';
import { getProjectTickers } from '@/data/defaultTickers';
import { StockData } from '@/lib/types';

// Loading states for different sections
interface LoadingStates {
  favorites: boolean;
  earnings: boolean;
  top50Stocks: boolean;
  remainingStocks: boolean;
  background: boolean;
}


export default function HomePage() {
  // State for stock data
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    favorites: false,
    earnings: false,
    top50Stocks: false,
    remainingStocks: false,
    background: false
  });
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'gainers' | 'losers' | 'movers' | 'bigMovers'>('all');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  
  // Section visibility state
  const [showPortfolioSection, setShowPortfolioSection] = useState(true);
  const [showFavoritesSection, setShowFavoritesSection] = useState(true);
  const [showEarningsSection, setShowEarningsSection] = useState(true);
  const [showAllStocksSection, setShowAllStocksSection] = useState(true);
  
  // Use portfolio hook with localStorage persistence
  const { portfolioHoldings, updateQuantity, removeStock, addStock } = usePortfolio();
  
  // Use cookie-based favorites (no authentication needed)
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  
  // User preferences and cookie consent
  const { 
    hasConsent,
    setConsent
  } = useUserPreferences();
  

  // PWA functionality
  const { isOnline } = usePWA();
  
  // Client-side rendering state
  const [isClient, setIsClient] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  
  // Background status state
  const [backgroundStatus, setBackgroundStatus] = useState<string | null>(null);
  
  // Mock stocks for fallback
  const mockStocks: StockData[] = [];

  // Set isClient to true once on client
  useEffect(() => {
    setIsClient(true);
    setHasHydrated(true);
  }, []);

  // WebSocket functionality with favorites support
  useWebSocket({
    onPriceUpdate: (updates: PriceUpdate[]) => {
      console.log('📡 WebSocket price updates received:', updates.length, 'tickers');
      
      // Update stock data with real-time prices
      setStockData(prev => {
        const updated = [...prev];
        
        updates.forEach(update => {
          const index = updated.findIndex(stock => stock.ticker === update.ticker);
          if (index !== -1 && updated[index]) {
            // Create animation effect by temporarily highlighting the change
            const oldPrice = updated[index].currentPrice;
            const priceChange = update.currentPrice - oldPrice;
            
            updated[index] = {
              ...updated[index],
              currentPrice: update.currentPrice,
              closePrice: update.previousClose,
              percentChange: update.percentChange,
              marketCap: update.marketCap,
              marketCapDiff: update.marketCapDiff,
              lastUpdated: new Date().toISOString()
            };

            // Add visual feedback for price changes
            if (Math.abs(priceChange) > 0.01) { // Only animate significant changes
              const element = document.querySelector(`[data-ticker="${update.ticker}"]`);
              if (element) {
                element.classList.add(priceChange > 0 ? 'price-up' : 'price-down');
                setTimeout(() => {
                  element.classList.remove('price-up', 'price-down');
                }, 1000);
              }
            }
          }
        });
        
        return updated;
      });
    },
    onConnect: () => {
      console.log('✅ WebSocket connected - real-time updates enabled');
    },
    onDisconnect: () => {
      console.log('❌ WebSocket disconnected - falling back to background updates');
    },
    onError: (error) => {
      console.error('❌ WebSocket error:', error);
    },
    favorites: favorites.map(fav => fav.ticker)
  });

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


  // Fetch background service status with throttling
  const fetchBackgroundStatus = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, background: true }));
    try {
      const response = await fetch('/api/background/status', {
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (!response.ok) {
        // Don't log errors for 404/500/429 - this is expected
        if (response.status !== 404 && response.status !== 500 && response.status !== 429) {
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
  }, []);


  // Helper function for retry with exponential backoff
  const fetchWithRetry = async (url: string, maxRetries = 3, initialDelay = 1000): Promise<Response | null> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        
        // If 429 (Too Many Requests), wait and retry
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : initialDelay * Math.pow(2, attempt);
          
          if (attempt < maxRetries - 1) {
            console.log(`⏳ Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        return response;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`⏳ Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return null;
  };

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
      
      // Skip API call if no favorites
      if (favoriteTickers.length === 0) {
        console.log('ℹ️ No favorites to load, skipping API call');
        return;
      }
      
      const response = await fetchWithRetry(`/api/stocks?tickers=${favoriteTickers.join(',')}&project=${project}&limit=50&t=${Date.now()}`);
      
      if (response && response.ok) {
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
      } else if (response) {
        console.error('❌ Failed to load favorites data:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error loading favorites data:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, favorites: false }));
    }
  };

  // 🚀 OPTIMIZED: Load all stocks data (priority 2 - lazy loaded)
  const fetchAllStocksData = async () => {
    setLoadingStates(prev => ({ ...prev, top50Stocks: true }));
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
        setLoadingStates(prev => ({ ...prev, top50Stocks: false }));
      }
  };

  // 🚀 PROGRESSIVE: Load top 50 stocks data (phase 3 - deferred)
  const fetchTop50StocksData = async () => {
    setLoadingStates(prev => ({ ...prev, top50Stocks: true }));
    
    try {
      console.log('🚀 Loading top 50 stocks data (phase 3)');
      
      // Get project from window.location only if available (client-side)
      let project = 'pmp'; // default
      if (typeof window !== 'undefined') {
        project = window.location.hostname.includes('premarketprice.com') ? 'pmp' : 
                  window.location.hostname.includes('capmovers.com') ? 'cm' :
                  window.location.hostname.includes('gainerslosers.com') ? 'gl' :
                  window.location.hostname.includes('stockcv.com') ? 'cv' : 'pmp';
      }
      
      // Load top 50 tickers from defaultTickers
      const top50Tickers = getProjectTickers(project, 50);
      
      const response = await fetchWithRetry(`/api/stocks?tickers=${top50Tickers.join(',')}&project=${project}&limit=50&t=${Date.now()}`);
      
      if (response && response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          console.log('✅ Top 50 stocks data loaded:', result.data.length, 'stocks');
          setStockData(prev => {
            // Merge with existing data, avoiding duplicates
            const existingTickers = new Set(prev.map(s => s.ticker));
            const newStocks = result.data.filter((s: StockData) => !existingTickers.has(s.ticker));
            return [...prev, ...newStocks];
          });
        }
      } else if (response) {
        console.error('❌ Failed to load top 50 stocks data:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error loading top 50 stocks data:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, top50Stocks: false }));
    }
  };

  // 🚀 PROGRESSIVE: Load remaining stocks data (phase 4 - lazy loaded)
  const fetchRemainingStocksData = async () => {
    setLoadingStates(prev => ({ ...prev, remainingStocks: true }));
    
    try {
      console.log('🚀 Loading remaining stocks data (phase 4 - lazy loaded)');
      
      // Get project from window.location only if available (client-side)
      let project = 'pmp'; // default
      if (typeof window !== 'undefined') {
        project = window.location.hostname.includes('premarketprice.com') ? 'pmp' : 
                  window.location.hostname.includes('capmovers.com') ? 'cm' :
                  window.location.hostname.includes('gainerslosers.com') ? 'gl' :
                  window.location.hostname.includes('stockcv.com') ? 'cv' : 'pmp';
      }
      
      // Load remaining tickers (skip top 50)
      // Reduced limit to avoid rate limiting - load in smaller batches
      const allTickers = getProjectTickers(project, 1000); // Reduced from 3000 to 1000
      const top50Tickers = getProjectTickers(project, 50);
      const remainingTickers = allTickers.filter(ticker => !top50Tickers.includes(ticker));
      
      // Limit to 500 tickers per request to avoid rate limiting
      const limitedTickers = remainingTickers.slice(0, 500);
      
      const response = await fetchWithRetry(`/api/stocks?tickers=${limitedTickers.join(',')}&project=${project}&limit=500&t=${Date.now()}`, 3, 2000);
      
      if (response && response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          console.log('✅ Remaining stocks data loaded:', result.data.length, 'stocks');
          setStockData(prev => {
            // Merge with existing data, avoiding duplicates
            const existingTickers = new Set(prev.map(s => s.ticker));
            const newStocks = result.data.filter((s: StockData) => !existingTickers.has(s.ticker));
            return [...prev, ...newStocks];
          });
        }
      } else if (response) {
        console.error('❌ Failed to load remaining stocks data:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error loading remaining stocks data:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, remainingStocks: false }));
    }
  };

  // 🚀 PROGRESSIVE: New progressive loading strategy
  const loadDataProgressive = async () => {
    try {
      setError(null);
      
      // Phase 1: Favorites (immediate - highest priority)
      console.log('🔄 Phase 1: Loading favorites...');
      await fetchFavoritesData();
      
      // Phase 2: Earnings + Background (parallel - high priority)
      console.log('🔄 Phase 2: Loading earnings and background...');
      await Promise.all([
        fetchBackgroundStatus(),
        // Earnings component will load its own data
      ]);
      
      // Phase 3: Top 50 stocks (deferred - medium priority)
      // Add delay to avoid rate limiting after favorites request
      console.log('🔄 Phase 3: Loading top 50 stocks...');
      setTimeout(() => {
        fetchTop50StocksData();
      }, 2000); // Increased delay to 2 seconds to avoid rate limiting
      
      // Phase 4: Remaining stocks (lazy - lowest priority)
      console.log('🔄 Phase 4: Remaining stocks will load on scroll');
      
    } catch (error) {
      console.error('Error in progressive loading:', error);
      setError('Failed to refresh data. Please try again.');
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

  // 🚀 PROGRESSIVE: Use new progressive loading strategy
  useEffect(() => {
    console.log('🔄 useEffect triggered - starting progressive loading');
    loadDataProgressive();
  }, []); // Only run once on mount

  // Handle favorites changes separately with debouncing
  useEffect(() => {
    // Only fetch if we have favorites and they've changed
    if (favorites.length > 0) {
      console.log('🔄 Favorites changed, reloading favorites data');
      // Debounce to avoid rapid successive calls
      const timeoutId = setTimeout(() => {
        fetchFavoritesData();
      }, 500); // 500ms debounce
      
      return () => clearTimeout(timeoutId);
    }
  }, [favorites.map(fav => fav.ticker).join(',')]); // Only depend on ticker string, not the full favorites array

  // Background status check with throttling
  useEffect(() => {
    // Start background status check immediately (non-blocking)
    fetchBackgroundStatus();
    // Increased interval to 60 seconds to reduce rate limiting
    const interval = setInterval(fetchBackgroundStatus, 60000); // Check every 60 seconds
    return () => clearInterval(interval);
  }, [fetchBackgroundStatus]);

  // Count companies by sector
  useEffect(() => {
    if (stockData.length === 0) {
      console.log('📊 Sector count: No stock data yet');
      return;
    }
    
    console.log('📊 Sector count: Processing', stockData.length, 'stocks');
    
    const sectorCounts: { [key: string]: number } = {};
    
    stockData.forEach(stock => {
      const sector = stock.sector || 'Unknown';
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
    });
    
    // Sort by count (descending)
    const sortedSectors = Object.entries(sectorCounts)
      .sort((a, b) => b[1] - a[1]);
    
    console.log('\n📊 Počet spoločností podľa sektorov:');
    console.log('=====================================');
    sortedSectors.forEach(([sector, count]) => {
      console.log(`${sector}: ${count}`);
    });
    console.log(`\nCelkom spoločností: ${stockData.length}`);
    console.log('=====================================\n');
  }, [stockData]);

  const favoriteStocks = stockData.filter(stock => favorites.some(fav => fav.ticker === stock.ticker));
  
  
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

  // Lazy loading hook with progressive loading
  const {
    displayLimit,
    isLoading: lazyLoading,
    hasMore,
    reset: resetLazyLoading,
    hasTriggeredRemaining
  } = useLazyLoading({
    initialLimit: 30,
    incrementSize: 30,
    totalItems: allStocksSorted.length,
    threshold: 200,
    onLoadRemaining: fetchRemainingStocksData,
    enableProgressiveLoading: true
  });

  // Display only the limited number of stocks
  const displayedStocks = allStocksSorted.slice(0, displayLimit);

  // Reset lazy loading when filters change
  useEffect(() => {
    resetLazyLoading();
  }, [searchTerm, favoritesOnly, filterCategory, selectedSector]); // Remove resetLazyLoading from dependencies

  // Portfolio functions (using hook methods)
  const handleUpdateQuantity = updateQuantity;
  const handleRemoveStock = removeStock;
  const handleAddStock = addStock;

  const calculatePortfolioValue = (stock: StockData): number => {
    const quantity = portfolioHoldings[stock.ticker] || 0;
    if (quantity === 0) return 0;
    const currentValue = stock.currentPrice * quantity;
    const previousValue = stock.closePrice * quantity;
    return currentValue - previousValue;
  };

  const totalPortfolioValue = stockData.reduce((total, stock) => {
    return total + calculatePortfolioValue(stock);
  }, 0);

  // Get portfolio stocks (stocks that have holdings > 0)
  const portfolioStocks = stockData.filter(stock => (portfolioHoldings[stock.ticker] || 0) > 0);




  // 🚀 PROGRESSIVE: Loading skeleton for tables
  const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
                  <div>
      <div className="bg-gray-200 h-10 rounded-t-lg mb-2"></div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-gray-100 h-12 mb-1 rounded"></div>
      ))}
    </div>
  );



  return (
    <>
      {/* PWA Status Bar */}
      <div className="pwa-status-bar"></div>
      
      {/* Offline Indicator - only render on client */}
      {isClient && hasHydrated && !isOnline && (
        <div className="offline-indicator">
          <span>📡</span>
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
          {/* Header Section with Section Toggles */}
          <PageHeader
            showFavoritesSection={showFavoritesSection}
            showPortfolioSection={showPortfolioSection}
            showAllStocksSection={showAllStocksSection}
            showEarningsSection={showEarningsSection}
            onToggleFavorites={setShowFavoritesSection}
            onTogglePortfolio={setShowPortfolioSection}
            onToggleAllStocks={setShowAllStocksSection}
            onToggleEarnings={setShowEarningsSection}
          />

          {/* Error Display */}
          {error && (
            <div className="error" role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Portfolio Section */}
          {showPortfolioSection && (
            <PortfolioSection
              portfolioStocks={portfolioStocks}
              portfolioHoldings={portfolioHoldings}
              allStocks={stockData}
              loading={loadingStates.top50Stocks}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveStock={handleRemoveStock}
              onAddStock={handleAddStock}
              calculatePortfolioValue={calculatePortfolioValue}
              totalPortfolioValue={totalPortfolioValue}
            />
          )}

          {/* Favorites Section */}
          {showFavoritesSection && (
            <FavoritesSection
              favoriteStocks={favoriteStocksSorted}
              loading={loadingStates.favorites}
              sortKey={favSortKey}
              ascending={favAscending}
              onSort={requestFavSort}
              onToggleFavorite={toggleFavorite}
              isFavorite={isFavorite}
            />
          )}

          {/* Today's Earnings Section */}
          {showEarningsSection && (
            <TodaysEarningsFinnhub />
          )}

          {/* All Stocks Section */}
          {showAllStocksSection && (
            <AllStocksSection
              displayedStocks={displayedStocks}
              loading={loadingStates.top50Stocks}
              sortKey={allSortKey}
              ascending={allAscending}
              onSort={requestAllSort}
              onToggleFavorite={toggleFavorite}
              isFavorite={isFavorite}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              hasMore={hasMore}
            />
          )}

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

      {/* Cookie Consent Banner */}
      <CookieConsent onAccept={() => {
        // Set consent to enable favorites functionality
        setConsent(true);
      }} />

    </>
  );
} 