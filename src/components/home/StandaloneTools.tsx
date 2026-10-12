'use client';

/**
 * Standalone wrappers for the personal tools that previously lived only as
 * homepage ?tab= sections. They own their own useHomeData instance so the
 * canonical /favorites, /portfolio and /analysis pages work without HomePage.
 */
import { useRouter } from 'next/navigation';
import { useHomeData } from '@/hooks/useHomeData';
import { HomeFavorites } from './HomeFavorites';
import { HomePortfolio } from './HomePortfolio';
import { HomeAnalysis } from './HomeAnalysis';

export function FavoritesStandalone() {
  const {
    favoriteStocksSorted, loadingStates, favSortKey, favAscending,
    requestFavSort, toggleFavorite, isFavorite, stockData,
  } = useHomeData({ initialData: [], activeSection: 'favorites' });
  return (
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
  );
}

export function PortfolioStandalone() {
  const {
    portfolioStocks, portfolioHoldings, stockData, loadingStates,
    updateQuantity, removeStock, addStock, calculateDailyChange,
    calculateTotalStockValue, totalPortfolioValue,
  } = useHomeData({ initialData: [], activeSection: 'portfolio' });
  return (
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
  );
}

export function AnalysisStandalone() {
  const router = useRouter();
  // Ticker selection goes straight to the canonical /analysis/[ticker] page —
  // the bare /analysis route is the search + discovery landing.
  return <HomeAnalysis onTickerChange={(t) => router.push(`/analysis/${t.toUpperCase()}`)} />;
}
