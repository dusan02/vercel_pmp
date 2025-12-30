'use client';

import React, { memo } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent, formatCurrencyCompact } from '@/lib/utils/format';
import { getCompanyName } from '@/lib/companyNames';
import CompanyLogo from './CompanyLogo';
import { PortfolioQuantityInput } from './PortfolioQuantityInput';
import { X, TrendingUp, TrendingDown } from 'lucide-react';

interface PortfolioCardMobileProps {
  stock: StockData;
  quantity: number;
  value: number;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onRemoveStock: (ticker: string) => void;
  priority?: boolean;
}

export const PortfolioCardMobile = memo(({
  stock,
  quantity,
  value,
  onUpdateQuantity,
  onRemoveStock,
  priority = false
}: PortfolioCardMobileProps) => {
  const formattedPrice = formatPrice(stock.currentPrice);
  const formattedPercentChange = formatPercent(stock.percentChange);
  const formattedValue = formatCurrencyCompact(value);
  const isPositive = stock.percentChange >= 0;
  const companyName = getCompanyName(stock.ticker);

  return (
    <div className="bg-[#111] border border-gray-800 rounded-lg p-4 mb-3">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <CompanyLogo 
              ticker={stock.ticker} 
              {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} 
              size={48} 
              priority={priority} 
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-white">{stock.ticker}</h3>
              <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-900 rounded border border-gray-800">
                {stock.sector}
              </span>
            </div>
            <p className="text-sm text-gray-400 truncate mt-0.5">{companyName}</p>
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

      {/* Quantity and Value Section */}
      <div className="mt-3 pt-3 border-t border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="block text-xs text-gray-600 mb-1">Quantity</span>
            <PortfolioQuantityInput
              value={quantity}
              onChange={(newQuantity) => onUpdateQuantity(stock.ticker, newQuantity)}
            />
          </div>
          <div className="text-right">
            <span className="block text-xs text-gray-600 mb-1">Value</span>
            <span className="text-gray-300 font-medium text-base">{formattedValue}</span>
          </div>
        </div>
        
        <button
          onClick={() => onRemoveStock(stock.ticker)}
          className="w-full mt-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 rounded text-red-400 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          aria-label={`Remove ${stock.ticker} from portfolio`}
        >
          <X size={16} />
          Remove
        </button>
      </div>
    </div>
  );
});

PortfolioCardMobile.displayName = 'PortfolioCardMobile';

