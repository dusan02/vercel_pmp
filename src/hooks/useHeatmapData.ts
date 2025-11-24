import { useState, useEffect, useCallback, useRef } from 'react';
// import { useWebSocket } from '@/hooks/useWebSocket'; // Temporarily disabled to fix webpack error
import { StockData, PriceUpdate } from '@/lib/types';
import { CompanyNode, HeatmapMetric } from '@/components/MarketHeatmap';

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
function transformStockDataToCompanyNode(stock: StockData): CompanyNode | null {
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

export function useHeatmapData({ 
  apiEndpoint = '/api/heatmap',
  refreshInterval = 30000,
  initialTimeframe = 'day',
  initialMetric = 'percent',
  autoRefresh = true
}: UseHeatmapDataProps = {}) {
  // State
  const [data, setData] = useState<CompanyNode[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>(initialTimeframe);
  const [metric, setMetric] = useState<HeatmapMetric>(initialMetric);
  const [lastEtag, setLastEtag] = useState<string | null>(null);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitialLoadRef = useRef(true);
  const isLoadingRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  const currentDataRef = useRef<CompanyNode[]>([]);

  // Update ref when data changes
  useEffect(() => {
    if (data) {
      currentDataRef.current = data;
    }
  }, [data]);

  // Main fetch function
  const fetchData = useCallback(async (force: boolean = false) => {
    // Throttling logic
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    const minInterval = force ? 0 : 1000;

    if (isLoadingRef.current && !force) {
      console.log('⏳ Heatmap: Load already in progress, skipping...');
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
      // Determine URL
      let url: URL;
      if (apiEndpoint.includes('/heatmap')) {
        url = new URL('/api/heatmap', window.location.origin);
      } else {
        url = new URL('/api/heatmap', window.location.origin);
      }

      // Add query params
      url.searchParams.set('timeframe', timeframe);
      url.searchParams.set('metric', metric);
      if (force || isFirstLoad) {
        url.searchParams.set('force', 'true');
      } else {
        url.searchParams.set('t', Date.now().toString()); // Prevent browser caching
      }

      const headers: HeadersInit = {
        'Accept': 'application/json',
      };

      // ETag handling
      const etagToUse = (isFirstLoad || !hasData || force) ? null : lastEtag;
      if (etagToUse) {
        headers['If-None-Match'] = etagToUse;
      }

      console.log(`🔄 Heatmap: Fetching data...`, { timeframe, metric, hasEtag: !!etagToUse });

      const response = await fetch(url.toString(), {
        cache: 'no-store',
        headers,
        signal: abortControllerRef.current.signal,
      });

      // Handle 304 Not Modified
      if (response.status === 304) {
        console.log('📊 Heatmap: 304 Not Modified - data unchanged');
        setLoading(false);
        isLoadingRef.current = false;
        isInitialLoadRef.current = false;
        return;
      }

      if (!response.ok) {
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
      let stocks: StockData[] = [];
      if (result.data && Array.isArray(result.data)) {
        stocks = result.data;
      } else if (result.rows && Array.isArray(result.rows)) {
        // Fallback for optimized format
        stocks = result.rows.map((row: any) => ({
          ticker: row.t,
          currentPrice: row.p,
          percentChange: row.c,
          marketCap: row.m,
          marketCapDiff: row.d,
          companyName: row.n,
          sector: row.s || 'Unknown',
          industry: row.i || 'Unknown',
        }));
      }

      // Transform to CompanyNode
      const companies = stocks
        .map(transformStockDataToCompanyNode)
        .filter((node): node is CompanyNode => node !== null);

      if (companies.length > 0) {
        console.log(`✅ Heatmap: Loaded ${companies.length} companies`);
        setData(companies);
        setLastUpdated(result.lastUpdatedAt || new Date().toISOString());
        isInitialLoadRef.current = false;
      } else {
        console.warn('⚠️ Heatmap: No valid company data found');
        if (!hasData) setError('No data available');
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('🔄 Heatmap: Request aborted');
        return;
      }
      console.error('❌ Heatmap load error:', err);
      if (!hasData) setError(err.message);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [apiEndpoint, timeframe, metric, lastEtag]);

  // WebSocket integration - temporarily disabled to fix webpack error
  /*
  useWebSocket({
    onPriceUpdate: (updates: PriceUpdate[]) => {
      if (!data || data.length === 0) return;
      // Only update live if timeframe is 'day' (real-time makes most sense for daily change)
      // But user might want to see current price update even in week view? 
      // Typically heatmap color depends on the selected timeframe change.
      // If we are in 'week' mode, real-time update of 'day' percentChange is wrong for the color.
      // However, we can update currentPrice.
      
      // For now, let's keep it simple and update mostly for 'day' or just update price/mcap properties
      
      setData(prevData => {
        if (!prevData) return null;

        const updateMap = new Map(updates.map(u => [u.ticker, u]));
        let hasChanges = false;

        const newData = prevData.map(node => {
          const update = updateMap.get(node.symbol);
          if (update) {
            hasChanges = true;
            
            // Calculate new values based on update
            // NOTE: If timeframe is NOT 'day', we should be careful about updating changePercent
            // The WebSocket typically sends daily percentChange.
            
            const newProps: Partial<CompanyNode> = {
                currentPrice: update.currentPrice,
                marketCap: update.marketCap,
                // We update these always as they are "current" values
                marketCapDiff: update.marketCapDiff,
                marketCapDiffAbs: Math.abs(update.marketCapDiff || 0)
            };

            if (timeframe === 'day') {
                newProps.changePercent = update.percentChange;
            }

            return { ...node, ...newProps };
          }
          return node;
        });

        if (hasChanges) {
          setLastUpdated(new Date().toISOString());
          return newData;
        }
        return prevData;
      });
    },
    favorites: [] // Listen to all
  });
  */

  // Initial load and auto-refresh
  useEffect(() => {
    fetchData(false);

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => fetchData(false), refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh, refreshInterval]);

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
