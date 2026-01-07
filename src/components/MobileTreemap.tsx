'use client';

import React, { useMemo, useCallback, useRef, useState } from 'react';
import { CompanyNode } from './MarketHeatmap';
import { formatPrice, formatPercent, formatMarketCap } from '@/lib/utils/format';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import Link from 'next/link';

interface MobileTreemapProps {
  data: CompanyNode[];
  timeframe?: 'day' | 'week' | 'month';
  metric?: 'percent' | 'mcap';
  onTileClick?: (company: CompanyNode) => void;
  onToggleFavorite?: (ticker: string) => void;
  isFavorite?: (ticker: string) => boolean;
}

// Maximum tiles for mobile (UX + performance)
const MAX_MOBILE_TILES = 36;

/**
 * TRUE MOBILE HEATMAP - Treemap Grid Layout
 * 
 * UX Princíp:
 * - Heatmapa = 2D plocha, nie vertikálny list
 * - CSS Grid s variabilnou šírkou a výškou
 * - Veľké firmy DOMINUJÚ (mega: 2x2, large: 2x1, small: 1x1)
 * - Agresívna vizualita (bez card look)
 * - Fixná výška pre overview (nie nekonečný scroll)
 * 
 * Bucket-y (diskrétne, nie plynulé):
 * - Mega (top 3-5): 2x2 grid cells
 * - Large (top 6-15): 2x1 grid cells  
 * - Small (zvyšok): 1x1 grid cells
 */
