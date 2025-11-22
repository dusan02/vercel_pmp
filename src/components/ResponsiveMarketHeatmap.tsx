'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import React from 'react';
import { MarketHeatmap, CompanyNode, useElementResize, HeatmapMetric } from './MarketHeatmap';
import { StockData } from '@/lib/types';

/**
 * Typ pre API response z /api/heatmap endpointu
 */
interface HeatmapApiResponse {
  success: boolean;
  data?: StockData[];
  error?: string;
  message?: string;
  count?: number;
  lastUpdatedAt?: string;
  cached?: boolean;
  timestamp?: string;
}

/**
 * Props pre ResponsiveMarketHeatmap
 */
export type ResponsiveMarketHeatmapProps = {
  /** API endpoint pre načítanie dát (default: /api/stocks) */
  apiEndpoint?: string;
  /** Callback pri kliknutí na dlaždicu */
  onTileClick?: (company: CompanyNode) => void;
  /** Automatické obnovovanie dát */
  autoRefresh?: boolean;
  /** Interval obnovovania v ms (default: 60000 = 1 min) */
  refreshInterval?: number;
  /** Počiatočný timeframe */
  initialTimeframe?: 'day' | 'week' | 'month';
};

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

/**
 * Načíta dáta z API endpointu
 * Pre heatmapu používame optimalizovaný /api/heatmap endpoint, ktorý vracia všetky firmy s cache
 * Podporuje ETag pre 304 Not Modified responses
 */
