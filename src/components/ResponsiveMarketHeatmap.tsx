'use client';

import React, { useEffect, useState } from 'react';
import { MarketHeatmap, CompanyNode, useElementResize, HeatmapMetric } from './MarketHeatmap';
import { useHeatmapData } from '@/hooks/useHeatmapData';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { HeatmapMetricButtons } from './HeatmapMetricButtons';
import { SectorListMobile } from './SectorListMobile';

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
  /** Počiatočný metric (ak je poskytnutý, prepíše default z hooku) */
  initialMetric?: HeatmapMetric;
  /** Kontrolovaný metric (ak je poskytnutý, prepíše vnútorný state) - DEPRECATED: use initialMetric */
  controlledMetric?: HeatmapMetric;
  /** Callback pri zmene metriky (ak je poskytnutý, volá sa pri každej zmene) */
  onMetricChange?: (metric: HeatmapMetric) => void;
  /** Skryť buttony pre prepínanie metriky (ak sú kontrolované zvonka) */
  hideMetricButtons?: boolean;
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
  initialMetric,
  controlledMetric,
  onMetricChange,
  hideMetricButtons = false,
}) => {
  // Resize hook
  const { ref, size } = useElementResize();
  const width = size.width;
  const height = size.height;
  
  const [isMounted, setIsMounted] = useState(false);
  
  // Mobile detection and sector navigation state
  const [isMobile, setIsMobile] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  
  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Centralized metric state management
  // Use controlledMetric if provided (for external control), otherwise use hook
  const { metric: centralizedMetric, setMetric: setMetricInternal } = useHeatmapMetric(
    controlledMetric ?? initialMetric ?? 'percent'
  );

  // Data fetching hook
  const {
    data,
    loading,
    error,
    lastUpdated,
    timeframe,
    setTimeframe,
    metric: hookMetric,
    setMetric: setHookMetric,
    refetch
  } = useHeatmapData({
    apiEndpoint,
    refreshInterval,
    initialTimeframe,
    initialMetric: controlledMetric ?? centralizedMetric, // Sync with centralized or controlled metric
    autoRefresh
  });

  // Use controlled metric if provided, otherwise use centralized metric, fallback to hook metric
  const metric = controlledMetric ?? centralizedMetric ?? hookMetric;

  // Handle metric change - sync with all systems
  const setMetric = (newMetric: HeatmapMetric) => {
    setMetricInternal(newMetric);
    setHookMetric(newMetric);
    if (onMetricChange) {
      onMetricChange(newMetric);
    }
  };

  // Sync hook's metric with centralized metric when not controlled
  useEffect(() => {
    if (controlledMetric === undefined && hookMetric !== centralizedMetric) {
      setHookMetric(centralizedMetric);
    }
  }, [centralizedMetric, hookMetric, controlledMetric, setHookMetric]);

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
    // Mobile: Show sector list or sector heatmap
    if (isMobile) {
      // Filter data by selected sector if sector is selected
      const filteredData = selectedSector
        ? data.filter((company) => (company.sector || 'Unknown') === selectedSector)
        : data;

      return (
        <>
          {/* Sector list view (no sector selected) */}
          {!selectedSector ? (
            <>
              {/* Metric selector - top left overlay (only if not hidden) */}
              {!hideMetricButtons && (
                <div className="absolute top-2 left-2 z-50 flex gap-2">
                  <div className="bg-black/70 backdrop-blur-sm rounded-lg p-1">
                    <HeatmapMetricButtons
                      metric={metric}
                      onMetricChange={setMetric}
                    />
                  </div>
                </div>
              )}

              <SectorListMobile
                data={data}
                onSectorClick={(sector) => setSelectedSector(sector)}
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
          ) : (
            /* Sector heatmap view (sector selected) */
            <>
              {/* Back button */}
              <button
                onClick={() => setSelectedSector(null)}
                className="absolute top-2 left-2 z-50 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
              >
                ← Back to Sectors
              </button>

              {/* Sector name */}
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-50 px-3 py-1.5 bg-black/70 backdrop-blur-sm text-white text-sm font-medium rounded">
                {selectedSector}
              </div>

              {/* Metric selector - top right overlay (only if not hidden) */}
              {!hideMetricButtons && (
                <div className="absolute top-2 right-2 z-50 flex gap-2">
                  <div className="bg-black/70 backdrop-blur-sm rounded-lg p-1">
                    <HeatmapMetricButtons
                      metric={metric}
                      onMetricChange={setMetric}
                    />
                  </div>
                </div>
              )}

              {/* Heatmap for selected sector */}
              <MarketHeatmap
                data={filteredData}
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
          )}
        </>
      );
    }

    // Desktop: Original behavior (no changes)
    return (
      <>
        {/* Metric selector - top left overlay (only if not hidden) */}
        {!hideMetricButtons && (
          <div className="absolute top-2 left-2 z-50 flex gap-2">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg p-1">
              <HeatmapMetricButtons
                metric={metric}
                onMetricChange={setMetric}
              />
            </div>
          </div>
        )}

        {/* Timeframe selector - top center overlay (optional, handled by page or here?) */}
        {/* Currently timeframe is passed via props usually, but hook manages it now. 
            We can expose controls here if needed, or let parent handle it.
            The page.tsx has a selector passed to Legend, but here we have internal state.
            Ideally, we should sync props with internal state or lift state up.
            For now, let's assume parent controls it via props or we add controls here.
            The hook respects initialTimeframe.
        */}

        {/* Same treemap layout for both desktop and mobile - vertical scroll on mobile */}
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
      className="h-full w-full relative mobile-heatmap-wrapper"
      style={{
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
