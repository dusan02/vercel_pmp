'use client';

// Client component containing all page logic
// This is imported by page.tsx (server component)
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';

// All component imports moved to dynamic imports - fixed pattern for named exports
const isDev = process.env.NODE_ENV === 'development';
const PerformanceOptimizer = isDev ? dynamic(
  () => import('@/components/PerformanceOptimizer').then((mod) => mod.PerformanceOptimizer),
  { ssr: false, loading: () => null }
) : ({ children }: { children: React.ReactNode }) => <>{children}</>;
const MobileTester = isDev ? dynamic(
  () => import('@/components/MobileTester').then((mod) => mod.MobileTester),
  { ssr: false, loading: () => null }
) : ({ children }: { children: React.ReactNode }) => <>{children}</>;
const PullToRefresh = dynamic(
  () => import('@/components/PullToRefresh').then((mod) => mod.PullToRefresh),
  { ssr: true, loading: () => null }
);
// Critical components - enable SSR for better initial load
const PageHeader = dynamic(
  () => import('@/components/PageHeader').then((mod) => mod.PageHeader),
  { ssr: true }
);
const SectionNavigation = dynamic(
  () => import('@/components/SectionNavigation').then((mod) => mod.SectionNavigation),
  { ssr: true, loading: () => null }
);

// --- NEW HOME COMPONENTS (Dynamically Imported) ---
const HomePortfolio = dynamic(
  () => import('@/components/home/HomePortfolio').then((mod) => mod.HomePortfolio),
  { ssr: true, loading: () => null }
);
const HomeFavorites = dynamic(
  () => import('@/components/home/HomeFavorites').then((mod) => mod.HomeFavorites),
  { ssr: true, loading: () => null }
);
const HomeEarnings = dynamic(
  () => import('@/components/home/HomeEarnings').then((mod) => mod.HomeEarnings),
  { ssr: true, loading: () => null }
);
const HomeBlog = dynamic(
  () => import('@/components/home/HomeBlog').then((mod) => mod.HomeBlog),
  { ssr: true, loading: () => null }
);
const HomePricing = dynamic(
  () => import('@/components/home/HomePricing').then((mod) => mod.HomePricing),
  { ssr: true, loading: () => null }
);
const HomeMovers = dynamic(
  () => import('@/components/home/HomeMovers').then((mod) => mod.HomeMovers),
  { ssr: true, loading: () => null }
);
// Screener — rendered as a client-side tab on the homepage (avoids full page
// transition to /screener route, which caused layout shift/flicker).
const StockScreener = dynamic(
  () => import('@/components/StockScreener'),
  { ssr: false, loading: () => null }
);
// OPTIMIZATION: Enable SSR for desktop (faster initial load), keep ssr: false for mobile
// Desktop heatmap can be server-rendered, mobile uses different components
const HomeHeatmap = dynamic(
  () => import('@/components/home/HomeHeatmap').then((mod) => mod.HomeHeatmap),
  {
    ssr: true, // Enable SSR for faster desktop loading
    loading: () => null // Custom loading handled inside if needed, or skeleton
  }
);
const HomeAnalysis = dynamic(
  () => import('@/components/home/HomeAnalysis').then((mod) => mod.HomeAnalysis),
  { ssr: true, loading: () => null }
);
const WhatMovedSidebar = dynamic(
  () => import('@/components/home/WhatMovedSidebar').then((mod) => mod.WhatMovedSidebar),
  { ssr: true, loading: () => null }
);
const WhatMovedToday = dynamic(
  () => import('@/components/home/WhatMovedToday').then((mod) => mod.WhatMovedToday),
  { ssr: true, loading: () => null }
);

