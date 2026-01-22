'use client';

import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { CompanyNode } from './MarketHeatmap';
import { formatPrice, formatPercent, formatMarketCap, formatMarketCapDiff } from '@/lib/utils/format';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import CompanyLogo from './CompanyLogo';
import { HeatmapMetricButtons } from './HeatmapMetricButtons';
import { HeatmapLegend } from './MarketHeatmap';
import { BrandLogo } from './BrandLogo';
import { LoginButton } from './LoginButton';
import { HeatmapToggleMinimal } from './HeatmapToggleMinimal';
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
  activeView?: string | undefined; // Signalizuje, či je heatmap aktívny view (pre automatické zatvorenie sheetu)
}

// Maximum tiles for mobile (UX + performance)
// NOTE: With true treemap layout we can render more while still filling the area.
const MAX_MOBILE_TILES = 650;

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
  activeView,
}) => {
  // Internal zoom for mobile heatmap:
  // zoom-in => more tiles become readable; zoom-out => labels disappear naturally.
  const [zoom, setZoom] = useState(1);
  // Vertical treemap layout with sector strips stacked vertically
  const [showPinchHint, setShowPinchHint] = useState(false);
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3;
  const EXPAND_FACTOR = 1.8;
  const lastTapRef = useRef(0);
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
  // FIX: Remove duplicate tickers (keep first occurrence with highest value)
  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sizeValue = (c: CompanyNode) => {
      if (metric === 'mcap') return c.marketCapDiffAbs ?? Math.abs(c.marketCapDiff ?? 0);
      return c.marketCap || 0;
    };

    // Remove duplicates: keep only the first occurrence of each ticker
    // (in case data prop contains duplicate tickers)
    const seen = new Set<string>();
    const uniqueData = data.filter(c => {
      const symbol = c.symbol?.toUpperCase();
      if (!symbol || seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });

    return uniqueData
      .filter(c => sizeValue(c) > 0)
      .sort((a, b) => sizeValue(b) - sizeValue(a))
      .slice(0, MAX_MOBILE_TILES); // CRITICAL: Limit for mobile UX + performance
  }, [data, metric]);

  // Color scale
  const colorScale = useMemo(() => createHeatmapColorScale(timeframe, metric === 'mcap' ? 'mcap' : 'percent'), [timeframe, metric]);

  // Get color for company
  const getColor = useCallback((company: CompanyNode): string => {
    // NOTE: marketCapDiff is treated throughout the app as "billions" (see formatMarketCapDiff docs).
    // So for mcap mode, feed raw marketCapDiff into the scale (which is also configured in B$ units).
    const value = metric === 'percent'
      ? company.changePercent
      : (company.marketCapDiff ?? 0);
    if (value === null || value === undefined) return '#1a1a1a';
    return colorScale(value);
  }, [metric, colorScale]);

  // Track container size for true treemap layout
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // State for available height (updates on visualViewport changes for iOS Safari/Chrome stability)
  const [availableHeight, setAvailableHeight] = useState(0);

  // Helper: Measure safe-area-inset-bottom reliably using a probe element
  const measureSafeAreaBottom = useCallback(() => {
    try {
      if (!CSS.supports('padding-bottom: env(safe-area-inset-bottom)')) {
        return 0;
      }
      
      // Create hidden probe element with safe-area padding
      const probe = document.createElement('div');
      probe.style.position = 'fixed';
      probe.style.bottom = '0';
      probe.style.left = '0';
      probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.width = '1px';
      probe.style.height = '1px';
      document.body.appendChild(probe);
      
      // Read computed padding-bottom value
      const computed = window.getComputedStyle(probe);
      const paddingBottom = parseFloat(computed.paddingBottom) || 0;
      
      document.body.removeChild(probe);
      return paddingBottom;
    } catch (e) {
      return 0;
    }
  }, []);

  // Helper: Calculate available height for treemap (accounts for Safari/Chrome viewport differences)
  const getAvailableTreemapHeight = useCallback(() => {
    // Use visualViewport if available (more accurate on mobile Safari/Chrome)
    // visualViewport excludes browser UI (address bar, etc.) which innerHeight includes
    const vh = window.visualViewport?.height ?? window.innerHeight;
    
    // Get safe area bottom (iOS notch/home indicator) - measure reliably
    const safeAreaBottom = measureSafeAreaBottom();
    
    // Header heights
    // Note: headerH is 0 for heatmap (we removed padding-top with is-heatmap class)
    const headerH = 0; // No main app header padding for heatmap
    const tabbarH = 72; // var(--tabbar-h) - bottom navigation
    const treemapHeaderH = 48; // Fixed header inside MobileTreemap (spacer height after fixed header)
    
    // CRITICAL: Do NOT subtract tabbarH here because .mobile-treemap-wrapper already has padding-bottom for tabbar
    // This prevents "double reservation" - wrapper reserves space via padding-bottom, we just need to fill available viewport
    // Available height = viewport - safe area - treemap header (tabbar is handled by wrapper padding-bottom)
    const available = vh - safeAreaBottom - treemapHeaderH;
    
    return Math.max(0, available);
  }, [measureSafeAreaBottom]);

  // Update availableHeight on visualViewport/window resize/scroll (critical for iOS Safari/Chrome)
  // Also update when metric changes (affects layout height calculation)
  useEffect(() => {
    const updateAvailableHeight = () => {
      setAvailableHeight(getAvailableTreemapHeight());
    };

    // Initial update
    updateAvailableHeight();

    // Safari needs a small delay after mount
    const timeoutId = setTimeout(updateAvailableHeight, 50);
    
    // Also update on next animation frame (ensures layout is settled)
    const rafId = requestAnimationFrame(updateAvailableHeight);

    // Listen to visualViewport changes (Safari/Chrome mobile - address bar show/hide)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateAvailableHeight);
      window.visualViewport.addEventListener('scroll', updateAvailableHeight);
    }

    // Fallback: window resize (desktop, older browsers)
    window.addEventListener('resize', updateAvailableHeight);

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateAvailableHeight);
        window.visualViewport.removeEventListener('scroll', updateAvailableHeight);
      }
      window.removeEventListener('resize', updateAvailableHeight);
    };
  }, [getAvailableTreemapHeight, metric]); // CRITICAL: Update when metric changes

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Initial measurement to get dimensions immediately
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      if (w > 0 || h > 0) {
        setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };

    // Measure immediately
    measure();

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      const w = Math.max(0, Math.floor(cr.width));
      const h = Math.max(0, Math.floor(cr.height));
      setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    });
    ro.observe(el);

    // Fallback: measure again after a short delay (in case parent container isn't ready)
    const timeoutId = setTimeout(measure, 100);

    return () => {
      ro.disconnect();
      clearTimeout(timeoutId);
    };
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

  // One-time discoverability hint: "Pinch to zoom" (and double-tap reset)
  useEffect(() => {
    try {
      const key = 'pmp_mobile_heatmap_hint_v1';
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, '1');
      setShowPinchHint(true);
      const t = window.setTimeout(() => setShowPinchHint(false), 2600);
      return () => window.clearTimeout(t);
    } catch {
      setShowPinchHint(true);
      const t = window.setTimeout(() => setShowPinchHint(false), 2600);
      return () => window.clearTimeout(t);
    }
  }, []);

  // Bottom sheet state (mobile "hover" replacement)
  const [selectedCompany, setSelectedCompany] = useState<CompanyNode | null>(null);
  const closeSheet = useCallback(() => setSelectedCompany(null), []);

  // Reset scroll position and layout when switching metric or view
  const prevMetricRef = useRef(metric);
  
  useEffect(() => {
    // Reset scroll position when metric changes
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      containerRef.current.scrollLeft = 0;
    }
    // Close detail sheet when metric or view changes (prevents stale data)
    if (selectedCompany) {
      setSelectedCompany(null);
    }
    prevMetricRef.current = metric;
    // Force layout recalculation by triggering resize observer
    // This ensures heatmap recalculates with new metric state
    if (containerRef.current) {
      // Trigger a resize event to force recalculation
      const resizeEvent = new Event('resize');
      window.dispatchEvent(resizeEvent);
    }
  }, [metric, selectedCompany]);

  const handleDoubleTapReset = useCallback((e: React.TouchEvent) => {
    // Only consider single-finger taps (avoid interfering with pinch)
    if (e.changedTouches.length !== 1) return;
    const now = Date.now();
    const dt = now - lastTapRef.current;
    if (dt > 0 && dt < 280) {
      lastTapRef.current = 0;
      setZoom(1);
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      });
    } else {
      lastTapRef.current = now;
    }
  }, []);

  // Long press handler for favorites
  const longPressTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [longPressActive, setLongPressActive] = useState<string | null>(null);
  // Prevent "long press" from also triggering a short-tap click afterwards
  const suppressClickRef = useRef<Set<string>>(new Set());
  const suppressTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // UX: Automaticky zatvor sheet pri prepnutí view (z heatmap na iný tab)
  useEffect(() => {
    if (activeView !== 'heatmap' && selectedCompany) {
      setSelectedCompany(null);
    }
  }, [activeView, selectedCompany]);

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

  // Build treemap rectangles (no gaps).
  // Vertical layout: sector strips stacked vertically, each with its own internal treemap.
  const { leaves, layoutHeight } = useMemo((): {
    leaves: Array<{ x0: number; y0: number; x1: number; y1: number; data: any }>;
    layoutHeight: number;
  } => {
    const { width, height } = containerSize;
    if (width <= 0 || height <= 0) return { leaves: [], layoutHeight: 0 };
    if (!sortedData.length) return { leaves: [], layoutHeight: 0 };

    // Vertical treemap layout:
    // - sectors are stacked as horizontal strips (full width, variable height)
    // - each sector gets height proportional to total sector value
    // - use EXPAND_FACTOR to allow vertical scrolling
    // - enforce a reasonable minimum height so small sectors don't collapse into thin bands
    //   (thin bands force companies into stretched horizontal bars).
    // CRITICAL: Use availableHeight if available (more accurate for iOS Safari/Chrome)
    const effectiveHeight = availableHeight > 0 ? availableHeight : height;
    const baseHeight = Math.max(1, Math.floor(effectiveHeight * EXPAND_FACTOR));
    const sectorHierarchy = buildHeatmapHierarchy(sortedData, metric);
    const sectors = sectorHierarchy.children ?? [];

    const sumSector = (sector: any) => {
      const children = sector?.children ?? [];
      let s = 0;
      for (const c of children) {
        if (typeof c?.value === 'number') s += c.value;
      }
      return s;
    };

    const sectorSums = sectors.map((s: any) => sumSector(s));
    const totalSum = sectorSums.reduce((a, b) => a + b, 0) || 1;

    const MIN_SECTOR_HEIGHT = 56;
    const sectorHeights: number[] = [];
    for (let i = 0; i < sectors.length; i++) {
      const raw = Math.round(baseHeight * ((sectorSums[i] || 0) / totalSum));
      sectorHeights.push(Math.max(MIN_SECTOR_HEIGHT, raw));
    }
    // Calculate total height - ensure it matches exactly
    const totalSectorHeights = sectorHeights.reduce((a, b) => a + b, 0);
    const computedLayoutHeight = Math.max(baseHeight, totalSectorHeights);

    const result: Array<{ x0: number; y0: number; x1: number; y1: number; data: any }> = [];
    let yCursor = 0;

    for (let i = 0; i < sectors.length; i++) {
      const sector = sectors[i] as any;
      // Use exact sector height; last sector gets remainder to ensure perfect fit
      let sectorHeight: number;
      if (i === sectors.length - 1) {
        // Last sector: use exact remainder to fill the total height
        sectorHeight = Math.max(MIN_SECTOR_HEIGHT, computedLayoutHeight - yCursor);
      } else {
        // Other sectors: use pre-calculated height
        sectorHeight = Math.max(MIN_SECTOR_HEIGHT, sectorHeights[i] || 0);
      }

      if (sectorHeight <= 0) continue;
      const sectorChildren = sector?.children ?? [];
      if (!sectorChildren.length) {
        yCursor += sectorHeight;
        continue;
      }

      const sectorRoot = hierarchy<any>({ name: sector.name, children: sectorChildren })
        .sum((d: any) => (typeof d.value === 'number' ? d.value : 0))
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

      treemap<any>()
        .tile(treemapSquarify)
        .size([width, sectorHeight])
        .paddingInner(0)
        .paddingOuter(0)
        .round(true)(sectorRoot as any);

      const leaves = sectorRoot.leaves().filter((l: any) => l.data?.meta?.type === 'company');
      const sectorEndY = yCursor + sectorHeight;
      
      for (const leaf of leaves) {
        const l = leaf as any;
        const absY0 = l.y0 + yCursor;
        const absY1 = l.y1 + yCursor;
        
        // Ensure pixel-perfect positioning: floor for start, ceil for end
        // Clamp y1 to not exceed sectorEndY to prevent overlapping with next sector
        const clampedY1 = Math.min(Math.ceil(absY1), sectorEndY);
        
        result.push({
          x0: Math.floor(l.x0),
          x1: Math.ceil(l.x1),
          y0: Math.floor(absY0),
          y1: clampedY1,
          data: l.data,
        });
      }

      // Update yCursor with exact sector height to prevent gaps/overlaps
      yCursor += sectorHeight;
    }

    // Final height must match exactly the sum of all sector heights
    // This ensures the bottom edge is perfectly aligned
    const finalLayoutHeight = yCursor;
    return { leaves: result, layoutHeight: finalLayoutHeight };
  }, [containerSize, sortedData, metric, availableHeight]); // CRITICAL: Include availableHeight in dependencies

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

    // Typography tuned for mobile: base it on area (not just width/height) so medium tiles remain readable.
    const minDim = Math.min(w, h);
    const tickerClass =
      area >= 9000 && minDim >= 64 ? 'text-xl font-extrabold tracking-tight' :
      area >= 5200 && minDim >= 48 ? 'text-lg font-bold tracking-tight' :
      area >= 2600 && minDim >= 34 ? 'text-sm font-semibold tracking-tight' :
      'text-[11px] font-semibold tracking-tight';

    // Padding: reduce on mid/small tiles so text has room; still comfortable on large tiles.
    const pad = Math.max(2, Math.min(10, Math.floor(minDim / 12)));

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

    // Ensure pixel-perfect alignment to prevent overlapping
    const left = Math.floor(leaf.x0 * zoom);
    const top = Math.floor(leaf.y0 * zoom);
    const width = Math.ceil(w);
    const height = Math.ceil(h);

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
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: color,
          color: '#ffffff',
          borderRadius: 0,
          // No gaps: draw separators via inset border instead of spacing.
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.28)',
          lineHeight: '1.15',
          letterSpacing: '-0.01em',
          textAlign: 'left',
          padding: pad,
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
      {/* Fixed top bar: Logo + Title + Metric buttons + Sign In */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'rgba(0,0,0,0.88)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {/* Logo + Title */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <BrandLogo size={28} />
          <span className="text-white font-semibold text-sm whitespace-nowrap">PreMarketPrice</span>
        </div>

        {/* Spacer - pushes buttons to the right */}
        <div className="flex-1" />

        {/* Buttons group - all same size (squares 44x44) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Metric buttons (% vs $) - refactored to square buttons */}
          {onMetricChange && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMetricChange('percent')}
                className="flex items-center justify-center w-[44px] h-[44px] rounded-lg transition-colors"
                style={{
                  background: metric === 'percent' ? '#2563eb' : '#1a1a1a',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: metric === 'percent' ? '#ffffff' : '#6b7280',
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
                aria-label="Percent Change"
              >
                %
              </button>
              <button
                type="button"
                onClick={() => onMetricChange('mcap')}
                className="flex items-center justify-center w-[44px] h-[44px] rounded-lg transition-colors"
                style={{
                  background: metric === 'mcap' ? '#2563eb' : '#1a1a1a',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: metric === 'mcap' ? '#ffffff' : '#6b7280',
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
                aria-label="Market Cap Change"
              >
                $
              </button>
            </div>
          )}

          {/* Sign In button - Square 44x44 */}
          <div className="flex-shrink-0">
            <LoginButton />
          </div>
        </div>

        {/* Legenda - skrytá na mobile (< 1024px), viditeľná len na desktop (lg a vyššie) */}
        <div className="hidden lg:flex flex-1" style={{ minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
          <div style={{ transform: 'scale(0.82)', transformOrigin: 'left center', width: 'max-content' }}>
            <HeatmapLegend timeframe={timeframe} metric={metric} />
          </div>
        </div>
      </div>

      {/* Spacer pre fixed header - aby obsah nebol pod headerom */}
      <div style={{ height: '48px', flexShrink: 0 }} />

      <div
        ref={containerRef}
        className="mobile-treemap-grid"
        style={{
          position: 'relative',
          background: '#000',
          flex: 1,
          minHeight: 0,
          width: '100%',
          height: '100%', /* CRITICAL: Fill available height */
          overflowX: zoom > 1 ? 'auto' : 'hidden',
          overflowY: 'auto', // Always allow vertical scrolling for vertical treemap layout
          WebkitOverflowScrolling: 'touch' as any,
        }}
        onTouchEnd={handleDoubleTapReset}
      >
        {/* Debug overlay (DEV only) - shows viewport measurements for Safari/Chrome debugging */}
        {process.env.NODE_ENV === 'development' && (
          <div
            style={{
              position: 'fixed',
              left: 8,
              bottom: 'calc(var(--tabbar-h) + 8px)',
              zIndex: 5000,
              background: 'rgba(0,0,0,0.65)',
              color: '#0f0',
              fontSize: 12,
              padding: '6px 8px',
              fontFamily: 'monospace',
              lineHeight: 1.4,
              maxWidth: '90%',
              wordBreak: 'break-word',
            }}
          >
            <div>container: {containerSize.width}×{containerSize.height}</div>
            <div>innerH: {window.innerHeight}</div>
            <div>vv: {window.visualViewport?.width ?? 'na'}×{window.visualViewport?.height ?? 'na'}</div>
            <div>available: {availableHeight} (state)</div>
            <div>availableCalc: {getAvailableTreemapHeight()} (fn)</div>
            <div>layoutH×zoom: {layoutHeight * zoom}</div>
            <div>finalH: {Math.max(layoutHeight * zoom, containerSize.height, availableHeight)}</div>
          </div>
        )}

        {/* Pinch hint: position fixed to be above header (zIndex 100) - fixes Safari/Chrome visibility */}
        {showPinchHint && zoom === 1 && (
          <div
            className="pointer-events-none"
            style={{
              position: 'fixed',
              left: 12,
              top: 64, // 56px (header) + 8px spacing
              zIndex: 2000, // Above header (zIndex 100)
            }}
          >
            <div
              className="px-2.5 py-1.5 rounded-md text-xs font-semibold"
              style={{
                background: 'rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)', // iOS Safari support
              }}
            >
              Pinch to zoom · Double‑tap to reset
            </div>
          </div>
        )}
        <div
          style={{
            position: 'relative',
            width: containerSize.width * zoom,
            /* CRITICAL: Use availableHeight state (updates on visualViewport changes) instead of just containerSize.height
               Safari/Chrome often report smaller containerSize.height than actual available space
               due to visualViewport vs innerHeight differences.
               availableHeight is updated via event listeners for stable iOS Safari/Chrome behavior.
               Vertical treemap: ensure minimum height matches availableHeight for footer alignment, allow scrolling if content is taller.
               CRITICAL: Remove all padding/margin to maximize heatmap area. */
            height: Math.max(layoutHeight * zoom, availableHeight), // Minimum availableHeight for footer alignment, allow scrolling if taller
            minHeight: availableHeight, // Ensure minimum height for footer alignment
            margin: 0,
            padding: 0,
            boxSizing: 'border-box',
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
            style={{
              background: 'rgba(0,0,0,0.45)',
              zIndex: 9999, // CRITICAL: Below detail panel (10000) but above tabbar (9999) - use 9999.5 or same as tabbar
              // Don't block the mobile tab bar + safe area
              bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom))',
            }}
          />
          <div
            className="fixed inset-x-0"
            style={{
              zIndex: 10000, // CRITICAL: Higher than tabbar (z-index: 9999) to appear above navigation
              // Dark background for mobile (consistent with mobile app theme)
              background: '#0f0f0f',
              color: '#ffffff',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              boxShadow: '0 -12px 30px rgba(0,0,0,0.35)',
              padding: '12px 14px',
              // CRITICAL: Calculate max height from viewport - heatmap header (48px) - tabbar - safe area
              // Heatmap has its own fixed header (48px), not the main app header (56px)
              maxHeight: 'calc(100dvh - 48px - var(--tabbar-h) - env(safe-area-inset-bottom))',
              overflow: 'auto', /* CRITICAL: Allow scroll if content is too tall */
              // Sit above mobile tab bar + safe area
              bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom))',
            }}
          >
            {/* Header: Logo + Ticker + Actions */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  <CompanyLogo ticker={selectedCompany.symbol} size={36} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold leading-tight">
                    {selectedCompany.symbol}
                  </div>
                  <div className="text-[10px] opacity-65 leading-tight mt-0.5 truncate">
                    {selectedCompany.sector} · {selectedCompany.industry}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(selectedCompany.symbol)}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-sm"
                    style={{
                      background: (isFavorite && isFavorite(selectedCompany.symbol)) ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.1)',
                      color: (isFavorite && isFavorite(selectedCompany.symbol)) ? '#fbbf24' : '#ffffff',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    aria-label={(isFavorite && isFavorite(selectedCompany.symbol)) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {(isFavorite && isFavorite(selectedCompany.symbol)) ? '★' : '☆'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeSheet}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', WebkitTapHighlightColor: 'transparent' }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Data Grid: 2 columns (Label | Value) */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {/* Row 1: Price */}
              <div className="opacity-70">Price</div>
              <div className="text-right font-semibold font-mono tabular-nums">
                {selectedCompany.currentPrice ? `$${formatPrice(selectedCompany.currentPrice)}` : '—'}
              </div>

              {/* Row 2: Market Cap */}
              <div className="opacity-70">Market Cap</div>
              <div className="text-right font-semibold font-mono tabular-nums">
                {formatMarketCap(selectedCompany.marketCap ?? 0)}
              </div>

              {/* Row 3: % Change */}
              <div className="opacity-70">% Change</div>
              <div
                className={`text-right font-semibold font-mono tabular-nums ${(selectedCompany.changePercent ?? 0) >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
                }`}
              >
                {formatPercent(selectedCompany.changePercent ?? 0)}
              </div>

              {/* Row 4: Mcap Δ */}
              <div className="opacity-70">Mcap Δ</div>
              <div
                className={`text-right font-semibold font-mono tabular-nums ${(selectedCompany.marketCapDiff ?? 0) >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
                }`}
              >
                {selectedCompany.marketCapDiff == null ? '—' : formatMarketCapDiff(selectedCompany.marketCapDiff)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
