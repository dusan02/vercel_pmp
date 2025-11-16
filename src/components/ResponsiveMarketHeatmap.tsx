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
 * Pre heatmapu potrebujeme sektor a industry, takže preferujeme /api/stocks
 */
async function fetchHeatmapData(
  endpoint: string,
  timeframe: 'day' | 'week' | 'month'
): Promise<CompanyNode[]> {
  try {
    // Ak je to optimized endpoint, použijeme /api/stocks namiesto toho
    // pretože optimized nevracia sektor a industry
    let url: URL;
    if (endpoint.includes('/optimized')) {
      // Použijeme hlavný stocks endpoint s default tickers
      url = new URL('/api/stocks', window.location.origin);
      // Načítame top tickers - môžeme použiť default tickers alebo načítať z iného endpointu
      // Pre teraz použijeme známe tickery
      const defaultTickers = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'AVGO', 'LLY',
        'JPM', 'V', 'MA', 'UNH', 'HD', 'PG', 'JNJ', 'DIS', 'BAC', 'ADBE',
        'CRM', 'COST', 'ABBV', 'WMT', 'NFLX', 'AMD', 'NKE', 'TMO', 'LIN', 'PM',
        'QCOM', 'INTU', 'AMGN', 'AXP', 'BKNG', 'LOW', 'HON', 'AMAT', 'SBUX', 'ADI',
        'ISRG', 'GILD', 'C', 'VRTX', 'REGN', 'CDNS', 'SNPS', 'KLAC', 'FTNT', 'ANSS'
      ];
      url.searchParams.set('tickers', defaultTickers.join(','));
      url.searchParams.set('limit', '500');
    } else {
      url = new URL(endpoint, window.location.origin);
      // Pre /api/stocks endpoint
      if (endpoint.includes('/stocks') && !endpoint.includes('tickers')) {
        // Ak nie sú tickers, použijeme default
        const defaultTickers = [
          'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'AVGO', 'LLY',
          'JPM', 'V', 'MA', 'UNH', 'HD', 'PG', 'JNJ', 'DIS', 'BAC', 'ADBE',
          'CRM', 'COST', 'ABBV', 'WMT', 'NFLX', 'AMD', 'NKE', 'TMO', 'LIN', 'PM',
          'QCOM', 'INTU', 'AMGN', 'AXP', 'BKNG', 'LOW', 'HON', 'AMAT', 'SBUX', 'ADI',
          'ISRG', 'GILD', 'C', 'VRTX', 'REGN', 'CDNS', 'SNPS', 'KLAC', 'FTNT', 'ANSS'
        ];
        url.searchParams.set('tickers', defaultTickers.join(','));
        url.searchParams.set('limit', '500');
      }
    }

    const response = await fetch(url.toString(), {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();

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
  apiEndpoint = '/api/stocks',
  onTileClick,
  autoRefresh = true,
  refreshInterval = 60000,
  initialTimeframe = 'day',
}) => {
  // Všetky hooks musia byť na začiatku, pred akýmkoľvek podmieneným returnom
  const { ref, size } = useElementResize();
  const [data, setData] = useState<CompanyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>(initialTimeframe);
  // Fallback veľkosť ak ResizeObserver ešte nezaznamenal veľkosť
  const [fallbackSize, setFallbackSize] = useState({ width: 800, height: 600 });

  // Načítanie dát
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companies = await fetchHeatmapData(apiEndpoint, timeframe);
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
    <div ref={ref} className="h-full w-full relative">
      <MarketHeatmap
        data={data}
        width={width}
        height={height}
        onTileClick={handleTileClick}
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
      />
    </div>
  );
};

export default ResponsiveMarketHeatmap;