const CookieConsent = dynamic(
  () => import('@/components/CookieConsent'),
  { ssr: false, loading: () => null }
);
const StructuredData = dynamic(
  () => import('@/components/StructuredData').then((mod) => mod.StructuredData),
  { ssr: true }
);
// Modern Mobile Components
const MobileApp = dynamic(
  () => import('@/components/mobile/MobileApp').then((mod) => mod.MobileApp),
  { ssr: false }
);
const MobileHeader = dynamic(
  () => import('@/components/mobile/MobileHeader').then((mod) => mod.MobileHeader),
  { ssr: false }
);
const MobileScreen = dynamic(
  () => import('@/components/mobile/MobileScreen').then((mod) => mod.MobileScreen),
  { ssr: false }
);
const BottomNavigation = dynamic(
  () => import('@/components/BottomNavigation').then((mod) => mod.BottomNavigation),
  { ssr: false }
);
const MobileSkeleton = dynamic(
  () => import('@/components/mobile/MobileSkeleton').then((mod) => mod.MobileSkeleton),
  { ssr: false }
);
// Hooks and utilities
import { usePWA } from '@/hooks/usePWA';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { StockData } from '@/lib/types';
import type { EarningsWeekDay } from '@/lib/seo/earningsSSR';
import { autoRepairLocalStorage } from '@/lib/utils/localStorageCache';
import { detectSession } from '@/lib/utils/timeUtils';
import { useMobilePrefetch } from '@/hooks/useMobilePrefetch';
import { useHomeNavigation } from '@/hooks/useHomeNavigation';
import { useHomeData } from '@/hooks/useHomeData';
import { KeepAliveTab } from '@/components/KeepAliveTab';

interface HomePageProps {
  initialData?: StockData[];
  initialMoversData?: any[];
  initialBlogSnapshots?: any[];
  initialHeatmapData?: any[];
  weeklyEarningsData?: Record<string, EarningsWeekDay>;
  earningsTodayStr?: string;
  earningsWeekStartStr?: string;
  eligibleTickers?: Set<string>;
}

