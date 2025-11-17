'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import React from 'react';
import { MarketHeatmap, CompanyNode, useElementResize } from './MarketHeatmap';
import { StockData } from '@/lib/types';

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
  /** Fullscreen režim - heatmapa zaberie celú obrazovku bez okrajov */
  fullscreen?: boolean;
};

/**
 * Transformuje StockData z API na CompanyNode pre heatmapu
 */
function transformStockDataToCompanyNode(stock: StockData): CompanyNode | null {
  if (!stock.ticker || !stock.sector || !stock.industry) {
    return null;
  }

  return {
    symbol: stock.ticker,
    name: stock.companyName || stock.ticker,
    sector: stock.sector,
    industry: stock.industry,
    marketCap: stock.marketCap || 0,
    changePercent: stock.percentChange || 0,
    marketCapDiff: stock.marketCapDiff,
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
  setEtag?: (etag: string | null) => void
): Promise<CompanyNode[]> {
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

    const headers: HeadersInit = {
      'Accept': 'application/json',
    };
    
    // Pridaj If-None-Match header pre ETag support
    if (lastEtag) {
      headers['If-None-Match'] = lastEtag;
    }

    // Pridaj timeout (90 sekúnd) pre pomalé requesty - /api/stocks môže trvať dlhšie kvôli cache
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout
    
    const response = await fetch(url.toString(), {
      cache: 'no-store',
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    // 304 Not Modified - dáta sa nezmenili, použijeme existujúce
    if (response.status === 304) {
      console.log('📊 Heatmap: 304 Not Modified - using cached data');
      return []; // Vráť prázdne pole, aby sa nezmenili dáta
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

    const result = await response.json();
    
    console.log('📊 Heatmap API response:', {
      success: result.success,
      hasData: !!result.data,
      dataLength: result.data?.length || 0,
      error: result.error,
      count: result.count,
    });
    
    if (!result.success) {
      const errorMsg = result.error || 'Failed to load heatmap data';
      console.error('❌ Heatmap API returned error:', errorMsg);
      throw new Error(errorMsg);
    }

    // API môže vracať rôzne formáty
    let stocks: StockData[] = [];

    if (result.data && Array.isArray(result.data)) {
      // Formát z /api/heatmap (preferovaný, má sektor a industry)
      stocks = result.data;
      console.log(`📊 Parsed ${stocks.length} stocks from result.data`);
    } else if (result.rows && Array.isArray(result.rows)) {
      // Formát z /api/stocks/optimized (fallback, nemá sektor/industry)
      stocks = result.rows.map((row: any) => ({
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
    } else if (Array.isArray(result)) {
      stocks = result;
      console.log(`📊 Parsed ${stocks.length} stocks from result array`);
    } else {
      console.warn('⚠️ Unexpected API response format:', result);
    }

    // Transformujeme na CompanyNode a filtrujeme neplatné
    const companies = stocks
      .map(transformStockDataToCompanyNode)
      .filter((node): node is CompanyNode => node !== null);

    console.log(`📊 Heatmap API: Prijatých ${stocks.length} firiem z API, po transformácii ${companies.length} firiem s sector/industry`);

    return companies;
  } catch (error) {
    console.error('Error fetching heatmap data:', error);
    return [];
  }
}

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
  fullscreen = false,
}) => {
  // Všetky hooks musia byť na začiatku, pred akýmkoľvek podmieneným returnom
  // Poradie: useRef, useState, useEffect, useCallback, useMemo
  const { ref, size } = useElementResize();
  const [data, setData] = useState<CompanyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>(initialTimeframe);
  const [fallbackSize, setFallbackSize] = useState({ width: 800, height: 600 });
  const [lastEtag, setLastEtag] = useState<string | null>(null);

  // Načítanie dát s ETag support
  const loadData = useCallback(async () => {
    // Pri auto-refresh nechceme zobrazovať loading, ak už máme dáta
    const hasData = data.length > 0;
    if (!hasData) {
      setLoading(true);
    }
    setError(null);
    
    const loadStartTime = Date.now();
    
    try {
      console.log('🔄 Heatmap: Starting data fetch...');
      const companies = await fetchHeatmapData(apiEndpoint, timeframe, lastEtag, setLastEtag);
      const loadDuration = Date.now() - loadStartTime;
      
      // Prázdne pole znamená 304 Not Modified - dáta sa nezmenili
      if (companies.length > 0) {
        console.log(`✅ Heatmap: Načítaných ${companies.length} firiem za ${loadDuration}ms`);
        setData(companies);
        setLoading(false);
      } else if (!hasData) {
        // Ak nemáme dáta a dostali sme 304, musíme načítať znovu bez ETag
        console.log('🔄 Heatmap: 304 on initial load, retrying without ETag...');
        const retryStartTime = Date.now();
        const companiesRetry = await fetchHeatmapData(apiEndpoint, timeframe, null, setLastEtag);
        const retryDuration = Date.now() - retryStartTime;
        if (companiesRetry.length > 0) {
          console.log(`✅ Heatmap: Načítaných ${companiesRetry.length} firiem po retry za ${retryDuration}ms`);
          setData(companiesRetry);
        } else {
          console.warn('⚠️ Heatmap: No data received after retry');
          setError('No data available - please check server logs');
        }
        setLoading(false);
      } else {
        console.log(`📊 Heatmap: 304 Not Modified - data unchanged (${loadDuration}ms)`);
        setLoading(false);
      }
    } catch (err) {
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
    }
  }, [apiEndpoint, timeframe, lastEtag, data]);

  // Počiatočné načítanie a auto-refresh
  useEffect(() => {
    loadData();

    if (autoRefresh) {
      const interval = setInterval(loadData, refreshInterval);
      return () => clearInterval(interval);
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

  // Ulož pomer strán z normálneho režimu (pred prepnutím do fullscreen)
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  // Ulož pomer strán z normálneho režimu (keď nie sme vo fullscreen)
  useEffect(() => {
    if (fullscreen || typeof window === 'undefined') return;
    
    // V normálnom režime uložíme pomer strán z aktuálnej veľkosti
    if (size.width > 0 && size.height > 0) {
      const ratio = size.width / size.height;
      if (ratio > 0 && ratio !== aspectRatio) {
        console.log(`📐 Aspect ratio saved: ${ratio.toFixed(3)} (${size.width}x${size.height})`);
        setAspectRatio(ratio);
      }
    } else if (size.width === 0 && size.height === 0) {
      // Fallback - použijeme window size mínus header
      const normalWidth = window.innerWidth;
      const normalHeight = window.innerHeight - 100;
      if (normalHeight > 0) {
        const ratio = normalWidth / normalHeight;
        if (ratio > 0 && ratio !== aspectRatio) {
          console.log(`📐 Aspect ratio saved (fallback): ${ratio.toFixed(3)} (${normalWidth}x${normalHeight})`);
          setAspectRatio(ratio);
        }
      }
    }
  }, [size.width, size.height, fullscreen, aspectRatio]);

  // Fallback size pre normálny režim
  useEffect(() => {
    if (fullscreen || typeof window === 'undefined') return;
    
    if (size.width === 0 && size.height === 0) {
      const normalWidth = window.innerWidth;
      const normalHeight = window.innerHeight - 100;
      setFallbackSize({
        width: normalWidth,
        height: normalHeight,
      });
    }
  }, [size.width, size.height, fullscreen]);

  // State pre fullscreen veľkosť s zachovaním pomeru strán
  const [fullscreenSize, setFullscreenSize] = useState({ width: 0, height: 0 });

  // Vypočítaj fullscreen veľkosť - použijeme celý viewport (okrem offsetu na Exit button)
  // Vo fullscreen režime ignorujeme aspect ratio a vyplníme celú obrazovku
  useEffect(() => {
    if (!fullscreen || typeof window === 'undefined') {
      setFullscreenSize({ width: 0, height: 0 });
      return;
    }

    const calculateSize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Použijeme celý viewport - Exit button je absolute, takže neobmedzuje kontajner
      // Použijeme presné viewport hodnoty bez akýchkoľvek odčítaní
      setFullscreenSize({
        width: viewportWidth,
        height: viewportHeight,
      });

      console.log(
        `📐 Fullscreen size (full viewport): ${viewportWidth}x${viewportHeight} (viewport: ${viewportWidth}x${viewportHeight})`
      );
    };

    calculateSize();

    // Pridaj resize listener
    window.addEventListener('resize', calculateSize);
    return () => window.removeEventListener('resize', calculateSize);
  }, [fullscreen]);

  // V fullscreen režime IGNORUJEME size z ResizeObserver a používame iba fullscreenSize
  // V normálnom režime používame size z ResizeObserver alebo fallbackSize
  const width = fullscreen 
    ? (fullscreenSize.width || (typeof window !== 'undefined' ? window.innerWidth : 1920))
    : (size.width || fallbackSize.width);
  const height = fullscreen
    ? (fullscreenSize.height || (typeof window !== 'undefined' ? window.innerHeight : 1080))
    : (size.height || fallbackSize.height);

  // Debug log pre fullscreen veľkosti
  useEffect(() => {
    if (fullscreen) {
      console.log(`🔍 Fullscreen container size: ${width}px x ${height}px`);
      console.log(`🔍 FullscreenSize state: ${fullscreenSize.width}px x ${fullscreenSize.height}px`);
      console.log(`🔍 Viewport: ${typeof window !== 'undefined' ? window.innerWidth : 'N/A'}px x ${typeof window !== 'undefined' ? window.innerHeight : 'N/A'}px`);
    }
  }, [fullscreen, width, height, fullscreenSize]);

  // Podmienené returny až po všetkých hookoch
  if (loading && data.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="mb-2">Loading heatmap data...</p>
          <p className="text-xs text-gray-600">This may take up to 90 seconds on first load</p>
          <p className="text-xs text-gray-600 mt-1">Please wait while we fetch the latest stock data</p>
        </div>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-red-500">
        <div className="text-center">
          <p className="mb-2">Error loading heatmap</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-gray-500">
        <p>No data available</p>
      </div>
    );
  }

        return (
          <div 
            ref={fullscreen ? null : ref} 
            className={fullscreen ? "" : "h-full w-full relative"}
            style={{ 
              overflow: 'hidden', 
              margin: 0, 
              padding: 0,
              boxSizing: 'border-box',
              // Vo fullscreen režime - absolute positioning, natiahnuté na celú obrazovku
              ...(fullscreen ? {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                minWidth: '100vw',
                minHeight: '100vh',
                maxWidth: '100vw',
                maxHeight: '100vh',
              } : {
                position: 'relative',
                width: '100%',
                height: '100%',
              }),
            }}
          >
      <MarketHeatmap
        data={data}
        width={width}
        height={height}
        onTileClick={handleTileClick}
        timeframe={timeframe}
      />
    </div>
          );
};

export default ResponsiveMarketHeatmap;

