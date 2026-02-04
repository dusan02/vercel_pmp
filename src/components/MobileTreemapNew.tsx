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
    if (sortedData.length === 0 || containerSize.width <= 0 || containerSize.height <= 0) return { sectors: [] };

    const sectorHierarchy = buildHeatmapHierarchy(sortedData, metric);
    const sectors = sectorHierarchy.children ?? [];

    if (sectors.length === 0) return { sectors: [] };

    const sumSector = (sector: any) => {
      const children = sector?.children ?? [];
      return children.reduce((sum: number, c: any) => sum + (c?.value || 0), 0);
    };

    const sectorSums = sectors.map(sumSector);
    const totalSum = sectorSums.reduce((a, b) => a + b, 0) || 1;

    // --- REFRACTORED LOGIC FOR SEGMENTED BLOCKS ---

    // 1. Calculate sector heights based on total available scroll area
    // Use a multiplier to ensure the heatmap is tall enough to be readable
    // Min 800px or screen height * 1.5
    const totalContentHeight = Math.max(containerSize.height * 1.2, 900);
    const baseHeight = totalContentHeight;
    const MIN_SECTOR_HEIGHT = 96; // Minimum usable height for a small sector

    const sectorHeights: number[] = [];
    let allocatedHeight = 0;

    for (let i = 0; i < sectors.length; i++) {
      if (i === sectors.length - 1) {
        // Last sector takes exactly what's left
        const h = Math.max(MIN_SECTOR_HEIGHT, baseHeight - allocatedHeight);
        sectorHeights.push(Math.round(h));
      } else {
        const raw = Math.round(baseHeight * ((sectorSums[i] || 0) / totalSum));
        // Ensure integer height
        const finalH = Math.round(Math.max(MIN_SECTOR_HEIGHT, raw));
        sectorHeights.push(finalH);
        allocatedHeight += finalH;
      }
    }

    // 2. Build Sector Blocks with their own independent Treemaps
    const sectorBlocks = sectors.map((sector: any, sectorIdx: number) => {
      if (!sector.children || sector.children.length === 0) return null;

      const sectorHeight = sectorHeights[sectorIdx] ?? 0;
      if (sectorHeight <= 0) return null;

      const width = containerSize.width;
      if (width <= 0) return null;

      // Create hierarchy for JUST this sector
      const sectorHierarchyNode = hierarchy(sector)
        .sum((d: any) => d.value || 0)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

      // Calculate Treemap layout for this sector block (0,0 is top-left of the block)
      const sectorTreemap = treemap()
        .size([width, sectorHeight])
        .padding(0)
        .paddingInner(0) // 0px border/gap to prevent gaps/jagged edges
        .round(true)     // Integers only
        .tile(treemapSquarify);

      sectorTreemap(sectorHierarchyNode);

      // Extract leaves relative to this sector block
      const sectorLeaves = sectorHierarchyNode.leaves().map((leaf: any) => ({
        x0: leaf.x0,
        y0: leaf.y0,
        x1: leaf.x1,
        y1: leaf.y1,
        company: leaf.data.meta?.companyData || leaf.data,
      }));

      return {
        name: sector.name,
        height: sectorHeight,
        children: sectorLeaves
      };
    }).filter(Boolean); // Filter out nulls

    return { sectors: sectorBlocks }; // No more flat 'tiles' array needed
  }, [sortedData, metric, containerSize]);

  // Direct use of treemapResult.sectors in JSX.
  const { sectors: sectorBlocks } = treemapResult;

  // Render treemap tiles and headers
  const renderHeatmapContent = () => {
    if (!sectorBlocks || !Array.isArray(sectorBlocks)) return null;

    return (
      <>
        {sectorBlocks.map((sector) => {
          if (!sector) return null; // Safety check

          return (
            <div
              key={sector.name}
              style={{
                display: 'block',
                width: '100%',
                // Gap handled by parent container
              }}
            >
              {/* Static Sector Header */}
              <div
                style={{
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'rgba(255, 255, 255, 0.85)',
                }}
              >
                {sector.name}
              </div>

              {/* Sector Divider */}
              <div
                style={{
                  height: '1px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  marginBottom: '6px',
                  marginLeft: '8px',
                  marginRight: '8px',
                }}
              />

              {/* Relative Container for D3 Tiles */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: `${sector.height}px`,
                }}
              >
                {/* Render Tiles for this Sector */}
                {sector.children.map((leaf: any, i: number) => {
                  const company = leaf.company;
                  const color = getColor(company);
                  // Coordinates are now relative to the SECTOR block, not global
                  const x = leaf.x0;
                  const y = leaf.y0;
                  const width = leaf.x1 - leaf.x0;
                  const height = leaf.y1 - leaf.y0;

                  if (width <= 0 || height <= 0) return null;

                  return (
                    <div
                      key={`${company.symbol}-${i}`}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
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
                        border: '1px solid rgba(0, 0, 0, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        cursor: 'pointer',
                        zIndex: 1, // Tile z-index
                      }}
                    >
                      <div style={{
                        fontSize: Math.min(width, height) > 50 ? '13px' : '10px',
                        fontWeight: 700,
                        color: '#ffffff',
                        textAlign: 'center',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        pointerEvents: 'none', // Allow click on tile
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
                          pointerEvents: 'none',
                        }}>
                          {formatPercent(company.changePercent)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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

      {/* Treemap Container - Segmented Blocks */}
      <div
        ref={containerRef}
        className="mobile-heatmap-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          position: 'relative',
          background: '#000',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '8px', // Distinct gap between sector blocks
          paddingBottom: '20px',
        }}
      >
        {treemapResult.sectors && treemapResult.sectors.length > 0 && containerSize.width > 0 ? (
          renderHeatmapContent()
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
      </div >

      {/* Detail Panel - Bottom Sheet (tap on tile) */}
      {
        selectedCompany && (
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
        )
      }
    </div >
  );
};
