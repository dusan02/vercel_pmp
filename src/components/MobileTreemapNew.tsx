'use client';

import React, { useMemo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CompanyNode } from '@/lib/heatmap/types';
import { formatPrice, formatPercent, formatMarketCap, formatMarketCapDiff } from '@/lib/utils/format';
import { createHeatmapColorScale } from '@/lib/utils/heatmapColors';
import CompanyLogo from './CompanyLogo';
import { BrandLogo } from './BrandLogo';
import { LoginButton } from './LoginButton';
import { computeMobileTreemapSectors, prepareMobileTreemapData } from '@/lib/heatmap/mobileTreemap';
import { getMobileTileLabel, getMobileTileOpticalOffsetPx } from '@/lib/heatmap/mobileLabels';

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
    return prepareMobileTreemapData(data);
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

  const getTileLabel = useCallback((company: CompanyNode, w: number, h: number) => {
    return getMobileTileLabel(company, w, h, metric);
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

  // Build mobile treemap sector blocks (pure helper; no React logic inside)
  const treemapResult = useMemo(() => {
    return computeMobileTreemapSectors(sortedData, containerSize, metric, {
      sectorChromeHeightPx: SECTOR_CHROME_H,
    });
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

          // Mobile UX: hit-slop for tiny tiles.
          // If user taps a very small tile (or near it), select the nearest tile center within a small radius.
          const pickNearestCompany = (px: number, py: number) => {
            const children = (sector as any).children ?? [];
            if (!Array.isArray(children) || children.length === 0) return null;

            // 1) If inside a tile, prefer that tile.
            for (const leaf of children) {
              if (!leaf) continue;
              if (px >= leaf.x0 && px <= leaf.x1 && py >= leaf.y0 && py <= leaf.y1) {
                return leaf.company ?? null;
              }
            }

            // 2) Otherwise pick nearest center (hit-slop).
            let best: any = null;
            let bestDist = Number.POSITIVE_INFINITY;
            for (const leaf of children) {
              if (!leaf) continue;
              const cx = (leaf.x0 + leaf.x1) / 2;
              const cy = (leaf.y0 + leaf.y1) / 2;
              const dx = px - cx;
              const dy = py - cy;
              const d2 = dx * dx + dy * dy;
              if (d2 < bestDist) {
                bestDist = d2;
                best = leaf;
              }
            }

            // Only accept if within ~20px radius (prevents weird far selections)
            const maxR = 20;
            return best && bestDist <= maxR * maxR ? (best.company ?? null) : null;
          };

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
                onClickCapture={(e) => {
                  // If a normal-size tile was tapped, let the tile handler run.
                  const target = e.target as HTMLElement | null;
                  const isTile = !!target?.closest?.('[data-heatmap-tile="1"]');
                  if (isTile) {
                    // For very tiny tiles, still apply hit-slop to reduce mis-taps.
                    const tileEl = target!.closest('[data-heatmap-tile="1"]') as HTMLElement | null;
                    const minDimAttr = tileEl?.getAttribute('data-min-dim');
                    const minDim = minDimAttr ? Number(minDimAttr) : NaN;
                    if (!Number.isFinite(minDim) || minDim >= 22) return;
                  }

                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const px = e.clientX - rect.left;
                  const py = e.clientY - rect.top;
                  const picked = pickNearestCompany(px, py);
                  if (!picked) return;

                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedCompany(picked);
                  onTileClick?.(picked);
                }}
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
                  const opticalOffsetPx = getMobileTileOpticalOffsetPx(label);

                  return (
                    <div
                      key={`${company.symbol}-${i}`}
                      role="button"
                      tabIndex={0}
                      data-heatmap-tile="1"
                      data-min-dim={Math.min(width, height)}
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
                      {(label.showSymbol || label.showValue) && (
                        <div
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: `calc(50% - ${opticalOffsetPx}px)`,
                            transform: 'translate(-50%, -50%)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            pointerEvents: 'none',
                            textAlign: 'center',
                            lineHeight: 1.05,
                            gap: label.showValue ? 2 : 0,
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
