'use client';

import React, { useEffect } from 'react';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { CompanyNode } from '@/components/MarketHeatmap';

/**
 * Testovacia stránka pre novú heatmapu
 */
export default function HeatmapPage() {
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
    console.log('Clicked on:', company.symbol);
    // Môžeš pridať vlastnú logiku, napr. navigáciu na detail stránku
    window.open(`https://www.google.com/search?q=stock+${company.symbol}`, '_blank');
  };

  return (
    <div className="h-screen w-screen bg-black overflow-hidden flex flex-col" style={{ overflow: 'hidden' }} suppressHydrationWarning>
      <div className="p-4 z-50 text-white flex-shrink-0">
        <h1 className="text-4xl font-bold mb-2">
          Heatmap<span className="text-green-500">.today</span>
        </h1>
        <p className="text-sm text-gray-400">
          Interactive treemap visualization of stock market data
        </p>
      </div>
      <div className="flex-1 min-h-0 relative" style={{ overflow: 'hidden' }}>
        <ResponsiveMarketHeatmap
          apiEndpoint="/api/stocks"
          onTileClick={handleTileClick}
          autoRefresh={true}
          refreshInterval={60000}
          initialTimeframe="day"
        />
      </div>
    </div>
  );
}

