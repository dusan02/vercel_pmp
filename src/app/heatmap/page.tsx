'use client';

import React, { useEffect, useState } from 'react';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { CompanyNode, HeatmapLegend } from '@/components/MarketHeatmap';

/**
 * Testovacia stránka pre novú heatmapu
 */
export default function HeatmapPage() {
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>('day');

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

  // Odstránený Google search - jednoklik nič nerobí
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
        />
      </div>
    </div>
  );
}

