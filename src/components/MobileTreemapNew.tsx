'use client';

import React, { useMemo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CompanyNode } from './MarketHeatmap';
import { formatPrice, formatPercent, formatMarketCap, formatMarketCapDiff } from '@/lib/utils/format';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import CompanyLogo from './CompanyLogo';
import { HeatmapMetricButtons } from './HeatmapMetricButtons';
import { BrandLogo } from './BrandLogo';
import { LoginButton } from './LoginButton';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { buildHeatmapHierarchy } from '@/lib/utils/heatmapLayout';
import type { HierarchyData } from '@/components/MarketHeatmap';

interface MobileTreemapNewProps {
  data: CompanyNode[];
  timeframe?: 'day' | 'week' | 'month';
  metric?: 'percent' | 'mcap';
  onMetricChange?: (metric: 'percent' | 'mcap') => void;
  onTileClick?: (company: CompanyNode) => void;
  onToggleFavorite?: (ticker: string) => void;
  isFavorite?: (ticker: string) => boolean;
  activeView?: string | undefined;
}

const MAX_MOBILE_TILES = 800;

type TreemapDatum = {
  name: string;
  value: number;
  company: CompanyNode;
};

/**
 * NOVÝ MOBILE HEATMAP - Úplne nový prístup
 * 
 * Princíp:
 * - Jednoduchý layout bez zbytočných wrapperov
 * - Presná výška: 100vh - header - tabbar
 * - Žiadny čierny priestor
 * - Flexbox layout s presnými výpočtami
 */
