import { useState, useEffect, useCallback, useRef } from 'react';
import { StockData, PriceUpdate } from '@/lib/types';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import { useHeatmapCache } from './useHeatmapCache';
import { useMediaQuery } from './useMediaQuery';

interface UseHeatmapDataProps {
  apiEndpoint?: string;
  refreshInterval?: number;
  initialTimeframe?: 'day' | 'week' | 'month';
  initialMetric?: HeatmapMetric;
  autoRefresh?: boolean;
}

/**
 * Transformuje StockData z API na CompanyNode pre heatmapu
 */
export function transformStockDataToCompanyNode(stock: StockData): CompanyNode | null {
  if (!stock.ticker || !stock.sector || !stock.industry) {
    return null;
  }

  const marketCapDiff = stock.marketCapDiff || 0;
  const marketCapDiffAbs = Math.abs(marketCapDiff);

  return {
    symbol: stock.ticker,
    name: stock.companyName || stock.ticker,
    sector: stock.sector,
    industry: stock.industry,
    marketCap: stock.marketCap || 0,
    changePercent: stock.percentChange || 0,
    marketCapDiff: marketCapDiff,
    marketCapDiffAbs: marketCapDiffAbs,
    currentPrice: stock.currentPrice,
  };
}

// Cache management moved to useHeatmapCache hook

