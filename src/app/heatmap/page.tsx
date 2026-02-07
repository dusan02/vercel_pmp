'use client';

import React, { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import type { CompanyNode } from '@/lib/heatmap/types';
import { HeatmapLegend } from '@/components/MarketHeatmap';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { HeatmapMetricButtons } from '@/components/HeatmapMetricButtons';
import { logger } from '@/lib/utils/logger';
import { event } from '@/lib/ga';

/**
 * Stránka pre heatmapu
 */
export default function HeatmapPage() {
  const router = useRouter();
  // Timeframe je fixne nastavený na 'day'
  const timeframe = 'day';
  
  // Metrika heat mapy (Percent vs Mcap) - state lifting
  const { metric, setMetric } = useHeatmapMetric();
  
  // Ensure heatmap page has normal font size
  useEffect(() => {
    document.body.classList.add('heatmap-page-wrapper');
    return () => {
      document.body.classList.remove('heatmap-page-wrapper');
    };
  }, []);

  // Handler pre exit fullscreen (návrat na homepage)
  const handleExitFullscreen = useCallback(() => {
    event('heatmap_fullscreen_toggle', { enabled: false });
    router.push('/');
  }, [router]);

  // Odstránenie scrollbarov z body a html
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyMargin = document.body.style.margin;
    const originalHtmlMargin = document.documentElement.style.margin;
    const originalBodyPadding = document.body.style.padding;
    
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.documentElement.style.margin = '0';
    document.body.style.padding = '0';
    
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.margin = originalBodyMargin;
      document.documentElement.style.margin = originalHtmlMargin;
      document.body.style.padding = originalBodyPadding;
    };
  }, []);

  const handleTileClick = (company: CompanyNode) => {
    // Jednoklik - nič nerobíme (iba tooltip)
    logger.debug('Heatmap tile clicked', { symbol: company.symbol });
    
    // Track ticker click event
    event('ticker_click', {
      ticker: company.symbol,
      source: 'heatmap'
    });
  };

  return (
    <div 
      className="h-screen w-screen bg-black overflow-hidden flex flex-col" 
      style={{ overflow: 'hidden' }} 
      suppressHydrationWarning
    >
      <div className="px-2 py-1 z-50 text-white flex-shrink-0 flex items-center justify-between bg-black border-b border-gray-800">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold mb-0 leading-none">
              Heatmap<span className="text-green-500">.{metric === 'percent' ? '% Change' : 'Mcap Change'}</span>
            </h1>
            <p className="text-[9px] text-gray-400 hidden sm:block">
              Interactive visualization
            </p>
          </div>

          {/* Heatmap Metric Buttons - moved here by user request */}
          <div className="ml-2">
            <HeatmapMetricButtons 
              metric={metric} 
              onMetricChange={setMetric}
              variant="dark"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Legenda (farebná škála) */}
          <div className="hidden sm:block">
            <HeatmapLegend timeframe={timeframe} />
          </div>
          
          {/* Exit fullscreen button - moved to top right */}
          <button
            onClick={handleExitFullscreen}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors duration-200 text-sm font-semibold shadow-md"
            title="Exit fullscreen (back to homepage)"
            aria-label="Exit fullscreen"
          >
            <svg 
              className="w-4 h-4" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>
      <div 
        className="flex-1 min-h-0 relative w-full"
        style={{ overflow: 'hidden', width: '100%' }}
      >
        <ResponsiveMarketHeatmap
          sectorLabelVariant="full"
          apiEndpoint="/api/heatmap"
          onTileClick={handleTileClick}
          autoRefresh={true}
          refreshInterval={30000} // 30s - zladené s CACHE_TTL v /api/heatmap
          initialTimeframe={timeframe}
          controlledMetric={metric}
          onMetricChange={setMetric}
          hideMetricButtons={true}
        />
      </div>
    </div>
  );
}
