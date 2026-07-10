'use client';

import { Star, TrendingDown, TrendingUp } from 'lucide-react';

export default function FavoriteCard({ stock }: { stock: any }) {
  const isPositive = stock.percentChange >= 0;

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">{stock.ticker}</h3>
        <Star className="text-yellow-400" fill="currentColor" size={20} />
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Close: ${stock.closePrice?.toFixed(2) || '0.00'}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Pre-Market: ${stock.currentPrice?.toFixed(2) || '0.00'}
      </p>

      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}
          {stock.percentChange?.toFixed(2) || '0.00'}%
        </span>
        {isPositive ? <TrendingUp size={16} className="text-green-500" /> : <TrendingDown size={16} className="text-red-500" />}
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
        Market Cap Diff: ${stock.marketCapDiff?.toFixed(2) || '0.00'}B
      </p>
    </div>
  );
} 