async function fetchHeatmapData(
  endpoint: string,
  timeframe: 'day' | 'week' | 'month',
  lastEtag: string | null = null,
  setEtag?: (etag: string | null) => void,
  forceRefresh: boolean = false,
  abortController?: AbortController
): Promise<[CompanyNode[], string | null]> {
  try {
    // Použijeme optimalizovaný heatmap endpoint, ktorý vracia všetky firmy s cache
    let url: URL;
    if (endpoint.includes('/heatmap')) {
      url = new URL('/api/heatmap', window.location.origin);
    } else if (endpoint.includes('/optimized')) {
      // Fallback na heatmap endpoint
      url = new URL('/api/heatmap', window.location.origin);
    } else {
      // Pre /api/stocks endpoint - použijeme heatmap endpoint namiesto toho
      url = new URL('/api/heatmap', window.location.origin);
    }

    // Pridaj force=true parameter ak je potrebný (napr. po vyčistení cache)
    if (forceRefresh) {
      url.searchParams.set('force', 'true');
    }

    const headers: HeadersInit = {
      'Accept': 'application/json',
    };

    // Pridaj If-None-Match header pre ETag support (iba ak nie je force refresh)
    if (lastEtag && !forceRefresh) {
      headers['If-None-Match'] = lastEtag;
    }

    // Použijeme poskytnutý controller alebo vytvoríme nový
    const controller = abortController || new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    // Timeout len ak sme vytvorili nový controller
    if (!abortController) {
      timeoutId = setTimeout(() => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      }, 30000); // 30s timeout
    }

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      headers,
      signal: controller.signal,
    });

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Skontroluj, či bol request abortovaný
    if (controller.signal.aborted) {
      throw new DOMException('Request was aborted', 'AbortError');
    }

    // 304 Not Modified - dáta sa nezmenili, použijeme existujúce
    if (response.status === 304) {
      console.log('📊 Heatmap: 304 Not Modified - using cached data');
      return [[], null]; // Vráť prázdne pole, aby sa nezmenili dáta
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      console.error('❌ Heatmap API error:', errorMessage);
      throw new Error(errorMessage);
    }

    // Ulož ETag ak je dostupný
    const etag = response.headers.get('ETag');
    if (etag && setEtag) {
      setEtag(etag);
    }

    const result: HeatmapApiResponse = await response.json();

    // Skontroluj znovu, či bol request abortovaný počas parsovania
    if (controller.signal.aborted) {
      throw new DOMException('Request was aborted', 'AbortError');
    }

    console.log('📊 Heatmap API response:', {
      success: result.success,
      hasData: !!result.data,
      dataLength: result.data?.length || 0,
      error: result.error,
      count: result.count,
      lastUpdatedAt: result.lastUpdatedAt,
      cached: result.cached,
    });

    // Log data freshness
    if (result.lastUpdatedAt) {
      const dataAge = Date.now() - new Date(result.lastUpdatedAt).getTime();
      const dataAgeMinutes = Math.floor(dataAge / 60000);
      if (dataAgeMinutes > 10) {
        console.warn(`⚠️ Heatmap data is ${dataAgeMinutes} minutes old (lastUpdated: ${result.lastUpdatedAt})`);
      } else {
        console.log(`✅ Heatmap data is fresh (${dataAgeMinutes} minutes old)`);
      }
    }

    if (!result.success) {
      const errorMsg = result.error || 'Failed to load heatmap data';
      console.error('❌ Heatmap API returned error:', errorMsg);
      throw new Error(errorMsg);
    }

    // Helper funkcia pre parsovanie rôznych formátov API response
    const parseApiResponse = (result: any): StockData[] => {
      // Formát z /api/heatmap (preferovaný, má sektor a industry)
      if (result.data && Array.isArray(result.data)) {
        console.log(`📊 Parsed ${result.data.length} stocks from result.data`);
        return result.data;
      }

      // Formát z /api/stocks/optimized (fallback, nemá sektor/industry)
      if (result.rows && Array.isArray(result.rows)) {
        const stocks = result.rows.map((row: any) => ({
          ticker: row.t || row.ticker,
          currentPrice: row.p || row.currentPrice || 0,
          closePrice: row.p || row.currentPrice || 0,
          percentChange: row.c || row.percentChange || 0,
          marketCap: row.m || row.marketCap || 0,
          marketCapDiff: row.d || row.marketCapDiff || 0,
          companyName: row.n || row.companyName,
          // Optimized endpoint nemá sektor/industry, použijeme fallback
          sector: row.s || 'Unknown',
          industry: row.i || 'Unknown',
        }));
        console.log(`📊 Parsed ${stocks.length} stocks from result.rows`);
        return stocks;
      }

      // Priamy array formát
      if (Array.isArray(result)) {
        console.log(`📊 Parsed ${result.length} stocks from result array`);
        return result;
      }

      console.warn('⚠️ Unexpected API response format:', result);
      return [];
    };

    const stocks = parseApiResponse(result);

    // Transformujeme na CompanyNode a filtrujeme neplatné
    const companies = stocks
      .map(transformStockDataToCompanyNode)
      .filter((node): node is CompanyNode => node !== null);

    console.log(`📊 Heatmap API: Prijatých ${stocks.length} firiem z API, po transformácii ${companies.length} firiem s sector/industry`);

    return [companies, result.lastUpdatedAt || null];
  } catch (error) {
    // Skontroluj, či bol request abortovaný
    if (error instanceof Error && error.name === 'AbortError') {
      throw error; // Re-throw AbortError, aby sa mohol správne spracovať v loadData
    }

    // Skontroluj, či bol abortovaný cez signal
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error; // Re-throw AbortError
    }

    console.error('Error fetching heatmap data:', error);
    throw error; // Re-throw ostatné chyby
  }
}

/**
 * Wrapper komponent, ktorý poskytuje responzívnu veľkosť
 * a načítava dáta z API
 */
import { useWebSocket } from '@/hooks/useWebSocket';
import { PriceUpdate } from '@/lib/types';

// ... existing imports ...

/**
 * Wrapper komponent, ktorý poskytuje responzívnu veľkosť
 * a načítava dáta z API
 */
