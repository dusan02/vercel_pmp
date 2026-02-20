'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Plus } from 'lucide-react';
import { SectionIcon } from './SectionIcon';
import { SectionLoader } from './SectionLoader';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';
import { StockData } from '@/lib/types';
import { PortfolioQuantityInput } from './PortfolioQuantityInput';
import { PortfolioCardMobile } from './PortfolioCardMobile';
import { UniversalTable, ColumnDef } from './UniversalTable';
import { PortfolioSectorDistributionChart } from './PortfolioSectorDistributionChart';
import { PortfolioStockDistributionChart } from './PortfolioStockDistributionChart';
import { PortfolioPerformanceTreemap } from './PortfolioTreemapNew';
import { formatCurrencyCompact, formatPercent, formatPrice, formatSectorName } from '@/lib/utils/format';
import { event } from '@/lib/ga';
import { useSortableData, SortKey } from '@/hooks/useSortableData';
import {
  BUTTON_PRIMARY_MD,
  BUTTON_ICON,
  BUTTON_ICON_DANGER,
  BUTTON_SECONDARY
} from '@/lib/utils/buttonStyles';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface PortfolioSectionProps {
  portfolioStocks: StockData[];
  portfolioHoldings: Record<string, number>;
  allStocks: StockData[];
  loading: boolean;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onRemoveStock: (ticker: string) => void;
  onAddStock: (ticker: string, quantity?: number) => void;
  calculatePortfolioValue: (stock: StockData) => number; // Daily change
  calculateTotalValue?: ((stock: StockData) => number) | undefined; // Total value (NEW)
  totalPortfolioValue: number;
}

