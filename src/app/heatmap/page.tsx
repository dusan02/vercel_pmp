'use client';

import React from 'react';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { CompanyNode } from '@/components/MarketHeatmap';

/**
 * Testovacia stránka pre novú heatmapu
 */
export default function HeatmapPage() {
  const handleTileClick = (company: CompanyNode) => {
    console.log('Clicked on:', company.symbol);
    // Môžeš pridať vlastnú logiku, napr. navigáciu na detail stránku
    window.open(`https://www.google.com/search?q=stock+${company.symbol}`, '_blank');
  };

  return (
    <div className="h-screen w-screen bg-black overflow-hidden flex flex-col" suppressHydrationWarning>
      <div className="p-4 z-50 text-white flex-shrink-0">
        <h1 className="text-2xl font-bold mb-2">
          Heatmap<span className="text-green-500">.today</span>
        </h1>
        <p className="text-sm text-gray-400">
          Interactive treemap visualization of stock market data
        </p>
      </div>
      <div className="flex-1 min-h-0 relative">
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

