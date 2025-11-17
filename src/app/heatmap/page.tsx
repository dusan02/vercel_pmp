'use client';

import React, { useEffect, useState } from 'react';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { CompanyNode, HeatmapLegend } from '@/components/MarketHeatmap';

/**
 * Testovacia stránka pre novú heatmapu
 */
export default function HeatmapPage() {
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>('day');
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // ESC handler pre ukončenie fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Odstránený Google search - jednoklik nič nerobí
  const handleTileClick = (company: CompanyNode) => {
    // Jednoklik - nič nerobíme (iba tooltip)
    console.log('Clicked on:', company.symbol);
  };

  // Handler pre fullscreen toggle
  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  if (isFullscreen) {
    // Fullscreen režim - celá obrazovka bez okrajov
    return (
      <div 
        className="fixed inset-0 bg-black z-50"
        style={{
          width: '100vw',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          margin: 0,
          padding: 0,
          overflow: 'hidden',
        }}
        suppressHydrationWarning
      >
        {/* Exit fullscreen button - minimálny, transparentný */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 z-50 px-2 py-1 bg-black/50 hover:bg-black/70 text-white rounded transition-colors flex items-center gap-1"
          style={{
            backdropFilter: 'blur(4px)',
          }}
          title="Exit fullscreen (ESC)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-xs font-medium">Exit</span>
        </button>
        {/* Kontajner pre heatmapu – vyplní celú obrazovku a centrovať heatmapu */}
        <ResponsiveMarketHeatmap
          apiEndpoint="/api/stocks"
          onTileClick={handleTileClick}
          autoRefresh={true}
          refreshInterval={60000}
          initialTimeframe={timeframe}
          fullscreen={true}
        />
      </div>
    );
  }

  // Normálny režim - s headerom a legendou
  return (
    <div 
      className="h-screen w-screen bg-black overflow-hidden flex flex-col" 
      style={{ overflow: 'hidden' }} 
      suppressHydrationWarning
    >
      <div className="px-2 py-1 z-50 text-white flex-shrink-0 flex items-center justify-between bg-black">
        <div>
          <h1 className="text-xl font-bold mb-0">
            Heatmap<span className="text-green-500">.today</span>
          </h1>
          <p className="text-[9px] text-gray-400">
            Interactive treemap visualization of stock market data
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Legenda vedľa nadpisu */}
          <HeatmapLegend timeframe={timeframe} />
          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center gap-2"
            title="Enter fullscreen"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span className="text-xs font-medium">Fullscreen</span>
          </button>
        </div>
      </div>
      <div 
        className="flex-1 min-h-0 relative w-full"
        style={{ overflow: 'hidden', width: '100%' }}
      >
        <ResponsiveMarketHeatmap
          apiEndpoint="/api/stocks"
          onTileClick={handleTileClick}
          autoRefresh={true}
          refreshInterval={30000} // 30s - zladené s CACHE_TTL v /api/heatmap
          initialTimeframe={timeframe}
        />
      </div>
    </div>
  );
}