export default function HomePage({ initialData = [], initialMoversData, initialBlogSnapshots, initialHeatmapData, weeklyEarningsData, earningsTodayStr = '', earningsWeekStartStr = '', eligibleTickers = new Set() }: HomePageProps) {
  useEffect(() => { autoRepairLocalStorage(); }, []);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // Re-render once a minute so the session badge (PRE/LIVE/AFTER/CLOSED)
  // flips at session boundaries even when no price ticks are arriving.
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMinuteTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { preferences, setConsent } = useUserPreferences();
  const { isOnline } = usePWA();

  const { activeSection, analysisTicker, setAnalysisTicker, handleMobileNavChange } =
    useHomeNavigation({ isMounted });

  const {
    toggleFavorite, isFavorite,
    stockData, loadingStates, error, loadData, liveConnected,
    portfolioHoldings, updateQuantity, removeStock, addStock,
    calculateTotalStockValue, calculateDailyChange, totalPortfolioValue, portfolioStocks,
    searchTerm, setSearchTerm,
    favoriteStocksSorted, favSortKey, favAscending, requestFavSort,
    allSortKey, allAscending, requestAllSort,
    selectedSectors, setSelectedSectors,
    selectedIndustries, setSelectedIndustries,
    uniqueSectors, availableIndustries,
    optimizedAllStocks, displayedStocks, hasMore, loadMore, isLoadingMore,
  } = useHomeData({ initialData, activeSection });

  // Prefetch inactive screens and prioritize heatmap on mobile
  useMobilePrefetch(activeSection);

  // Warm up lazy tab chunks on idle so tab switches don't trigger a
  // sequential chunk-download waterfall (each dynamic() is a separate fetch).
  useEffect(() => {
    const warmup = () => {
      void import('@/components/home/HomeMovers');
      void import('@/components/home/HomeAnalysis');
      void import('@/components/home/HomeEarnings');
      void import('@/components/home/HomePortfolio');
      void import('@/components/home/HomeFavorites');
      void import('@/components/home/HomeBlog');
      void import('@/components/home/HomePricing');
      void import('@/components/StockScreener');
      // Heatmap inner chunks (the heaviest waterfall: 4 nested dynamic levels)
      void import('@/components/HeatmapPreview');
      void import('@/components/ResponsiveMarketHeatmap');
      void import('@/components/MarketHeatmap');
      void import('@/components/MobileTreemapNew');
    };
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(warmup, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(warmup, 3000);
    return () => clearTimeout(t);
  }, []);

  // Warm the analysis endpoints when the user hovers a heatmap tile — by the
  // time they click, /api/stocks + /api/analysis/{t} + /history are already
  // in-flight or cached server-side, so the tab switch renders fast.
  // 150ms debounce skips fast mouse sweeps; per-symbol Set dedupes.
  const analysisPrefetchRef = useRef<{ timer?: ReturnType<typeof setTimeout>; done: Set<string> }>({ done: new Set() });
  const handleAnalysisPrefetch = useCallback((ticker: string | null) => {
    const ref = analysisPrefetchRef.current;
    clearTimeout(ref.timer);
    if (!ticker) return;
    const symbol = ticker.toUpperCase();
    if (ref.done.has(symbol)) return;
    ref.timer = setTimeout(() => {
      ref.done.add(symbol);
      const s = encodeURIComponent(symbol);
      void fetch(`/api/stocks?tickers=${s}`).catch(() => {});
      void fetch(`/api/analysis/${s}`).catch(() => {});
      void fetch(`/api/analysis/${s}/history`).catch(() => {});
    }, 150);
  }, []);


  return (
    <>
      {/* Modern Mobile Layout — only after mount + only on mobile */}
      {(isMounted && !isDesktop) && (
        <MobileApp>
          {/* MobileHeader - viditeľný vo všetkých sekciách okrem heatmap (heatmap má svoj vlastný header) */}
          {activeSection !== 'heatmap' && (
            <MobileHeader
              onLogoClick={() => handleMobileNavChange('heatmap')}
            />
          )}
          <PullToRefresh
            onRefresh={loadData}
            disabled={activeSection === 'heatmap'} // Disable PTR on heatmap to allow scrolling up
            className="flex-1 w-full relative overflow-hidden"
          >
            <div className={`mobile-app-content ${activeSection === 'heatmap' ? 'is-heatmap' : ''}`}>
              <MobileScreen
                active={activeSection === 'heatmap'}
                className="screen-heatmap"
                prefetch={activeSection === 'heatmap'}
                screenName="Heatmap"
                skeleton={<MobileSkeleton type="heatmap" />}
              >
                {(preferences.showHeatmapSection ?? true) && (
                  <HomeHeatmap
                    wrapperClass="mobile-heatmap-wrapper"
                    activeView={activeSection === 'heatmap' ? 'heatmap' : 'inactive'}
                    onTileClick={(ticker) => handleMobileNavChange('analysis', ticker)}
                    stockData={stockData}
                    onSelectTicker={(ticker) => handleMobileNavChange('analysis', ticker)}
                    initialHeatmapData={initialHeatmapData}
                  />
                )}
              </MobileScreen>
              <MobileScreen
                active={activeSection === 'analysis'}
                className="screen-analysis"
                prefetch={false}
                screenName="Analysis"
                skeleton={<MobileSkeleton type="list" count={1} />}
              >
                <HomeAnalysis
                  activeTicker={analysisTicker}
                  onTickerChange={setAnalysisTicker}
                />
              </MobileScreen>
              <MobileScreen
                active={activeSection === 'movers'}
                className="screen-movers"
                prefetch={false}
                screenName="Movers"
                skeleton={<MobileSkeleton type="list" count={1} />}
              >
                {(preferences.showMoversSection ?? true) && (
                  <HomeMovers onTileClick={(ticker) => handleMobileNavChange('analysis', ticker)} initialData={initialMoversData} />
                )}
              </MobileScreen>
              <MobileScreen
                active={activeSection === 'portfolio'}
                className="screen-portfolio"
                prefetch={activeSection === 'heatmap'} // Prefetch keď je heatmap aktívny (najpravdepodobnejší ďalší tab)
                screenName="Portfolio"
                skeleton={<MobileSkeleton type="cards" count={2} />}
              >
                {(preferences.showPortfolioSection ?? true) && (
                  <HomePortfolio
                    portfolioStocks={portfolioStocks}
                    portfolioHoldings={portfolioHoldings}
                    allStocks={stockData}
                    loading={loadingStates.top50Stocks}
                    onUpdateQuantity={updateQuantity}
                    onRemoveStock={removeStock}
                    onAddStock={addStock}
                    calculatePortfolioValue={calculateDailyChange}
                    calculateTotalValue={calculateTotalStockValue}
                    totalPortfolioValue={totalPortfolioValue}
                  />
                )}
              </MobileScreen>
              <MobileScreen
                active={activeSection === 'favorites'}
                className="screen-favorites"
                prefetch={false}
                screenName="Favorites"
                skeleton={<MobileSkeleton type="cards" count={2} />}
              >
                {(preferences.showFavoritesSection ?? true) && (
                  <HomeFavorites
                    favoriteStocks={favoriteStocksSorted}
                    loading={loadingStates.favorites}
                    sortKey={favSortKey}
                    ascending={favAscending}
                    onSort={requestFavSort}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={isFavorite}
                    allStocks={stockData}
                  />
                )}
              </MobileScreen>
              <MobileScreen
                active={activeSection === 'earnings'}
                className="screen-earnings"
                prefetch={false}
                screenName="Earnings"
                skeleton={<MobileSkeleton type="earnings" count={1} />}
              >
                {(preferences.showEarningsSection ?? true) && (
                  <HomeEarnings weeklyEarningsData={weeklyEarningsData} todayStr={earningsTodayStr} weekStartStr={earningsWeekStartStr} eligibleTickers={eligibleTickers} />
                )}
              </MobileScreen>
              <MobileScreen
                active={activeSection === 'screener'}
                className="screen-screener"
                prefetch={false}
                screenName="Screener"
                skeleton={<MobileSkeleton type="list" count={1} />}
              >
                <StockScreener />
              </MobileScreen>
              <MobileScreen
                active={activeSection === 'pricing'}
                className="screen-pricing"
                prefetch={false}
                screenName="Pricing"
                skeleton={<MobileSkeleton type="list" count={1} />}
              >
                <HomePricing />
              </MobileScreen>
            </div>
          </PullToRefresh>
          {/* Floating Search Button Removed */}
          <BottomNavigation
            activeSection={activeSection}
            onSectionChange={handleMobileNavChange}
          />
        </MobileApp>
      )}

      {/* Desktop Layout — render on SSR (default) + after mount on desktop */}
      {(!isMounted || isDesktop) && (
        <div className="homepage-container" data-debug="desktop-layout">
          <div className="pwa-status-bar"></div>

          {!isOnline && (
            <div className="offline-indicator">
              <span>📡</span>
              <span>You're offline - using cached data</span>
            </div>
          )}

          <Suspense fallback={<div className="flex justify-center items-center h-screen bg-black text-white">Loading...</div>}>
            <PerformanceOptimizer
              enableMonitoring={isDev}
              enableLazyLoading={true}
              enableImageOptimization={true}
            >
              <MobileTester
                enableTesting={isDev && process.env.NEXT_PUBLIC_ENABLE_MOBILE_TESTING === 'true'}
                showDeviceFrame={true}
              >
                <PullToRefresh onRefresh={loadData}>
                  <StructuredData stocks={stockData} pageType="home" />

                  <div className="header-wrapper">
                    <div className="container mx-auto px-4">
                      {/* --- DESKTOP LAYOUT (Tab Based) --- */}
                      <div className="desktop-layout-wrapper">
                        <PageHeader
                          onLogoClick={() => handleMobileNavChange('heatmap')}
                          navigation={
                            <div className="hidden lg:block">
                              <SectionNavigation
                                onTabChange={(tab: string) => handleMobileNavChange(tab as any)}
                              />
                            </div>
                          }
                        />
                        {liveConnected && (() => {
                          const session = detectSession();
                          const badge = {
                            pre:    { label: 'PRE-MARKET',  cls: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',   dot: 'bg-amber-500',  ping: 'bg-amber-400' },
                            live:   { label: 'LIVE',        cls: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800/50', dot: 'bg-green-500',  ping: 'bg-green-400' },
                            after:  { label: 'AFTER-HOURS', cls: 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/50', dot: 'bg-violet-500', ping: 'bg-violet-400' },
                            closed: { label: 'CLOSED',      cls: 'bg-gray-100 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-700',         dot: 'bg-gray-400',   ping: '' },
                          }[session];
                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badge.cls}`}
                              title={`Real-time prices via WebSocket — market session: ${session}`}
                            >
                              <span className="relative flex h-1.5 w-1.5">
                                {badge.ping && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${badge.ping}`} />}
                                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${badge.dot}`} />
                              </span>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                  </div>

                  <main className={`${activeSection === 'screener' ? 'container-wide' : 'container'} min-h-[calc(100dvh-130px)]`} role="main">
                    <div className="flex-1 min-w-0">
                      {error && (
                        <div className="error" role="alert">
                          <strong>Error:</strong> {error}
                        </div>
                      )}

                      {/* --- DESKTOP LAYOUT (Tab Based) --- */}
                      {/* KeepAliveTab: mount on first activation, then stay mounted
                          (display:none) — switching tabs no longer remounts the
                          whole subtree (heatmap ~600 tiles) or refetches data. */}
                      <div className="desktop-layout-wrapper">
                        <KeepAliveTab active={activeSection === 'heatmap'} className="tab-content relative fade-in">
                          <HomeHeatmap
                            wrapperClass="desktop-heatmap-wrapper"
                            activeView={activeSection === 'heatmap' ? 'heatmap' : 'inactive'}
                            onTileClick={(ticker) => handleMobileNavChange('analysis', ticker)}
                            onTileHover={handleAnalysisPrefetch}
                            stockData={stockData}
                            onSelectTicker={(ticker) => handleMobileNavChange('analysis', ticker)}
                            initialHeatmapData={initialHeatmapData}
                          />
                          <WhatMovedToday movers={initialMoversData} eligibleTickers={eligibleTickers} />
                        </KeepAliveTab>

                        <KeepAliveTab active={activeSection === 'analysis'} className="tab-content fade-in">
                          <HomeAnalysis
                            activeTicker={analysisTicker}
                            onTickerChange={setAnalysisTicker}
                          />
                        </KeepAliveTab>

                        <KeepAliveTab active={activeSection === 'movers'} className="tab-content fade-in">
                          <HomeMovers onTileClick={(ticker) => handleMobileNavChange('analysis', ticker)} initialData={initialMoversData} />
                        </KeepAliveTab>

                        <KeepAliveTab active={activeSection === 'portfolio'} className="tab-content fade-in">
                          <HomePortfolio
                            portfolioStocks={portfolioStocks}
                            portfolioHoldings={portfolioHoldings}
                            allStocks={stockData}
                            loading={loadingStates.top50Stocks}
                            onUpdateQuantity={updateQuantity}
                            onRemoveStock={removeStock}
                            onAddStock={addStock}
                            calculatePortfolioValue={calculateDailyChange}
                            calculateTotalValue={calculateTotalStockValue}
                            totalPortfolioValue={totalPortfolioValue}
                          />
                        </KeepAliveTab>

                        <KeepAliveTab active={activeSection === 'favorites'} className="tab-content fade-in">
                          <HomeFavorites
                            favoriteStocks={favoriteStocksSorted}
                            loading={loadingStates.favorites}
                            sortKey={favSortKey}
                            ascending={favAscending}
                            onSort={requestFavSort}
                            onToggleFavorite={toggleFavorite}
                            isFavorite={isFavorite}
                            allStocks={stockData}
                          />
                        </KeepAliveTab>

                        <KeepAliveTab active={activeSection === 'earnings'} className="tab-content fade-in">
                          <HomeEarnings weeklyEarningsData={weeklyEarningsData} todayStr={earningsTodayStr} weekStartStr={earningsWeekStartStr} eligibleTickers={eligibleTickers} />
                        </KeepAliveTab>

                        <KeepAliveTab active={activeSection === 'screener'} className="tab-content fade-in">
                          <StockScreener />
                        </KeepAliveTab>

                        <KeepAliveTab active={activeSection === 'blog'} className="tab-content fade-in">
                          <HomeBlog initialSnapshots={initialBlogSnapshots} />
                        </KeepAliveTab>

                        <KeepAliveTab active={activeSection === 'pricing'} className="tab-content fade-in">
                          <HomePricing />
                        </KeepAliveTab>
                      </div>

                    </div>

                  </main>
                </PullToRefresh>
              </MobileTester>
            </PerformanceOptimizer>
          </Suspense>

        </div >
      )
      }
      {/* Cookie consent must exist on mobile too; favorites depend on consent for local persistence */}
      <CookieConsent onAccept={() => setConsent(true)} />
    </>
  );
}
