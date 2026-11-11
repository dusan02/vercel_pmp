'use client';

import React, { useState, useMemo } from 'react';
import { Search, X, Plus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { StockData } from '@/lib/types';
import { SortKey } from '@/hooks/useSortableData';
import { PortfolioCardMobile } from './PortfolioCardMobile';
import { PortfolioPositionSheet } from './PortfolioPositionSheet';
import { getCompanyName } from '@/lib/companyNames';
import { formatPrice } from '@/lib/utils/format';

interface EnhancedStock extends StockData {
  value: number;
  dailyPnl: number;
  quantity: number;
  positionValue: number;
  weight: number;
  totalPnl: number | null;
  totalRetPct: number | null;
}

interface PortfolioMobileHoldingsProps {
  stocks: EnhancedStock[];
  allStocks: StockData[];
  portfolioHoldings: Record<string, number>;
  costBasis: Record<string, number>;
  totalPortfolioValue: number;
  sortKey: SortKey | null;
  ascending: boolean;
  onSort: (key: SortKey) => void;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onUpdateCostBasis?: ((ticker: string, avgPrice: number) => void) | undefined;
  onRemoveStock: (ticker: string) => void;
  onAddStock: (ticker: string, quantity?: number) => void;
  trendUniverse: Set<string>;
}

const POPULAR_STOCKS = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'TSLA', 'GOOGL', 'META'];

export function PortfolioMobileHoldings({
  stocks,
  allStocks,
  portfolioHoldings,
  costBasis,
  totalPortfolioValue,
  sortKey,
  ascending,
  onSort,
  onUpdateQuantity,
  onUpdateCostBasis,
  onRemoveStock,
  onAddStock,
  trendUniverse,
}: PortfolioMobileHoldingsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [editingStockTicker, setEditingStockTicker] = useState<string | null>(null);

  // Search Results
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return allStocks
      .filter(
        (s) =>
          s.ticker.toLowerCase().includes(term) ||
          (s.companyName || '').toLowerCase().includes(term) ||
          getCompanyName(s.ticker).toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [searchTerm, allStocks]);

  // Suggested popular stocks not yet in portfolio
  const existingTickers = useMemo(() => new Set(stocks.map((s) => s.ticker)), [stocks]);
  const suggestions = useMemo(() => {
    return POPULAR_STOCKS.filter((t) => !existingTickers.has(t));
  }, [existingTickers]);

  // Stock currently being edited in bottom sheet
  const editingStock = useMemo(() => {
    if (!editingStockTicker) return null;
    return stocks.find((s) => s.ticker === editingStockTicker) || allStocks.find((s) => s.ticker === editingStockTicker) || null;
  }, [editingStockTicker, stocks, allStocks]);

  const handleAddStock = (ticker: string) => {
    onAddStock(ticker, 1);
    setSearchTerm('');
    setShowSearchDropdown(false);
    // Automatically open sheet to let user set quantity/cost
    setEditingStockTicker(ticker);
  };

  const sortOptions: Array<{ key: SortKey; label: string }> = [
    { key: 'positionValue', label: 'Value' },
    { key: 'percentChange', label: 'Today %' },
    { key: 'totalPnl', label: 'Total P&L' },
    { key: 'ticker', label: 'A–Z' },
    { key: 'weight', label: 'Weight' },
  ];

  return (
    <div className="space-y-3">
      {/* 1. Search Bar + Quick Add */}
      <div className="relative">
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search stock to add (e.g. NVDA, AAPL)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setShowSearchDropdown(true)}
            onBlur={() => setTimeout(() => setShowSearchDropdown(false), 250)}
            className="w-full h-11 pl-10 pr-9 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showSearchDropdown && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 z-40 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
            {searchResults.map((stock) => (
              <button
                key={stock.ticker}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleAddStock(stock.ticker);
                }}
                className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 transition-colors"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                      {stock.ticker}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                      {stock.companyName || getCompanyName(stock.ticker)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {stock.currentPrice > 0 && (
                    <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                      ${formatPrice(stock.currentPrice)}
                    </span>
                  )}
                  <span className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <Plus size={16} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Quick Suggestion Chips */}
        {suggestions.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-[11px] font-semibold text-slate-400 shrink-0">Add quick:</span>
            {suggestions.slice(0, 5).map((ticker) => (
              <button
                key={ticker}
                type="button"
                onClick={() => handleAddStock(ticker)}
                className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:border-blue-400 hover:text-blue-600 transition-colors shrink-0 flex items-center gap-1 shadow-2xl shadow-slate-100"
              >
                <Plus size={12} className="text-blue-500" />
                <span>{ticker}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Mobile Sort Pills */}
      {stocks.length > 1 && (
        <div className="flex items-center justify-between gap-2 pt-1 pb-1">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs w-full">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0 mr-0.5">
              Sort:
            </span>
            {sortOptions.map((opt) => {
              const isActive = sortKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onSort(opt.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isActive && (
                    <span className="text-[10px]">
                      {ascending ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Holdings Cards List */}
      {stocks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 text-center shadow-sm">
          <div className="text-4xl mb-3">💼</div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">
            Your portfolio is empty
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mb-5 leading-relaxed">
            Add your stock positions to track real-time portfolio balance, daily market moves, and all-time profit/loss.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {POPULAR_STOCKS.slice(0, 4).map((ticker) => (
              <button
                key={ticker}
                type="button"
                onClick={() => handleAddStock(ticker)}
                className="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40 font-bold text-xs hover:bg-blue-100 transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>Add {ticker}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {stocks.map((stock) => (
            <PortfolioCardMobile
              key={stock.ticker}
              stock={stock}
              quantity={portfolioHoldings[stock.ticker] || 0}
              avgCost={costBasis[stock.ticker] || 0}
              weight={stock.weight}
              positionValue={stock.positionValue}
              dailyPnl={stock.dailyPnl}
              totalPnl={stock.totalPnl}
              totalRetPct={stock.totalRetPct}
              isTrend={trendUniverse.has(stock.ticker)}
              onEdit={(ticker) => setEditingStockTicker(ticker)}
              onRemove={onRemoveStock}
            />
          ))}
        </div>
      )}

      {/* 4. Position Editor Bottom Sheet */}
      <PortfolioPositionSheet
        isOpen={editingStockTicker !== null}
        onClose={() => setEditingStockTicker(null)}
        stock={editingStock}
        currentQuantity={editingStockTicker ? (portfolioHoldings[editingStockTicker] || 0) : 0}
        currentCostBasis={editingStockTicker ? (costBasis[editingStockTicker] || 0) : 0}
        totalPortfolioValue={totalPortfolioValue}
        onUpdateQuantity={onUpdateQuantity}
        onUpdateCostBasis={onUpdateCostBasis}
        onRemoveStock={onRemoveStock}
      />
    </div>
  );
}
