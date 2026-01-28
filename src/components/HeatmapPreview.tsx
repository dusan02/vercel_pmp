'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { SectionIcon } from './SectionIcon';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { HeatmapMetricButtons } from './HeatmapMetricButtons';
import { HeatmapViewButton } from './HeatmapViewButton';
import { useMediaQuery } from '@/hooks/useMediaQuery';

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
export function HeatmapPreview({ activeView, wrapperClass }: { activeView?: string | undefined; wrapperClass?: string }) {
  const router = useRouter();
  // Centralized metric state with localStorage persistence
  const { metric, setMetric } = useHeatmapMetric('percent');

  // Use hook for reliable desktop/mobile detection
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
      target.closest('[role="button"]');

    if (!isInteractive) {
      router.push('/heatmap');
    }
  }, [router, isDesktop, activeView]);

  // Prevent hydration mismatch by only rendering after mount OR using CSS gating for SSR
  if (!isMounted) return null;

  return (
    <section className={`heatmap-preview ${wrapperClass || ''} ${!isDesktop ? 'h-full flex flex-col' : ''}`}>
      {/* Header - hide on mobile (MobileTreemap has its own) */}
      {isDesktop && (
        <div className="flex items-center justify-between mb-4 px-4">
          <div className="flex items-center">
            <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--clr-text)] m-0 relative -top-1.5">
              <SectionIcon type="heatmap" size={24} className="text-[var(--clr-text)]" />
              <span>Market Heatmap</span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <HeatmapMetricButtons
              metric={metric}
              onMetricChange={setMetric}
            />
            <HeatmapViewButton />
          </div>
        </div>
      )}

      {/* Content Wrapper - simplified: removed unnecessary inner div */}
      <div
        className={`relative w-full bg-black overflow-hidden group heatmap-preview-container ${isDesktop ? 'heatmap-preview-desktop h-[600px]' : 'flex-1'
          }`}
        style={isDesktop ? { cursor: 'pointer' } : { cursor: 'pointer' }}
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
        />
      </div>
    </section>
  );
}

