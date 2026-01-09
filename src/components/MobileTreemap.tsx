'use client';

import React, { useMemo, useCallback, useRef, useState } from 'react';
import { CompanyNode } from './MarketHeatmap';
import { formatPrice, formatPercent, formatMarketCap, formatMarketCapDiff } from '@/lib/utils/format';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import Link from 'next/link';
import { HeatmapMetricButtons } from './HeatmapMetricButtons';
import { HeatmapLegend } from './MarketHeatmap';

interface MobileTreemapProps {
  data: CompanyNode[];
  timeframe?: 'day' | 'week' | 'month';
  metric?: 'percent' | 'mcap';
  onMetricChange?: (metric: 'percent' | 'mcap') => void;
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
  onMetricChange,
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
    const value = metric === 'percent' ? company.changePercent : (company.marketCapDiff ?? 0);
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
  // Prevent "long press" from also triggering a short-tap click afterwards
  const suppressClickRef = useRef<Set<string>>(new Set());
  const suppressTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Bottom sheet state (mobile "hover" replacement)
  const [selectedCompany, setSelectedCompany] = useState<CompanyNode | null>(null);
  const closeSheet = useCallback(() => setSelectedCompany(null), []);

  const handleTouchStart = useCallback((ticker: string) => {
    if (!onToggleFavorite) return;
    
    const timer = setTimeout(() => {
      setLongPressActive(ticker);
      onToggleFavorite(ticker);
      // Mark to suppress the following click/tap
      suppressClickRef.current.add(ticker);
      const existing = suppressTimerRef.current.get(ticker);
      if (existing) clearTimeout(existing);
      const clearTimer = setTimeout(() => {
        suppressClickRef.current.delete(ticker);
        suppressTimerRef.current.delete(ticker);
      }, 900);
      suppressTimerRef.current.set(ticker, clearTimer);
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
    const value = metric === 'percent' ? (company.changePercent ?? 0) : (company.marketCapDiff ?? 0);
    const displayValue = metric === 'percent'
      ? formatPercent(value)
      : formatMarketCapDiff(value);
    
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

    const handleShortTap = (e: React.SyntheticEvent) => {
      // Don't trigger short-tap action if a long-press just happened
      if (suppressClickRef.current.has(company.symbol)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setSelectedCompany(company);
      if (onTileClick) onTileClick(company);
    };

    return (
      <button
        key={company.symbol}
        type="button"
        onClick={handleShortTap}
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
          textAlign: 'left',
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
              {/* Price only makes sense in % mode; in Mcap mode show only cap diff */}
              {metric === 'percent' && company.currentPrice && (
                <div className={textClasses.price} style={{ opacity: 0.85 }}>
                  ${formatPrice(company.currentPrice)}
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
      </button>
    );
  }, [getSizeBucket, getColor, metric, onTileClick, isFavorite, handleTouchStart, handleTouchEnd, closeSheet]);

  if (sortedData.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-gray-500">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="mobile-treemap-wrapper" style={{ height: '70vh', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky top bar: metric toggle + legend (mobile-friendly) */}
      <div
        style={{
          background: 'rgba(0,0,0,0.88)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          {onMetricChange && (
            <HeatmapMetricButtons
              metric={metric}
              // HeatmapMetricButtons expects HeatmapMetric union; this matches at runtime.
              onMetricChange={onMetricChange as any}
              variant="dark"
              className="scale-[0.92] origin-left"
            />
          )}
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
          <div style={{ transform: 'scale(0.92)', transformOrigin: 'left center', width: 'max-content' }}>
            <HeatmapLegend timeframe={timeframe} />
          </div>
        </div>
      </div>

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
      
      {/* Removed: "View all stocks" button (caused crashes on some mobile flows) */}

      {/* Bottom sheet: details (tap on tile) */}
      {selectedCompany && (
        <>
          <button
            type="button"
            aria-label="Close details"
            onClick={closeSheet}
            className="fixed inset-0"
            style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1000 }}
          />
          <div
            className="fixed inset-x-0 bottom-0"
            style={{
              zIndex: 1001,
              background: 'var(--clr-bg)',
              color: 'var(--clr-text)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              boxShadow: '0 -12px 30px rgba(0,0,0,0.35)',
              padding: 14,
              maxHeight: '72vh',
              overflow: 'auto',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {selectedCompany.symbol}
                  {selectedCompany.name && selectedCompany.name !== selectedCompany.symbol ? ` — ${selectedCompany.name}` : ''}
                </div>
                <div className="text-xs opacity-75 mt-0.5">
                  {selectedCompany.sector} · {selectedCompany.industry}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(selectedCompany.symbol)}
                    className="px-3 py-1.5 rounded-md text-sm font-semibold"
                    style={{
                      background: (isFavorite && isFavorite(selectedCompany.symbol)) ? 'rgba(251,191,36,0.15)' : 'rgba(59,130,246,0.12)',
                      color: (isFavorite && isFavorite(selectedCompany.symbol)) ? '#fbbf24' : 'var(--clr-primary)',
                    }}
                  >
                    {(isFavorite && isFavorite(selectedCompany.symbol)) ? '★ Favorited' : '☆ Favorite'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeSheet}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold"
                  style={{ background: 'rgba(0,0,0,0.06)' }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {metric === 'percent' ? (
                <>
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.04)' }}>
                    <div className="text-[11px] opacity-70">Price</div>
                    <div className="text-base font-semibold">
                      {selectedCompany.currentPrice ? `$${formatPrice(selectedCompany.currentPrice)}` : '—'}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.04)' }}>
                    <div className="text-[11px] opacity-70">% Change</div>
                    <div className="text-base font-semibold">
                      {formatPercent(selectedCompany.changePercent ?? 0)}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.04)' }}>
                    <div className="text-[11px] opacity-70">Mcap Diff</div>
                    <div className="text-base font-semibold">
                      {formatMarketCapDiff(selectedCompany.marketCapDiff ?? 0)}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.04)' }}>
                    <div className="text-[11px] opacity-70">Market Cap</div>
                    <div className="text-base font-semibold">
                      {formatMarketCap(selectedCompany.marketCap ?? 0)}
                    </div>
                  </div>
                </>
              )}
              <div className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.04)' }}>
                <div className="text-[11px] opacity-70">Open</div>
                <Link
                  href={`/company/${selectedCompany.symbol}`}
                  className="inline-block mt-0.5 text-sm font-semibold"
                  style={{ color: 'var(--clr-primary)' }}
                  onClick={closeSheet}
                >
                  View details →
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
