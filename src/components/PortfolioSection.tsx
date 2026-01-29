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
  const [portfolioSearchTerm, setPortfolioSearchTerm] = useState('');
  const [portfolioSearchResults, setPortfolioSearchResults] = useState<StockData[]>([]);
  const [showPortfolioSearch, setShowPortfolioSearch] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sorting Logic
  const {
    sorted: sortedPortfolioStocks,
    sortKey,
    ascending,
    requestSort
  } = useSortableData(portfolioStocks, 'ticker', true);

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
      width: '60px',
      render: (stock) => (
        <div className="flex justify-center">
          <CompanyLogo
            ticker={stock.ticker}
            logoUrl={stock.logoUrl || `/logos/${stock.ticker.toLowerCase()}-32.webp`}
            size={32}
            priority={true}
          />
        </div>
      )
    },
    {
      key: 'ticker',
      header: 'Ticker',
      sortable: true,
      render: (stock) => <strong>{stock.ticker}</strong>
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
      key: 'quantity',
      header: '#',
      align: 'center',
      render: (stock) => (
        <PortfolioQuantityInput
          value={portfolioHoldings[stock.ticker] || 0}
          onChange={(newQuantity) => onUpdateQuantity(stock.ticker, newQuantity)}
          className="min-w-[80px] w-20 mx-auto"
        />
      )
    },
    {
      key: 'currentPrice',
      header: 'Price',
      sortable: true,
      align: 'right',
      className: 'hidden md:table-cell',
      render: (stock) => {
        const price = stock.currentPrice ?? 0;
        return <span className="tabular-nums">${isFinite(price) ? Math.round(price).toLocaleString('en-US') : '0'}</span>;
      }
    },
    {
      key: 'percentChange',
      header: '% Change',
      sortable: true,
      align: 'right',
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
      render: (stock) => (
        <button
          className="portfolio-delete-button mx-auto"
          onClick={() => onRemoveStock(stock.ticker)}
          aria-label={`Remove ${stock.ticker} from portfolio`}
          title="Remove from portfolio"
        >
          <X size={16} />
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
    <tr className="portfolio-total-row hidden md:table-row" style={{ backgroundColor: 'var(--clr-bg-yellow-light, #fffbeb)' }}>
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
          <div className="portfolio-stats hidden md:flex gap-6 text-sm font-medium">
            <div className="flex gap-2">
              <span className="text-[var(--clr-subtext)]">Total Value:</span>
              <span>{formatCurrencyCompact(totalPortfolioValue, true)}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-[var(--clr-subtext)]">Daily Change:</span>
              <span className={totalDailyChange >= 0 ? 'positive' : 'negative'}>
                {formatCurrencyCompact(totalDailyChange, true)} ({formatPercent(weightedDailyChangePercent)})
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

      {/* Search Bar */}
      <div className="px-4 mb-6 relative">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search stocks to add..."
            value={portfolioSearchTerm}
            onChange={(e) => setPortfolioSearchTerm(e.target.value)}
            onFocus={() => setShowPortfolioSearch(true)}
            onBlur={() => setTimeout(() => setShowPortfolioSearch(false), 200)}
            className="w-full px-4 py-2 border rounded-lg dark:bg-black/20 dark:border-gray-700"
          />
          {showPortfolioSearch && portfolioSearchResults.length > 0 && (
            <div className="absolute top-100 left-0 right-0 z-50 bg-white dark:bg-gray-800 shadow-xl border rounded-lg mt-1 max-h-60 overflow-y-auto">
              {portfolioSearchResults.map((stock) => (
                <button
                  key={stock.ticker}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 border-b last:border-0"
                  onClick={() => {
                    onAddStock(stock.ticker);
                    setPortfolioSearchTerm('');
                  }}
                >
                  <span className="font-bold">{stock.ticker}</span> - {getCompanyName(stock.ticker)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visualizations: Order -> Donuts -> Treemap -> Table */}
      {portfolioStocks.length > 0 && (
        <div className="mb-8 space-y-8 px-4">
          {/* 1. Donut Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PortfolioSectorDistributionChart data={chartData} />
            <PortfolioStockDistributionChart data={chartData} />
          </div>

          {/* 2. Heatmap */}
          <PortfolioPerformanceTreemap data={chartData} />
        </div>
      )}

      {/* 3. Table */}
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
        footer={footerRow}
      />
    </section>
  );
}
