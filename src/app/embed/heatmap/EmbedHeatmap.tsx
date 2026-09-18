'use client';

import React, { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import { isHeatmapMetric } from '@/lib/heatmap/metricValue';

const SITE_URL = 'https://premarketprice.com';

/**
 * Embeddable live premarket heatmap — designed to be iframed by third-party
 * sites (newsletters, blogs). Strips all site chrome, forces dark theme,
 * opens ticker detail in a new tab, and carries a "Powered by" backlink.
 *
 * Params:
 *   ?metric=<HeatmapMetric> — initial metric, any of the 27 supported
 *                             (percent, mcap, week, pe, health, ...; default percent)
 */
export function EmbedHeatmap() {
  const params = useSearchParams();
  const raw = params.get('metric');
  const metric: HeatmapMetric = isHeatmapMetric(raw) ? raw : 'percent';

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark', 'embed-widget');
    document.body.classList.add('embed-widget');
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      root.classList.remove('dark', 'embed-widget');
      document.body.classList.remove('embed-widget');
    };
  }, []);

  const openAnalysis = (company: CompanyNode) => {
    window.open(
      `${SITE_URL}/analysis/${company.symbol}?utm_source=embed&utm_medium=widget`,
      '_blank',
      'noopener'
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0f0f0f]">
      {/* Hide site chrome that the root layout renders around children:
          Footer element, GlobalBottomNav <nav>, and the ZhLanguageHint
          banner (div.fixed.bottom-20). ScrollToTop never mounts here —
          the embed is overflow:hidden so it can't scroll. */}
      <style>{`
        .embed-widget footer,
        .embed-widget nav,
        .embed-widget div.fixed.bottom-20 { display: none !important; }
        .embed-widget body { overflow: hidden !important; }
      `}</style>

      <div className="min-h-0 flex-1">
        <ResponsiveMarketHeatmap
          onTileClick={openAnalysis}
          initialMetric={metric}
          hideMetricButtons
          sectorLabelVariant="compact"
          autoRefresh
          refreshInterval={60000}
        />
      </div>

      <a
        href={`${SITE_URL}/heatmap?utm_source=embed&utm_medium=widget`}
        target="_blank"
        rel="noopener"
        className="flex h-7 shrink-0 items-center justify-center gap-1.5 border-t border-slate-800 bg-[#0a0a0a] text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Live premarket data · Powered by <span className="font-semibold text-slate-300">PreMarketPrice</span>
      </a>
    </div>
  );
}