export const MobileTreemapNew: React.FC<MobileTreemapNewProps> = ({
  data,
  timeframe = 'day',
  metric = 'percent',
  onMetricChange,
  onTileClick,
  onToggleFavorite,
  isFavorite,
  activeView,
}) => {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [headerH, setHeaderH] = useState(48);
  const [availableHeight, setAvailableHeight] = useState(0);
  // Detail panel state
  const [selectedCompany, setSelectedCompany] = useState<CompanyNode | null>(null);
  const closeSheet = useCallback(() => setSelectedCompany(null), []);

  // Sort data
  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sizeValue = (c: CompanyNode) => {
      if (metric === 'mcap') return c.marketCapDiffAbs ?? Math.abs(c.marketCapDiff ?? 0);
      return c.marketCap || 0;
    };

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
      .slice(0, MAX_MOBILE_TILES);
  }, [data, metric]);

  // Color scale
  const colorScale = useMemo(() => createHeatmapColorScale(timeframe, metric === 'mcap' ? 'mcap' : 'percent'), [timeframe, metric]);

  const getColor = useCallback((company: CompanyNode): string => {
    const value = metric === 'percent'
      ? company.changePercent
      : (company.marketCapDiff ?? 0);
    if (value === null || value === undefined) return '#1a1a1a';
    return colorScale(value);
  }, [metric, colorScale]);

  // Calculate available height: viewport - header - tabbar
  const calculateAvailableHeight = useCallback(() => {
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const tabbarH = 72; // var(--tabbar-h)
    const headerHeight = headerH;
    const available = vh - headerHeight - tabbarH;
    return Math.max(0, available);
  }, [headerH]);

  // Measure header height
  useLayoutEffect(() => {
    if (headerRef.current) {
      const rect = headerRef.current.getBoundingClientRect();
      setHeaderH(Math.ceil(rect.height));
    }
  }, []);

  // Update container size and available height
  useLayoutEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
      setAvailableHeight(calculateAvailableHeight());
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    window.visualViewport?.addEventListener('resize', updateSize);
    
    return () => {
      window.removeEventListener('resize', updateSize);
      window.visualViewport?.removeEventListener('resize', updateSize);
    };
  }, [calculateAvailableHeight]);

  // Build treemap hierarchy using buildHeatmapHierarchy (same as original)
  const treemapData = useMemo(() => {
    if (sortedData.length === 0 || containerSize.width <= 0 || availableHeight <= 0) return null;

    // Use buildHeatmapHierarchy for sector-based layout
    const sectorHierarchy = buildHeatmapHierarchy(sortedData, metric);
    const sectors = sectorHierarchy.children ?? [];

    if (sectors.length === 0) return null;

    // Calculate sector heights (vertical layout - sectors stacked)
    const sumSector = (sector: any) => {
      const children = sector?.children ?? [];
      return children.reduce((sum: number, c: any) => sum + (c?.value || 0), 0);
    };

    const sectorSums = sectors.map(sumSector);
    const totalSum = sectorSums.reduce((a, b) => a + b, 0) || 1;

    // Use availableHeight for accurate calculation
    const baseHeight = availableHeight;
    const MIN_SECTOR_HEIGHT = 56;
    const sectorHeights: number[] = [];
    
    for (let i = 0; i < sectors.length; i++) {
      const raw = Math.round(baseHeight * ((sectorSums[i] || 0) / totalSum));
      sectorHeights.push(Math.max(MIN_SECTOR_HEIGHT, raw));
    }

    // Build treemap for each sector
    const allLeaves: Array<{ x0: number; y0: number; x1: number; y1: number; company: CompanyNode }> = [];
    let currentY = 0;

    sectors.forEach((sector: any, sectorIdx: number) => {
      if (!sector.children || sector.children.length === 0) return;

      const sectorHeight: number = sectorHeights[sectorIdx] ?? 0;
      if (sectorHeight <= 0) return; // Skip if invalid height
      
      const sectorHierarchyNode = hierarchy(sector)
        .sum((d: any) => d.value || 0)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

      const width: number = containerSize.width ?? 0;
      if (width <= 0) return; // Skip if invalid width
      
      const sectorTreemap = treemap()
        .size([width, sectorHeight])
        .padding(0)
        .round(true)
        .tile(treemapSquarify);

      sectorTreemap(sectorHierarchyNode);

      // Extract leaves and adjust Y position
      sectorHierarchyNode.leaves().forEach((leaf: any) => {
        allLeaves.push({
          x0: leaf.x0 || 0,
          y0: (leaf.y0 || 0) + currentY,
          x1: leaf.x1 || 0,
          y1: (leaf.y1 || 0) + currentY,
          company: leaf.data.meta?.companyData || leaf.data,
        });
      });

      currentY += sectorHeight;
    });

    return allLeaves;
  }, [sortedData, metric, containerSize, availableHeight]);

  // Render treemap tiles
  const renderTiles = () => {
    if (!treemapData || !Array.isArray(treemapData)) return null;

    return treemapData.map((leaf, index) => {
      const company = leaf.company;
      const color = getColor(company);
      const x = leaf.x0;
      const y = leaf.y0;
      const width = leaf.x1 - leaf.x0;
      const height = leaf.y1 - leaf.y0;

      if (width <= 0 || height <= 0) return null;

      return (
        <div
          key={`${company.symbol}-${index}`}
          onClick={() => {
            setSelectedCompany(company);
            onTileClick?.(company);
          }}
          style={{
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
            background: color,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'opacity 0.2s',
            WebkitTapHighlightColor: 'transparent',
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.opacity = '0.8';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          <div style={{ 
            fontSize: Math.min(width, height) > 60 ? '12px' : '10px',
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            padding: '4px',
          }}>
            {company.symbol}
          </div>
          {Math.min(width, height) > 60 && (
            <div style={{
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.8)',
              textAlign: 'center',
            }}>
              {formatPercent(company.changePercent)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        /* CRITICAL: Use --tabbar-real-h if available (includes safe-area), otherwise fallback to --tabbar-h */
        bottom: 'var(--tabbar-real-h, var(--tabbar-h, 72px))',
        width: '100%',
        height: 'calc(100vh - var(--tabbar-real-h, var(--tabbar-h, 72px)))',
        display: 'flex',
        flexDirection: 'column',
        background: '#000',
        zIndex: 1,
        overflow: 'hidden',
      }}
    >
      {/* Fixed Header */}
      <div
        ref={headerRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'rgba(0,0,0,0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '8px 10px',
          paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <BrandLogo size={28} />
          <span className="text-white font-semibold text-sm whitespace-nowrap">PreMarketPrice</span>
        </div>
        <div className="flex-1" />
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
              }}
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
              }}
            >
              $
            </button>
          </div>
        )}
        <div className="flex-shrink-0">
          <LoginButton />
        </div>
      </div>

      {/* Spacer for fixed header */}
      <div style={{ height: `${headerH}px`, flexShrink: 0 }} />

      {/* Treemap Container - fills remaining space exactly */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          position: 'relative',
          background: '#000',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {sortedData.length > 0 && containerSize.width > 0 && availableHeight > 0 ? (
          <div style={{
            position: 'relative',
            width: '100%',
            height: treemapData && Array.isArray(treemapData) 
              ? Math.max(availableHeight, treemapData[treemapData.length - 1]?.y1 || availableHeight)
              : availableHeight,
          }}>
            {renderTiles()}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#666',
          }}>
            Loading...
          </div>
        )}
      </div>

      {/* Detail Panel - Bottom Sheet (tap on tile) */}
      {selectedCompany && (
        <>
          <button
            type="button"
            aria-label="Close details"
            onClick={closeSheet}
            className="fixed inset-0"
            style={{
              background: 'rgba(0,0,0,0.6)',
              zIndex: 9998,
              bottom: 'calc(var(--tabbar-real-h, var(--tabbar-h, 72px)) + env(safe-area-inset-bottom))',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />
          <div
            className="fixed inset-x-0"
            style={{
              zIndex: 10000,
              background: '#0f0f0f',
              color: '#ffffff',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
              padding: '16px',
              maxHeight: 'calc(100dvh - 48px - var(--tabbar-real-h, var(--tabbar-h, 72px)) - env(safe-area-inset-bottom))',
              overflow: 'auto',
              bottom: 'calc(var(--tabbar-real-h, var(--tabbar-h, 72px)) + env(safe-area-inset-bottom))',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  <CompanyLogo ticker={selectedCompany.symbol} size={40} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold leading-tight">
                    {selectedCompany.symbol}
                  </div>
                  <div className="text-xs opacity-70 leading-tight mt-1 truncate">
                    {selectedCompany.sector} · {selectedCompany.industry}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(selectedCompany.symbol)}
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors"
                    style={{
                      background: (isFavorite && isFavorite(selectedCompany.symbol)) ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.1)',
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
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-semibold transition-colors"
                  style={{ 
                    background: 'rgba(255,255,255,0.1)', 
                    color: '#ffffff', 
                    WebkitTapHighlightColor: 'transparent' 
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Data Grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="opacity-70 text-xs">Price</div>
              <div className="text-right font-semibold font-mono tabular-nums">
                {selectedCompany.currentPrice ? `$${formatPrice(selectedCompany.currentPrice)}` : '—'}
              </div>

              <div className="opacity-70 text-xs">Market Cap</div>
              <div className="text-right font-semibold font-mono tabular-nums">
                {formatMarketCap(selectedCompany.marketCap ?? 0)}
              </div>

              <div className="opacity-70 text-xs">% Change</div>
              <div
                className={`text-right font-semibold font-mono tabular-nums ${
                  (selectedCompany.changePercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {formatPercent(selectedCompany.changePercent ?? 0)}
              </div>

              <div className="opacity-70 text-xs">Mcap Δ</div>
              <div
                className={`text-right font-semibold font-mono tabular-nums ${
                  (selectedCompany.marketCapDiff ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
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
