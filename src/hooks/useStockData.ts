import { useState, useEffect, useRef, useCallback } from 'react';
import { StockData, LoadingStates, PriceUpdate } from '@/lib/types';
import { getProjectTickers } from '@/data/defaultTickers';
import { useThrottle } from '@/hooks/useThrottle';

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

interface UseStockDataProps {
  initialData?: StockData[];
  favorites: { ticker: string }[];
}

export function useStockData({ initialData = [], favorites }: UseStockDataProps) {
  // State for stock data
  const [stockData, setStockData] = useState<StockData[]>(initialData);
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    favorites: false,
    earnings: false,
    top50Stocks: false,
    remainingStocks: false,
    background: false
  });
  const [error, setError] = useState<string | null>(null);
  const [backgroundStatus, setBackgroundStatus] = useState<string | null>(null);
  
  // Mock stocks for fallback
  const mockStocks: StockData[] = [];

  // Track if initial load happened
  const initialDataLoaded = useRef(initialData.length > 0);

  // WebSocket functionality - temporarily disabled to fix webpack error
  // Will be re-enabled after webpack issue is resolved
  // TODO: Re-enable WebSocket after fixing webpack import issue
  /*
  useWebSocket({
    onPriceUpdate: (updates: PriceUpdate[]) => {
      console.log('📡 WebSocket price updates received:', updates.length, 'tickers');
      
      setStockData(prev => {
        const updated = [...prev];
        let hasChanges = false;
        
        // Create a map for faster lookup
        const prevMap = new Map(prev.map((s, index) => [s.ticker, index]));

        updates.forEach(update => {
          const index = prevMap.get(update.ticker);
          if (index !== undefined && updated[index]) {
            hasChanges = true;
            const current = updated[index]!;
            const priceChange = update.currentPrice - current.currentPrice;
            
            updated[index] = {
              ...current,
              currentPrice: update.currentPrice,
              closePrice: update.previousClose,
              percentChange: update.percentChange,
              marketCap: update.marketCap,
              marketCapDiff: update.marketCapDiff,
              lastUpdated: new Date().toISOString()
            };

            // Add visual feedback for price changes (DOM manipulation)
            if (Math.abs(priceChange) > 0.01 && typeof document !== 'undefined') {
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
        
        return hasChanges ? updated : prev;
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
  */

  // Fetch background service status
  const fetchBackgroundStatus = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, background: true }));
    try {
      const response = await fetch('/api/background/status', {
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
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
      // Ignore expected errors
    } finally {
      setLoadingStates(prev => ({ ...prev, background: false }));
    }
  }, []);

  const getProjectName = () => {
    if (typeof window !== 'undefined') {
      return window.location.hostname.includes('premarketprice.com') ? 'pmp' : 'pmp';
    }
    return 'pmp';
  };

  // Phase 1: Favorites
  const fetchFavoritesData = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, favorites: true }));
    try {
      console.log('🚀 Loading favorites data (priority 1)');
      const project = getProjectName();
      const favoriteTickers = favorites.map(fav => fav.ticker);
      
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
            const existingTickers = new Set(prev.map(s => s.ticker));
            const newStocks = result.data.filter((s: StockData) => !existingTickers.has(s.ticker));
            return [...prev, ...newStocks];
          });
        }
      }
    } catch (error) {
      console.error('Error loading favorites data:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, favorites: false }));
    }
  }, [favorites]);

  // Phase 3: Top 50
  const fetchTop50StocksData = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, top50Stocks: true }));
    try {
      console.log('🚀 Loading top 50 stocks data (phase 3)');
      const project = getProjectName();
      const top50Tickers = getProjectTickers(project, 50);
      
      const response = await fetchWithRetry(`/api/stocks?tickers=${top50Tickers.join(',')}&project=${project}&limit=50&t=${Date.now()}`);
      
      if (response && response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          console.log('✅ Top 50 stocks data loaded:', result.data.length, 'stocks');
          setStockData(prev => {
            const existingTickers = new Set(prev.map(s => s.ticker));
            const newStocks = result.data.filter((s: StockData) => !existingTickers.has(s.ticker));
            // Replace existing Top 50 with fresh data
            // Alebo len merge? Merge je bezpečnejší pre zachovanie state
            return [...prev, ...newStocks];
          });
        }
      }
    } catch (error) {
      console.error('Error loading top 50 stocks data:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, top50Stocks: false }));
    }
  }, []);

  // Phase 4: Remaining - Load ALL stocks from database
  // Optimized to prevent scroll stuttering
  const fetchRemainingStocksData = useCallback(async () => {
    // Use requestIdleCallback for non-blocking load
    const loadInBackground = async () => {
      setLoadingStates(prev => ({ ...prev, remainingStocks: true }));
      try {
        console.log('🚀 Loading ALL remaining stocks from database (phase 4)');
        const project = getProjectName();
        
        // Get all stocks from database, sorted by marketCapDiff DESC
        // This ensures we get all tickers that are in the database, not just from getProjectTickers
        const response = await fetchWithRetry(
          `/api/stocks?getAll=true&project=${project}&sort=marketCapDiff&order=desc&limit=10000&t=${Date.now()}`, 
          3, 
          2000
        );
        
        if (response && response.ok) {
          const result = await response.json();
          if (result.data && result.data.length > 0) {
            console.log('✅ All stocks loaded from database:', result.data.length, 'stocks');
            
            // Use requestAnimationFrame for smooth state update
            requestAnimationFrame(() => {
              setStockData(prev => {
                // Merge with existing data, avoiding duplicates
                const existingTickers = new Set(prev.map(s => s.ticker));
                const newStocks = result.data.filter((s: StockData) => !existingTickers.has(s.ticker));
                // Combine and maintain sort order
                const combined = [...prev, ...newStocks];
                // Sort by marketCapDiff DESC to maintain order
                combined.sort((a, b) => (b.marketCapDiff || 0) - (a.marketCapDiff || 0));
                return combined;
              });
              
              // Set loading to false in next frame
              requestAnimationFrame(() => {
                setLoadingStates(prev => ({ ...prev, remainingStocks: false }));
              });
            });
          }
        }
      } catch (error) {
        console.error('Error loading remaining stocks data:', error);
        setLoadingStates(prev => ({ ...prev, remainingStocks: false }));
      }
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      const idleCallback = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1));
      idleCallback(loadInBackground, { timeout: 1000 });
    } else {
      // Fallback: load in next tick
      setTimeout(loadInBackground, 0);
    }
  }, []);

  // Main loading strategy
  const loadDataProgressive = useCallback(async () => {
    try {
      setError(null);
      
      // Phase 1: Favorites
      console.log('🔄 Phase 1: Loading favorites...');
      await fetchFavoritesData();
      
      // Phase 2: Background check
      console.log('🔄 Phase 2: Loading background status...');
      fetchBackgroundStatus();
      
      // Phase 3: Top 50
      if (initialDataLoaded.current) {
         console.log('✅ SSR Data: Top 50 stocks already loaded, skipping fetch');
         initialDataLoaded.current = false; // Reset flag so next refresh fetches real data
      } else {
         console.log('🔄 Phase 3: Loading top 50 stocks...');
         setTimeout(() => {
            fetchTop50StocksData();
         }, 2000);
      }
      
      // Phase 4: Remaining (lazy loaded handled by UI hook, but we provide the function)
      console.log('🔄 Phase 4: Remaining stocks ready for lazy load');
      
    } catch (error) {
      console.error('Error in progressive loading:', error);
      setError('Failed to refresh data. Please try again.');
    }
  }, [fetchFavoritesData, fetchTop50StocksData, fetchBackgroundStatus]);

  // Full refresh function
  const loadData = useCallback(async () => {
    try {
      setError(null);
      await fetchFavoritesData();
      fetchBackgroundStatus();
      setTimeout(() => {
        fetchTop50StocksData();
      }, 100);
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data. Please try again.');
    }
  }, [fetchFavoritesData, fetchBackgroundStatus, fetchTop50StocksData]);

  // Initial load effect - run only once on mount
  useEffect(() => {
    console.log('🔄 useEffect triggered - starting progressive loading');
    loadDataProgressive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - run only once on mount

  // Throttled background status fetch to prevent too frequent calls
  const throttledFetchBackgroundStatus = useThrottle(fetchBackgroundStatus, 30000); // Max once per 30s

  // Background polling - use throttled version
  useEffect(() => {
    throttledFetchBackgroundStatus();
    const interval = setInterval(throttledFetchBackgroundStatus, 60000);
    return () => clearInterval(interval);
  }, [throttledFetchBackgroundStatus]);

  // Favorites polling - only when favorites change, not when function changes
  useEffect(() => {
    if (favorites.length > 0) {
      const timeoutId = setTimeout(() => {
        fetchFavoritesData();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites.map(f => f.ticker).join(',')]); // Only depend on favorites content, not function

  // Function to fetch specific tickers (e.g., for portfolio)
  const fetchSpecificTickers = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return;
    
    setLoadingStates(prev => ({ ...prev, remainingStocks: true }));
    try {
      console.log('🚀 Loading specific tickers:', tickers);
      const project = getProjectName();
      
      const response = await fetchWithRetry(`/api/stocks?tickers=${tickers.join(',')}&project=${project}&limit=${tickers.length}&t=${Date.now()}`, 3, 2000);
      
      if (response && response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          console.log('✅ Specific tickers loaded:', result.data.length, 'stocks');
          setStockData(prev => {
            const existingTickers = new Set(prev.map(s => s.ticker));
            const newStocks = result.data.filter((s: StockData) => !existingTickers.has(s.ticker));
            return [...prev, ...newStocks];
          });
        }
      }
    } catch (error) {
      console.error('Error loading specific tickers:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, remainingStocks: false }));
    }
  }, []);

  return {
    stockData,
    loadingStates,
    error,
    backgroundStatus,
    fetchRemainingStocksData,
    fetchSpecificTickers, // New function for fetching specific tickers
    loadData // For pull to refresh
  };
}

