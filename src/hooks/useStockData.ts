import { useState, useEffect, useRef, useCallback } from 'react';
import { StockData, LoadingStates, PriceUpdate } from '@/lib/types';
import { getProjectTickers } from '@/data/defaultTickers';
import { useThrottle } from '@/hooks/useThrottle';

// Helper function for retry with exponential backoff
const fetchWithRetry = async (url: string, maxRetries = 3, initialDelay = 1000): Promise<Response | null> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, { cache: 'no-store' });

      // If 503 (Service Unavailable), wait and retry (server/database might be starting up)
      if (response.status === 503) {
        const delay = initialDelay * Math.pow(2, attempt);

        if (attempt < maxRetries - 1) {
          // Silently retry 503 errors (common during server startup)
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        // After max retries, return null instead of throwing
        return null;
      }

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
        // Don't throw, return null instead to allow graceful degradation
        return null;
      }
      const delay = initialDelay * Math.pow(2, attempt);
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

  // Helper for fetching and updating stock data - REDUCES DUPLICATION
  const fetchAndMergeStocks = useCallback(async (
    url: string,
    loadingKey: keyof LoadingStates,
    logMessage: string,
    options: { showLoading?: boolean } = {}
  ) => {
    const showLoading = options.showLoading !== false;
    if (showLoading) {
      setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
    }
    try {
      console.log(`🚀 ${logMessage}`);

      const response = await fetchWithRetry(url);

      if (response && response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          console.log(`✅ Loaded ${result.data.length} stocks (${logMessage})`);
          // UPSERT merge: update existing tickers in-place (prevents stale values) + add missing
          setStockData(prev => {
            const map = new Map(prev.map(s => [s.ticker, s]));
            for (const s of result.data as StockData[]) {
              map.set(s.ticker, s);
            }
            return Array.from(map.values());
          });
        }
      }
    } catch (error) {
      console.error(`Error loading stocks (${logMessage}):`, error);
    } finally {
      if (showLoading) {
        setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
      }
    }
  }, []);

  // Track if favorites have been initially loaded
  const favoritesInitialLoadRef = useRef(false);

  // Phase 1: Favorites
  const fetchFavoritesData = useCallback(async (showLoading: boolean = true) => {
    const project = getProjectName();
    const favoriteTickers = favorites.map(fav => fav.ticker);

    if (favoriteTickers.length === 0) {
      console.log('ℹ️ No favorites to load, skipping API call');
      return;
    }

    // Only show loading state on initial load, not when favorites change
    if (showLoading) {
      setLoadingStates(prev => ({ ...prev, favorites: true }));
    }

    try {
      console.log(`🚀 Loading favorites data (showLoading: ${showLoading})`);

      const response = await fetchWithRetry(
        `/api/stocks?tickers=${favoriteTickers.join(',')}&project=${project}&limit=50&t=${Date.now()}`
      );

      if (response && response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          console.log(`✅ Loaded ${result.data.length} favorite stocks`);
          // UPSERT merge for favorites: keeps prices fresh without reordering the whole list
          setStockData(prev => {
            const map = new Map(prev.map(s => [s.ticker, s]));
            for (const s of result.data as StockData[]) {
              map.set(s.ticker, s);
            }
            return Array.from(map.values());
          });
        }
      }
    } catch (error) {
      console.error('Error loading favorites data:', error);
    } finally {
      if (showLoading) {
        setLoadingStates(prev => ({ ...prev, favorites: false }));
      }
    }
  }, [favorites]);

  // Phase 3: Top 50
  const fetchTop50StocksData = useCallback(async () => {
    const project = getProjectName();
    const top50Tickers = getProjectTickers(project, 50);

    await fetchAndMergeStocks(
      `/api/stocks?tickers=${top50Tickers.join(',')}&project=${project}&limit=50&t=${Date.now()}`,
      'top50Stocks',
      'Loading top 50 stocks data'
    );
  }, [fetchAndMergeStocks]);

  // Function to fetch specific tickers (e.g., for portfolio)
  const fetchSpecificTickers = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return;

    const project = getProjectName();

    await fetchAndMergeStocks(
      `/api/stocks?tickers=${tickers.join(',')}&project=${project}&limit=${tickers.length}&t=${Date.now()}`,
      'remainingStocks',
      `Loading specific tickers: ${tickers.length}`
    );
  }, [fetchAndMergeStocks]);

  // Phase 4: Remaining - Load ALL stocks from database
  const fetchRemainingStocksData = useCallback(async () => {
    // Use requestIdleCallback for non-blocking load
    const loadInBackground = async () => {
      setLoadingStates(prev => ({ ...prev, remainingStocks: true }));
      try {
        console.log('🚀 Loading ALL remaining stocks from database (phase 4)');
        const project = getProjectName();

        const response = await fetchWithRetry(
          `/api/stocks?getAll=true&project=${project}&sort=marketCapDiff&order=desc&limit=3000&t=${Date.now()}`,
          3,
          2000
        );

        if (response && response.ok) {
          const result = await response.json();
          if (result.data && result.data.length > 0) {
            console.log('✅ All stocks loaded from database:', result.data.length, 'stocks');

            requestAnimationFrame(() => {
              setStockData(prev => {
                const existingTickers = new Set(prev.map(s => s.ticker));
                const newStocks = result.data.filter((s: StockData) => !existingTickers.has(s.ticker));
                const combined = [...prev, ...newStocks];
                // Sort by marketCapDiff DESC to maintain order
                combined.sort((a, b) => (b.marketCapDiff || 0) - (a.marketCapDiff || 0));
                return combined;
              });

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

    if ('requestIdleCallback' in window) {
      const idleCallback = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1));
      idleCallback(loadInBackground, { timeout: 1000 });
    } else {
      setTimeout(loadInBackground, 0);
    }
  }, []);

  // Main loading strategy
  const loadDataProgressive = useCallback(async () => {
    try {
      setError(null);

      console.log('🔄 Phase 1: Loading favorites...');
      await fetchFavoritesData(true); // Show loading on initial load
      favoritesInitialLoadRef.current = true;

      console.log('🔄 Phase 2: Loading background status...');
      fetchBackgroundStatus();

      if (stockData.length >= 50) {
        console.log('✅ SSR Data: Sufficient stocks already loaded, skipping Phase 3 fetch');
      } else {
        console.log('🔄 Phase 3: Loading top 50 stocks...');
        setTimeout(() => {
          fetchTop50StocksData();
        }, 2000);
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Throttled background status fetch
  const throttledFetchBackgroundStatus = useThrottle(fetchBackgroundStatus, 30000);

  // Background polling
  useEffect(() => {
    throttledFetchBackgroundStatus();
    const interval = setInterval(throttledFetchBackgroundStatus, 60000);
    return () => clearInterval(interval);
  }, [throttledFetchBackgroundStatus]);

  // Auto-refresh stock data (similar to heatmap - every 30 seconds)
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout | null = null;

    // Wait a bit after initial load before starting auto-refresh
    const initialDelay = setTimeout(() => {
      // Start auto-refresh after 30 seconds from initial load
      refreshInterval = setInterval(() => {
        console.log('🔄 Auto-refreshing stock data...');
        // Refresh favorites and top 50 stocks (SILENT refresh - no loading state)
        fetchFavoritesData(false);
        fetchAndMergeStocks(
          `/api/stocks?tickers=${getProjectTickers(getProjectName(), 50).join(',')}&project=${getProjectName()}&limit=50&t=${Date.now()}`,
          'top50Stocks',
          'Refreshing top 50 stocks data',
          { showLoading: false }
        );
      }, 30000); // 30 seconds - same as heatmap
    }, 30000);

    return () => {
      clearTimeout(initialDelay);
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [fetchFavoritesData, fetchTop50StocksData]);

  // Favorites polling - only fetch on initial load or when favorites are added
  // Don't refetch when favorites are removed to avoid flickering
  const favoritesTickersString = favorites.map(f => f.ticker).join(',');
  const previousFavoritesRef = useRef<string>('');

  useEffect(() => {
    const currentFavorites = favoritesTickersString;
    const previousFavorites = previousFavoritesRef.current;

    // Only fetch if:
    // 1. This is the initial load (previousFavorites is empty)
    // 2. New favorites were added (current length > previous length)
    // Don't fetch if favorites were removed (to avoid flickering)
    const favoritesAdded = currentFavorites.length > previousFavorites.length;
    const isInitialLoad = previousFavorites === '';

    if (favorites.length > 0 && (isInitialLoad || favoritesAdded)) {
      const timeoutId = setTimeout(() => {
        // Only show loading on initial load, not when favorites are added later
        fetchFavoritesData(isInitialLoad);
        favoritesInitialLoadRef.current = true;
      }, 500);

      previousFavoritesRef.current = currentFavorites;
      return () => clearTimeout(timeoutId);
    } else {
      // Update ref even if we don't fetch (for removed favorites)
      previousFavoritesRef.current = currentFavorites;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoritesTickersString]);

  return {
    stockData,
    loadingStates,
    error,
    backgroundStatus,
    fetchRemainingStocksData,
    fetchSpecificTickers,
    loadData
  };
}
