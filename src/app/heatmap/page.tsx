'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { CompanyNode, HeatmapLegend } from '@/components/MarketHeatmap';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { HeatmapMetricButtons } from '@/components/HeatmapMetricButtons';

/**
 * Stránka pre heatmapu
 */
export default function HeatmapPage() {
  // Timeframe je fixne nastavený na 'day'
  const timeframe = 'day';
  
  // Metrika heat mapy (Percent vs Mcap) - state lifting
  const { metric, setMetric } = useHeatmapMetric();

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
    console.log('Clicked on:', company.symbol);
  };

  return (
    <div 
      className="h-screen w-screen bg-black overflow-hidden flex flex-col" 
      style={{ overflow: 'hidden' }} 
      suppressHydrationWarning
    >
      <div className="px-2 py-1 z-50 text-white flex-shrink-0 flex items-center justify-between bg-black border-b border-gray-800">
        <div className="flex items-center gap-4">
          {/* Back button */}
          <Link 
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors duration-200 text-sm font-medium"
            title="Back to homepage"
          >
            <svg 
              className="w-4 h-4" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </Link>
          
          <div>
            <h1 className="text-xl font-bold mb-0 leading-none">
              Heatmap<span className="text-green-500">.today</span>
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
            />
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Legenda (farebná škála) */}
          <div className="hidden sm:block">
            <HeatmapLegend timeframe={timeframe} />
          </div>
        </div>
      </div>
      <div 
        className="flex-1 min-h-0 relative w-full"
        style={{ overflow: 'hidden', width: '100%' }}
      >
        <ResponsiveMarketHeatmap
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
