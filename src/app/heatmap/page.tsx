'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import type { CompanyNode } from '@/lib/heatmap/types';
import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import { HeatmapMetricButtons } from '@/components/HeatmapMetricButtons';
import { HEATMAP_METRICS, isHeatmapMetric } from '@/lib/heatmap/metricValue';
import { METRIC_PAGES } from '@/lib/heatmap/metricPages';
import { HeatmapMethodology } from '@/components/HeatmapMethodology';
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

  // Odstránenie scrollbarov z body a html
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyMargin = document.body.style.margin;
    const originalHtmlMargin = document.documentElement.style.margin;
    const originalBodyPadding = document.body.style.padding;
    
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.documentElement.style.margin = '0';
    document.body.style.padding = '0';
    
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.margin = originalBodyMargin;
      document.documentElement.style.margin = originalHtmlMargin;
      document.body.style.padding = originalBodyPadding;
    };
  }, []);

  const handleTileClick = useCallback((company: CompanyNode) => {
    logger.debug('Heatmap tile clicked', { symbol: company.symbol });
    event('ticker_click', { ticker: company.symbol, source: 'heatmap' });
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
      className="h-screen w-screen bg-black overflow-hidden flex flex-col"
      style={{ overflow: 'hidden' }}
      suppressHydrationWarning
    >
      {/* SEO: sr-only summary for crawlers (page is client-only, no SSR content) */}
      <div className="sr-only" aria-hidden="false">
        <h2>US Stock Market Heatmap</h2>
        <p>
          Interactive treemap visualization of US stock market performance.
          View market movers by percentage change or market capitalization change
          across all major sectors: Technology, Healthcare, Financial Services,
          Consumer Cyclical, Industrials, Energy, Communication Services,
          Consumer Defensive, Utilities, Real Estate, and Basic Materials.
        </p>
        <p>
          Each tile represents a publicly traded company. Tile size corresponds
          to market capitalization. Tile color indicates the selected metric —
          choose from day, week, month, YTD or 1-year performance, P/E, forward
          P/E, P/S, P/B, PEG and EV/EBITDA valuation ratios, dividend yield, ROE,
          net margin, revenue and EPS growth, free cash flow margin, Piotroski
          F-score, Altman Z-score, Beneish M-score, relative volume, beta and
          movers Z-score — green for favorable values, red for unfavorable ones.
          Click any tile to view detailed stock analysis including financial
          health scores, valuation metrics, analyst consensus, earnings
          calendar, and recent market moves.
        </p>
        <nav aria-label="Related pages">
          <a href="/premarket-movers">Pre-market movers</a>
          <a href="/gainers">Top gainers</a>
          <a href="/losers">Top losers</a>
          <a href="/screener">All stocks</a>
          <a href="/sectors">Sector performance</a>
          <a href="/screener">Stock screener</a>
          <a href="/earnings">Earnings calendar</a>
          {METRIC_PAGES.map((p) => (
            <a key={p.slug} href={`/heatmap/${p.slug}`}>{p.h1}</a>
          ))}
          <a href="/analysis/AAPL">AAPL Analysis</a>
          <a href="/analysis/MSFT">MSFT Analysis</a>
          <a href="/analysis/NVDA">NVDA Analysis</a>
          <a href="/analysis/GOOGL">GOOGL Analysis</a>
          <a href="/analysis/AMZN">AMZN Analysis</a>
          <a href="/analysis/META">META Analysis</a>
          <a href="/analysis/TSLA">TSLA Analysis</a>
          <a href="/analysis/JPM">JPM Analysis</a>
        </nav>
      </div>

      <div className="relative px-2 py-1 z-[100] text-white flex-shrink-0 flex items-center justify-between bg-black border-b border-gray-800" style={{ pointerEvents: 'auto' }}>
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold mb-0 leading-none">
              Heatmap<span className="text-green-500">.{HEATMAP_METRICS.find(m => m.id === metric)?.label ?? 'Day change %'}</span>
            </h1>
            <p className="text-[9px] text-gray-400 hidden sm:block">
              Interactive visualization
            </p>
          </div>

          {/* Heatmap Metric Buttons - moved here by user request */}
          <div className="ml-2">
            <HeatmapMetricButtons 
              metric={metric} 
              onMetricChange={setMetric}
              variant="dark"
            />
          </div>

          {/* Score methodology — ⓘ opens a floating panel; content stays in DOM for crawlers */}
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
          {/* Legenda je teraz overlay priamo v heatmap (MarketHeatmap) — vždy
              zodpovedá adaptívnej farebnej škále tileov */}
          
          {/* Exit fullscreen button - moved to top right */}
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
          refreshInterval={60000} // 60s — zladené s MAX_DATA_AGE_FOR_ETAG (60s) v /api/heatmap
          initialTimeframe={timeframe}
          controlledMetric={metric}
          onMetricChange={setMetric}
          hideMetricButtons={true}
        />
      </div>
    </div>
  );
}