export const MobileTreemap: React.FC<MobileTreemapProps> = ({
  data,
  timeframe = 'day',
  metric = 'percent',
  onTileClick,
  onToggleFavorite,
  isFavorite,
}) => {
  // Sort by market cap (descending) - largest first, limit to MAX_MOBILE_TILES
  // OPTIMIZATION: Use useMemo with stable sorting for better performance
  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    return [...data]
      .filter(c => (c.marketCap || 0) > 0)
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
      .slice(0, MAX_MOBILE_TILES); // CRITICAL: Limit for mobile UX + performance
  }, [data]);

  // Color scale
  const colorScale = useMemo(() => createHeatmapColorScale(timeframe), [timeframe]);

  // Get color for company
  const getColor = useCallback((company: CompanyNode): string => {
    const value = metric === 'percent' ? company.changePercent : company.marketCap;
    if (value === null || value === undefined) return '#1a1a1a';
    return colorScale(value);
  }, [metric, colorScale]);

  // Determine size bucket based on rank (NOT market cap value)
  const getSizeBucket = useCallback((index: number): 'mega' | 'large' | 'small' => {
    if (index < 3) return 'mega';      // Top 3: 2x2
    if (index < 15) return 'large';     // Top 6-15: 2x1
    return 'small';                     // Rest: 1x1
  }, []);

  // Long press handler for favorites
  const longPressTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [longPressActive, setLongPressActive] = useState<string | null>(null);

  const handleTouchStart = useCallback((ticker: string) => {
    if (!onToggleFavorite) return;
    
    const timer = setTimeout(() => {
      setLongPressActive(ticker);
      onToggleFavorite(ticker);
      // Haptic feedback (if available)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 600); // 600ms for long press
    
    longPressTimerRef.current.set(ticker, timer);
  }, [onToggleFavorite]);

  const handleTouchEnd = useCallback((ticker: string) => {
    const timer = longPressTimerRef.current.get(ticker);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(ticker);
    }
    setLongPressActive(null);
  }, []);

  // Render company tile
  const renderTile = useCallback((company: CompanyNode, index: number) => {
    const size = getSizeBucket(index);
    const color = getColor(company);
    const value = metric === 'percent' ? company.changePercent : company.marketCap;
    const displayValue = metric === 'percent'
      ? formatPercent(value || 0)
      : formatMarketCap(value || 0);
    
    const isFav = isFavorite ? isFavorite(company.symbol) : false;

    // Grid classes based on size
    const gridClasses = {
      mega: 'col-span-2 row-span-2',   // 2x2
      large: 'col-span-2 row-span-1',  // 2x1
      small: 'col-span-1 row-span-1', // 1x1
    }[size];

    // Text size based on tile size - professional financial typography
    const textClasses = {
      mega: {
        ticker: 'text-2xl font-extrabold tracking-tight',
        value: 'text-base font-semibold',
        price: 'text-sm',
      },
      large: {
        ticker: 'text-lg font-bold tracking-tight',
        value: 'text-sm font-semibold',
        price: 'text-xs',
      },
      small: {
        ticker: 'text-sm font-semibold tracking-tight',
        value: 'text-xs opacity-90',
        price: 'text-xs',
      },
    }[size];

    return (
      <Link
        key={company.symbol}
        href={`/company/${company.symbol}`}
        onClick={(e) => {
          // Don't navigate if long press was active
          if (longPressActive === company.symbol) {
            e.preventDefault();
            return;
          }
          if (onTileClick) {
            e.preventDefault();
            onTileClick(company);
          }
        }}
        onTouchStart={() => handleTouchStart(company.symbol)}
        onTouchEnd={() => handleTouchEnd(company.symbol)}
        onMouseDown={() => handleTouchStart(company.symbol)}
        onMouseUp={() => handleTouchEnd(company.symbol)}
        onMouseLeave={() => handleTouchEnd(company.symbol)}
        className={`${gridClasses} block relative overflow-hidden active:opacity-80 transition-opacity`}
        style={{
          backgroundColor: color,
          color: '#ffffff',
          // NO rounded corners, NO shadows - aggressive heatmap look
          borderRadius: '0',
          boxShadow: 'none',
          lineHeight: '1.15',
          letterSpacing: '-0.01em',
        }}
      >
        {/* Favorite indicator (top right corner) */}
        {isFav && (
          <div className="absolute top-1 right-1 text-yellow-400 text-xs" style={{ opacity: 0.9 }}>
            ★
          </div>
        )}

        {/* Content - minimal padding (8px), aggressive layout */}
        <div className="h-full w-full p-2 flex flex-col justify-between">
          {/* Top: Ticker (dominant) */}
          <div className={textClasses.ticker} style={{ lineHeight: '1.15' }}>
            {company.symbol}
          </div>

          {/* Mega tiles: Show company name */}
          {size === 'mega' && company.name && company.name !== company.symbol && (
            <div className="text-xs opacity-80 mb-1 line-clamp-1">
              {company.name}
            </div>
          )}

          {/* Bottom: Value and price (only for mega/large) */}
          {(size === 'mega' || size === 'large') && (
            <div className="flex flex-col gap-0.5">
              <div className={textClasses.value} style={{ fontWeight: 600 }}>
                {displayValue}
              </div>
              {company.currentPrice && (
                <div className={textClasses.price} style={{ opacity: 0.85 }}>
                  {formatPrice(company.currentPrice)}
                </div>
              )}
            </div>
          )}

          {/* Small tiles: only value */}
          {size === 'small' && (
            <div className={textClasses.value} style={{ opacity: 0.9, fontWeight: 500 }}>
              {displayValue}
            </div>
          )}
        </div>
      </Link>
    );
  }, [getSizeBucket, getColor, metric, onTileClick, isFavorite, longPressActive, handleTouchStart, handleTouchEnd]);

  if (sortedData.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-gray-500">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="mobile-treemap-wrapper" style={{ height: '70vh', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div 
        className="mobile-treemap-grid" 
        style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridAutoRows: 'minmax(72px, auto)',
          gap: '2px',
          background: '#000',
          padding: '2px',
          flex: '1',
          overflow: 'auto',
        }}
      >
        {sortedData.map((company, index) => renderTile(company, index))}
      </div>
      
      {/* "View all stocks" button below heatmap */}
      {data.length > MAX_MOBILE_TILES && (
        <div className="w-full p-3 bg-black border-t border-gray-800 flex-shrink-0">
          <Link
            href="/stocks"
            className="block w-full text-center py-2.5 px-4 bg-gray-800 text-white rounded-lg font-semibold active:bg-gray-700 transition-colors text-sm"
          >
            View all stocks →
          </Link>
        </div>
      )}
    </div>
  );
};
