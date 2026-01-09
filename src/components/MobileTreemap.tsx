'use client';

import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { CompanyNode } from './MarketHeatmap';
import { formatPrice, formatPercent, formatMarketCap, formatMarketCapDiff } from '@/lib/utils/format';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import Link from 'next/link';
import { HeatmapMetricButtons } from './HeatmapMetricButtons';
import { HeatmapLegend } from './MarketHeatmap';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { buildHeatmapHierarchy } from '@/lib/utils/heatmapLayout';

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
// NOTE: With true treemap layout we can render more while still filling the area.
const MAX_MOBILE_TILES = 250;

type TreemapDatum = {
  name: string;
  value: number;
  company: CompanyNode;
};

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
  // Internal zoom for mobile heatmap:
  // zoom-in => more tiles become readable; zoom-out => labels disappear naturally.
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3;
  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startZoom: number;
    // Unscaled content point under the pinch center at start (in "base" px)
    uX: number;
    uY: number;
    // Pinch center offset in container viewport
    offsetX: number;
    offsetY: number;
  }>({ active: false, startDist: 0, startZoom: 1, uX: 0, uY: 0, offsetX: 0, offsetY: 0 });

  // Sort by ACTIVE size metric (descending), limit to MAX_MOBILE_TILES.
  // - percent mode: size by market cap
  // - mcap mode: size by absolute market cap diff
  // OPTIMIZATION: Use useMemo with stable sorting for better performance
  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sizeValue = (c: CompanyNode) => {
      if (metric === 'mcap') return c.marketCapDiffAbs ?? Math.abs(c.marketCapDiff ?? 0);
      return c.marketCap || 0;
    };

    return [...data]
      .filter(c => sizeValue(c) > 0)
      .sort((a, b) => sizeValue(b) - sizeValue(a))
      .slice(0, MAX_MOBILE_TILES); // CRITICAL: Limit for mobile UX + performance
  }, [data, metric]);

  // Color scale
  const colorScale = useMemo(() => createHeatmapColorScale(timeframe), [timeframe]);

  // Get color for company
  const getColor = useCallback((company: CompanyNode): string => {
    const value = metric === 'percent' ? company.changePercent : (company.marketCapDiff ?? 0);
    if (value === null || value === undefined) return '#1a1a1a';
    return colorScale(value);
  }, [metric, colorScale]);

  // Track container size for true treemap layout
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      const w = Math.max(0, Math.floor(cr.width));
      const h = Math.max(0, Math.floor(cr.height));
      setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pinch-to-zoom (two-finger zoom) on the heatmap canvas area.
  // This is the mobile-native interaction (no +/- buttons).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const clamp = (v: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
    const dist = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      // Only handle pinch on the heatmap grid (prevent browser/page zoom)
      e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const rect = el.getBoundingClientRect();
      const centerClientX = (t1.clientX + t2.clientX) / 2;
      const centerClientY = (t1.clientY + t2.clientY) / 2;
      const offsetX = centerClientX - rect.left;
      const offsetY = centerClientY - rect.top;

      const startZoom = zoom;
      // Convert current scroll+offset to unscaled "base" coordinates
      const uX = (el.scrollLeft + offsetX) / startZoom;
      const uY = (el.scrollTop + offsetY) / startZoom;

      pinchRef.current = {
        active: true,
        startDist: dist(t1, t2) || 1,
        startZoom,
        uX,
        uY,
        offsetX,
        offsetY,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current.active) return;
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const d = dist(t1, t2) || 1;
      const scale = d / pinchRef.current.startDist;
      const nextZoom = clamp(pinchRef.current.startZoom * scale);
      setZoom(nextZoom);

      // Keep the pinch center "locked" to the same content point while zooming
      requestAnimationFrame(() => {
        const { uX, uY, offsetX, offsetY } = pinchRef.current;
        el.scrollLeft = uX * nextZoom - offsetX;
        el.scrollTop = uY * nextZoom - offsetY;
      });
    };

    const endPinch = () => {
      pinchRef.current.active = false;
    };

    // IMPORTANT: non-passive so we can preventDefault during pinch
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', endPinch);
    el.addEventListener('touchcancel', endPinch);

    return () => {
      el.removeEventListener('touchstart', onTouchStart as any);
      el.removeEventListener('touchmove', onTouchMove as any);
      el.removeEventListener('touchend', endPinch as any);
      el.removeEventListener('touchcancel', endPinch as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ZOOM_MAX, ZOOM_MIN, zoom]);

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

  // Build true treemap rectangles (no gaps, proportional to market cap)
  const leaves = useMemo(() => {
    const { width, height } = containerSize;
    if (width <= 0 || height <= 0) return [];
    if (!sortedData.length) return [];

    // Group by sector like desktop heatmap, but we won't render sector labels on mobile.
    // IMPORTANT: Tile AREA depends on active metric:
    // - percent: marketCap
    // - mcap: marketCapDiffAbs
    const sectorHierarchy = buildHeatmapHierarchy(sortedData, metric);

    const root = hierarchy<any>(sectorHierarchy)
      .sum((d: any) => (typeof d.value === 'number' ? d.value : 0))
      .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

    treemap<{ name: string; children: TreemapDatum[] }>()
      .tile(treemapSquarify)
      .size([width, height])
      .paddingInner(0)
      .paddingOuter(0)
      .round(true)(root as any);

    // Leaves are the companies
    return root.leaves().filter((l: any) => l.data?.meta?.type === 'company') as any as Array<{
      x0: number; y0: number; x1: number; y1: number;
      data: any;
    }>;
  }, [containerSize, sortedData]);

  const renderLeaf = useCallback((leaf: { x0: number; y0: number; x1: number; y1: number; data: any }) => {
    const company = leaf.data?.meta?.companyData as CompanyNode | undefined;
    if (!company) return null;
    const w0 = Math.max(0, leaf.x1 - leaf.x0);
    const h0 = Math.max(0, leaf.y1 - leaf.y0);
    const w = w0 * zoom;
    const h = h0 * zoom;
    if (w < 2 || h < 2) return null;

    const color = getColor(company);
    const value = metric === 'percent' ? (company.changePercent ?? 0) : (company.marketCapDiff ?? 0);
    const displayValue = metric === 'percent' ? formatPercent(value) : formatMarketCapDiff(value);
    const isFav = isFavorite ? isFavorite(company.symbol) : false;

    // Show less text on tiny rectangles to avoid visual noise.
    // Thresholds are AREA-based, so when the user zooms in / rotates to landscape
    // (tiles become larger), labels naturally appear; zooming out hides them again.
    const area = w * h;
    const showTicker = area >= 360;
    const showValue = area >= 900 && w >= 44 && h >= 22; // % change OR B$ diff (based on metric)
    const showPrice = metric === 'percent' && !!company.currentPrice && area >= 1400 && w >= 60 && h >= 30;

    const tickerClass =
      w >= 110 && h >= 70 ? 'text-xl font-extrabold tracking-tight' :
      w >= 84 && h >= 48 ? 'text-lg font-bold tracking-tight' :
      w >= 60 && h >= 34 ? 'text-sm font-semibold tracking-tight' :
      'text-[11px] font-semibold tracking-tight';

    const handleShortTap = (e: React.SyntheticEvent) => {
      // If a pinch gesture is/was active, ignore tap
      if (pinchRef.current.active) return;
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
        className="block absolute overflow-hidden active:opacity-80 transition-opacity"
        style={{
          left: leaf.x0 * zoom,
          top: leaf.y0 * zoom,
          width: w,
          height: h,
          backgroundColor: color,
          color: '#ffffff',
          borderRadius: 0,
          // No gaps: draw separators via inset border instead of spacing.
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.28)',
          lineHeight: '1.15',
          letterSpacing: '-0.01em',
          textAlign: 'left',
          padding: Math.max(6, Math.min(10, Math.round(8 * zoom))),
        }}
      >
        {isFav && (
          <div className="absolute top-1 right-1 text-yellow-400 text-xs" style={{ opacity: 0.9 }}>
            ★
          </div>
        )}

        <div className="h-full w-full flex flex-col justify-between">
          {showTicker ? <div className={tickerClass}>{company.symbol}</div> : <div />}

          {showValue && (
            <div className="flex flex-col gap-0.5">
              <div className="text-xs font-semibold" style={{ opacity: 0.95 }}>
                {displayValue}
              </div>
              {showPrice && (
                <div className="text-xs" style={{ opacity: 0.85 }}>
                  ${formatPrice(company.currentPrice!)}
                </div>
              )}
            </div>
          )}
        </div>
      </button>
    );
  }, [getColor, metric, isFavorite, onTileClick, handleTouchStart, handleTouchEnd, zoom]);

  if (sortedData.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-gray-500">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div
      className="mobile-treemap-wrapper"
      style={{
        // Fill the available mobile view height (no artificial empty band below)
        height: '100%',
        maxHeight: 'none',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Sticky top bar: compact toggle + legend on one row */}
      <div
        style={{
          background: 'rgba(0,0,0,0.88)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {onMetricChange && (
          <HeatmapMetricButtons
            metric={metric}
            // HeatmapMetricButtons expects HeatmapMetric union; this matches at runtime.
            onMetricChange={onMetricChange as any}
            variant="dark"
            className="scale-[0.85] origin-left"
          />
        )}

        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
          <div style={{ transform: 'scale(0.82)', transformOrigin: 'left center', width: 'max-content' }}>
            <HeatmapLegend timeframe={timeframe} />
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="mobile-treemap-grid"
        style={{
          position: 'relative',
          background: '#000',
          flex: 1,
          minHeight: 0,
          overflow: zoom > 1 ? 'auto' : 'hidden',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: containerSize.width * zoom,
            height: containerSize.height * zoom,
          }}
        >
          {leaves.map((leaf) => renderLeaf(leaf))}
        </div>
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
