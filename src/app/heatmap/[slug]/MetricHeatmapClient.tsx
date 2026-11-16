'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { HeatmapMetricButtons } from '@/components/HeatmapMetricButtons';
import { useAnalysisPrefetch } from '@/hooks/useAnalysisPrefetch';
import { METRIC_PAGES } from '@/lib/heatmap/metricPages';
import type { HeatmapMetric, CompanyNode } from '@/lib/heatmap/types';
import { event } from '@/lib/ga';

/**
 * Resolve navigation target when switching metrics on /heatmap/[slug].
 * Metrics with a dedicated SEO page route to `/heatmap/<slug>`, otherwise
 * fall back to `/heatmap?metric=<id>` so the chosen metric stays selected.
 */
export function getMetricNavigationTarget(next: HeatmapMetric): string {
  const slug = METRIC_PAGES.find((p) => p.metric === next)?.slug;
  return slug ? `/heatmap/${slug}` : `/heatmap?metric=${encodeURIComponent(next)}`;
}

/**
 * Interactive heatmap for /heatmap/[metric] SEO pages.
 * Metric switches navigate to that metric's dedicated page (or `/heatmap?metric=...`
 * for metrics without one) so URL state always matches the view.
 */
export default function MetricHeatmapClient({ metric }: { metric: HeatmapMetric }) {
  const router = useRouter();
  const handleTileHover = useAnalysisPrefetch();

  const handleTileClick = useCallback(
    (company: CompanyNode) => {
      event('ticker_click', { ticker: company.symbol, click_source: 'heatmap_metric' });
      router.push(`/analysis/${company.symbol.toUpperCase()}`);
    },
    [router],
  );

  const handleMetricChange = useCallback(
    (next: HeatmapMetric) => {
      if (next === metric) return;
      router.push(getMetricNavigationTarget(next));
    },
    [metric, router],
  );

  return (
    <div className="flex flex-col h-full w-full">
      {/* Desktop bar above canvas so metric selector never covers the TECHNOLOGY sector header */}
      <div className="hidden md:flex items-center justify-between gap-3 px-3 py-1.5 bg-[#0a0a0a] border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400">Metric:</span>
          <HeatmapMetricButtons
            metric={metric}
            onMetricChange={handleMetricChange}
            variant="dark"
            size="sm"
          />
        </div>
        <Link
          href={`/heatmap?metric=${encodeURIComponent(metric)}`}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Full interactive heatmap ↗
        </Link>
      </div>

      <div className="flex-1 min-h-0 relative">
        <ResponsiveMarketHeatmap
          controlledMetric={metric}
          onTileClick={handleTileClick}
          onTileHover={handleTileHover}
          onMetricChange={handleMetricChange}
          hideMetricButtons={true}
          sectorLabelVariant="full"
        />
      </div>
    </div>
  );
}
