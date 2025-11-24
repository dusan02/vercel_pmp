'use client';

// Client component containing all page logic
// This is imported by page.tsx (server component)
import React, { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';

// All component imports moved to dynamic imports to fix webpack require error
const PerformanceOptimizer = dynamic(
  () => import('@/components/PerformanceOptimizer').then(mod => ({ default: mod.PerformanceOptimizer })),
  { ssr: false, loading: () => null }
);
const MobileTester = dynamic(
  () => import('@/components/MobileTester').then(mod => ({ default: mod.MobileTester })),
  { ssr: false, loading: () => null }
);
const PullToRefresh = dynamic(
  () => import('@/components/PullToRefresh').then(mod => ({ default: mod.PullToRefresh })),
  { ssr: false, loading: () => null }
);
const PageHeader = dynamic(
  () => import('@/components/PageHeader').then(mod => ({ default: mod.PageHeader })),
  { ssr: false, loading: () => null }
);
const PortfolioSection = dynamic(
  () => import('@/components/PortfolioSection').then(mod => ({ default: mod.PortfolioSection })),
  { ssr: false, loading: () => null }
);
const FavoritesSection = dynamic(
  () => import('@/components/FavoritesSection').then(mod => ({ default: mod.FavoritesSection })),
  { ssr: false, loading: () => null }
);
const AllStocksSection = dynamic(
  () => import('@/components/AllStocksSection').then(mod => ({ default: mod.AllStocksSection })),
  { ssr: false, loading: () => null }
);
const TodaysEarningsFinnhub = dynamic(
  () => import('@/components/TodaysEarningsFinnhub'),
  { ssr: false, loading: () => null }
);
const CookieConsent = dynamic(
  () => import('@/components/CookieConsent'),
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

interface HomePageProps {
  initialData?: StockData[];
}

export default function HomePage({ initialData = [] }: HomePageProps) {
  // Use user preferences hook for persistence
  const { preferences, savePreferences, isLoaded, setConsent } = useUserPreferences();

  // Section visibility state
  const [showPortfolioSection, setShowPortfolioSection] = useState(true);
  const [showFavoritesSection, setShowFavoritesSection] = useState(true);
  const [showEarningsSection, setShowEarningsSection] = useState(true);
  const [showAllStocksSection, setShowAllStocksSection] = useState(true);
  
  // Sync local state with preferences when loaded
  useEffect(() => {
    if (isLoaded) {
      setShowPortfolioSection(preferences.showPortfolioSection ?? true);
      setShowFavoritesSection(preferences.showFavoritesSection ?? true);
      setShowEarningsSection(preferences.showEarningsSection ?? true);
      setShowAllStocksSection(preferences.showAllStocksSection ?? true);
    }
  }, [isLoaded, preferences]);

  // Handlers for toggling sections with persistence
  const handleTogglePortfolio = (value: boolean) => {
    setShowPortfolioSection(value);
    savePreferences({ showPortfolioSection: value });
  };

  const handleToggleFavorites = (value: boolean) => {
    setShowFavoritesSection(value);
    savePreferences({ showFavoritesSection: value });
  };

  const handleToggleEarnings = (value: boolean) => {
    setShowEarningsSection(value);
    savePreferences({ showEarningsSection: value });
  };

  const handleToggleAllStocks = (value: boolean) => {
    setShowAllStocksSection(value);
    savePreferences({ showAllStocksSection: value });
  };

  // Hooks for core functionality
  const { portfolioHoldings, updateQuantity, removeStock, addStock } = usePortfolio();
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

  // Load portfolio tickers that are not in stockData
  useEffect(() => {
    const portfolioTickers = Object.keys(portfolioHoldings).filter(ticker => (portfolioHoldings[ticker] || 0) > 0);
    const missingTickers = portfolioTickers.filter(ticker => !stockData.some(s => s.ticker === ticker));
    
    if (missingTickers.length > 0) {
      // Debounce to avoid too many requests
      const timeoutId = setTimeout(() => {
        fetchSpecificTickers(missingTickers);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [portfolioHoldings, stockData, fetchSpecificTickers]);

  const {
    searchTerm, setSearchTerm,
    favoritesOnly, setFavoritesOnly, // Aj keď sa nepoužíva priamo v UI (filter logic je v hooku), môžeme použiť pre custom filtre
    // filterCategory, setFilterCategory, // Ak by sme chceli pridať tabs
    // selectedSector, setSelectedSector, // Ak by sme chceli pridať sector filter
    filteredStocks, // Toto sú už vyfiltrované akcie
    favoriteStocksSorted,
    allStocksSorted,
    favSortKey, favAscending, requestFavSort,
    allSortKey, allAscending, requestAllSort
  } = useStockFilter({ 
    stockData, 
    favorites, 
    isFavorite 
  });

  // Lazy loading hook
  const {
    displayLimit,
    hasMore,
    reset: resetLazyLoading,
  } = useLazyLoading({
    initialLimit: 30,
    incrementSize: 30,
    totalItems: allStocksSorted.length,
    threshold: 200,
    onLoadRemaining: fetchRemainingStocksData,
    enableProgressiveLoading: true
  });

  // Display only the limited number of stocks
  const displayedStocks = allStocksSorted.slice(0, displayLimit);

  // Calculate portfolio value
  const calculatePortfolioValue = (stock: StockData): number => {
    const quantity = portfolioHoldings[stock.ticker] || 0;
    if (quantity === 0) return 0;
    const currentValue = stock.currentPrice * quantity;
    const previousValue = stock.closePrice * quantity;
    return currentValue - previousValue;
  };

  const totalPortfolioValue = stockData.reduce((total, stock) => {
    return total + calculatePortfolioValue(stock);
  }, 0);

  // Get portfolio stocks (stocks that have holdings > 0)
  // Ensure all portfolio stocks have logoUrl - if missing, add fallback
  // Also handle tickers that are in portfolio but not yet in stockData
  const portfolioTickers = Object.keys(portfolioHoldings).filter(ticker => (portfolioHoldings[ticker] || 0) > 0);
  const portfolioStocksFromData = stockData.filter(stock => portfolioTickers.includes(stock.ticker));
  const missingTickers = portfolioTickers.filter(ticker => !stockData.some(s => s.ticker === ticker));
  
  // Create placeholder stocks for missing tickers (they will be loaded later)
  const missingStocks: StockData[] = missingTickers.map(ticker => ({
    ticker,
    currentPrice: 0,
    closePrice: 0,
    percentChange: 0,
    marketCap: 0,
    marketCapDiff: 0,
    lastUpdated: new Date().toISOString(),
    logoUrl: `/logos/${ticker.toLowerCase()}-32.webp`, // Fallback logoUrl
    companyName: '',
    sector: '',
    industry: ''
  }));
  
  const portfolioStocks = [...portfolioStocksFromData, ...missingStocks]
    .map(stock => ({
      ...stock,
      // Ensure logoUrl is always present - use fallback if missing
      logoUrl: stock.logoUrl || `/logos/${stock.ticker.toLowerCase()}-32.webp`
    }));

  return (
    <>
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
              <main className="container">
                {/* Header Section with Section Toggles */}
                <PageHeader
                  showFavoritesSection={showFavoritesSection}
                  showPortfolioSection={showPortfolioSection}
                  showAllStocksSection={showAllStocksSection}
                  showEarningsSection={showEarningsSection}
                  onToggleFavorites={handleToggleFavorites}
                  onTogglePortfolio={handleTogglePortfolio}
                  onToggleAllStocks={handleToggleAllStocks}
                  onToggleEarnings={handleToggleEarnings}
                />

                {/* Error Display */}
                {error && (
                  <div className="error" role="alert">
                    <strong>Error:</strong> {error}
                  </div>
                )}

                {/* Portfolio Section */}
                {showPortfolioSection && (
                  <PortfolioSection
                    portfolioStocks={portfolioStocks}
                    portfolioHoldings={portfolioHoldings}
                    allStocks={stockData}
                    loading={loadingStates.top50Stocks}
                    onUpdateQuantity={updateQuantity}
                    onRemoveStock={removeStock}
                    onAddStock={addStock}
                    calculatePortfolioValue={calculatePortfolioValue}
                    totalPortfolioValue={totalPortfolioValue}
                  />
                )}

                {/* Favorites Section */}
                {showFavoritesSection && (
                  <FavoritesSection
                    favoriteStocks={favoriteStocksSorted}
                    loading={loadingStates.favorites}
                    sortKey={favSortKey}
                    ascending={favAscending}
                    onSort={requestFavSort}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={isFavorite}
                  />
                )}

                {/* Today's Earnings Section */}
                {showEarningsSection && (
                  <TodaysEarningsFinnhub />
                )}

                {/* All Stocks Section */}
                {showAllStocksSection && (
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
                  />
                )}

                <footer className="footer" aria-label="Site footer">
                  <p>Data provided by Polygon.io • Powered by Next.js</p>
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

      {/* Cookie Consent Banner */}
      <CookieConsent onAccept={() => {
        // Set consent to enable favorites functionality
        setConsent(true);
      }} />
    </>
  );
}
