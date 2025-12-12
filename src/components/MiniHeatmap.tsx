'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { StockData } from '@/lib/types';
import { MarketHeatmap } from './MarketHeatmap';
import { transformStockDataToCompanyNode } from '@/hooks/useHeatmapData';

interface MiniHeatmapProps {
  data: StockData[];
  width?: number;
  height?: number;
}

export function MiniHeatmap({ data, width = 180, height = 80 }: MiniHeatmapProps) {
  // Transform data to CompanyNodes
  const companyNodes = useMemo(() => {
    // Take top 50 stocks by market cap diff (most significant movers) or just market cap
    // We assume data is already relevant. Let's take top 50 to keep it performant.
    return data
      .slice(0, 50)
      .map(transformStockDataToCompanyNode)
      .filter((node): node is NonNullable<typeof node> => node !== null);
  }, [data]);

  return (
    <Link href="/heatmap" className="block" title="View Full Heatmap">
      <div 
        className="relative bg-black rounded-lg overflow-hidden border border-gray-800 hover:border-gray-600 transition-colors"
        style={{ width, height }}
      >
        {/* Overlay title */}
        <div className="absolute top-0 left-0 z-10 px-1.5 py-0.5 bg-black/60 backdrop-blur-[1px] rounded-br text-[9px] font-semibold text-gray-300 pointer-events-none">
          Heatmap
        </div>
        
        {/* Heatmap component - using DOM mode implicitly or Canvas if preferred */}
        {/* We disable interactivity via pointer-events on wrapper, but MarketHeatmap needs dimensions */}
        <div className="pointer-events-none">
          <MarketHeatmap
            data={companyNodes}
            width={width}
            height={height}
            timeframe="day"
            metric="percent"
          />
        </div>
      </div>
    </Link>
  );
}

