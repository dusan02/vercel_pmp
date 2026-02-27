'use client';

// Client component containing all page logic
// This is imported by page.tsx (server component)
import React, { useState, useEffect, Suspense, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';

// All component imports moved to dynamic imports - fixed pattern for named exports
const PerformanceOptimizer = dynamic(
  () => import('@/components/PerformanceOptimizer').then((mod) => mod.PerformanceOptimizer),
  { ssr: false, loading: () => null }
);
const MobileTester = dynamic(
  () => import('@/components/MobileTester').then((mod) => mod.MobileTester),
  { ssr: false, loading: () => null }
);
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

const CookieConsent = dynamic(
  () => import('@/components/CookieConsent'),
  { ssr: false, loading: () => null }
);
const StructuredData = dynamic(
  () => import('@/components/StructuredData').then((mod) => mod.StructuredData),
  { ssr: true }
);
const SEOContent = dynamic(
  () => import('@/components/SEOContent').then((mod) => mod.SEOContent),
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
const FloatingSearchButton = dynamic(
  () => import('@/components/mobile/FloatingSearchButton').then((mod) => mod.FloatingSearchButton),
  { ssr: false }
);

// Hooks and utilities
import { useFavorites } from '@/hooks/useFavorites';
import { usePortfolio } from '@/hooks/usePortfolio';
import { usePWA } from '@/hooks/usePWA';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useLazyLoading } from '@/hooks/useLazyLoading';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { StockData } from '@/lib/types';
import { useStockData } from '@/hooks/useStockData';
import { useStockFilter } from '@/hooks/useStockFilter';
// import { useLogoLoader } from '@/hooks/useLogoLoader';
import { useTablePerformance } from '@/hooks/useTablePerformance';
import { autoRepairLocalStorage } from '@/lib/utils/clearCache';
import { logger } from '@/lib/utils/logger';
import { useMobilePrefetch } from '@/hooks/useMobilePrefetch';
import { useMobileOptimization } from '@/hooks/useMobileOptimization';

interface HomePageProps {
  initialData?: StockData[];
  initialEarningsData?: any;
}

export default function HomePage({ initialData = [], initialEarningsData }: HomePageProps) {
  // Auto-repair localStorage on mount (fixes corrupted cache issues)
  useEffect(() => {
    autoRepairLocalStorage();
  }, []);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Debug: Log desktop detection
  useEffect(() => {
    if (isMounted) {
      console.log('[HomePage] isMounted:', isMounted, 'isDesktop:', isDesktop, 'window width:', typeof window !== 'undefined' ? window.innerWidth : 'N/A');
    }
  }, [isMounted, isDesktop]);

  // Use user preferences hook for persistence
  const { preferences, savePreferences, setConsent } = useUserPreferences();

  // Scroll to section function
  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Navigation state (unified for mobile and desktop)
  const [activeSection, setActiveSection] = useState<'heatmap' | 'movers' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks'>('heatmap');

  // Helper function to validate and set tab
  const setActiveTab = useCallback((tab: string) => {
    if (tab === 'heatmap' || tab === 'movers' || tab === 'portfolio' || tab === 'favorites' || tab === 'earnings' || tab === 'allStocks') {
      setActiveSection(tab as 'heatmap' | 'movers' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks');
      return true;
    }
    return false;
  }, []);

  // Allow deep-linking to a specific mobile tab (e.g. "/?tab=allStocks")
  useEffect(() => {
    if (!isMounted) return;
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      console.log('🔍 Deep-link tab detection:', { tab, currentActiveSection: activeSection });
      if (tab) {
        const success = setActiveTab(tab);
        console.log('🔍 setActiveTab result:', { tab, success, newActiveSection: activeSection });
      }
    } catch {
      // ignore
    }
  }, [isMounted, setActiveTab]);

  // Listen for browser back/forward navigation
  useEffect(() => {
    if (!isMounted) return;
    const handlePopState = () => {
      try {
        const tab = new URLSearchParams(window.location.search).get('tab');
        if (tab) {
          setActiveTab(tab);
        } else {
          // If no tab in URL, default to heatmap
          setActiveTab('heatmap');
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isMounted, setActiveTab]);

  // Listen for custom navigation events (e.g., from FavoritesSection)
  useEffect(() => {
    if (!isMounted) return;
    const handleNavChange = (e: CustomEvent<string>) => {
      const tab = e.detail;
      if (setActiveTab(tab)) {
        // Update URL without page reload
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.pushState({}, '', url.toString());
      }
    };
    window.addEventListener('mobile-nav-change', handleNavChange as EventListener);
    return () => window.removeEventListener('mobile-nav-change', handleNavChange as EventListener);
  }, [isMounted, setActiveTab]);

  // Handle mobile bottom navigation change - VIEW-BASED (tabs, not scroll)
  const handleMobileNavChange = useCallback((tab: 'heatmap' | 'movers' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks') => {
    setActiveSection(tab);
    // Update URL to keep it in sync
    const url = new URL(window.location.href);
    const navUrl = new URL(window.location.href);
    navUrl.searchParams.set('tab', tab);
    window.history.pushState({}, '', navUrl.toString());
  }, []);

  // Prefetch neaktívne screens a API endpoints pre rýchlejšie prepínanie
  useMobilePrefetch(activeSection);

  // CRITICAL: Mobile optimization - prioritizuje heatmap (prvá obrazovka)
  useMobileOptimization(activeSection);

  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { isOnline } = usePWA();

  // Custom hooks for data and filtering - REFACTORED
  const {
    stockData,
    loadingStates,
    error,
    fetchRemainingStocksData,
    fetchSpecificTickers,
    loadData
  } = useStockData({
    initialData,
    favorites
  });

  // Auto-load all stocks when user navigates to All Stocks section
  const allStocksLoadedRef = useRef(false);
  useEffect(() => {
    if (activeSection === 'allStocks' && !allStocksLoadedRef.current && !loadingStates.remainingStocks) {
      console.log('🔄 User navigated to All Stocks - loading all remaining stocks...');
      fetchRemainingStocksData();
      allStocksLoadedRef.current = true;
    }
  }, [activeSection, fetchRemainingStocksData, loadingStates.remainingStocks]);

  // Hooks for core functionality - Refactored to use updated hook logic
  const {
    portfolioHoldings,
    updateQuantity,
    removeStock,
    addStock,
    calculateStockValue, // DEPRECATED: daily change
    calculateTotalStockValue, // Total value
    calculateDailyChange, // Daily change
    totalPortfolioValue,
    portfolioStocks
  } = usePortfolio({ stockData });

  // Load portfolio tickers that are not in stockData - optimized with debounce
  useEffect(() => {
    const portfolioTickers = Object.keys(portfolioHoldings);
    const missingTickers = portfolioTickers.filter(ticker => !stockData.some(s => s.ticker === ticker));

    if (missingTickers.length > 0) {
      const timeoutId = setTimeout(() => {
        fetchSpecificTickers(missingTickers);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [portfolioHoldings, stockData, fetchSpecificTickers]);

  const {
    searchTerm, setSearchTerm,
    favoritesOnly, setFavoritesOnly,
    filteredStocks,
    favoriteStocksSorted,
    allStocksSorted,
    favSortKey, favAscending, requestFavSort,
    allSortKey, allAscending, requestAllSort,
    selectedSector, setSelectedSector,
    selectedIndustry, setSelectedIndustry,
    uniqueSectors, availableIndustries
  } = useStockFilter({
    stockData,
    favorites,
    isFavorite
  });


  // Optimized table performance hook for All Stocks section
  const { filteredStocks: optimizedAllStocks } = useTablePerformance({
    stocks: allStocksSorted,
    sortKey: allSortKey,
    ascending: allAscending,
    searchTerm: '' // Search is already applied in useStockFilter
  });

  // Trigger fetchRemainingStocksData early to ensure all data is loaded
  useEffect(() => {
    const timer = setTimeout(() => {
      if (allStocksSorted.length < 200) {
        logger.data('Auto-triggering remaining stocks load (low count detected)');
        fetchRemainingStocksData();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [allStocksSorted.length, fetchRemainingStocksData]);

  // Lazy loading hook - optimized for smooth scrolling
  const {
    displayLimit,
    hasMore,
    reset: resetLazyLoading,
    loadMore,
    isLoading: isLoadingMore,
  } = useLazyLoading({
    initialLimit: 50,
    incrementSize: 50,
    totalItems: optimizedAllStocks.length,
    threshold: 500,
    onLoadRemaining: fetchRemainingStocksData,
    enableProgressiveLoading: true
  });

  const displayedStocks = optimizedAllStocks.slice(0, Math.min(displayLimit, optimizedAllStocks.length));

  // Debug: Log when stocks are loaded (only in development)
  useEffect(() => {
    if (optimizedAllStocks.length > 0) {
      logger.data(`Stocks available: ${optimizedAllStocks.length}, Displayed: ${displayedStocks.length}, Limit: ${displayLimit}`);
    }
  }, [optimizedAllStocks.length, displayedStocks.length, displayLimit]);

  // Optimized logo loading hook - REMOVED: Redundant and causes preload warnings
  // const displayedTickers = useMemo(() => displayedStocks.map(s => s.ticker), [displayedStocks]);
  // useLogoLoader({
  //   tickers: displayedTickers,
  //   priorityCount: 100,
  //   size: 32
  // });


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
                  />
                )}
              </MobileScreen>
              <MobileScreen
                active={activeSection === 'movers'}
                className="screen-movers"
                prefetch={activeSection === 'heatmap'}
                screenName="Movers"
                skeleton={<MobileSkeleton type="list" count={1} />}
              >
                {(preferences.showMoversSection ?? true) && (
                  <HomeMovers />
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
                prefetch={activeSection === 'heatmap'} // Prefetch keď je heatmap aktívny
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
                    selectedSector={selectedSector}
                    selectedIndustry={selectedIndustry}
                    onSectorChange={setSelectedSector}
                    onIndustryChange={setSelectedIndustry}
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
              enableMonitoring={process.env.NODE_ENV === 'development'}
              enableLazyLoading={true}
              enableImageOptimization={true}
            >
              <MobileTester
                enableTesting={process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_MOBILE_TESTING === 'true'}
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
                                activeTab={activeSection}
                                onTabChange={(tab: string) => handleMobileNavChange(tab as any)}
                              />
                            </div>
                          }
                        />
                      </div>
                    </div>

                  </div>

                  <main className="container" role="main">
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
                            <HomeHeatmap wrapperClass="desktop-heatmap-wrapper" />
                          </div>
                        )}

                        {activeSection === 'movers' && (
                          <div className="tab-content fade-in">
                            <HomeMovers />
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
                              selectedSector={selectedSector}
                              selectedIndustry={selectedIndustry}
                              onSectorChange={setSelectedSector}
                              onIndustryChange={setSelectedIndustry}
                              uniqueSectors={uniqueSectors}
                              availableIndustries={availableIndustries}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <footer className="footer hidden lg:block" aria-label="Site footer">
                      <p className="disclaimer">
                        Data is for informational purposes only. We are not responsible for its accuracy.
                      </p>
                      <p>
                        Need help? Contact us:
                        <a href="mailto:support@premarketprice.com" className="support-email">
                          support@premarketprice.com
                        </a>
                      </p>
                    </footer>
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
