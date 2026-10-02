'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { HeatmapMetricChips } from './HeatmapMetricChips';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { HeatmapMethodology } from './HeatmapMethodology';

// OPTIMIZATION: Enable SSR for desktop (faster initial load)
// Mobile uses different components, so SSR is safe for desktop
const ResponsiveMarketHeatmap = dynamic(
  () => import('@/components/ResponsiveMarketHeatmap').then(mod => ({ default: mod.default })),
  {
    ssr: true, // Enable SSR for faster desktop loading
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-black text-white text-sm">
        Loading heatmap preview...
      </div>
    )
  }
);

/**
 * Komponent pre miniaturu heatmapy na hlavnej stránke
 * Zobrazuje zmenšenú verziu heatmapy, ktorá pri kliknutí presmeruje na plnú stránku
 * Prepínacie buttony (% Change / Mcap Change) sú vedľa nadpisu
 */
export function HeatmapPreview({ activeView, wrapperClass, onTileClick, onTileHover, initialHeatmapData }: { activeView?: string | undefined; wrapperClass?: string | undefined; onTileClick?: (ticker: string) => void | undefined; onTileHover?: (ticker: string | null) => void | undefined; initialHeatmapData?: any[] | undefined }) {
  const router = useRouter();
  // Centralized metric state with localStorage persistence
  const { metric, setMetric } = useHeatmapMetric('percent');

  // Use hook for reliable desktop/mobile detection
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Handler pre klik na pozadí (nie na buttonoch)
  const handleBackgroundClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Na mobile (ak sme v heatmap tabe), nechceme redirect, aby fungoval bottom sheet
    if (!isDesktop && activeView === 'heatmap') {
      return;
    }

    // Skontroluj, či klik nebol na button alebo interaktívnom elemente
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button') ||
      target.closest('a') ||
      target.closest('[role="button"]') ||
      target.closest('.no-redirect');

    if (!isInteractive) {
      router.push('/heatmap');
    }
  }, [router, isDesktop, activeView]);

  return (
    <section className={`heatmap-preview ${wrapperClass || ''} ${!isDesktop ? 'h-full flex flex-col' : ''}`}>
      {/* No visible title — the active tab above already carries the label.
          Search + fullscreen live in the nav row (PageHeader toolbar). */}
      <h2 className="sr-only">Market Heatmap</h2>

      {/* Metric chips — single scrollable row above the map (desktop) */}
      {isDesktop && (
        <div className="px-4 mb-1.5">
          <HeatmapMetricChips metric={metric} onMetricChange={setMetric} orientation="horizontal" />
        </div>
      )}

      {/* Map — full width; height clamps so the whole map fits above the fold
          (≈190px of header/nav/chips chrome above it), capped at 600px */}
      <div className={isDesktop ? '' : 'flex-1 flex flex-col'}>
      {/* Content Wrapper - simplified: removed unnecessary inner div */}
      <div
        className={`relative w-full bg-black overflow-hidden group heatmap-preview-container border-none outline-none ${isDesktop ? 'heatmap-preview-desktop' : 'flex-1'
          }`}
        style={isDesktop ? { cursor: 'pointer', border: 'none', outline: 'none', height: 'clamp(420px, calc(100vh - 235px), 600px)' } : { cursor: 'pointer', border: 'none', outline: 'none' }}
        onClick={handleBackgroundClick}
      >
        <ResponsiveMarketHeatmap
          apiEndpoint="/api/heatmap"
          autoRefresh={true}
          refreshInterval={60000}
          initialTimeframe="day"
          controlledMetric={metric}
          onMetricChange={setMetric}
          hideMetricButtons={true}
          sectorLabelVariant="compact"
          activeView={activeView}
          initialHeatmapData={initialHeatmapData}
          onTileClick={(company) => {
            if (onTileClick) {
              onTileClick(company.symbol);
            }
          }}
          onTileHover={(company) => onTileHover?.(company ? company.symbol : null)}
        />
      </div>
      </div>

      {/* Score methodology — small print under the map; crawlable via <details> */}
      <HeatmapMethodology className="px-4 pt-1.5 pb-1 flex-shrink-0" />
    </section>
  );
}
