'use client';

import React, { useEffect, useState } from 'react';
import { MarketHeatmap, CompanyNode, useElementResize, HeatmapMetric } from './MarketHeatmap';
import { useHeatmapData } from '@/hooks/useHeatmapData';

export type ResponsiveMarketHeatmapProps = {
  /** API endpoint pre načítanie dát (default: /api/heatmap) */
  apiEndpoint?: string;
  /** Callback pri kliknutí na dlaždicu */
  onTileClick?: (company: CompanyNode) => void;
  /** Automatické obnovovanie dát */
  autoRefresh?: boolean;
  /** Interval obnovovania v ms (default: 30000 = 30s) */
  refreshInterval?: number;
  /** Počiatočný timeframe */
  initialTimeframe?: 'day' | 'week' | 'month';
};

/**
 * Wrapper komponent, ktorý poskytuje responzívnu veľkosť
 * a načítava dáta z API pomocou useHeatmapData hooku
 */
export const ResponsiveMarketHeatmap: React.FC<ResponsiveMarketHeatmapProps> = ({
  apiEndpoint = '/api/heatmap',
  onTileClick,
  autoRefresh = true,
  refreshInterval = 30000,
  initialTimeframe = 'day',
}) => {
  // Resize hook
  const { ref, size } = useElementResize();
  const width = size.width;
  const height = size.height;
  
  const [isMounted, setIsMounted] = useState(false);

  // Data fetching hook - REFACTORED
  const {
    data,
    loading,
    error,
    lastUpdated,
    timeframe,
    setTimeframe,
    metric,
    setMetric,
    refetch
  } = useHeatmapData({
    apiEndpoint,
    refreshInterval,
    initialTimeframe,
    autoRefresh
  });

  // Zabezpeč, že komponent je mounted (hydration safety)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📏 Heatmap Dimensions:', { width, height });
    }
  }, [width, height]);

  // Vypočítaj vek dát pre zobrazenie
  const getDataAgeDisplay = (): string | null => {
    if (!lastUpdated) return null;
    
    // Check if lastUpdated is a valid date string
    const date = new Date(lastUpdated);
    if (isNaN(date.getTime())) return null;

    const ageMs = Date.now() - date.getTime();
    const ageMinutes = Math.floor(ageMs / 60000);
    if (ageMinutes < 1) return 'just now';
    if (ageMinutes === 1) return '1 min ago';
    return `${ageMinutes} min ago`;
  };

  const dataAgeDisplay = getDataAgeDisplay();
  const isDataStale = lastUpdated ? (Date.now() - new Date(lastUpdated).getTime()) > 10 * 60 * 1000 : false;

  // Render content logic
  const renderContent = () => {
    // Loading state (only initial or when no data)
    if (!isMounted || (loading && (!data || data.length === 0))) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-black z-40">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="mb-2">Loading heatmap data...</p>
            <p className="text-xs text-gray-600">This may take up to 30 seconds on first load</p>
          </div>
        </div>
      );
    }

    // Error state
    if (error && (!data || data.length === 0)) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-black z-40">
          <div className="text-center">
            <p className="mb-2">Error loading heatmap</p>
            <p className="text-sm text-gray-500">{error}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    // No data state
    if (!data || data.length === 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-black z-40">
          <p>No data available</p>
        </div>
      );
    }

    // Data loaded state
    return (
      <>
        {/* Metric selector - top left overlay */}
        <div className="absolute top-2 left-2 z-50 flex gap-2">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg p-1 flex gap-1">
            <button
              onClick={() => setMetric('percent')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${metric === 'percent'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
            >
              % Change
            </button>
            <button
              onClick={() => setMetric('mcap')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${metric === 'mcap'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
            >
              Mcap Change
            </button>
          </div>
        </div>

        {/* Timeframe selector - top center overlay (optional, handled by page or here?) */}
        {/* Currently timeframe is passed via props usually, but hook manages it now. 
            We can expose controls here if needed, or let parent handle it.
            The page.tsx has a selector passed to Legend, but here we have internal state.
            Ideally, we should sync props with internal state or lift state up.
            For now, let's assume parent controls it via props or we add controls here.
            The hook respects initialTimeframe.
        */}

        <MarketHeatmap
          data={data}
          width={width}
          height={height}
          {...(onTileClick ? { onTileClick } : {})}
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
            title={`Last updated: ${lastUpdated}`}
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
