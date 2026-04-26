'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import { useElementResize } from '@/hooks/useElementResize';
import { useHeatmapData } from '@/hooks/useHeatmapData';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { HeatmapMetricButtons } from './HeatmapMetricButtons';

// Dynamic import for new mobile treemap (client-side only)
const MobileTreemapNew = dynamic(
  () => import('@/components/MobileTreemapNew').then(mod => ({ default: mod.MobileTreemapNew })),
  { 
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-black flex items-center justify-center">
        <div className="text-white text-sm">Loading mobile heatmap...</div>
      </div>
    )
  }
);

// Desktop heatmap is heavy (D3, tooltip, canvas). Load it only when needed so mobile bundle stays lean.
const DesktopMarketHeatmap = dynamic(
  () => import('@/components/MarketHeatmap').then((mod) => ({ default: mod.MarketHeatmap })),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-black text-white text-sm">
        Loading desktop heatmap...
      </div>
    ),
  }
);

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
  /** Variant sector labels: 'compact' for homepage, 'full' for heatmap page */
  sectorLabelVariant?: 'compact' | 'full';
  /** Signalizuje, či je heatmap aktívny view (pre automatické zatvorenie sheetu) */
  activeView?: string | undefined;
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
  sectorLabelVariant = 'compact',
  activeView,
}) => {
  // Resize hook
  const { ref, size } = useElementResize();
  const width = size.width;
  const height = size.height;

  const [isMounted, setIsMounted] = useState(false);

  // Use hook for reliable desktop/mobile detection (consistent with other components)
  const isMobile = useMediaQuery('(max-width: 767px)');

  // Centralized metric state management
  // Use controlledMetric if provided (for external control), otherwise use hook
  const { metric: centralizedMetric, setMetric: setMetricInternal } = useHeatmapMetric(
    controlledMetric ?? initialMetric ?? 'percent'
  );

  // Data fetching hook
  // OPTIMIZATION: On mobile, use same refresh interval but ensure minimum 30s for battery
  const mobileRefreshInterval = isMobile ? Math.max(refreshInterval, 30000) : refreshInterval; // Min 30s on mobile

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
    refreshInterval: mobileRefreshInterval,
    initialTimeframe,
    initialMetric: controlledMetric ?? centralizedMetric, // Sync with centralized or controlled metric
    autoRefresh: autoRefresh && isMounted // Only auto-refresh after mount
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
    // DESKTOP ONLY: Don't render until we have valid dimensions.
    // On mobile, skip this gate entirely — MobileTreemapNew handles its own
    // dimension measurement. When the mobile-app-screen is hidden (display:none),
    // useElementResize returns 0x0 which would block rendering indefinitely.
    const minDimension = 50;

    if (!isMobile && (!width || !height || width < minDimension || height < minDimension)) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-40 bg-white dark:bg-transparent">
          <div className="animate-pulse text-sm text-gray-400">
            Measuring container...
          </div>
        </div>
      );
    }

    // Show loading only when we genuinely have no data yet
    // Cache is now read synchronously so data is usually available on first render
    const hasNoData = !data || data.length === 0;
    const shouldShowLoading = loading && hasNoData;

    if (shouldShowLoading) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-40 bg-white dark:bg-transparent">
          <div className="animate-spin rounded-full border-b-2 border-blue-600 w-8 h-8" />
          <span className="text-base font-semibold text-gray-900 dark:text-white">
            Loading heatmap data...
          </span>
          <span className="text-sm text-center max-w-xs text-gray-500 dark:text-gray-400">
            This may take up to 30 seconds on first load
          </span>
        </div>
      );
    }

    // Error state
    if (error && (!data || data.length === 0)) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-white dark:bg-black z-40">
          <div className="text-center">
            <p className="mb-2 font-bold">Error loading heatmap</p>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    // No data state - REFAKTOROVANÝ
    if (!data || data.length === 0) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-40 bg-white dark:bg-transparent">
          <div className="text-6xl mb-2 opacity-50 grayscale">
            📈
          </div>
          <span className="text-base font-semibold text-gray-900 dark:text-white">
            Data are loading
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Heatmap data is loading...
          </span>
        </div>
      );
    }

    // Mobile: MobileTreemapNew | Desktop: MarketHeatmap
    if (isMobile) {
      return (
        <MobileTreemapNew
          data={data || []}
          timeframe={timeframe}
          metric={metric}
          {...(onMetricChange ? { onMetricChange: onMetricChange as any } : {})}
          {...(onTileClick ? { onTileClick } : {})}
          activeView={activeView}
        />
      );
    }

    // Desktop: Always show Heatmap (removed sector list for mobile per user request)
    return (
      <>
        {/* Metric selector - top left overlay (only if not hidden, and not on mobile - mobile has it in header) */}
        {!hideMetricButtons && !isMobile && (
          <div className="absolute top-2 left-2 z-50 flex gap-2">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg p-1">
              <HeatmapMetricButtons
                metric={metric}
                onMetricChange={setMetric}
              />
            </div>
          </div>
        )}

        {/* Heatmap */}
        <DesktopMarketHeatmap
          data={data}
          width={width}
          height={height}
          {...(onTileClick ? { onTileClick } : {})}
          timeframe={timeframe}
          metric={metric}
          sectorLabelVariant={sectorLabelVariant}
          zoomedSector={null}
        />

        {/* Last updated indicator - only on desktop (mobile has it in header or can be added) */}

      </>
    );
  };

  // Fallback: If dimensions are still 0 after mount, try to get from parent
  useEffect(() => {
    if (ref.current && (width === 0 || height === 0)) {
      const element = ref.current;
      const parent = element.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        if (parentRect.width > 0 && parentRect.height > 0) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('📐 Heatmap: Using parent dimensions as fallback', {
              parentWidth: parentRect.width,
              parentHeight: parentRect.height
            });
          }
          // Force a re-measure by triggering a resize
          window.dispatchEvent(new Event('resize'));
        }
      }
    }
  }, [width, height]);

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
        minHeight: isMobile ? '0px' : '400px', // Ensure minimum height for desktop, fill available on mobile
        // CRITICAL: Remove overflow from outer container - let MarketHeatmap handle scrolling
        // This prevents double scrollbars (one here, one in MarketHeatmap)
        overflow: 'hidden', // Always hidden - MarketHeatmap handles its own scrolling
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {renderContent()}
    </div>
  );
};

export default ResponsiveMarketHeatmap;