export function useHeatmapData({ 
  apiEndpoint = '/api/heatmap',
  refreshInterval = 30000,
  initialTimeframe = 'day',
  initialMetric = 'percent',
  autoRefresh = true
}: UseHeatmapDataProps = {}) {
  // Cache hook FIRST — so cachedData is available for synchronous state init below
  const { cachedData, isLoading: cacheLoading, saveCache } = useHeatmapCache();

  // State — initialized from cache synchronously (no useEffect needed for initial data)
  const [data, setData] = useState<CompanyNode[] | null>(() => cachedData?.data ?? null);
  const [loading, setLoading] = useState<boolean>(() => !cachedData);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(() => cachedData?.lastUpdated ?? null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>(initialTimeframe);
  const [metric, setMetric] = useState<HeatmapMetric>(initialMetric);
  const [lastEtag, setLastEtag] = useState<string | null>(() => cachedData?.etag ?? null);

  // Use hook for consistent mobile detection
  const isMobile = useMediaQuery('(max-width: 767px)');

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitialLoadRef = useRef(!cachedData);
  const isLoadingRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  const currentDataRef = useRef<CompanyNode[]>(cachedData?.data ?? []);

  // Update ref when data changes
  useEffect(() => {
    if (data) {
      currentDataRef.current = data;
    }
  }, [data]);

  // OPTIMIZATION: Debounce rapid requests (especially on mobile)
  const fetchData = useCallback(async (force: boolean = false) => {
    // Throttling logic
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    const minInterval = force ? 0 : 1000;

    if (isLoadingRef.current && !force) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('⏳ Heatmap: Load already in progress, skipping...');
      }
      return;
    }

    if (timeSinceLastLoad < minInterval && lastLoadTimeRef.current > 0 && !force) {
      return;
    }

    // Cleanup previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const hasData = currentDataRef.current && currentDataRef.current.length > 0;
    const isFirstLoad = isInitialLoadRef.current;

    isLoadingRef.current = true;
    lastLoadTimeRef.current = now;

    // Only show loading indicator if we don't have data or it's a force refresh
    if (!hasData || force) {
      setLoading(true);
    }
    setError(null);

    try {
      const url = new URL('/api/heatmap', window.location.origin);

      // Add query params
      url.searchParams.set('timeframe', timeframe);
      url.searchParams.set('metric', metric);

      // OPTIMIZATION: Never bypass server cache on the first load.
      // The API already has short TTL + ETag support; forcing on first load defeats it.
      if (force) {
        url.searchParams.set('force', 'true');
      }

      // OPTIMIZATION (mobile): Request fewer items for MobileTreemap (we only render a small subset anyway)
      if (isMobile) {
        // Big enough to cover top market cap + a bit of tail, but much smaller than 3000
        url.searchParams.set('limit', '250');
      }

      const headers: HeadersInit = {
        'Accept': 'application/json',
      };

      // ETag handling
      const etagToUse = (isFirstLoad || !hasData || force) ? null : lastEtag;
      if (etagToUse) {
        headers['If-None-Match'] = etagToUse;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`🔄 Heatmap: Fetching data...`, { timeframe, metric, hasEtag: !!etagToUse });
      }

      // CRITICAL: Prioritize heatmap API on mobile (first screen)
      const priority: RequestPriority = isMobile && isInitialLoadRef.current ? 'high' : 'auto';

      const response = await fetch(url.toString(), {
        // Let the browser/HTTP cache + ETag do its job; the API already uses short-lived caching.
        cache: 'default',
        headers,
        signal: abortControllerRef.current.signal,
        // @ts-ignore - priority is experimental but supported in Chrome/Edge
        priority,
      });

      // Handle 304 Not Modified
      if (response.status === 304) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('📊 Heatmap: 304 Not Modified - data unchanged');
        }
        setLoading(false);
        isLoadingRef.current = false;
        isInitialLoadRef.current = false;
        return;
      }

      if (!response.ok) {
        // If 503 (Service Unavailable), throw specific error to trigger retry
        if (response.status === 503) {
          throw new Error('Service temporarily unavailable (503)');
        }
        // If 502 (Bad Gateway), throw specific error to trigger retry
        if (response.status === 502) {
          throw new Error('Service temporarily unavailable (502)');
        }
        throw new Error(`API error: ${response.status}`);
      }

      // Save ETag
      const newEtag = response.headers.get('ETag');
      if (newEtag) {
        setLastEtag(newEtag);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load heatmap data');
      }

      // Process data
      let companies: CompanyNode[] = [];
      
      if (result.rows && Array.isArray(result.rows)) {
        // FAST PATH: Optimized format from API
        for (const row of result.rows) {
          if (!row.t || !row.s || !row.i) continue;
          
          const marketCapDiff = row.d || 0;
          companies.push({
            symbol: row.t,
            name: row.n || row.t,
            sector: row.s,
            industry: row.i,
            marketCap: row.m || 0,
            changePercent: row.c || 0,
            marketCapDiff: marketCapDiff,
            marketCapDiffAbs: Math.abs(marketCapDiff),
            currentPrice: row.p,
          });
        }
      } else if (result.data && Array.isArray(result.data)) {
        // SLOW PATH: Legacy format
        companies = result.data
          .map(transformStockDataToCompanyNode)
          .filter((node: CompanyNode | null): node is CompanyNode => node !== null);
      }

      if (companies.length > 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`✅ Heatmap: Loaded ${companies.length} companies`);
        }
        setData(companies);
        const updatedAt = result.lastUpdatedAt || new Date().toISOString();
        setLastUpdated(updatedAt);
        isInitialLoadRef.current = false;
        currentDataRef.current = companies;
        
        // Save to cache for instant loading next time
        saveCache(companies, updatedAt, newEtag);
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('⚠️ Heatmap: No valid company data found');
        }
        if (!hasData) setError('No data available');
      }

    } catch (err: any) {
      // Handle abort errors silently
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('🔄 Heatmap: Request aborted');
        }
        return;
      }
      
      // Handle network errors gracefully
      const isNetworkError = err.message?.includes('Failed to fetch') || 
                            err.message?.includes('NetworkError') ||
                            err.message?.includes('network') ||
                            !err.message;
      
      if (isNetworkError) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('⚠️ Heatmap: Network error - server may be unavailable');
        }
        // Don't set error if we have cached data
        if (!hasData) {
          setError('Unable to connect to server. Please check your connection.');
        }
      } else {
        // Other errors (API errors, etc.)
        if (process.env.NODE_ENV !== 'production') {
          console.error('❌ Heatmap load error:', err);
        }
        
        // Track API error
        if (typeof window !== 'undefined') {
          import('@/lib/ga-api-errors').then(({ trackApiError }) => {
            trackApiError(apiEndpoint, (err as any).status || 500, (err as any).message);
          });
        }
        
        if (!hasData) {
          setError(err.message || 'Failed to load heatmap data');
        }
      }
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [apiEndpoint, timeframe, metric, lastEtag, saveCache, isMobile]);

  // Store fetchData in ref to avoid infinite loop
  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  // Initial load and auto-refresh
  useEffect(() => {
    // Ak už máme dáta z localStorage, nevolaj fetchData hneď (už sa zobrazujú)
    // Ale spusti background refresh po 100ms
    if (currentDataRef.current.length > 0) {
      setTimeout(() => {
        fetchDataRef.current(false); // Background refresh
      }, 100);
    } else {
      // Ak nemáme dáta, načítaj hneď
      fetchDataRef.current(false);
    }

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => fetchDataRef.current(false), refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]); // Remove fetchData from deps

  // Sync internal state with props if props change
  useEffect(() => {
    if (initialTimeframe) {
      setTimeframe(initialTimeframe);
    }
  }, [initialTimeframe]);

  // Re-fetch on timeframe change
  useEffect(() => {
    fetchData(true);
  }, [timeframe]); // Removed fetchData from deps to avoid loop if not careful (but useCallback handles it)

  return {
    data,
    loading,
    error,
    lastUpdated,
    timeframe,
    setTimeframe,
    metric,
    setMetric,
    refetch: () => fetchData(true)
  };
}