export function PortfolioSection({
  portfolioStocks,
  portfolioHoldings,
  allStocks,
  loading,
  onUpdateQuantity,
  onRemoveStock,
  onAddStock,
  calculatePortfolioValue,
  calculateTotalValue,
  totalPortfolioValue
}: PortfolioSectionProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [portfolioSearchTerm, setPortfolioSearchTerm] = useState('');
  const [portfolioSearchResults, setPortfolioSearchResults] = useState<StockData[]>([]);
  const [showPortfolioSearch, setShowPortfolioSearch] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pre-calculate value (Daily P&L) for sorting
  const enhancedPortfolioStocks = useMemo(() => {
    return portfolioStocks.map(stock => ({
      ...stock,
      value: calculatePortfolioValue(stock) || 0
    }));
  }, [portfolioStocks, calculatePortfolioValue]);

  // Sorting Logic
  const {
    sorted: sortedPortfolioStocks,
    sortKey,
    ascending,
    requestSort
  } = useSortableData(enhancedPortfolioStocks, 'ticker', true);

  // Calculate Global Stats (Daily Change)
  const totalDailyChange = useMemo(() => {
    return portfolioStocks.reduce((sum, stock) => sum + (calculatePortfolioValue(stock) || 0), 0);
  }, [portfolioStocks, calculatePortfolioValue]);

  const weightedDailyChangePercent = useMemo(() => {
    if (totalPortfolioValue === 0) return 0;
    // Derived from P&L and Total Value
    // P&L / (Value - P&L) * 100 ?
    // If portfolio value is 1000, and P&L is 100. Previous was 900. 100/900 = 11.1%.
    // If P&L is percent of TODAY's value?
    // Usually "Daily Change %" is Sum(Change) / Sum(PreviousValue).
    // PreviousValue = TotalValue - TotalDailyChange.
    const previousValue = totalPortfolioValue - totalDailyChange;
    if (previousValue === 0) return 0;
    return (totalDailyChange / previousValue) * 100;
  }, [totalDailyChange, totalPortfolioValue]);

  // Search Logic
  useEffect(() => {
    if (portfolioSearchTerm.trim() === '') {
      setPortfolioSearchResults([]);
      return;
    }
    const term = portfolioSearchTerm.toLowerCase();
    const results = allStocks.filter(
      (stock) =>
        stock.ticker.toLowerCase().includes(term) ||
        getCompanyName(stock.ticker).toLowerCase().includes(term)
    ).slice(0, 5);
    setPortfolioSearchResults(results);
    setSelectedIndex(-1);
  }, [portfolioSearchTerm, allStocks]);

  // Column Definitions
  const columns: ColumnDef<StockData>[] = useMemo(() => [
    {
      key: 'logo',
      header: 'Logo',
      align: 'center',
      className: 'hidden md:table-cell',
      width: '72px',
      render: (stock) => (
        <div className="flex justify-center">
          <CompanyLogo
            ticker={stock.ticker}
            size={44}
            priority={true}
          />
        </div>
      )
    },
    {
      key: 'ticker',
      header: 'Stock',
      sortable: true,
      align: 'left',
      showInMobileSort: true,
      mobileWidth: 'w-28',
      render: (stock) => <strong>{stock.ticker}</strong>
    },
    {
      key: isDesktop ? 'currentPrice' : 'value',
      header: 'Price',
      sortable: true,
      align: 'right',
      className: 'text-right',
      showInMobileSort: true,
      mobileWidth: 'w-24',
      render: (stock) => {
        const price = stock.currentPrice ?? 0;
        return <span className="tabular-nums block w-full text-right">${isFinite(price) ? Math.round(price).toLocaleString('en-US') : '0'}</span>;
      }
    },
    {
      key: 'quantity',
      header: '#',
      align: 'center',
      showInMobileSort: true,
      mobileWidth: 'w-16',
      render: (stock) => (
        <PortfolioQuantityInput
          value={portfolioHoldings[stock.ticker] || 0}
          onChange={(newQuantity) => onUpdateQuantity(stock.ticker, newQuantity)}
          className="min-w-[80px] w-20 mx-auto"
        />
      )
    },
    {
      key: 'companyName',
      header: 'Company',
      className: 'hidden md:table-cell',
      render: (stock) => <span className="block truncate max-w-[180px]">{getCompanyName(stock.ticker)}</span>
    },
    {
      key: 'sector',
      header: 'Sector',
      sortable: true,
      className: 'hidden md:table-cell',
      render: (stock) => formatSectorName(stock.sector)
    },
    {
      key: 'industry',
      header: 'Industry',
      sortable: true,
      className: 'hidden md:table-cell',
      render: (stock) => stock.industry || 'N/A'
    },
    {
      key: 'percentChange',
      header: '% Change',
      sortable: isDesktop,
      align: 'right',
      className: 'text-right hidden md:table-cell',
      render: (stock) => {
        const pct = stock.percentChange ?? 0;
        return (
          <span className={`tabular-nums ${pct >= 0 ? 'positive' : 'negative'}`}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
          </span>
        );
      }
    },
    {
      key: 'value',
      header: 'Daily P&L',
      sortable: isDesktop,
      align: 'right',
      render: (stock) => {
        const value = calculatePortfolioValue(stock);
        return (
          <span className={`tabular-nums ${value >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrencyCompact(value, true)}
          </span>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      width: '88px',
      showInMobileSort: false, // Hide label in mobile sort header
      render: (stock) => (
        <button
          className="flex items-center justify-center w-8 h-8 mx-auto rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-red-900/20 transition-all duration-200"
          onClick={() => onRemoveStock(stock.ticker)}
          aria-label={`Remove ${stock.ticker} from portfolio`}
          title="Remove from portfolio"
        >
          <X size={18} />
        </button>
      )
    }
  ], [portfolioHoldings, onUpdateQuantity, onRemoveStock, calculatePortfolioValue]);

  // Transform data for charts
  const chartData = useMemo(() => {
    return portfolioStocks.map(stock => {
      const quantity = portfolioHoldings[stock.ticker] || 0;
      const currentPrice = stock.currentPrice || 0;
      const value = quantity * currentPrice; // Total Position Value
      const dailyChangeValue = calculatePortfolioValue(stock); // Daily P&L

      return {
        ticker: stock.ticker,
        value: value,
        dailyChangePercent: stock.percentChange || 0,
        dailyChangeValue: dailyChangeValue,
        sector: stock.sector || 'Unknown',
        industry: stock.industry || 'Unknown'
      };
    });
  }, [portfolioStocks, portfolioHoldings, calculatePortfolioValue]);

  if (loading) {
    return (
      <section className="portfolio">
        <div className="flex items-center justify-between mb-4 px-4">
          <div className="flex items-center">
            <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--clr-text)] m-0 relative -top-1.5">
              <SectionIcon type="pie" size={24} className="text-[var(--clr-text)]" />
              <span>Portfolio</span>
            </h2>
          </div>
        </div>
        <SectionLoader message="Loading portfolio..." />
      </section>
    );
  }

  // Footer Row for UniversalTable
  const footerRow = portfolioStocks.length > 0 ? (
    <tr className="portfolio-total-row hidden md:table-row" style={{ backgroundColor: 'var(--clr-bg-yellow-light, #fffbeb)', borderTop: '3px double #3b82f6' }}>
      <td colSpan={7} className="text-right font-semibold py-4 px-2 align-middle">
        Total:
      </td>
      <td className={`${weightedDailyChangePercent >= 0 ? 'positive' : 'negative'} text-right tabular-nums font-semibold py-4 px-2 whitespace-nowrap align-middle`}>
        {formatPercent(weightedDailyChangePercent)}
      </td>
      <td className={`${totalDailyChange >= 0 ? 'positive' : 'negative'} text-right tabular-nums font-semibold py-4 px-2 whitespace-nowrap align-middle min-w-[120px]`}>
        {formatCurrencyCompact(totalDailyChange, true)}
      </td>
      <td></td>
    </tr>
  ) : null;

  return (
    <section className="portfolio">
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center">
          <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--clr-text)] m-0 relative -top-1.5">
            <SectionIcon type="pie" size={24} className="text-[var(--clr-text)]" />
            <span>Portfolio</span>
          </h2>
        </div>

        {/* Desktop Stats (Header) */}
        {portfolioStocks.length > 0 && (
          <div className="portfolio-stats hidden md:flex gap-8 items-baseline">
            <div className="flex gap-2 items-baseline">
              <span className="text-[var(--clr-subtext)] text-base">Total Value:</span>
              <span className="text-2xl font-bold">{formatCurrencyCompact(totalPortfolioValue, true)}</span>
            </div>
            <div className="flex gap-2 items-baseline">
              <span className="text-[var(--clr-subtext)] text-base">Daily Change:</span>
              <span className={`text-2xl font-bold ${totalDailyChange >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrencyCompact(totalDailyChange, true)} <span className="text-lg font-medium text-opacity-80">({formatPercent(weightedDailyChangePercent)})</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Stats Card (since table footer logic is desktop only) */}
      {portfolioStocks.length > 0 && (
        <div className="lg:hidden bg-white dark:bg-white/5 mx-3 mb-4 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-800">
            <div className="pr-4">
              <div className="text-xs text-[var(--clr-subtext)] mb-1">Total Value</div>
              <div className="text-lg font-bold">{formatCurrencyCompact(totalPortfolioValue, true)}</div>
            </div>
            <div className="pl-4">
              <div className="text-xs text-[var(--clr-subtext)] mb-1">Daily Change</div>
              <div className={`text-lg font-bold ${totalDailyChange >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrencyCompact(totalDailyChange, true)}
              </div>
            </div>
          </div>
        </div>
      )}



      {/* 3. Search Bar - Above Table */}
      <div className="px-4 mb-4 relative mt-2">
        <div className="relative group">
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search stocks to add..."
            value={portfolioSearchTerm}
            onChange={(e) => setPortfolioSearchTerm(e.target.value)}
            onFocus={() => setShowPortfolioSearch(true)}
            onBlur={() => setTimeout(() => setShowPortfolioSearch(false), 200)}
            className="w-full px-4 py-4 h-14 text-lg border-2 rounded-xl bg-white dark:bg-gray-800 border-blue-500/20 md:border-gray-200 md:dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm md:shadow-md"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>

          {showPortfolioSearch && portfolioSearchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-[60] bg-white dark:bg-gray-800 shadow-xl border rounded-lg mt-2 max-h-60 overflow-y-auto ring-1 ring-black/5">
              {portfolioSearchResults.map((stock) => (
                <button
                  key={stock.ticker}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 border-b last:border-0 border-gray-100 dark:border-gray-700/50 transition-colors flex items-center"
                  onClick={() => {
                    onAddStock(stock.ticker);
                    setPortfolioSearchTerm('');
                  }}
                >
                  <span className="font-bold text-blue-600 dark:text-blue-400 w-16">{stock.ticker}</span>
                  <span className="text-gray-300 mx-2">|</span>
                  <span className="text-sm font-medium truncate flex-1">{getCompanyName(stock.ticker)}</span>
                  <Plus size={18} className="text-gray-400 ml-2" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Visualizations: Only show when portfolio has stocks */}
      {portfolioStocks.length > 0 && (
        <div className="mb-8 space-y-8 px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PortfolioSectorDistributionChart data={chartData} />
            <PortfolioStockDistributionChart data={chartData} />
          </div>
          <PortfolioPerformanceTreemap data={chartData} />
        </div>
      )}

      {/* 4. Table */}
      <UniversalTable
        data={sortedPortfolioStocks}
        columns={columns}
        keyExtractor={(item) => item.ticker}
        isLoading={loading}
        sortKey={sortKey}
        ascending={ascending}
        onSort={requestSort}
        emptyMessage={
          <div className="empty-portfolio text-center py-12">
            <div className="text-4xl mb-4 opacity-50">💼</div>
            <h3 className="text-lg font-semibold mb-2">Your portfolio is empty</h3>
            <p className="text-[var(--clr-subtext)] mb-4">Add stocks to track your performance</p>
          </div>
        }
        renderMobileCard={(stock) => (
          <PortfolioCardMobile
            stock={stock}
            quantity={portfolioHoldings[stock.ticker] || 0}
            onUpdateQuantity={onUpdateQuantity}
            onRemove={onRemoveStock}
            calculateValue={calculatePortfolioValue}
          />
        )}
        // forceTable={true} // REMOVED to enable mobile cards
        footer={footerRow}
      />
    </section>
  );
}
