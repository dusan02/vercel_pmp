'use client';
import React, { useState } from 'react';
import { AdaptiveTable } from './AdaptiveTable';
import { SortKey } from '@/hooks/useSortableData';
import { useSortableData } from '@/hooks/useSortableData';

// Mock data for testing
const mockStocks = [
  { ticker: 'AAPL', currentPrice: 212.14, closePrice: 207.57, percentChange: -0.89, marketCapDiff: -28.60, marketCap: 3194 },
  { ticker: 'MSFT', currentPrice: 512.09, closePrice: 533.50, percentChange: -0.08, marketCapDiff: -3.06, marketCap: 3818 },
  { ticker: 'GOOGL', currentPrice: 195.13, closePrice: 192.63, percentChange: 1.32, marketCapDiff: 14.84, marketCap: 2336 },
  { ticker: 'NVDA', currentPrice: 176.36, closePrice: 177.87, percentChange: -0.22, marketCapDiff: -9.52, marketCap: 4231 },
  { ticker: 'AMZN', currentPrice: 231.47, closePrice: 182.31, percentChange: -0.57, marketCapDiff: -14.01, marketCap: 2457 },
  { ticker: 'META', currentPrice: 709.81, closePrice: 717.59, percentChange: -1.09, marketCapDiff: -16.98, marketCap: 1792 },
  { ticker: 'TSLA', currentPrice: 245.67, closePrice: 248.42, percentChange: 2.91, marketCapDiff: 8.45, marketCap: 789 },
  { ticker: 'BRK.B', currentPrice: 380.40, closePrice: 378.89, percentChange: 0.40, marketCapDiff: 1.6, marketCap: 300 }
];

export const AdaptiveTableDemo: React.FC = () => {
  const [favorites, setFavorites] = useState<string[]>(['AAPL', 'MSFT']);
  
  const { sorted: sortedStocks, sortKey, ascending, requestSort } = useSortableData(mockStocks, 'marketCap', false);
  
  const toggleFavorite = (ticker: string) => {
    setFavorites(prev => 
      prev.includes(ticker) 
        ? prev.filter(fav => fav !== ticker)
        : [...prev, ticker]
    );
  };
  
  const isFavorite = (ticker: string) => favorites.includes(ticker);

  return (
    <div className="adaptive-table-demo">
      <h2>📱 Adaptive Table Demo</h2>
      <p>Resize your browser window to see how the table adapts to different screen sizes!</p>
      
      <div className="demo-info">
        <h3>How it works:</h3>
        <ul>
          <li><strong>Mobile (≤768px):</strong> Shows only essential columns (Logo, Ticker, Price, % Change, Favorites)</li>
          <li><strong>Tablet (769-1024px):</strong> Adds Company Name and Market Cap</li>
          <li><strong>Desktop (&gt;1024px):</strong> Shows all columns including Market Cap Diff</li>
        </ul>
      </div>

      <AdaptiveTable
        stocks={sortedStocks}
        sortKey={sortKey}
        ascending={ascending}
        onSort={requestSort}
        onToggleFavorite={toggleFavorite}
        isFavorite={isFavorite}
      />
      
      <div className="demo-controls">
        <h3>Current Favorites:</h3>
        <div className="favorites-list">
          {favorites.length > 0 ? (
            favorites.map(ticker => (
              <span key={ticker} className="favorite-tag">
                {ticker} ★
              </span>
            ))
          ) : (
            <span className="no-favorites">No favorites selected</span>
          )}
        </div>
      </div>
    </div>
  );
}; 