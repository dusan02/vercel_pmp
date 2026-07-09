'use client';

// Client component containing all page logic
// This is imported by page.tsx (server component)
import React, { useState, useEffect, Suspense } from 'react';
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
  { ssr: false, loading: () => null }
);
// Critical components - enable SSR for better initial load
const PageHeader = dynamic(
  () => import('@/components/PageHeader').then((mod) => mod.PageHeader),
  { ssr: true }
);
const SectionNavigation = dynamic(
  () => import('@/components/SectionNavigation').then((mod) => mod.SectionNavigation),
  { ssr: false, loading: () => null }
);

// --- NEW HOME COMPONENTS (Dynamically Imported) ---
const HomePortfolio = dynamic(
  () => import('@/components/home/HomePortfolio').then((mod) => mod.HomePortfolio),
  { ssr: false, loading: () => null }
);
const HomeFavorites = dynamic(
  () => import('@/components/home/HomeFavorites').then((mod) => mod.HomeFavorites),
  { ssr: false, loading: () => null }
);
const HomeAllStocks = dynamic(
  () => import('@/components/home/HomeAllStocks').then((mod) => mod.HomeAllStocks),
  { ssr: false, loading: () => null }
);
const HomeEarnings = dynamic(
  () => import('@/components/home/HomeEarnings').then((mod) => mod.HomeEarnings),
  { ssr: false, loading: () => null }
);
const HomeBlog = dynamic(
  () => import('@/components/home/HomeBlog').then((mod) => mod.HomeBlog),
  { ssr: false, loading: () => null }
);
const HomeMovers = dynamic(
  () => import('@/components/home/HomeMovers').then((mod) => mod.HomeMovers),
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
  { ssr: false, loading: () => null }
);
const GlobalScreener = dynamic(
  () => import('@/components/analysis/GlobalScreener').then((mod) => {
    // If it's a named export, we use mod.GlobalScreener
    return mod.GlobalScreener;
  }),
  { ssr: false, loading: () => null }
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
import { autoRepairLocalStorage } from '@/lib/utils/localStorageCache';
import { useMobilePrefetch } from '@/hooks/useMobilePrefetch';
import { useHomeNavigation } from '@/hooks/useHomeNavigation';
import { useHomeData } from '@/hooks/useHomeData';

interface HomePageProps {
  initialData?: StockData[];
  initialEarningsData?: any;
}

export default function HomePage({ initialData = [], initialEarningsData }: HomePageProps) {
  useEffect(() => { autoRepairLocalStorage(); }, []);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { preferences, setConsent } = useUserPreferences();
  const { isOnline } = usePWA();

  const { activeSection, analysisTicker, setAnalysisTicker, handleMobileNavChange } =
    useHomeNavigation({ isMounted });

  const {
    toggleFavorite, isFavorite,
    stockData, loadingStates, error, loadData,
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


  return (
    <>
      {/* Modern Mobile Layout */}
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
                    activeView={activeSection === 'heatmap' ? 'heatmap' : undefined}
                    onTileClick={(ticker) => handleMobileNavChange('analysis', ticker)}
                    stockData={stockData}
                    onSelectTicker={(ticker) => handleMobileNavChange('analysis', ticker)}
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
                  <HomeMovers onTileClick={(ticker) => handleMobileNavChange('analysis', ticker)} />
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
                  <HomeEarnings initialData={initialEarningsData} />
                )}
              </MobileScreen>
              <MobileScreen
                active={activeSection === 'allStocks'}
                className="screen-all-stocks"
                prefetch={false}
                screenName="All Stocks"
                skeleton={<MobileSkeleton type="list" count={2} />}
              >
                {(preferences.showAllStocksSection ?? true) && (
                  <HomeAllStocks
                    displayedStocks={displayedStocks}
                    loading={loadingStates.top50Stocks}
                    sortKey={allSortKey}
                    ascending={allAscending}
                    onSort={requestAllSort}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={isFavorite}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    hasMore={hasMore}
                    onLoadMore={loadMore}
                    isLoadingMore={isLoadingMore}
                    totalCount={optimizedAllStocks.length}
                    selectedSectors={selectedSectors}
                    selectedIndustries={selectedIndustries}
                    onSectorsChange={setSelectedSectors}
                    onIndustriesChange={setSelectedIndustries}
                    uniqueSectors={uniqueSectors}
                    availableIndustries={availableIndustries}
                  />
                )}
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

      {/* Desktop Layout - Traditional scroll-based */}
      {(isMounted && isDesktop) && (
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
                      </div>
                    </div>

                  </div>

                  <main className="container min-h-[calc(100dvh-130px)]" role="main">
                    <div className="flex-1 min-w-0">
                      {error && (
                        <div className="error" role="alert">
                          <strong>Error:</strong> {error}
                        </div>
                      )}

                      {/* --- DESKTOP LAYOUT (Tab Based) --- */}
                      <div className="desktop-layout-wrapper">
                        {activeSection === 'heatmap' && (
                          <div className="tab-content relative fade-in">
                            <HomeHeatmap
                              wrapperClass="desktop-heatmap-wrapper"
                              onTileClick={(ticker) => handleMobileNavChange('analysis', ticker)}
                              stockData={stockData}
                              onSelectTicker={(ticker) => handleMobileNavChange('analysis', ticker)}
                            />
                          </div>
                        )}

                        {activeSection === 'analysis' && (
                          <div className="tab-content fade-in">
                            <HomeAnalysis
                              activeTicker={analysisTicker}
                              onTickerChange={setAnalysisTicker}
                            />
                          </div>
                        )}

                        {activeSection === 'movers' && (
                          <div className="tab-content fade-in">
                            <HomeMovers onTileClick={(ticker) => handleMobileNavChange('analysis', ticker)} />
                          </div>
                        )}

                        {activeSection === 'portfolio' && (
                          <div className="tab-content fade-in">
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
                          </div>
                        )}

                        {activeSection === 'favorites' && (
                          <div className="tab-content fade-in">
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
                          </div>
                        )}

                        {activeSection === 'earnings' && (
                          <div className="tab-content fade-in">
                            <HomeEarnings initialData={initialEarningsData} />
                          </div>
                        )}

                        {activeSection === 'allStocks' && (
                          <div className="tab-content fade-in">
                            <HomeAllStocks
                              displayedStocks={displayedStocks}
                              loading={loadingStates.top50Stocks}
                              sortKey={allSortKey}
                              ascending={allAscending}
                              onSort={requestAllSort}
                              onToggleFavorite={toggleFavorite}
                              isFavorite={isFavorite}
                              searchTerm={searchTerm}
                              onSearchChange={setSearchTerm}
                              hasMore={hasMore}
                              onLoadMore={loadMore}
                              isLoadingMore={isLoadingMore}
                              totalCount={optimizedAllStocks.length}
                              selectedSectors={selectedSectors}
                              selectedIndustries={selectedIndustries}
                              onSectorsChange={setSelectedSectors}
                              onIndustriesChange={setSelectedIndustries}
                              uniqueSectors={uniqueSectors}
                              availableIndustries={availableIndustries}
                            />
                          </div>
                        )}

                        {activeSection === 'screener' && (
                          <div className="tab-content fade-in container mx-auto py-8">
                            <GlobalScreener />
                          </div>
                        )}

                        {activeSection === 'blog' && (
                          <div className="tab-content fade-in">
                            <HomeBlog />
                          </div>
                        )}
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
