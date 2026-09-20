'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { METRIC_PAGES } from '@/lib/heatmap/metricPages';
import type { HeatmapMetric, CompanyNode } from '@/lib/heatmap/types';
import { event } from '@/lib/ga';

/**
 * Interactive heatmap for /heatmap/[metric] SEO pages.
 * Metric switches navigate to that metric's dedicated page (or back to
 * /heatmap for metrics without one) so URL state always matches the view.
 */
export default function MetricHeatmapClient({ metric }: { metric: HeatmapMetric }) {
  const router = useRouter();

  const handleTileClick = useCallback(
    (company: CompanyNode) => {
      event('ticker_click', { ticker: company.symbol, click_source: 'heatmap_metric' });
      router.push(`/analysis/${company.symbol.toUpperCase()}`);
    },
    [router],
  );

  const handleMetricChange = useCallback(
    (next: HeatmapMetric) => {
      const slug = METRIC_PAGES.find((p) => p.metric === next)?.slug;
      router.push(slug ? `/heatmap/${slug}` : '/heatmap');
    },
    [router],
  );

  return (
    <ResponsiveMarketHeatmap
      initialMetric={metric}
      onTileClick={handleTileClick}
      onMetricChange={handleMetricChange}
      sectorLabelVariant="full"
    />
  );
}
