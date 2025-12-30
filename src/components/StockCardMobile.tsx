'use client';

import React, { memo, useMemo } from 'react';
import { StockData } from '@/lib/types';
import { formatBillions, formatPrice, formatPercent, formatMarketCapDiff } from '@/lib/utils/format';
import { getCompanyName } from '@/lib/companyNames';
import CompanyLogo from './CompanyLogo';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

interface StockCardMobileProps {
  stock: StockData;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  priority?: boolean;
}

export const StockCardMobile = memo(({
  stock,
  isFavorite,
  onToggleFavorite,
  priority = false
}: StockCardMobileProps) => {
  const formattedPrice = useMemo(() => formatPrice(stock.currentPrice), [stock.currentPrice]);
  const formattedPercentChange = useMemo(() => formatPercent(stock.percentChange), [stock.percentChange]);
  
  // Clean up company name (remove Inc, Corp, etc if needed, or keep full)
  const fullCompanyName = useMemo(() => getCompanyName(stock.ticker), [stock.ticker]);
  // Simple truncation or cleanup could happen here if needed, but CSS truncation is safer
  
  const isPositive = stock.percentChange >= 0;

  return (
    <div className="bg-[#111] border border-gray-800 rounded-lg p-4 mb-3 active:bg-gray-900 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
             <CompanyLogo 
              ticker={stock.ticker} 
              {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} 
              size={48} 
              priority={priority} 
            />
             <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className="absolute -bottom-1 -right-1 w-6 h-6 flex items-center justify-center bg-gray-900 rounded-full border border-gray-700 shadow-sm z-10"
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <span className={`text-sm ${isFavorite ? 'text-yellow-400' : 'text-gray-500'}`}>
                {isFavorite ? '★' : '☆'}
              </span>
            </button>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-white">{stock.ticker}</h3>
              <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-900 rounded border border-gray-800">
                {stock.sector}
              </span>
            </div>
            <p className="text-sm text-gray-400 truncate mt-0.5">{fullCompanyName}</p>
          </div>
        </div>

        <div className="text-right flex-shrink-0 ml-3">
          <div className="font-mono font-bold text-white text-lg">${formattedPrice}</div>
          <div className={`flex items-center justify-end gap-1 text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {isPositive ? '+' : ''}{formattedPercentChange}%
          </div>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
        <div className="flex gap-4">
          <div>
            <span className="block text-gray-600 mb-0.5">Mkt Cap</span>
            <span className="text-gray-300 font-medium">{formatBillions(stock.marketCap)}</span>
          </div>
           <div>
            <span className="block text-gray-600 mb-0.5">Cap Diff</span>
            <span className={`font-medium ${stock.marketCapDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
               {stock.marketCapDiff >= 0 ? '+' : ''}{formatMarketCapDiff(stock.marketCapDiff)}
            </span>
          </div>
        </div>
        
        {/* Optional: Add chevron or action hint */}
        {/* <ChevronRight size={16} className="text-gray-700" /> */}
      </div>
    </div>
  );
});

StockCardMobile.displayName = 'StockCardMobile';
