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
};

/**
 * Default tickery pre heatmapu (top 50 spoločností)
 */
const DEFAULT_HEATMAP_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'AVGO', 'LLY',
  'JPM', 'V', 'MA', 'UNH', 'HD', 'PG', 'JNJ', 'DIS', 'BAC', 'ADBE',
  'CRM', 'COST', 'ABBV', 'WMT', 'NFLX', 'AMD', 'NKE', 'TMO', 'LIN', 'PM',
  'QCOM', 'INTU', 'AMGN', 'AXP', 'BKNG', 'LOW', 'HON', 'AMAT', 'SBUX', 'ADI',
  'ISRG', 'GILD', 'C', 'VRTX', 'REGN', 'CDNS', 'SNPS', 'KLAC', 'FTNT', 'ANSS'
];

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
  };
}

/**
 * Načíta dáta z API endpointu
 * Pre heatmapu používame optimalizovaný /api/heatmap endpoint, ktorý vracia všetky firmy s cache
 */
async function fetchHeatmapData(
  endpoint: string,
  timeframe: 'day' | 'week' | 'month'
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

    const response = await fetch(url.toString(), {
      cache: 'no-store',
    });

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

    const result = await response.json();
    
    if (!result.success) {
      console.error('❌ Heatmap API returned error:', result.error);
      throw new Error(result.error || 'Failed to load heatmap data');
    }

    // API môže vracať rôzne formáty
    let stocks: StockData[] = [];

    if (result.data && Array.isArray(result.data)) {
      // Formát z /api/stocks (preferovaný, má sektor a industry)
      stocks = result.data;
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
    } else if (Array.isArray(result)) {
      stocks = result;
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
  refreshInterval = 60000,
  initialTimeframe = 'day',
}) => {
  // Všetky hooks musia byť na začiatku, pred akýmkoľvek podmieneným returnom
  // Poradie: useRef, useState, useEffect, useCallback, useMemo
  const { ref, size } = useElementResize();
  const [data, setData] = useState<CompanyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>(initialTimeframe);
  const [fallbackSize, setFallbackSize] = useState({ width: 800, height: 600 });

  // Načítanie dát
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companies = await fetchHeatmapData(apiEndpoint, timeframe);
      console.log(`📊 Heatmap: Načítaných ${companies.length} firiem`);
      setData(companies);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      console.error('Error loading heatmap data:', err);
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint, timeframe]);

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
      } else {
        // Default: otvorí Google search pre ticker
        window.open(`https://www.google.com/search?q=stock+${company.symbol}`, '_blank');
      }
    },
    [onTileClick]
  );

  // Handler pre zmenu timeframe
  const handleTimeframeChange = useCallback((newTimeframe: 'day' | 'week' | 'month') => {
    setTimeframe(newTimeframe);
    // Dáta sa načítajú automaticky cez useEffect
  }, []);

  // Fallback size effect
  useEffect(() => {
    if (size.width === 0 && size.height === 0 && typeof window !== 'undefined') {
      setFallbackSize({
        width: window.innerWidth,
        height: window.innerHeight - 100,
      });
    }
  }, [size.width, size.height]);

  const width = size.width || fallbackSize.width;
  const height = size.height || fallbackSize.height;

  // Podmienené returny až po všetkých hookoch
  if (loading && data.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading heatmap data...</p>
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
    <div ref={ref} className="h-full w-full relative" style={{ overflow: 'hidden' }}>
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

