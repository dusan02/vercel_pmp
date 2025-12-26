'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { SectionIcon } from './SectionIcon';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { HeatmapMetricButtons } from './HeatmapMetricButtons';
import { HeatmapViewButton } from './HeatmapViewButton';

// Dynamicky importujeme ResponsiveMarketHeatmap, aby sa nenačítal hneď (lazy loading)
const ResponsiveMarketHeatmap = dynamic(
  () => import('@/components/ResponsiveMarketHeatmap').then(mod => ({ default: mod.default })),
  {
    ssr: false,
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
export function HeatmapPreview() {
  const router = useRouter();
  // Centralized metric state with localStorage persistence
  const { metric, setMetric } = useHeatmapMetric('percent');

  // Handler pre klik na pozadí (nie na buttonoch)
  const handleBackgroundClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Skontroluj, či klik nebol na button alebo interaktívnom elemente
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button') ||
      target.closest('a') ||
      target.closest('[role="button"]');

    if (!isInteractive) {
      router.push('/heatmap');
    }
  }, [router]);

  return (
    <section className="heatmap-preview">
      <div className="section-header">
        <div className="header-main">
          <h2>
            <SectionIcon type="heatmap" size={20} className="section-icon" />
            <span>Market Heatmap</span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Metric selector buttons - moved outside heatmap */}
          <HeatmapMetricButtons
            metric={metric}
            onMetricChange={setMetric}
          />
          <HeatmapViewButton />
        </div>
      </div>

      <div
        className="relative w-full bg-black overflow-hidden group heatmap-preview-container"
        style={{ height: '400px', minHeight: '400px', cursor: 'pointer' }}
        onClick={handleBackgroundClick}
      >
        {/* Mini heatmap */}
        <div className="w-full h-full">
          <ResponsiveMarketHeatmap
            apiEndpoint="/api/heatmap"
            autoRefresh={true}
            refreshInterval={60000} // 60s - menej časté obnovovanie pre preview
            initialTimeframe="day"
            controlledMetric={metric}
            onMetricChange={setMetric}
            hideMetricButtons={true}
          />
        </div>

      </div>
    </section>
  );
}

