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
import { pickCompanyWithHitSlop } from '@/lib/heatmap/mobileHitSlop';
import type { MobileTreemapSectorBlock } from '@/lib/heatmap/mobileTreemap';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { RotateCcw } from 'lucide-react';

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
// ⚡ PREMIUM UX: Sector label is rendered ABOVE tiles with generous height to
// prevent any text/tile overlap. Bigger chrome = no collision.
const SECTOR_LABEL_H = 18; // px — taller for readability (was 14)
const SECTOR_LABEL_TOP_DIVIDER_H = 1; // px — thin accent line
const SECTOR_LABEL_TOP_GAP = 5; // px — breathing room between label and divider
const SECTOR_LABEL_BOTTOM_MARGIN = 5; // px — margin below divider before first tile row
// Total chrome reserved per sector block:
// Label (18) + TopGap (5) + Divider (1) + BottomMargin (5) = 29px
const SECTOR_CHROME_H = SECTOR_LABEL_H + SECTOR_LABEL_TOP_GAP + SECTOR_LABEL_TOP_DIVIDER_H + SECTOR_LABEL_BOTTOM_MARGIN;

const SECTOR_COL_GAP = 6; // px — tighter columns = more tile space

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
  const { preferences } = useUserPreferences();
  const theme = preferences.theme;
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
    if (!company) return '#1a1a1a';
    const value = metric === 'percent'
      ? (company.changePercent ?? 0)
      : (company.marketCapDiff ?? 0);
    return colorScale(value);
  }, [metric, colorScale]);

  const getTileLabel = useCallback((company: CompanyNode, w: number, h: number) => {
    return getMobileTileLabel(company, w, h, metric);
  }, [metric]);


  // Handle container resizing via ResizeObserver
  // IMPORTANT: We only track WIDTH changes. Height must NEVER be updated from observer
  // because this scrollable container grows vertically when D3 inserts tiles, which
  // re-triggers the observer → infinite layout thrashing loop.
  // Initial height is captured once via getBoundingClientRect on mount.
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // One-time: grab the real available height before D3 mutates the container
    const initialH = containerRef.current.getBoundingClientRect().height;
    setContainerSize(prev =>
      prev.height > 0 ? prev : { width: prev.width, height: initialH }
    );

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setContainerSize(prev => {
            if (prev.width !== width) {
              return { width, height: prev.height }; // height stays frozen — DO NOT update
            }
            return prev;
          });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);



  // Build mobile treemap sector blocks (pure helper; no React logic inside)
  const treemapResult = useMemo(() => {
    return computeMobileTreemapSectors(sortedData, containerSize, metric, {
      sectorChromeHeightPx: SECTOR_CHROME_H,
      columnGapPx: SECTOR_COL_GAP,
    });
  }, [sortedData, metric, containerSize]);

  // Direct use of treemapResult.rows.
  const { rows } = treemapResult;

  // Render treemap tiles + sector labels
  const renderHeatmapContent = () => {
    if (!rows || !Array.isArray(rows)) return null;

    return (
      <>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: 'flex',
              width: '100%',
              height: `${row.height}px`,
              flexShrink: 0, // Prevent row from shrinking and clipping the contained tiles
              gap: `${SECTOR_COL_GAP}px`, // Match D3 calculation instead of hardcoded 4px
            }}
          >
            {row.sectors.map((sector) => (
              <div
                key={sector.name}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  // Use flexBasis + flexShrink:0 so D3's exact pixel widths are honoured.
                  // flexGrow was previously causing flexbox to override D3 calculations and
                  // unevenly inflate one of the columns.
                  flexBasis: `${sector.width}px`,
                  flexShrink: 0,
                  flexGrow: 0,
                  height: '100%',
                  overflow: 'hidden'
                }}
              >
                {/* ── Sector Label Header ── */}
                <div
                  style={{
                    height: `${SECTOR_LABEL_H}px`,
                    padding: '0 6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    fontSize: '9px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(255,255,255,0.65)',
                    lineHeight: 1,
                    marginBottom: `${SECTOR_LABEL_TOP_GAP}px`,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {sector.name}
                </div>

                {/* Thin accent divider */}
                <div
                  style={{
                    height: `${SECTOR_LABEL_TOP_DIVIDER_H}px`,
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 100%)',
                    marginBottom: `${SECTOR_LABEL_BOTTOM_MARGIN}px`,
                    borderRadius: '1px',
                  }}
                />

                {/* Relative Container for D3 Tiles */}
                <div
                  onClickCapture={(e) => {
                    const target = e.target as HTMLElement | null;
                    const isTile = !!target?.closest?.('[data-heatmap-tile="1"]');
                    if (isTile) {
                      const tileEl = target!.closest('[data-heatmap-tile="1"]') as HTMLElement | null;
                      const minDimAttr = tileEl?.getAttribute('data-min-dim');
                      const minDim = minDimAttr ? Number(minDimAttr) : NaN;
                      if (!Number.isFinite(minDim) || minDim >= 22) return;
                    }

                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const px = e.clientX - rect.left;
                    const py = e.clientY - rect.top;
                    const picked = pickCompanyWithHitSlop(sector.children, px, py, { radiusPx: 20 });
                    if (!picked) return;

                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedCompany(picked);
                    onTileClick?.(picked);
                  }}
                  style={{
                    position: 'relative',
                    width: '100%',
                    // Explicit height matches D3 exactly — prevents white strips / jagged edges.
                    height: `${sector.tilesHeight}px`,
                  }}
                >
                  {/* Render Tiles */}
                  {sector.children.map((leaf, i: number) => {
                    const company = leaf.company;
                    const color = getColor(company);
                    const x = leaf.x0;
                    const y = leaf.y0;
                    const width = leaf.x1 - leaf.x0;
                    const height = leaf.y1 - leaf.y0;

                    if (width <= 0 || height <= 0) return null;

                    // Semantic Zoom: Use effective size for visibility checks
                    const effectiveScale = Math.max(1, 1); // Fixed zoomScale reference - zoomScale was removed
                    const label = getTileLabel(company, width * effectiveScale, height * effectiveScale);

                    // Center text: remove optical offset for small tiles/fonts to ensure it looks vertically centered
                    // Only use optical offset if we have ample space
                    const labelHeight = (label.symbolFontPx || 0) + (label.showValue ? (label.valueFontPx || 0) : 0);
                    const useOpticalOffset = height > 60 && labelHeight > 20;
                    const opticalOffsetPx = useOpticalOffset ? getMobileTileOpticalOffsetPx(label) : 0;

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
                          left: `${x + 1}px`,
                          top: `${y + 1}px`,
                          width: `${Math.max(0, width - 2)}px`,  // 2px gap = 1px on each side
                          height: `${Math.max(0, height - 2)}px`,
                          background: color,
                          // Premium border effect: inset shadow creates border without layout impact
                          boxShadow: [
                            'inset 0 0 0 1px rgba(255,255,255,0.18)', // bright inner edge
                            'inset 0 1px 0 rgba(255,255,255,0.28)',   // top highlight
                            '0 0 0 1px rgba(0,0,0,0.35)',             // outer dark edge
                          ].join(', '),
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          cursor: 'pointer',
                          zIndex: 1,
                          touchAction: 'pan-y',
                          // Rounded corners — match desktop tile feel
                          borderRadius: width > 40 && height > 40 ? '4px' : width > 20 && height > 20 ? '2px' : '1px',
                          transition: 'filter 0.15s ease',
                        }}
                      >
                        {!(label.showSymbol || label.showValue) && width >= 10 && height >= 10 && (
                          <div style={{
                            width: Math.min(4, width * 0.2),
                            height: Math.min(4, height * 0.2),
                            borderRadius: '50%',
                            backgroundColor: 'rgba(255,255,255,0.3)',
                            pointerEvents: 'none',
                          }} />
                        )}
                        {(label.showSymbol || label.showValue) && (
                          <div
                            style={{
                              // Refactored to Grid centering per user recommendation (Fix #3)
                              // Grid handles sub-pixel all-caps centering better than flex baseline.
                              display: 'grid',
                              placeItems: 'center',
                              alignContent: 'center',
                              height: '100%',
                              width: '100%',
                              position: 'relative',
                              pointerEvents: 'none',
                              textAlign: 'center',
                              lineHeight: '1', // Fixed line-height
                              gap: label.showValue ? 2 : 0,
                              // Apply optical offset via small translation (safer than 50% transform)
                              transform: opticalOffsetPx > 0 ? `translateY(-${opticalOffsetPx}px)` : 'none',
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
              </div>
            ))}
          </div>
        ))}
      </>
    );
  };

  return (
    <div
      className="flex flex-col w-full overflow-hidden"
      style={{
        position: 'relative',
        height: '100%',
        minHeight: '100%',
        zIndex: 1,
        background: '#0a0a0a', // Always dark for heatmap
      }}
    >
      {/* ── Premium Header ── */}
      <div
        style={{
          position: 'relative',
          zIndex: 100,
          // Glassmorphism header
          background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
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
          <BrandLogo size={22} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '13px', letterSpacing: '-0.01em' }}>PreMarketPrice</span>
        </div>
        <div className="flex-1" />
        {onMetricChange && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '8px',
              padding: '3px',
              border: '1px solid rgba(255,255,255,0.1)',
              gap: 2,
            }}
          >
            <button
              type="button"
              onClick={() => onMetricChange('percent')}
              style={{
                padding: '4px 12px',
                height: '28px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: metric === 'percent'
                  ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                  : 'transparent',
                color: metric === 'percent' ? '#ffffff' : 'rgba(255,255,255,0.5)',
                boxShadow: metric === 'percent' ? '0 2px 8px rgba(37,99,235,0.4)' : 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => onMetricChange('mcap')}
              style={{
                padding: '4px 12px',
                height: '28px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: metric === 'mcap'
                  ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                  : 'transparent',
                color: metric === 'mcap' ? '#ffffff' : 'rgba(255,255,255,0.5)',
                boxShadow: metric === 'mcap' ? '0 2px 8px rgba(37,99,235,0.4)' : 'none',
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

      {/* ── Treemap Container ── */}
      <div
        ref={containerRef}
        className="mobile-heatmap-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          position: 'relative',
          background: '#0a0a0a',
          paddingBottom: '6px',
          overflowX: 'hidden',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',         // Slightly tighter row gap
            paddingTop: '6px',
            paddingLeft: '4px',
            paddingRight: '4px',
          }}
        >
          {treemapResult.rows && treemapResult.rows.length > 0 && containerSize.width > 0 ? (
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
              background: 'var(--clr-bg)',
            }}>
              <div
                className="animate-spin rounded-full border-b-2 border-[var(--clr-text)]"
                style={{
                  width: '32px',
                  height: '32px',
                }}
              />
              <span style={{
                color: 'var(--clr-text-secondary)',
                fontSize: '14px',
              }}>
                Loading heatmap...
              </span>
            </div>
          )}
        </div>
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
                // Premium bottom sheet
                background: 'linear-gradient(180deg, rgba(18,18,22,0.98) 0%, rgba(12,12,16,1) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                color: '#fff',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                border: '1px solid rgba(255,255,255,0.1)',
                borderBottom: 'none',
                boxShadow: '0 -12px 40px rgba(0,0,0,0.7), 0 -1px 0 rgba(255,255,255,0.08)',
                padding: '0',
                maxHeight: 'calc(100dvh - 48px - var(--tabbar-real-h, var(--tabbar-h, 72px)))',
                overflow: 'auto',
                bottom: 'var(--tabbar-real-h, var(--tabbar-h, 72px))',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
                <div style={{
                  width: 36, height: 4,
                  borderRadius: 2,
                  background: 'rgba(255,255,255,0.2)',
                }} />
              </div>
              {/* ── Sheet Header ── */}
              <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{ flexShrink: 0 }}>
                    <CompanyLogo ticker={selectedCompany.symbol} size={44} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                      {selectedCompany.symbol}
                    </div>
                    {/* Sector · Industry — shown on separate lines if needed */}
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4, marginTop: 2 }}>
                      {selectedCompany.sector && (
                        <span>{selectedCompany.sector}</span>
                      )}
                      {selectedCompany.sector && selectedCompany.industry && selectedCompany.industry !== selectedCompany.sector && (
                        <>
                          <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>
                          <span>{selectedCompany.industry}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {onToggleFavorite && (
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(selectedCompany.symbol)}
                      style={{
                        width: 38, height: 38,
                        borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20,
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                        background: (isFavorite && isFavorite(selectedCompany.symbol))
                          ? 'rgba(251,191,36,0.15)'
                          : 'rgba(255,255,255,0.08)',
                        color: (isFavorite && isFavorite(selectedCompany.symbol)) ? '#fbbf24' : 'rgba(255,255,255,0.6)',
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
                    style={{
                      width: 38, height: 38,
                      borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: 'rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.7)',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* ── Data Grid ── */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1px',
                margin: '12px 16px 16px',
                background: 'rgba(255,255,255,0.07)',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                {/* Price */}
                <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Price</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                    {selectedCompany.currentPrice ? `$${formatPrice(selectedCompany.currentPrice)}` : '—'}
                  </div>
                </div>
                {/* % Change */}
                <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>% Change</div>
                  <div style={{
                    fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    color: (selectedCompany.changePercent ?? 0) >= 0 ? '#34d399' : '#f87171',
                  }}>
                    {formatPercent(selectedCompany.changePercent ?? 0)}
                  </div>
                </div>
                {/* Market Cap */}
                <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Market Cap</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb', fontVariantNumeric: 'tabular-nums' }}>
                    {formatMarketCap(selectedCompany.marketCap ?? 0)}
                  </div>
                </div>
                {/* Mcap Δ */}
                <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Mcap Δ</div>
                  <div style={{
                    fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    color: (selectedCompany.marketCapDiff ?? 0) >= 0 ? '#34d399' : '#f87171',
                  }}>
                    {selectedCompany.marketCapDiff == null ? '—' : formatMarketCapDiff(selectedCompany.marketCapDiff)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )
      }
    </div >
  );
};
