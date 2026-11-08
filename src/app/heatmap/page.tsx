'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import type { CompanyNode } from '@/lib/heatmap/types';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { HeatmapMetricChips } from '@/components/HeatmapMetricChips';
import { HEATMAP_METRICS, isHeatmapMetric } from '@/lib/heatmap/metricValue';
import { METRIC_PAGES } from '@/lib/heatmap/metricPages';
import { HeatmapMethodology } from '@/components/HeatmapMethodology';
import { AnalysisStockSearch } from '@/components/AnalysisStockSearch';
import { logger } from '@/lib/utils/logger';
import { event } from '@/lib/ga';

/**
 * Stránka pre heatmapu
 */
export default function HeatmapPage() {
  const router = useRouter();
  // Timeframe je fixne nastavený na 'day'
  const timeframe = 'day';
  
  // Metrika heat mapy (Percent vs Mcap) - state lifting
  const { metric, setMetric } = useHeatmapMetric();

  // ?metric= z URL má prednosť pred localStorage — shareable linky
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('metric');
    if (fromUrl && isHeatmapMetric(fromUrl)) setMetric(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync metriky do URL cez replaceState — /heatmap?metric=pe je zdielateľný
  // (canonical ostáva /heatmap, SEO landing pages sú /heatmap/[slug])
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('metric') === metric) return;
    url.searchParams.set('metric', metric);
    window.history.replaceState(null, '', url.toString());
  }, [metric]);

  // Ensure heatmap page has normal font size
  useEffect(() => {
    document.body.classList.add('heatmap-page-wrapper');
    return () => {
      document.body.classList.remove('heatmap-page-wrapper');
    };
  }, []);

  // Handler pre exit fullscreen (návrat na homepage)
  const handleExitFullscreen = useCallback(() => {
    event('heatmap_fullscreen_toggle', { enabled: false });
    router.push('/');
  }, [router]);



  const handleTileClick = useCallback((company: CompanyNode) => {
    logger.debug('Heatmap tile clicked', { symbol: company.symbol });
    event('ticker_click', { ticker: company.symbol, click_source: 'heatmap' });
    router.push(`/analysis/${company.symbol.toUpperCase()}`);
  }, [router]);

  // Prefetch the analysis route + warm the API on persistent tile hover
  // (150ms debounce skips mouse sweeps; per-symbol Set dedupes).
  const prefetchRef = useRef<{ timer?: ReturnType<typeof setTimeout>; done: Set<string> }>({ done: new Set() });
  const handleTileHover = useCallback((company: CompanyNode | null) => {
    const ref = prefetchRef.current;
    clearTimeout(ref.timer);
    if (!company) return;
    const symbol = company.symbol.toUpperCase();
    if (ref.done.has(symbol)) return;
    ref.timer = setTimeout(() => {
      ref.done.add(symbol);
      router.prefetch(`/analysis/${symbol}`);
      void fetch(`/api/analysis/${encodeURIComponent(symbol)}`).catch(() => {});
    }, 150);
  }, [router]);

  return (
    <div
      className="min-h-screen w-full bg-black text-white flex flex-col"
      suppressHydrationWarning
    >
      {/* 1. Interactive Heatmap Canvas Viewport */}
      <div className="h-[92vh] min-h-[580px] w-full flex flex-col flex-shrink-0 border-b border-gray-800">
        <div className="relative px-2 py-1 z-[100] text-white flex-shrink-0 flex items-center justify-between bg-black border-b border-gray-800" style={{ pointerEvents: 'auto' }}>
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold mb-0 leading-none">
                Heatmap<span className="text-green-500">.{HEATMAP_METRICS.find(m => m.id === metric)?.label ?? 'Day change %'}</span>
              </h1>
              <p className="text-[9px] text-gray-400 hidden sm:block">
                Interactive US stock market visualization
              </p>
            </div>

            {/* Score methodology — ⓘ opens floating panel */}
            <details className="relative group">
              <summary
                className="list-none cursor-pointer w-5 h-5 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 transition-colors text-[10px] font-bold italic"
                title="How are the scores calculated?"
                aria-label="How are the scores calculated?"
              >
                i
              </summary>
              <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-[320px] sm:w-[420px] max-h-[70vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl z-[200]">
                <HeatmapMethodology />
              </div>
            </details>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Global ticker search */}
            <div className="w-44 sm:w-64">
              <AnalysisStockSearch variant="dark" placeholder="Search stocks…" />
            </div>

            {/* Exit fullscreen button */}
            <button
              onClick={handleExitFullscreen}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors duration-200 text-sm font-semibold shadow-md relative z-10"
              style={{ pointerEvents: 'auto' }}
              title="Exit fullscreen (back to homepage)"
              aria-label="Exit fullscreen"
            >
              <svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M6 18L18 6M6 6l12 12" 
                />
              </svg>
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>

        {/* Metric chip strip */}
        <div className="px-2 py-1 flex-shrink-0 bg-black border-b border-gray-800">
          <HeatmapMetricChips metric={metric} onMetricChange={setMetric} variant="dark" />
        </div>

        {/* Heatmap canvas */}
        <div 
          className="flex-1 min-h-0 relative w-full"
          style={{ overflow: 'hidden', width: '100%' }}
        >
          <ResponsiveMarketHeatmap
            sectorLabelVariant="full"
            apiEndpoint="/api/heatmap"
            onTileClick={handleTileClick}
            onTileHover={handleTileHover}
            autoRefresh={true}
            refreshInterval={60000}
            initialTimeframe={timeframe}
            controlledMetric={metric}
            onMetricChange={setMetric}
            hideMetricButtons={true}
          />
        </div>
      </div>

      {/* 2. Visible SEO Guide & FAQ Section (eliminates Google Soft 404) */}
      <section className="bg-gray-950 text-gray-300 py-10 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-7xl mx-auto space-y-10">
          <div>
            <h2 className="text-2xl font-bold text-white mb-3">US Stock Market Heatmap Guide</h2>
            <p className="text-gray-400 text-sm leading-relaxed max-w-4xl">
              An interactive visual map of 1,000+ US publicly traded companies across all major S&amp;P 500 sectors:
              Technology, Healthcare, Financial Services, Consumer Cyclical, Industrials, Energy, Communication Services,
              Consumer Defensive, Utilities, Real Estate, and Basic Materials.
              Tile size reflects market capitalization, while color reveals relative strength across 27 fundamental and performance metrics.
            </p>
          </div>

          {/* Metric Landing Pages */}
          <div>
            <h3 className="text-base font-semibold text-white mb-3">27 Performance &amp; Valuation Views</h3>
            <div className="flex flex-wrap gap-2">
              {METRIC_PAGES.map((p) => (
                <Link
                  key={p.slug}
                  href={`/heatmap/${p.slug}`}
                  className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs font-medium text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
                >
                  {p.h1}
                </Link>
              ))}
            </div>
          </div>

          {/* FAQ matching JSON-LD Schema */}
          <div>
            <h3 className="text-base font-semibold text-white mb-4">Frequently Asked Questions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-1">What is a stock market heatmap?</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  A market heatmap is a treemap visualization where each tile is a publicly traded company, sized by market capitalization and colored by a selected metric — such as daily % change, weekly/monthly performance, valuation multiples, or financial health scores.
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-1">What metrics can the heatmap display?</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  The heatmap supports 27 metrics including price performance (day, week, month, YTD, 1-year change), valuation ratios (P/E, forward P/E, P/S, P/B, PEG, EV/EBITDA), fundamental scores (Altman Z, Piotroski F-score, Beneish M-score), and activity signals (relative volume, movers Z-score).
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-1">How often is the heatmap data updated?</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Prices refresh roughly every minute during pre-market (4:00 AM – 9:30 AM ET), regular trading hours, and after-hours sessions. Fundamental metrics and financial statement scores are updated daily from SEC EDGAR filings.
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-1">What does tile color mean?</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Green tiles indicate a favorable value for the selected metric (e.g. positive return, high health score, or attractive valuation), red tiles indicate an unfavorable value, and neutral dark tiles indicate that the metric is not applicable or unavailable.
                </p>
              </div>
            </div>
          </div>

          {/* Quick links to top stocks */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Track Top S&amp;P 500 Companies</h3>
            <div className="flex flex-wrap gap-2 text-xs text-gray-400">
              {['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'UNH', 'XOM', 'V', 'JNJ', 'WMT', 'PG', 'AMD', 'COST', 'BAC', 'CRM'].map((sym) => (
                <Link
                  key={sym}
                  href={`/analysis/${sym}`}
                  className="hover:text-blue-400 underline decoration-gray-700"
                >
                  {sym} Analysis
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
