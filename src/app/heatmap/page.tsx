'use client';

import React, { useEffect, useState } from 'react';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { CompanyNode, HeatmapLegend } from '@/components/MarketHeatmap';

// Timeframe selector component
const TimeframeSelector = ({ value, onChange }: { value: 'day' | 'week' | 'month', onChange: (v: 'day' | 'week' | 'month') => void }) => (
  <div className="flex bg-gray-800 rounded-md p-1 mr-4">
    {['day', 'week', 'month'].map((t) => (
      <button
        key={t}
        onClick={() => onChange(t as 'day' | 'week' | 'month')}
        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
          value === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
        }`}
      >
        {t === 'day' ? '1D' : t === 'week' ? '1W' : '1M'}
      </button>
    ))}
  </div>
);

/**
 * Stránka pre heatmapu
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
          <div>
            <h1 className="text-xl font-bold mb-0 leading-none">
              Heatmap<span className="text-green-500">.today</span>
            </h1>
            <p className="text-[9px] text-gray-400 hidden sm:block">
              Interactive visualization
            </p>
          </div>
          
          {/* Timeframe selector in header */}
          <TimeframeSelector value={timeframe} onChange={setTimeframe} />
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
        />
      </div>
    </div>
  );
}
