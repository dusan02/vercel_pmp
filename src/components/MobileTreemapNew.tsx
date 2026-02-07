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

const MAX_MOBILE_TILES = 500; // Target: S&P 500
const MIN_TILE_VALUE_B = 1e-6; // 0.000001B = $1k (prevents D3 from dropping 0-valued tiles)

// Mobile sector label sizing.
// IMPORTANT UX: tiles should get priority; the sector label should be minimal and not "eat" the heatmap.
// We render the sector label as a small footer under tiles (not above).
const SECTOR_LABEL_H = 12; // px
const SECTOR_LABEL_TOP_DIVIDER_H = 1; // px
const SECTOR_LABEL_TOP_GAP = 2; // px (space between tiles and divider)
const SECTOR_CHROME_H = SECTOR_LABEL_TOP_GAP + SECTOR_LABEL_TOP_DIVIDER_H + SECTOR_LABEL_H;

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

    const seen = new Set<string>();
    const uniqueData = data.filter(c => {
      const symbol = c.symbol?.toUpperCase();
      if (!symbol || seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });

    // Keep a stable ticker set (top 500 by market cap), but allow layout sizing to change by metric later.
    // We enrich marketCapDiffAbs so $ sizing can work reliably even if the API didn't send it.
    const top = uniqueData
      .filter(c => (c.marketCap ?? 0) > 0)
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, MAX_MOBILE_TILES);

    return top.map((c) => ({
      ...c,
      marketCapDiffAbs: c.marketCapDiffAbs ?? Math.max(MIN_TILE_VALUE_B, Math.abs(c.marketCapDiff ?? 0)),
    }));
  }, [data]);

  // For easy verification (prod too): how many unique tickers are shown
  const tileCount = sortedData.length;

  // Color scale
  const colorScale = useMemo(() => createHeatmapColorScale(timeframe, metric === 'mcap' ? 'mcap' : 'percent'), [timeframe, metric]);

  const getColor = useCallback((company: CompanyNode): string => {
    const value = metric === 'percent'
      ? company.changePercent
      : (company.marketCapDiff ?? 0);
    if (value === null || value === undefined) return '#1a1a1a';
    return colorScale(value);
  }, [metric, colorScale]);

  // Tile label rules: adaptive fitting for mobile
  const getTileLabel = useCallback((company: CompanyNode, w: number, h: number) => {
    const minDim = Math.min(w, h);
    const maxDim = Math.max(w, h);
    const aspect = h > 0 ? (w / h) : 1;
    const area = w * h;

    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    // Too small → no text at all
    if (minDim < 16 || area < 18 * 18) {
      return { showSymbol: false, showValue: false, layout: 'none' as const, symbol: '', value: '', symbolFontPx: 0, valueFontPx: 0 };
    }

    // Base font sizing (ticker is priority, percent is optional)
    // Use minDim but allow slightly smaller fonts in very thin rectangles.
    const symbolFontPx = Math.round(clamp(minDim * 0.3, 8, 16));
    const valueFontPx = Math.round(clamp(symbolFontPx - 4, 7, 12));

    const valueText = metric === 'percent'
      ? formatPercent(company.changePercent ?? 0)
      : (company.marketCapDiff == null ? '' : formatMarketCapDiff(company.marketCapDiff));

    const symbolText = (company.symbol ?? '').toUpperCase();

    // Rough text width approximation (fast + good enough for fitting decisions)
    // Uppercase tickers are usually compact; % strings are slightly wider.
    const estTextWidth = (text: string, fontPx: number, factor: number) => text.length * fontPx * factor;
    const symbolW = estTextWidth(symbolText, symbolFontPx, 0.62);
    const valueW = estTextWidth(valueText, valueFontPx, 0.56);

    // Inner padding budget (keeps text away from edges)
    const padX = clamp(Math.round(minDim * 0.08), 2, 6);
    const padY = clamp(Math.round(minDim * 0.06), 2, 6);
    const availW = Math.max(0, w - padX * 2);
    const availH = Math.max(0, h - padY * 2);

    const hasValue = valueText.length > 0;

    // Candidate: stacked (ticker above %)
    const stackedGap = 2;
    const stackedNeededH = symbolFontPx + (hasValue ? (stackedGap + valueFontPx) : 0);
    const stackedNeededW = Math.max(symbolW, hasValue ? valueW : 0);
    const stackedFits = availH >= stackedNeededH && availW >= stackedNeededW;

    // Candidate: inline (ticker + % side-by-side)
    const inlineGap = 4;
    const inlineNeededH = Math.max(symbolFontPx, valueFontPx);
    const inlineNeededW = symbolW + (hasValue ? (inlineGap + valueW) : 0);
    const inlineFits = hasValue && aspect >= 1.35 && availH >= inlineNeededH && availW >= inlineNeededW;

    // Candidate: ticker-only
    const tickerOnlyFits = availH >= symbolFontPx && availW >= symbolW;

    // Pick best layout:
    // - If the tile is wide, inline looks best and saves vertical space.
    // - Otherwise use stacked if it fits.
    // - Otherwise ticker only.
    // - Otherwise nothing.
    let layout: 'inline' | 'stacked' | 'ticker' | 'none' = 'none';
    if (inlineFits) layout = 'inline';
    else if (stackedFits && hasValue && maxDim >= 26) layout = 'stacked';
    else if (tickerOnlyFits) layout = 'ticker';
    else layout = 'none';

    return {
      showSymbol: layout !== 'none',
      showValue: layout === 'inline' || layout === 'stacked',
      layout,
      symbol: symbolText,
      value: valueText,
      symbolFontPx,
      valueFontPx,
    };
  }, [metric]);


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

    // Compute treemap areas based on selected metric:
    // - % view: size by market cap (classic S&P 500 heatmap)
    // - $ view: size by absolute market cap change (mcap diff)
    const layoutMetric = metric === 'mcap' ? 'mcap' : 'percent';
    const sectorHierarchy = buildHeatmapHierarchy(sortedData, layoutMetric);
    const sectors = sectorHierarchy.children ?? [];

    if (sectors.length === 0) return { sectors: [] };

    // IMPORTANT: sector children are typically industries, not companies, so `.value` may be missing at that level.
    // We must sum recursively, otherwise most sector sums collapse to ~0 and sector heights become distorted.
    const sumNode = (node: any): number => {
      if (!node) return 0;
      if (typeof node.value === 'number' && !Number.isNaN(node.value)) return node.value;
      const children = node.children ?? [];
      if (!Array.isArray(children) || children.length === 0) return 0;
      return children.reduce((sum: number, c: any) => sum + sumNode(c), 0);
    };
    const sumSector = (sector: any) => sumNode(sector);

    const sectorSums = sectors.map(sumSector);
    const totalSum = sectorSums.reduce((a, b) => a + b, 0) || 1;

    // --- REFRACTORED LOGIC FOR SEGMENTED BLOCKS ---

    // 1. Calculate sector heights based on total available scroll area
    // Use a multiplier to ensure the heatmap is tall enough to be readable
    // Min 800px or screen height * 1.5
    const totalContentHeight = Math.max(containerSize.height * 1.2, 900);
    const baseHeight = totalContentHeight;
    const MIN_TILES_H = 56; // Minimum usable tile area inside a small sector block
    const MIN_SECTOR_HEIGHT = SECTOR_CHROME_H + MIN_TILES_H;

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

      // Reserve space for the sector header/divider so it never overlaps/clips tiles.
      const tilesHeight = Math.max(1, sectorHeight - SECTOR_CHROME_H);

      // Create hierarchy for JUST this sector
      const sectorHierarchyNode = hierarchy(sector)
        .sum((d: any) => d.value || 0)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

      // Calculate Treemap layout for this sector block (0,0 is top-left of the block)
      const sectorTreemap = treemap()
        .size([width, tilesHeight])
        .padding(0)
        .paddingInner(0) // 0px border/gap to prevent gaps/jagged edges
        .round(true) // CRITICAL: snap to integer pixels to avoid subpixel gaps / jagged bottoms
        .tile(treemapSquarify);

      sectorTreemap(sectorHierarchyNode);

      // Extract leaves relative to this sector block
      const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
      const sectorLeaves = sectorHierarchyNode.leaves().map((leaf: any) => {
        // IMPORTANT:
        // D3 treemap with `.round(true)` already produces a non-overlapping integer tiling.
        // Avoid floor/ceil expansion here, which can create 1px overlaps between neighbors.
        const x0 = clamp(leaf.x0 ?? 0, 0, width);
        const y0 = clamp(leaf.y0 ?? 0, 0, tilesHeight);
        const x1 = clamp(leaf.x1 ?? 0, 0, width);
        const y1 = clamp(leaf.y1 ?? 0, 0, tilesHeight);

        return {
          x0,
          y0,
          x1,
          y1,
          company: leaf.data.meta?.companyData || leaf.data,
        };
      }).filter((leaf: any) => {
        // Drop degenerate tiles (can happen for extremely small values after rounding)
        const w = (leaf.x1 - leaf.x0);
        const h = (leaf.y1 - leaf.y0);
        return w > 0 && h > 0;
      });

      return {
        name: sector.name,
        height: sectorHeight,
        tilesHeight,
        children: sectorLeaves
      };
    }).filter(Boolean); // Filter out nulls

    return { sectors: sectorBlocks }; // No more flat 'tiles' array needed
  }, [sortedData, metric, containerSize]);

  // Direct use of treemapResult.sectors in JSX.
  const { sectors: sectorBlocks } = treemapResult;

  // Render treemap tiles + sector labels
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
              {/* Relative Container for D3 Tiles (tiles first = priority) */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  // Keep the overall sector block height stable and reserve label space BELOW tiles.
                  height: `${(sector as any).tilesHeight ?? sector.height}px`,
                  overflow: 'hidden', // CRITICAL: never allow tiles to bleed outside sector block
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

                  const label = getTileLabel(company, width, height);
                  // Optical centering: geometric 50/50 tends to look slightly low for all-caps text.
                  // For stacked labels it’s more noticeable; for inline/ticker-only keep it smaller.
                  const opticalOffsetPx = (() => {
                    if (label.layout === 'none') return 0;
                    if (label.layout === 'inline') return 1;
                    if (label.layout === 'ticker') return 1;
                    // stacked
                    return Math.min(
                      4,
                      Math.max(
                        1,
                        Math.round(
                          (label.symbolFontPx || 0) * 0.12 +
                          (label.showValue ? (label.valueFontPx || 0) * 0.2 : 0)
                        )
                      )
                    );
                  })();

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
                        // CRITICAL:
                        // Use inset shadow instead of border. On iOS/Safari, borders on edge-aligned absolutely positioned
                        // elements inside overflow-hidden containers can look "clipped" by 1px at sector boundaries.
                        // Inset shadow is drawn fully inside the tile and avoids that rendering artifact.
                        boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.25)',
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        cursor: 'pointer',
                        zIndex: 1, // Tiles should stay above any sector label chrome
                      }}
                    >
                      {label.layout !== 'none' && (
                        <div
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: `calc(50% - ${opticalOffsetPx}px)`,
                            transform: 'translate(-50%, -50%)',
                            display: 'flex',
                            flexDirection: label.layout === 'inline' ? 'row' : 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                            textAlign: 'center',
                            lineHeight: 1.05,
                            gap: label.layout === 'inline' ? 4 : (label.showValue ? 2 : 0),
                          }}
                        >
                          {label.showSymbol && (
                            <div
                              style={{
                                fontSize: `${label.symbolFontPx}px`,
                                fontWeight: 800,
                                color: '#ffffff',
                                textShadow: '0 1px 2px rgba(0,0,0,0.55)',
                                letterSpacing: '0.01em',
                                whiteSpace: 'nowrap',
                                lineHeight: 1,
                              }}
                            >
                              {label.symbol}
                            </div>
                          )}
                          {label.showValue && (
                            <div
                              style={{
                                fontSize: `${label.valueFontPx}px`,
                                fontWeight: 600,
                                color: 'rgba(255, 255, 255, 0.92)',
                                textShadow: '0 1px 2px rgba(0,0,0,0.45)',
                                whiteSpace: 'nowrap',
                                lineHeight: 1,
                              }}
                            >
                              {label.value}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Sector Label Footer (minimal; doesn't steal prime tile space) */}
              <div style={{ height: `${SECTOR_LABEL_TOP_GAP}px` }} />
              <div
                style={{
                  height: `${SECTOR_LABEL_TOP_DIVIDER_H}px`,
                  background: 'rgba(255, 255, 255, 0.06)',
                  margin: '0 8px',
                }}
              />
              <div
                style={{
                  height: `${SECTOR_LABEL_H}px`,
                  padding: '0 8px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'rgba(255, 255, 255, 0.75)',
                  lineHeight: 1,
                }}
              >
                {sector.name}
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
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.55)',
              marginLeft: 6,
              letterSpacing: '0.02em',
            }}
            aria-label={`Heatmap tickers shown: ${tileCount}`}
            title={`Tickers shown: ${tileCount}`}
          >
            {tileCount}
          </span>
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
          // CRITICAL: ensure the last sector/tiles are not hidden behind the fixed mobile tab bar.
          // `--tabbar-real-h` is set dynamically (and already includes safe-area from tabbar padding).
          // IMPORTANT: don't add `env(safe-area-inset-bottom)` again, otherwise you get a big empty "black strip".
          paddingBottom:
            'calc(var(--tabbar-real-h, calc(var(--tabbar-h, 72px) + env(safe-area-inset-bottom, 0px))) + 8px)',
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
