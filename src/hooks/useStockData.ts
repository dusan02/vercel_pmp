import { useState, useEffect, useRef, useCallback } from 'react';
import { StockData, LoadingStates, PriceUpdate } from '@/lib/types';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getProjectTickers } from '@/data/defaultTickers';

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

  // WebSocket functionality
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

  // Phase 4: Remaining
  const fetchRemainingStocksData = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, remainingStocks: true }));
    try {
      console.log('🚀 Loading remaining stocks data (phase 4 - lazy loaded)');
      const project = getProjectName();
      const allTickers = getProjectTickers(project, 1000);
      const top50Tickers = getProjectTickers(project, 50);
      const remainingTickers = allTickers.filter(ticker => !top50Tickers.includes(ticker));
      
      // Limit per request
      const limitedTickers = remainingTickers.slice(0, 500);
      
      const response = await fetchWithRetry(`/api/stocks?tickers=${limitedTickers.join(',')}&project=${project}&limit=500&t=${Date.now()}`, 3, 2000);
      
      if (response && response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          console.log('✅ Remaining stocks data loaded:', result.data.length, 'stocks');
          setStockData(prev => {
            const existingTickers = new Set(prev.map(s => s.ticker));
            const newStocks = result.data.filter((s: StockData) => !existingTickers.has(s.ticker));
            return [...prev, ...newStocks];
          });
        }
      }
    } catch (error) {
      console.error('Error loading remaining stocks data:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, remainingStocks: false }));
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

  // Initial load effect
  useEffect(() => {
    console.log('🔄 useEffect triggered - starting progressive loading');
    loadDataProgressive();
  }, [loadDataProgressive]);

  // Background polling
  useEffect(() => {
    fetchBackgroundStatus();
    const interval = setInterval(fetchBackgroundStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchBackgroundStatus]);

  // Favorites polling
  useEffect(() => {
    if (favorites.length > 0) {
      const timeoutId = setTimeout(() => {
        fetchFavoritesData();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [favorites, fetchFavoritesData]);

  return {
    stockData,
    loadingStates,
    error,
    backgroundStatus,
    fetchRemainingStocksData,
    loadData // For pull to refresh
  };
}

