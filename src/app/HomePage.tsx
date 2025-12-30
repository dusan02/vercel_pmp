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
const PortfolioSection = dynamic(
  () => import('@/components/PortfolioSection').then((mod) => mod.PortfolioSection),
  { ssr: false, loading: () => null }
);
const FavoritesSection = dynamic(
  () => import('@/components/FavoritesSection').then((mod) => mod.FavoritesSection),
  { ssr: false, loading: () => null }
);
const AllStocksSection = dynamic(
  () => import('@/components/AllStocksSection').then((mod) => mod.AllStocksSection),
  { ssr: false, loading: () => null }
);
const TodaysEarningsFinnhub = dynamic(
  () => import('@/components/TodaysEarningsFinnhub'),
  { ssr: false, loading: () => null }
);
const HeatmapSkeleton = dynamic(
  () => import('@/components/SectionSkeleton').then((mod) => ({ default: mod.HeatmapSkeleton })),
  { ssr: false }
);

const HeatmapPreview = dynamic(
  () => import('@/components/HeatmapPreview').then((mod) => mod.HeatmapPreview),
  { ssr: false, loading: () => <HeatmapSkeleton /> }
);
const CookieConsent = dynamic(
  () => import('@/components/CookieConsent'),
  { ssr: false, loading: () => null }
);
const StructuredData = dynamic(
  () => import('@/components/StructuredData').then((mod) => mod.StructuredData),
  { ssr: true }
);
const SectionErrorBoundary = dynamic(
  () => import('@/components/SectionErrorBoundary').then((mod) => mod.SectionErrorBoundary),
  { ssr: false }
);

// New Mobile Navigation
const BottomNavigation = dynamic(
  () => import('@/components/BottomNavigation').then((mod) => mod.BottomNavigation),
  { ssr: false, loading: () => null }
);
const MarketIndices = dynamic(
  () => import('@/components/MarketIndices').then((mod) => mod.MarketIndices),
  { ssr: false, loading: () => null }
);
const MobileShell = dynamic(
  () => import('@/components/MobileShell').then((mod) => mod.MobileShell),
  { ssr: false, loading: () => null }
);
const MobileViews = dynamic(
  () => import('@/components/MobileViews').then((mod) => mod.MobileViews),
  { ssr: false, loading: () => null }
);

// Hooks and utilities
import { useFavorites } from '@/hooks/useFavorites';
import { usePortfolio } from '@/hooks/usePortfolio';
import { usePWA } from '@/hooks/usePWA';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useLazyLoading } from '@/hooks/useLazyLoading';
import { StockData } from '@/lib/types';
import { useStockData } from '@/hooks/useStockData';
import { useStockFilter } from '@/hooks/useStockFilter';
import { useLogoLoader } from '@/hooks/useLogoLoader';
import { useTablePerformance } from '@/hooks/useTablePerformance';
import { autoRepairLocalStorage } from '@/lib/utils/clearCache';
import { logger } from '@/lib/utils/logger';

interface HomePageProps {
  initialData?: StockData[];
}

