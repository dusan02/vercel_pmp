'use client';

// Client component containing all page logic
// This is imported by page.tsx (server component)
import React, { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
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
const MobileTabBar = dynamic(
  () => import('@/components/mobile/MobileTabBar').then((mod) => mod.MobileTabBar),
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
import { useLogoLoader } from '@/hooks/useLogoLoader';
import { useTablePerformance } from '@/hooks/useTablePerformance';
import { autoRepairLocalStorage } from '@/lib/utils/clearCache';
import { logger } from '@/lib/utils/logger';
import { useMobilePrefetch } from '@/hooks/useMobilePrefetch';
import { useMobileOptimization } from '@/hooks/useMobileOptimization';

interface HomePageProps {
  initialData?: StockData[];
}

export default function HomePage({ initialData = [] }: HomePageProps) {
  // Auto-repair localStorage on mount (fixes corrupted cache issues)
  useEffect(() => {
    autoRepairLocalStorage();
  }, []);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Use user preferences hook for persistence
  const { preferences, savePreferences, setConsent } = useUserPreferences();

  // Scroll to section function
  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 80; // Offset for sticky header/navigation
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  }, []);

  // Mobile bottom navigation state
  const [activeMobileSection, setActiveMobileSection] = useState<'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks'>('heatmap');

  // Allow deep-linking to a specific mobile tab (e.g. "/?tab=allStocks")
  useEffect(() => {
    if (!isMounted) return;
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab === 'heatmap' || tab === 'portfolio' || tab === 'favorites' || tab === 'earnings' || tab === 'allStocks') {
        setActiveMobileSection(tab);
      }
    } catch {
      // ignore
    }
  }, [isMounted]);

  // Handle mobile bottom navigation change - VIEW-BASED (tabs, not scroll)
  const handleMobileNavChange = useCallback((tab: 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks') => {
    setActiveMobileSection(tab);
  }, []);

  // Prefetch neaktívne screens a API endpoints pre rýchlejšie prepínanie
  useMobilePrefetch(activeMobileSection);
  
  // CRITICAL: Mobile optimization - prioritizuje heatmap (prvá obrazovka)
  useMobileOptimization(activeMobileSection);

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

  // Hooks for core functionality - Refactored to use updated hook logic
  const {
    portfolioHoldings,
    updateQuantity,
    removeStock,
    addStock,
    calculateStockValue,
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

  // Optimized logo loading hook
  const displayedTickers = useMemo(() => displayedStocks.map(s => s.ticker), [displayedStocks]);
  useLogoLoader({
    tickers: displayedTickers,
    priorityCount: 100,
    size: 32
  });


  return (
    <>
      {/* Modern Mobile Layout */}
      {(isMounted && !isDesktop) && (
        <MobileApp>
          <MobileHeader />
          <div className="mobile-app-content">
            <MobileScreen 
              active={activeMobileSection === 'heatmap'} 
              className="screen-heatmap"
              prefetch={activeMobileSection === 'heatmap'}
              skeleton={
                <div className="h-full w-full bg-black p-2">
                  <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: 'minmax(72px, auto)' }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="bg-gray-800 rounded animate-pulse"
                        style={{
                          gridColumn: i < 2 ? 'span 2' : 'span 1',
                          gridRow: i < 2 ? 'span 2' : 'span 1',
                          animationDelay: `${i * 50}ms`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              }
            >
              {(preferences.showHeatmapSection ?? true) && (
                <HomeHeatmap wrapperClass="mobile-heatmap-wrapper" />
              )}
            </MobileScreen>
            <MobileScreen 
              active={activeMobileSection === 'portfolio'} 
              className="screen-portfolio"
              prefetch={activeMobileSection === 'heatmap'} // Prefetch keď je heatmap aktívny (najpravdepodobnejší ďalší tab)
              skeleton={<div className="p-4 space-y-3"><div className="h-20 bg-gray-200 rounded animate-pulse" /><div className="h-20 bg-gray-200 rounded animate-pulse" /></div>}
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
                  calculatePortfolioValue={calculateStockValue}
                  totalPortfolioValue={totalPortfolioValue}
                />
              )}
            </MobileScreen>
            <MobileScreen 
              active={activeMobileSection === 'favorites'} 
              className="screen-favorites"
              prefetch={activeMobileSection === 'heatmap'} // Prefetch keď je heatmap aktívny
              skeleton={<div className="p-4 space-y-3"><div className="h-20 bg-gray-200 rounded animate-pulse" /><div className="h-20 bg-gray-200 rounded animate-pulse" /></div>}
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
              active={activeMobileSection === 'earnings'} 
              className="screen-earnings"
              prefetch={false}
              skeleton={<div className="p-4 space-y-3"><div className="h-20 bg-gray-200 rounded animate-pulse" /></div>}
            >
              {(preferences.showEarningsSection ?? true) && (
                <HomeEarnings />
              )}
            </MobileScreen>
            <MobileScreen 
              active={activeMobileSection === 'allStocks'} 
              className="screen-all-stocks"
              prefetch={false}
              skeleton={<div className="p-4 space-y-3"><div className="h-20 bg-gray-200 rounded animate-pulse" /><div className="h-20 bg-gray-200 rounded animate-pulse" /></div>}
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
          <MobileTabBar
            activeTab={activeMobileSection}
            onTabChange={handleMobileNavChange}
          />
        </MobileApp>
      )}

      {/* Desktop Layout - Traditional scroll-based */}
      {(isMounted && isDesktop) && (
      <div className="homepage-container">
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
                    <PageHeader
                      navigation={
                        <div className="hidden lg:block">
                          <SectionNavigation
                            preferences={preferences}
                            onToggleSection={(key) => savePreferences({ [key]: !(preferences[key] ?? true) })}
                            onScrollToSection={scrollToSection}
                          />
                        </div>
                      }
                    />
                  </div>
                </div>

                <main className="container" role="main">
                  <div className="flex-1 min-w-0">
                    {error && (
                      <div className="error" role="alert">
                        <strong>Error:</strong> {error}
                      </div>
                    )}

                    {/* --- DESKTOP LAYOUT (Scroll Based) --- */}
                      <div className="desktop-layout-wrapper">
                        {(preferences.showHeatmapSection ?? true) && (
                          <div id="section-heatmap" className="scroll-mt-20">
                            <HomeHeatmap wrapperClass="desktop-heatmap-wrapper" />
                          </div>
                        )}

                        {(preferences.showPortfolioSection ?? true) && (
                          <div id="section-portfolio" className="scroll-mt-20">
                            <HomePortfolio
                              portfolioStocks={portfolioStocks}
                              portfolioHoldings={portfolioHoldings}
                              allStocks={stockData}
                              loading={loadingStates.top50Stocks}
                              onUpdateQuantity={updateQuantity}
                              onRemoveStock={removeStock}
                              onAddStock={addStock}
                              calculatePortfolioValue={calculateStockValue}
                              totalPortfolioValue={totalPortfolioValue}
                            />
                          </div>
                        )}

                        {(preferences.showFavoritesSection ?? true) && (
                          <div id="section-favorites" className="scroll-mt-20">
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

                        {(preferences.showEarningsSection ?? true) && (
                          <div id="section-earnings" className="scroll-mt-20">
                            <HomeEarnings />
                          </div>
                        )}

                        {(preferences.showAllStocksSection ?? true) && (
                          <div id="section-all-stocks" className="scroll-mt-20">
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

      </div>
      )}
      {/* Cookie consent must exist on mobile too; favorites depend on consent for local persistence */}
      <CookieConsent onAccept={() => setConsent(true)} />
    </>
  );
}