export const ResponsiveMarketHeatmap: React.FC<ResponsiveMarketHeatmapProps> = ({
  apiEndpoint = '/api/heatmap',
  onTileClick,
  autoRefresh = true,
  refreshInterval = 30000, // 30s - zladené s CACHE_TTL (30s)
  initialTimeframe = 'day',
}) => {
  // Všetky hooks musia byť na začiatku, pred akýmkoľvek podmieneným returnom
  // Poradie: useRef, useState, useEffect, useCallback, useMemo
  const { ref, size } = useElementResize();
  // CRITICAL: Použijeme null pre počiatočný stav, aby sme zabránili hydration mismatch
  // SSR renderuje null, client hydration tiež začína s null, potom sa načítajú dáta
  const [data, setData] = useState<CompanyNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>(initialTimeframe);
  const [metric, setMetric] = useState<HeatmapMetric>('percent');
  const [fallbackSize, setFallbackSize] = useState({ width: 800, height: 600 });
  const [lastEtag, setLastEtag] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const currentDataRef = useRef<CompanyNode[]>([]);
  const isLoadingRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  const [isMounted, setIsMounted] = useState(false);

  // Ref pre AbortController - používa sa na cleanup pri unmount alebo zmenách
  const abortControllerRef = useRef<AbortController | null>(null);

  // Zabezpeč, že komponent je mounted pred načítaním dát (hydration safety)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Aktualizuj ref pri každej zmene dát
  useEffect(() => {
    if (data) {
      currentDataRef.current = data;
    }
  }, [data]);

  // WebSocket integration
  useWebSocket({
    onPriceUpdate: (updates: PriceUpdate[]) => {
      if (!data || data.length === 0) return;

      console.log('📡 Heatmap: WebSocket price updates received:', updates.length);

      setData(prevData => {
        if (!prevData) return null;

        // Create a map of updates for faster lookup
        const updateMap = new Map(updates.map(u => [u.ticker, u]));
        let hasChanges = false;

        const newData = prevData.map(node => {
          const update = updateMap.get(node.symbol);
          if (update) {
            hasChanges = true;
            return {
              ...node,
              currentPrice: update.currentPrice,
              changePercent: update.percentChange,
              marketCap: update.marketCap,
              marketCapDiff: update.marketCapDiff,
              marketCapDiffAbs: Math.abs(update.marketCapDiff || 0)
            };
          }
          return node;
        });

        if (hasChanges) {
          setLastUpdatedAt(new Date().toISOString());
          return newData;
        }
        return prevData;
      });
    },
    onConnect: () => console.log('✅ Heatmap: WebSocket connected'),
    onDisconnect: () => console.log('❌ Heatmap: WebSocket disconnected'),
    // We don't filter by favorites here, we want updates for all visible stocks
    // If needed, we could extract tickers from 'data' but that might be too many subscriptions
    // For now, let's rely on the server broadcasting relevant updates or the hook handling it
    favorites: []
  });

  // Načítanie dát s ETag support (s throttling)
  const loadData = useCallback(async (force: boolean = false) => {
    // Throttling - minimálne 1 sekunda medzi requestmi (iba ak nie je force)
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    const minInterval = force ? 0 : 1000; // 1 sekunda (alebo 0 ak je force)

    if (isLoadingRef.current && !force) {
      console.log('⏳ Heatmap: Load already in progress, skipping...');
      return;
    }

    if (timeSinceLastLoad < minInterval && lastLoadTimeRef.current > 0 && !force) {
      console.log(`⏳ Heatmap: Throttling - waiting ${minInterval - timeSinceLastLoad}ms...`);
      return;
    }
    // Pri auto-refresh nechceme zobrazovať loading, ak už máme dáta
    const hasData = currentDataRef.current && currentDataRef.current.length > 0;
    const isFirstLoad = isInitialLoadRef.current;

    isLoadingRef.current = true;
    lastLoadTimeRef.current = now;

    // Zobraz loading ak nemáme dáta alebo je to force refresh
    if (!hasData || force) {
      setLoading(true);
    }
    setError(null);

    const loadStartTime = Date.now();

    try {
      console.log('🔄 Heatmap: Starting data fetch...', { hasData, isFirstLoad, force, lastEtag: lastEtag ? 'present' : 'null' });

      // Pri prvom načítaní, force refresh alebo po vyčistení cache nepoužívame ETag
      const etagToUse = (isFirstLoad || !hasData || force) ? null : lastEtag;
      const shouldForce = force || isFirstLoad || !hasData;

      // Vytvor nový AbortController pre tento request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const [companies, updatedAt] = await fetchHeatmapData(
        apiEndpoint,
        timeframe,
        etagToUse,
        setLastEtag,
        shouldForce,
        controller // Predaj controller do fetchHeatmapData
      );
      const loadDuration = Date.now() - loadStartTime;

      // Prázdne pole znamená 304 Not Modified - dáta sa nezmenili
      if (companies.length > 0) {
        console.log(`✅ Heatmap: Načítaných ${companies.length} firiem za ${loadDuration}ms`);
        setData(companies);
        if (updatedAt) {
          setLastUpdatedAt(updatedAt);
        }
        setLoading(false);
        isInitialLoadRef.current = false;
        isLoadingRef.current = false;
      } else if (!hasData || isFirstLoad || force) {
        // Ak nemáme dáta alebo je to prvý load/force a dostali sme 304/prázdne pole, musíme načítať znovu s force
        console.log('🔄 Heatmap: No data received on initial load/force, retrying with force=true...');
        const retryStartTime = Date.now();
        const [companiesRetry, updatedAtRetry] = await fetchHeatmapData(
          apiEndpoint,
          timeframe,
          null,
          setLastEtag,
          true // Force refresh pri retry
        );
        const retryDuration = Date.now() - retryStartTime;
        if (companiesRetry.length > 0) {
          console.log(`✅ Heatmap: Načítaných ${companiesRetry.length} firiem po retry za ${retryDuration}ms`);
          setData(companiesRetry);
          if (updatedAtRetry) {
            setLastUpdatedAt(updatedAtRetry);
          }
          isInitialLoadRef.current = false;
        } else {
          console.warn('⚠️ Heatmap: No data received after retry - server may be processing data');
          setError('No data available - server may be processing data. Please wait a moment and refresh.');
        }
        setLoading(false);
        isLoadingRef.current = false;
      } else {
        // Máme už dáta a dostali sme 304 - dáta sa nezmenili, nič nerobíme
        console.log(`📊 Heatmap: 304 Not Modified - data unchanged (${loadDuration}ms)`);
        setLoading(false);
        isLoadingRef.current = false;
      }
    } catch (err) {
      // Ignoruj AbortError ak bol request úmyselne abortovaný (cleanup)
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('🔄 Heatmap: Request aborted (component unmounted or dependency changed)');
        return; // Nezobrazuj error, ak bol request úmyselne abortovaný
      }

      const loadDuration = Date.now() - loadStartTime;
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';

      console.error(`❌ Heatmap load error after ${loadDuration}ms:`, err);

      // Špecifická správa pre timeout
      if (err instanceof Error && (err.name === 'AbortError' || errorMessage.includes('timeout'))) {
        setError('Request timeout - server is processing data, please wait and refresh');
      } else {
        setError(`Error: ${errorMessage}`);
      }
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [apiEndpoint, timeframe, lastEtag]);

  // Počiatočné načítanie a auto-refresh
  useEffect(() => {
    // Reset initial load flag when component mounts
    isInitialLoadRef.current = true;
    // Pri prvom načítaní použijeme force=false, aby sme použili cache (ak existuje)
    // Force=true len ak cache neexistuje alebo je prázdny
    loadData(false);

    if (autoRefresh) {
      const interval = setInterval(() => loadData(false), refreshInterval);
      return () => {
        clearInterval(interval);
        // Abort aktuálny request pri cleanup
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
      };
    } else {
      // Cleanup aj ak nie je auto-refresh
      return () => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
      };
    }
  }, [loadData, autoRefresh, refreshInterval]);

  // Handler pre kliknutie na dlaždicu
  const handleTileClick = useCallback(
    (company: CompanyNode) => {
      if (onTileClick) {
        onTileClick(company);
      }
      // Odstránený default Google search - jednoklik teraz nič nerobí (iba tooltip)
    },
    [onTileClick]
  );

  // Handler pre zmenu timeframe
  const handleTimeframeChange = useCallback((newTimeframe: 'day' | 'week' | 'month') => {
    setTimeframe(newTimeframe);
    // Dáta sa načítajú automaticky cez useEffect
  }, []);

  // Handler pre zmenu metriky
  const handleMetricChange = useCallback((newMetric: HeatmapMetric) => {
    setMetric(newMetric);
    // Dáta sa nemusia načítavať znova, len sa zmení výpočet veľkosti dlaždíc
  }, []);

  // Použijeme size z ResizeObserver
  // Odstránený fallbackSize, ktorý spôsoboval problémy s layoutom (používal window rozmery namiesto kontajnera)
  const width = size.width;
  const height = size.height;

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📏 Heatmap Dimensions:', {
        observed: size,
        final: { width, height }
      });
    }
  }, [size, width, height]);

  // Vypočítaj vek dát pre zobrazenie
  const getDataAgeDisplay = (): string | null => {
    if (!lastUpdatedAt) return null;
    const ageMs = Date.now() - new Date(lastUpdatedAt).getTime();
    const ageMinutes = Math.floor(ageMs / 60000);
    if (ageMinutes < 1) return 'just now';
    if (ageMinutes === 1) return '1 min ago';
    return `${ageMinutes} min ago`;
  };

  const dataAgeDisplay = getDataAgeDisplay();
  const isDataStale = lastUpdatedAt ? (Date.now() - new Date(lastUpdatedAt).getTime()) > 10 * 60 * 1000 : false;

  // Podmienené returny až po všetkých hookoch
  // CRITICAL: Počas SSR a hydration, data je null, takže zobrazíme loading
  const renderContent = () => {
    if (!isMounted || (loading && (!data || data.length === 0))) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-black z-40">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="mb-2">Loading heatmap data...</p>
            <p className="text-xs text-gray-600">This may take up to 30 seconds on first load</p>
            <p className="text-xs text-gray-600 mt-1">Please wait while we fetch the latest stock data</p>
          </div>
        </div>
      );
    }

    if (error && (!data || data.length === 0)) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-black z-40">
          <div className="text-center">
            <p className="mb-2">Error loading heatmap</p>
            <p className="text-sm text-gray-500">{error}</p>
            <button
              onClick={() => loadData(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry (Force Refresh)
            </button>
          </div>
        </div>
      );
    }

    if (!data || data.length === 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-black z-40">
          <p>No data available</p>
        </div>
      );
    }

    return (
      <>
        {/* Metric selector - top left */}
        <div className="absolute top-2 left-2 z-50 flex gap-2">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg p-1 flex gap-1">
            <button
              onClick={() => handleMetricChange('percent')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${metric === 'percent'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
            >
              % Change
            </button>
            <button
              onClick={() => handleMetricChange('mcap')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${metric === 'mcap'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
            >
              Mcap Change
            </button>
          </div>
        </div>

        <MarketHeatmap
          data={data}
          width={width}
          height={height}
          onTileClick={handleTileClick}
          timeframe={timeframe}
          metric={metric}
        />
        {/* Last updated indicator */}
        {dataAgeDisplay && (
          <div
            className={`absolute bottom-2 right-2 px-2 py-1 rounded text-xs z-50 ${isDataStale
              ? 'bg-yellow-500/80 text-yellow-900'
              : 'bg-black/60 text-gray-300'
              }`}
            title={`Last updated: ${lastUpdatedAt}`}
          >
            Updated {dataAgeDisplay}
            {isDataStale && ' ⚠️'}
          </div>
        )}
      </>
    );
  };

  return (
    <div
      ref={ref}
      className="h-full w-full relative"
      style={{
        overflow: 'hidden',
        margin: 0,
        padding: 0,
        boxSizing: 'border-box',
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      {renderContent()}
    </div>
  );
};

export default ResponsiveMarketHeatmap;

