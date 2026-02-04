'use client';

import React, { useMemo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { CompanyNode } from './MarketHeatmap';
import { formatPrice, formatPercent, formatMarketCap, formatMarketCapDiff } from '@/lib/utils/format';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import CompanyLogo from './CompanyLogo';
import { BrandLogo } from './BrandLogo';
import { LoginButton } from './LoginButton';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { buildHeatmapHierarchy } from '@/lib/utils/heatmapLayout';

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

const MAX_MOBILE_TILES = 120; // Reduced for better mobile visibility and performance

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

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


  // Update container size
  useLayoutEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Use floor/ceil to avoid subpixel gaps
        setContainerSize({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height)
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    window.visualViewport?.addEventListener('resize', updateSize);

    return () => {
      window.removeEventListener('resize', updateSize);
      window.visualViewport?.removeEventListener('resize', updateSize);
    };
  }, []);

  // Build treemap hierarchy using buildHeatmapHierarchy (same as original)
  const treemapResult = useMemo(() => {
    if (sortedData.length === 0 || containerSize.width <= 0 || containerSize.height <= 0) return { tiles: [], sectors: [] };

    const sectorHierarchy = buildHeatmapHierarchy(sortedData, metric);
    const sectors = sectorHierarchy.children ?? [];

    if (sectors.length === 0) return { tiles: [], sectors: [] };

    const sumSector = (sector: any) => {
      const children = sector?.children ?? [];
      return children.reduce((sum: number, c: any) => sum + (c?.value || 0), 0);
    };

    const sectorSums = sectors.map(sumSector);
    const totalSum = sectorSums.reduce((a, b) => a + b, 0) || 1;

    // CRITICAL: Use measured container height to eliminate gaps
    // Force minimum height to allow scrolling as requested
    const scrollHeight = Math.max(containerSize.height, 800);
    const baseHeight = scrollHeight;
    const MIN_SECTOR_HEIGHT = 48; // Lowered slightly to allow more flexibility
    const sectorHeights: number[] = [];
    let allocatedHeight = 0;

    for (let i = 0; i < sectors.length; i++) {
      if (i === sectors.length - 1) {
        // Last sector takes exactly what's left to avoid gaps
        sectorHeights.push(Math.max(MIN_SECTOR_HEIGHT, baseHeight - allocatedHeight));
      } else {
        const raw = Math.round(baseHeight * ((sectorSums[i] || 0) / totalSum));
        const finalH = Math.max(MIN_SECTOR_HEIGHT, raw);
        sectorHeights.push(finalH);
        allocatedHeight += finalH;
      }
    }

    const allLeaves: Array<{ x0: number; y0: number; x1: number; y1: number; company: CompanyNode }> = [];
    const sectorHeaders: Array<{ name: string; y: number; height: number }> = [];
    let currentY = 0;

    sectors.forEach((sector: any, sectorIdx: number) => {
      if (!sector.children || sector.children.length === 0) return;

      const sectorHeight: number = sectorHeights[sectorIdx] ?? 0;
      if (sectorHeight <= 0) return;

      sectorHeaders.push({ name: sector.name, y: currentY, height: sectorHeight });

      const sectorHierarchyNode = hierarchy(sector)
        .sum((d: any) => d.value || 0)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

      const width: number = containerSize.width ?? 0;
      if (width <= 0) return;

      const sectorTreemap = treemap()
        .size([width, sectorHeight])
        .padding(0)
        .paddingInner(1) // Add 1px gap between tiles to prevent overlaps
        .round(true)
        .tile(treemapSquarify);

      sectorTreemap(sectorHierarchyNode);

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

    return { tiles: allLeaves, sectors: sectorHeaders };
  }, [sortedData, metric, containerSize]);

  const { tiles: treemapData, sectors: sectorHeaders } = treemapResult;

  // Render treemap tiles and headers
  const renderHeatmapContent = () => {
    if (!treemapData || !Array.isArray(treemapData)) return null;

    return (
      <>
        {/* Sector Labels (Background) */}
        {sectorHeaders.map((header, idx) => (
          <div
            key={`sector-${idx}`}
            style={{
              position: 'absolute',
              top: `${header.y}px`,
              left: 0,
              width: '100%',
              height: `${header.height}px`,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            <div style={{
              position: 'sticky',
              top: '0px',
              padding: '4px 8px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.2)',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '80%',
            }}>
              {header.name}
            </div>
          </div>
        ))}

        {/* Company Tiles */}
        {treemapData.map((leaf, index) => {
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
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCompany(company);
                onTileClick?.(company);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedCompany(company);
                  onTileClick?.(company);
                }
              }}
              style={{
                position: 'absolute',
                left: `${x}px`,
                top: `${y}px`,
                width: `${width}px`,
                height: `${height}px`,
                background: color,
                border: '1px solid rgba(0, 0, 0, 0.4)', // Optional: keep border for definition or remove if padding is enough
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'transform 0.15s ease-out, opacity 0.15s ease-out',
                WebkitTapHighlightColor: 'transparent',
                zIndex: 1,
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.transform = 'scale(0.96)';
                e.currentTarget.style.opacity = '0.9';
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.opacity = '1';
              }}
            >
              <div style={{
                fontSize: Math.min(width, height) > 50 ? '13px' : '10px',
                fontWeight: 700,
                color: '#ffffff',
                textAlign: 'center',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}>
                {company.symbol}
              </div>
              {Math.min(width, height) > 40 && (
                <div style={{
                  fontSize: '9px',
                  fontWeight: 500,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textAlign: 'center',
                  marginTop: '1px',
                }}>
                  {formatPercent(company.changePercent)}
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div
      className="flex flex-col w-full bg-black overflow-hidden"
      style={{
        position: 'relative',
        height: '100%',
        minHeight: '100%',
        zIndex: 1,
      }}
    >
      {/* Header - Relative positioning */}
      <div
        style={{
          position: 'relative',
          zIndex: 100,
          background: 'rgba(0,0,0,0.92)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '8px 12px',
          paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <BrandLogo size={24} />
          <span className="text-white font-bold text-sm tracking-tight">PreMarketPrice</span>
        </div>
        <div className="flex-1" />
        {onMetricChange && (
          <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/10">
            <button
              type="button"
              onClick={() => onMetricChange('percent')}
              className="px-3 h-8 rounded-md text-xs font-bold transition-all"
              style={{
                background: metric === 'percent' ? '#2563eb' : 'transparent',
                color: metric === 'percent' ? '#ffffff' : '#94a3b8',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => onMetricChange('mcap')}
              className="px-3 h-8 rounded-md text-xs font-bold transition-all"
              style={{
                background: metric === 'mcap' ? '#2563eb' : 'transparent',
                color: metric === 'mcap' ? '#ffffff' : '#94a3b8',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              $
            </button>
          </div>
        )}
        <div className="flex-shrink-0 ml-1">
          <LoginButton />
        </div>
      </div>

      {/* Spacer REMOVED */}

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
        {sortedData.length > 0 && containerSize.width > 0 && containerSize.height > 0 ? (
          <div style={{
            position: 'relative',
            width: '100%',
            height: treemapData && Array.isArray(treemapData)
              ? Math.max(containerSize.height, (treemapData[treemapData.length - 1]?.y1 || 0))
              : containerSize.height,
          }}>
            {renderHeatmapContent()}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            height: '100%',
            minHeight: '300px',
            background: '#000',
          }}>
            <div
              className="animate-spin rounded-full border-b-2 border-white"
              style={{
                width: '32px',
                height: '32px',
              }}
            />
            <span style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '14px',
            }}>
              Loading heatmap...
            </span>
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
              bottom: 'var(--tabbar-real-h, var(--tabbar-h, 72px))',
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
              maxHeight: 'calc(100dvh - 48px - var(--tabbar-real-h, var(--tabbar-h, 72px)))',
              overflow: 'auto',
              bottom: 'var(--tabbar-real-h, var(--tabbar-h, 72px))',
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
                className={`text-right font-semibold font-mono tabular-nums ${(selectedCompany.changePercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
              >
                {formatPercent(selectedCompany.changePercent ?? 0)}
              </div>

              <div className="opacity-70 text-xs">Mcap Δ</div>
              <div
                className={`text-right font-semibold font-mono tabular-nums ${(selectedCompany.marketCapDiff ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
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