export default function HomePage({ initialData = [] }: HomePageProps) {
  // Auto-repair localStorage on mount (fixes corrupted cache issues)
  useEffect(() => {
    autoRepairLocalStorage();
  }, []);

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
    // Include 0-quantity tickers too (they stay visible while user edits).
    const portfolioTickers = Object.keys(portfolioHoldings);
    const missingTickers = portfolioTickers.filter(ticker => !stockData.some(s => s.ticker === ticker));

    if (missingTickers.length > 0) {
      // Debounce to avoid too many requests when portfolio changes rapidly
      const timeoutId = setTimeout(() => {
        fetchSpecificTickers(missingTickers);
      }, 300); // Reduced from 500ms for faster response
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

  // Bottom Navigation State
  const [activeBottomSection, setActiveBottomSection] = useState<'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks'>('heatmap');

  // Mobile: View-based navigation (no scrolling)
  // Desktop: Scroll-based navigation (keep existing behavior)
  const handleBottomNavChange = (section: 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks') => {
    setActiveBottomSection(section);
    // On desktop, still use scroll-to-section
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      switch (section) {
        case 'heatmap':
          scrollToSection('section-heatmap');
          break;
        case 'portfolio':
          scrollToSection('section-portfolio');
          break;
        case 'favorites':
          scrollToSection('section-favorites');
          break;
        case 'earnings':
          scrollToSection('section-earnings');
          break;
        case 'allStocks':
          scrollToSection('section-all-stocks');
          break;
      }
    }
    // On mobile, view switching is handled by MobileShell/MobileViews
  };

  // Optimized table performance hook for All Stocks section
  // allStocksSorted is already filtered by sector, industry, and search term from useStockFilter
  // This hook just provides memoization for better performance
  const { filteredStocks: optimizedAllStocks } = useTablePerformance({
    stocks: allStocksSorted,
    sortKey: allSortKey,
    ascending: allAscending,
    searchTerm: '' // Search is already applied in useStockFilter
  });

  // Trigger fetchRemainingStocksData early to ensure all data is loaded
  useEffect(() => {
    // Load all remaining stocks after initial load completes
    const timer = setTimeout(() => {
      if (allStocksSorted.length < 200) { // If we have less than 200 stocks, trigger load
        logger.data('Auto-triggering remaining stocks load (low count detected)');
        fetchRemainingStocksData();
      }
    }, 3000); // Wait 3 seconds after initial load

    return () => clearTimeout(timer);
  }, [allStocksSorted.length, fetchRemainingStocksData]);

  // Lazy loading hook - optimized for smooth scrolling
  const {
    displayLimit,
    hasMore,
    reset: resetLazyLoading,
    loadMore,
  } = useLazyLoading({
    initialLimit: 50, // Increased initial limit for smoother initial load
    incrementSize: 50, // Increased increment for fewer re-renders
    totalItems: optimizedAllStocks.length, // Use optimized stocks count
    threshold: 500, // Increased threshold - load earlier to prevent stuttering
    onLoadRemaining: fetchRemainingStocksData,
    enableProgressiveLoading: true
  });

  // Auto-increase displayLimit when new stocks are loaded (handled by useLazyLoading hook)

  // Display only the limited number of stocks (use optimized filtered stocks)
  // Ensure we show all stocks if displayLimit exceeds the array length
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
    priorityCount: 100, // Preload first 100 logos
    size: 32
  });

  // Prepare props for MobileViews
  const mobileViewsProps = {
    activeView: activeBottomSection,
    // Portfolio
    portfolioStocks,
    portfolioHoldings,
    allStocks: stockData,
    portfolioLoading: loadingStates.top50Stocks,
    onUpdateQuantity: updateQuantity,
    onRemoveStock: removeStock,
    onAddStock: addStock,
    calculatePortfolioValue: calculateStockValue,
    totalPortfolioValue,
    // Favorites
    favoriteStocks: favoriteStocksSorted,
    favoritesLoading: loadingStates.favorites,
    favSortKey,
    favAscending,
    onFavSort: requestFavSort,
    onToggleFavorite: toggleFavorite,
    isFavorite,
    // All Stocks
    displayedStocks,
    allStocksLoading: loadingStates.top50Stocks,
    allSortKey,
    allAscending,
    onAllSort: requestAllSort,
    searchTerm,
    onSearchChange: setSearchTerm,
    hasMore,
    selectedSector,
    selectedIndustry,
    onSectorChange: setSelectedSector,
    onIndustryChange: setSelectedIndustry,
    uniqueSectors,
    availableIndustries,
  };

  return (
    <>
      {/* Mobile: App-like view switching (CSS gating - lg:hidden) */}
      <div className="lg:hidden">
        <MobileShell
          activeView={activeBottomSection}
          onViewChange={handleBottomNavChange}
        >
          <MobileViews {...mobileViewsProps} />
        </MobileShell>
      </div>

      {/* Desktop: Traditional scroll-based layout (CSS gating - hidden lg:block) */}
      <div className="homepage-container hidden lg:block">
        {/* PWA Status Bar */}
        <div className="pwa-status-bar"></div>

        {/* Offline Indicator - only render on client */}
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
              {/* Structured Data for SEO */}
              <StructuredData stocks={stockData} pageType="home" />

              {/* Header Section - Full Width */}
              <div className="header-wrapper">
                <div className="container mx-auto px-4">
                  <PageHeader
                    navigation={
                      /* Hide navigation in header on mobile - show only in main content area */
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

              {/* Market Indices - Mobile only, shown below header */}
              <div className="lg:hidden container mx-auto px-4 py-2">
                <MarketIndices />
              </div>

              <main className="container" role="main">
                {/* Section Navigation - Mobile (Hidden now as we use BottomNavigation) */}
                <div className="hidden">
                  <SectionNavigation
                    preferences={preferences}
                    onToggleSection={(key) => savePreferences({ [key]: !(preferences[key] ?? true) })}
                    onScrollToSection={scrollToSection}
                  />
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">

                  {/* Error Display */}
                  {error && (
                    <div className="error" role="alert">
                      <strong>Error:</strong> {error}
                    </div>
                  )}

                  {/* Heatmap Preview Section - First */}
                  {(preferences.showHeatmapSection ?? true) && (
                    <div id="section-heatmap" className="scroll-mt-20">
                      <SectionErrorBoundary sectionName="Heatmap">
                        <HeatmapPreview />
                      </SectionErrorBoundary>
                    </div>
                  )}

                  {/* Portfolio Section */}
                  {(preferences.showPortfolioSection ?? true) && (
                    <div id="section-portfolio" className="scroll-mt-20">
                      <SectionErrorBoundary sectionName="Portfolio">
                        <PortfolioSection
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
                      </SectionErrorBoundary>
                    </div>
                  )}

                  {/* Favorites Section */}
                  {(preferences.showFavoritesSection ?? true) && (
                    <div id="section-favorites" className="scroll-mt-20">
                      <SectionErrorBoundary sectionName="Favorites">
                        <FavoritesSection
                          favoriteStocks={favoriteStocksSorted}
                          loading={loadingStates.favorites}
                          sortKey={favSortKey}
                          ascending={favAscending}
                          onSort={requestFavSort}
                          onToggleFavorite={toggleFavorite}
                          isFavorite={isFavorite}
                        />
                      </SectionErrorBoundary>
                    </div>
                  )}

                  {/* Today's Earnings Section */}
                  {(preferences.showEarningsSection ?? true) && (
                    <div id="section-earnings" className="scroll-mt-20">
                      <SectionErrorBoundary sectionName="Earnings">
                        <TodaysEarningsFinnhub />
                      </SectionErrorBoundary>
                    </div>
                  )}

                  {/* All Stocks Section */}
                  {(preferences.showAllStocksSection ?? true) && (
                    <div id="section-all-stocks" className="scroll-mt-20">
                      <SectionErrorBoundary sectionName="All Stocks">
                        <AllStocksSection
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
                          selectedSector={selectedSector}
                          selectedIndustry={selectedIndustry}
                          onSectorChange={setSelectedSector}
                          onIndustryChange={setSelectedIndustry}
                          uniqueSectors={uniqueSectors}
                          availableIndustries={availableIndustries}
                        />
                      </SectionErrorBoundary>
                    </div>
                  )}
                </div>

                <footer className="footer" aria-label="Site footer">
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

      <CookieConsent onAccept={() => {
        // Set consent to enable favorites functionality
        setConsent(true);
      }} />

        {/* Desktop: Bottom navigation is handled by MobileShell on mobile */}
        <div className="lg:hidden">
          <BottomNavigation
            activeSection={activeBottomSection}
            onSectionChange={handleBottomNavChange}
          />
        </div>
      </div>
    </>
  );
}
