'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { HeatmapViewButton } from './HeatmapViewButton';
import type { HeatmapMetric } from '@/lib/heatmap/types';
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
export function HeatmapPreview({ activeView, wrapperClass, onTileClick, onTileHover, metric, onMetricChange, initialHeatmapData }: { activeView?: string | undefined; wrapperClass?: string | undefined; onTileClick?: (ticker: string) => void | undefined; onTileHover?: (ticker: string | null) => void | undefined; metric?: HeatmapMetric | undefined; onMetricChange?: ((metric: HeatmapMetric) => void) | undefined; initialHeatmapData?: any[] | undefined }) {
  const router = useRouter();
  // Metric is controlled by HomePage (chips render in the header under the
  // tabs); fall back to the hook when no controller is provided.
  const internal = useHeatmapMetric('percent');
  const effectiveMetric = metric ?? internal.metric;
  const effectiveSetMetric = onMetricChange ?? internal.setMetric;

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
          Search + fullscreen live in the nav row, metric chips in the header
          subnav row (PageHeader) — the map starts flush below them. */}
      <h2 className="sr-only">Market Heatmap</h2>

      {/* Map — full width; height clamps so the whole map fits above the fold
          (≈215px of hero/header/nav/chips chrome above it), capped at 600px */}
      <div className={isDesktop ? '' : 'flex-1 flex flex-col'}>
      {/* Content Wrapper - simplified: removed unnecessary inner div */}
      <div
        className={`relative w-full bg-black overflow-hidden group heatmap-preview-container border-none outline-none ${isDesktop ? 'heatmap-preview-desktop' : 'flex-1'
          }`}
        style={isDesktop ? { cursor: 'pointer', border: 'none', outline: 'none', height: 'clamp(420px, calc(100vh - 215px), 600px)' } : { cursor: 'pointer', border: 'none', outline: 'none' }}
        onClick={handleBackgroundClick}
      >
        {/* Fullscreen — a map control, visually owned by the map itself */}
        {isDesktop && (
          <div className="absolute top-2 right-2 z-10">
            <HeatmapViewButton overlay />
          </div>
        )}
        <ResponsiveMarketHeatmap
          apiEndpoint="/api/heatmap"
          autoRefresh={true}
          refreshInterval={60000}
          initialTimeframe="day"
          controlledMetric={effectiveMetric}
          onMetricChange={effectiveSetMetric}
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
