/**
 * Sector List Component for Mobile
 * Displays sectors as cards, sorted by total market cap
 */

'use client';

import React, { useMemo } from 'react';
import type { CompanyNode } from '@/lib/heatmap/types';
import { formatBillions, formatSectorName } from '@/lib/utils/format';

interface SectorListMobileProps {
  data: CompanyNode[];
  onSectorClick: (sector: string) => void;
}

interface SectorInfo {
  name: string;
  companies: CompanyNode[];
  totalMarketCap: number;
  companyCount: number;
  avgChangePercent: number;
}

export const SectorListMobile: React.FC<SectorListMobileProps> = ({
  data,
  onSectorClick,
}) => {
  // Group companies by sector and calculate stats
  const sectors = useMemo(() => {
    const sectorMap = new Map<string, SectorInfo>();

    data.forEach((company) => {
      const sectorName = company.sector || 'Other';
      
      if (!sectorMap.has(sectorName)) {
        sectorMap.set(sectorName, {
          name: sectorName,
          companies: [],
          totalMarketCap: 0,
          companyCount: 0,
          avgChangePercent: 0,
        });
      }

      const sector = sectorMap.get(sectorName)!;
      sector.companies.push(company);
      sector.totalMarketCap += company.marketCap || 0;
      sector.companyCount += 1;
    });

    // Calculate average change percent for each sector
    sectorMap.forEach((sector) => {
      if (sector.companies.length > 0) {
        const sumChange = sector.companies.reduce(
          (sum, c) => sum + (c.changePercent || 0),
          0
        );
        sector.avgChangePercent = sumChange / sector.companies.length;
      }
    });

    // Convert to array and sort by total market cap (descending)
    // Technology should be first, then others by market cap
    const sectorsArray = Array.from(sectorMap.values());
    
    sectorsArray.sort((a, b) => {
      // Technology is always first
      if (a.name === 'Technology' && b.name !== 'Technology') return -1;
      if (a.name !== 'Technology' && b.name === 'Technology') return 1;
      
      // Other is always last
      if (a.name === 'Other' && b.name !== 'Other') return 1;
      if (a.name !== 'Other' && b.name === 'Other') return -1;
      
      // Others sorted by total market cap (descending)
      return b.totalMarketCap - a.totalMarketCap;
    });

    return sectorsArray;
  }, [data]);

  const getChangeColor = (changePercent: number) => {
    if (changePercent > 0) return 'text-green-400';
    if (changePercent < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getChangeIcon = (changePercent: number) => {
    if (changePercent > 0) return '🟢';
    if (changePercent < 0) return '🔴';
    return '⚪';
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-black">
      <div className="p-4 space-y-3">
        {sectors.map((sector) => (
          <button
            key={sector.name}
            onClick={() => onSectorClick(sector.name)}
            className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg p-4 text-left transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold text-lg">
                {formatSectorName(sector.name)}
              </h3>
              <span className="text-2xl">
                {getChangeIcon(sector.avgChangePercent)}
              </span>
            </div>
            
            <div className="space-y-1 text-sm">
              <div className="text-gray-400">
                {sector.companyCount} {sector.companyCount === 1 ? 'company' : 'companies'}
              </div>
              
              <div className="text-gray-300">
                {formatBillions(sector.totalMarketCap)} market cap
              </div>
              
              <div className={`font-medium ${getChangeColor(sector.avgChangePercent)}`}>
                {sector.avgChangePercent >= 0 ? '+' : ''}
                {sector.avgChangePercent.toFixed(2)}% avg change
              </div>
            </div>
            
            <div className="mt-3 flex items-center justify-end text-blue-400 text-sm">
              View heatmap →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

