/**
 * Portfolio Section Component
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { SectionIcon } from './SectionIcon';
import { SectionLoader } from './SectionLoader';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';
import { StockData } from '@/lib/types';
import { PortfolioQuantityInput } from './PortfolioQuantityInput';
import { PortfolioCardMobile } from './PortfolioCardMobile';
import { formatCurrencyCompact, formatPercent, formatPrice, formatSectorName } from '@/lib/utils/format';
import { event } from '@/lib/ga';
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
  calculatePortfolioValue: (stock: StockData) => number;
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
  totalPortfolioValue
}: PortfolioSectionProps) {
  const [portfolioSearchTerm, setPortfolioSearchTerm] = useState('');
  const [portfolioSearchResults, setPortfolioSearchResults] = useState<StockData[]>([]);
  const [showPortfolioSearch, setShowPortfolioSearch] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Desktop sort state - persisted in localStorage
  const [desktopSortKey, setDesktopSortKey] = useState<'ticker' | 'company' | 'sector' | 'industry' | 'quantity' | 'price' | 'percent' | 'value' | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('pmp_portfolio_desktop_sortKey');
    return (stored as any) || null;
  });
  const [desktopAscending, setDesktopAscending] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('pmp_portfolio_desktop_sortAscending');
    return stored ? stored === 'true' : false;
  });

  // Mobile sort (unified with Stocks/Favorites sort chips) - persisted in localStorage
  const [mobileSortKey, setMobileSortKey] = useState<'ticker' | 'quantity' | 'price' | 'percent' | 'delta'>(() => {
    if (typeof window === 'undefined') return 'ticker';
    const stored = localStorage.getItem('pmp_portfolio_sortKey');
    return (stored as any) || 'ticker';
  });
  const [mobileAscending, setMobileAscending] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('pmp_portfolio_sortAscending');
    return stored ? stored === 'true' : true;
  });

  // Persist sort state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pmp_portfolio_sortKey', mobileSortKey);
      localStorage.setItem('pmp_portfolio_sortAscending', String(mobileAscending));
      if (desktopSortKey !== null) {
        localStorage.setItem('pmp_portfolio_desktop_sortKey', desktopSortKey);
        localStorage.setItem('pmp_portfolio_desktop_sortAscending', String(desktopAscending));
      }
    }
  }, [mobileSortKey, mobileAscending, desktopSortKey, desktopAscending]);

  // Mobile details bottom-sheet
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const selectedStock = selectedTicker
    ? portfolioStocks.find((s) => s.ticker === selectedTicker) ?? null
    : null;

  const selectedQuantity = selectedTicker ? (portfolioHoldings[selectedTicker] ?? 0) : 0;

  const closeDetails = () => {
    setIsDetailsOpen(false);
    setTimeout(() => setSelectedTicker(null), 150);
  };

  const openDetails = (ticker: string) => {
    setSelectedTicker(ticker);
    setIsDetailsOpen(true);
  };

  const getHoldingDelta = (stock: StockData, quantity: number) => {
    const price = stock.currentPrice ?? 0;
    const pct = stock.percentChange ?? 0;
    if (!isFinite(price) || price <= 0) return 0;
    if (!isFinite(pct)) return 0;
    if (pct <= -99.999) return 0;
    const prev = price / (1 + pct / 100);
    const perShareDelta = price - prev;
    const v = perShareDelta * (quantity || 0);
    return isFinite(v) ? v : 0;
  };

  // Desktop sort function
  const sortedPortfolioStocksDesktop = (() => {
    if (!desktopSortKey) return portfolioStocks;

    const arr = [...portfolioStocks];
    arr.sort((a, b) => {
      const qa = portfolioHoldings[a.ticker] || 0;
      const qb = portfolioHoldings[b.ticker] || 0;
      const va = calculatePortfolioValue(a);
      const vb = calculatePortfolioValue(b);

      let cmp = 0;
      switch (desktopSortKey) {
        case 'ticker':
          cmp = a.ticker.localeCompare(b.ticker);
          break;
        case 'company':
          cmp = getCompanyName(a.ticker).localeCompare(getCompanyName(b.ticker));
          break;
        case 'sector':
          cmp = (a.sector || '').localeCompare(b.sector || '');
          break;
        case 'industry':
          cmp = (a.industry || '').localeCompare(b.industry || '');
          break;
        case 'quantity':
          cmp = qa - qb;
          break;
        case 'price':
          cmp = (a.currentPrice ?? 0) - (b.currentPrice ?? 0);
          break;
        case 'percent':
          cmp = (a.percentChange ?? 0) - (b.percentChange ?? 0);
          break;
        case 'value':
          cmp = va - vb;
          break;
      }
      if (!desktopAscending) cmp = -cmp;
      if (cmp !== 0) return cmp;
      return a.ticker.localeCompare(b.ticker); // Secondary sort by ticker
    });
    return arr;
  })();

  const sortedPortfolioStocksMobile = (() => {
    const arr = [...portfolioStocks];
    arr.sort((a, b) => {
      const qa = portfolioHoldings[a.ticker] || 0;
      const qb = portfolioHoldings[b.ticker] || 0;
      const pa = a.currentPrice ?? 0;
      const pb = b.currentPrice ?? 0;
      const ca = a.percentChange ?? 0;
      const cb = b.percentChange ?? 0;
      const da = getHoldingDelta(a, qa);
      const db = getHoldingDelta(b, qb);

      let cmp = 0;
      switch (mobileSortKey) {
        case 'ticker':
          cmp = a.ticker.localeCompare(b.ticker);
          break;
        case 'quantity':
          cmp = qa - qb;
          break;
        case 'price':
          cmp = pa - pb;
          break;
        case 'percent':
          cmp = ca - cb;
          break;
        case 'delta':
          cmp = da - db;
          break;
      }
      if (!mobileAscending) cmp = -cmp;
      if (cmp !== 0) return cmp;
      return a.ticker.localeCompare(b.ticker);
    });
    return arr;
  })();

  const searchStocksForPortfolio = (searchTerm: string) => {
    if (!searchTerm || searchTerm.trim().length < 1) {
      setPortfolioSearchResults([]);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    // Exclude anything already present in holdings (even if quantity is currently 0 while editing)
    const currentHoldings = Object.keys(portfolioHoldings);
    const results = allStocks
      .filter(stock =>
        stock && stock.ticker && (
          stock.ticker.toLowerCase().includes(term) ||
          getCompanyName(stock.ticker).toLowerCase().includes(term)
        )
      )
      .filter(stock => stock && stock.ticker && !currentHoldings.includes(stock.ticker))
      .slice(0, 10);

    setPortfolioSearchResults(results);
  };

  const handlePortfolioSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPortfolioSearchTerm(value);
    searchStocksForPortfolio(value);
    setShowPortfolioSearch(value.length > 0);
    setSelectedIndex(-1); // Reset selection when search changes
  };

  const handleAddStock = (stock: StockData) => {
    // Track ticker click event
    event('ticker_click', {
      ticker: stock.ticker,
      source: 'portfolio_search'
    });

    onAddStock(stock.ticker, 1);
    setPortfolioSearchTerm('');
    setPortfolioSearchResults([]);
    setShowPortfolioSearch(false);
    setSelectedIndex(-1);
    searchInputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showPortfolioSearch || portfolioSearchResults.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev < portfolioSearchResults.length - 1 ? prev + 1 : prev;
          // Scroll into view
          setTimeout(() => {
            itemRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 0);
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : -1;
          // Scroll into view
          if (next >= 0) {
            setTimeout(() => {
              itemRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }, 0);
          }
          return next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < portfolioSearchResults.length) {
          const selectedStock = portfolioSearchResults[selectedIndex];
          if (selectedStock) {
            handleAddStock(selectedStock);
          }
        } else if (portfolioSearchResults.length > 0) {
          // If nothing selected, select first item
          const firstStock = portfolioSearchResults[0];
          if (firstStock) {
            handleAddStock(firstStock);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowPortfolioSearch(false);
        setSelectedIndex(-1);
        searchInputRef.current?.blur();
        break;
    }
  };

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
    itemRefs.current = [];
  }, [portfolioSearchResults]);
  if (loading) {
    return (
      <section className="portfolio">
        <div className="section-header">
          <div className="header-main">
            <h2 className="portfolio-header">
              <SectionIcon type="pie" size={20} className="section-icon" />
              <span>Portfolio</span>
            </h2>
          </div>
        </div>
        <SectionLoader message="Loading portfolio..." />
      </section>
    );
  }

  return (
    <section className="portfolio">
      <div className="section-header flex flex-col lg:flex-row items-center gap-4 lg:gap-0">
        <div className="header-main w-full lg:w-auto flex justify-center lg:justify-start">
          <h2>
            <SectionIcon type="pie" size={20} className="section-icon" />
            <span>Portfolio</span>
          </h2>
        </div>
        <div className="portfolio-search-wrapper w-full flex justify-center lg:justify-end">
          <div className="portfolio-search-container w-full max-w-md">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by ticker or company name..."
              value={portfolioSearchTerm}
              onChange={handlePortfolioSearchChange}
              onKeyDown={handleKeyDown}
              className="portfolio-search-input text-center lg:text-left"
              aria-label="Search stocks to add to portfolio"
              aria-expanded={showPortfolioSearch}
              aria-haspopup="listbox"
              role="combobox"
            />
            {showPortfolioSearch && portfolioSearchResults.length > 0 && (
              <div
                ref={resultsRef}
                className="portfolio-search-results"
                role="listbox"
                aria-label="Search results"
              >
                {portfolioSearchResults.map((stock, index) => (
                  <div
                    key={stock.ticker}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    className={`portfolio-search-result-item ${selectedIndex === index ? 'selected' : ''}`}
                    onClick={() => handleAddStock(stock)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    role="option"
                    aria-selected={selectedIndex === index}
                  >
                    <div className="portfolio-search-result-logo">
                      <CompanyLogo ticker={stock.ticker} {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} size={24} priority={true} /> {/* Search results sú vždy priority */}
                    </div>
                    <div className="portfolio-search-result-info">
                      <div className="portfolio-search-result-ticker">{stock.ticker}</div>
                      <div className="portfolio-search-result-name">{getCompanyName(stock.ticker)}</div>
                    </div>
                    <button
                      className="portfolio-add-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onAddStock(stock.ticker, 1);
                        setPortfolioSearchTerm('');
                        setPortfolioSearchResults([]);
                        setShowPortfolioSearch(false);
                        searchInputRef.current?.blur();
                      }}
                      aria-label={`Add ${stock.ticker} to portfolio`}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Cards layout */}
      <div className="lg:hidden flex-1 flex flex-col">
        {portfolioStocks.length === 0 ? (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3 py-16 px-4 min-h-[60vh] text-center"
            style={{
              background: '#0f0f0f',
            }}
          >
            <div
              className="text-6xl mb-2"
              style={{
                opacity: 0.3,
              }}
            >
              📊
            </div>
            <span
              className="text-base font-semibold"
              style={{
                color: '#ffffff',
              }}
            >
              Your portfolio is empty
            </span>
            <span
              className="text-sm max-w-xs"
              style={{
                color: 'rgba(255, 255, 255, 0.6)',
              }}
            >
              Add stocks to track your investments
            </span>
            <button
              onClick={() => {
                const input = document.querySelector('.portfolio-search-input') as HTMLInputElement;
                if (input) {
                  input.focus();
                  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className="mt-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold transition-colors"
              style={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.opacity = '0.8';
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              Find stocks to add →
            </button>
          </div>
        ) : (
          <div className="w-full">
            <div className="w-full bg-white dark:bg-gray-900 border-none outline-none ring-0 rounded-none overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
              {/* Header row (mobile): align with PortfolioCardMobile grid - clickable for sorting */}
              <div className="px-3 py-2 bg-slate-50/80 dark:bg-white/5 text-xs font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wide">
                <div className="grid items-center gap-x-1.5 min-w-0 [grid-template-columns:minmax(56px,1fr)_56px_72px_56px_52px]">
                  <button
                    type="button"
                    onClick={() => {
                      if (mobileSortKey === 'ticker') {
                        setMobileAscending((v) => !v);
                      } else {
                        setMobileSortKey('ticker');
                        setMobileAscending(true);
                      }
                    }}
                    className="text-xs text-gray-400 dark:text-gray-400 font-semibold text-center cursor-pointer hover:opacity-70 transition-opacity flex items-center justify-center gap-0.5 px-1 py-0.5 rounded border-none bg-transparent uppercase tracking-wide"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Sort by ticker"
                  >
                    Ticker
                    {mobileSortKey === 'ticker' && (
                      <span className="text-[9px] text-gray-500 dark:text-gray-400">{mobileAscending ? '▲' : '▼'}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (mobileSortKey === 'quantity') {
                        setMobileAscending((v) => !v);
                      } else {
                        setMobileSortKey('quantity');
                        setMobileAscending(false);
                      }
                    }}
                    className="text-xs text-gray-400 dark:text-gray-400 font-semibold text-center cursor-pointer hover:opacity-70 transition-opacity flex items-center justify-center gap-0.5 px-1 py-0.5 rounded border-none bg-transparent uppercase tracking-wide"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Sort by quantity"
                  >
                    #
                    {mobileSortKey === 'quantity' && (
                      <span className="text-[9px] text-gray-500 dark:text-gray-400">{mobileAscending ? '▲' : '▼'}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (mobileSortKey === 'delta') {
                        setMobileAscending((v) => !v);
                      } else {
                        setMobileSortKey('delta');
                        setMobileAscending(false);
                      }
                    }}
                    className="text-xs text-gray-400 dark:text-gray-400 font-semibold text-center cursor-pointer hover:opacity-70 transition-opacity flex items-center justify-center gap-0.5 px-1 py-0.5 rounded border-none bg-transparent uppercase tracking-wide"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Sort by dollar change"
                  >
                    $
                    {mobileSortKey === 'delta' && (
                      <span className="text-[9px] text-gray-500 dark:text-gray-400">{mobileAscending ? '▲' : '▼'}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (mobileSortKey === 'percent') {
                        setMobileAscending((v) => !v);
                      } else {
                        setMobileSortKey('percent');
                        setMobileAscending(false);
                      }
                    }}
                    className="text-xs text-gray-400 dark:text-gray-400 font-semibold text-center cursor-pointer hover:opacity-70 transition-opacity flex items-center justify-center gap-0.5 px-1 py-0.5 rounded border-none bg-transparent uppercase tracking-wide"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Sort by percent"
                  >
                    %
                    {mobileSortKey === 'percent' && (
                      <span className="text-[9px] text-gray-500 dark:text-gray-400">{mobileAscending ? '▲' : '▼'}</span>
                    )}
                  </button>
                  <div className="text-center">X</div>
                </div>
              </div>

              {sortedPortfolioStocksMobile.map((stock, index) => {
                const quantity = portfolioHoldings[stock.ticker] || 0;

                return (
                  <PortfolioCardMobile
                    key={stock.ticker}
                    stock={stock}
                    quantity={quantity}
                    onRemoveStock={onRemoveStock}
                    onOpenDetails={openDetails}
                    priority={index < 10} // Only first 10 items have priority loading
                  />
                );
              })}
              {/* Total row for mobile */}
              <div className="p-4">
                <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300 font-semibold">Total Portfolio Value:</span>
                    <span className={`font-bold text-lg ${totalPortfolioValue >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrencyCompact(totalPortfolioValue, true)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile details bottom-sheet */}
        {isDetailsOpen && selectedStock && (
          <div
            className="fixed inset-0"
            style={{ zIndex: 1200 }}
            onClick={closeDetails}
            role="dialog"
            aria-modal="true"
            aria-label={`Portfolio details for ${selectedStock.ticker}`}
          >
            <div className="absolute inset-0 bg-black/35" />

            <div
              className="fixed inset-x-0 bottom-0 rounded-t-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
              style={{
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
                zIndex: 1201,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 pt-3 pb-2">
                <div className="mx-auto h-1.5 w-10 rounded-full bg-gray-200 dark:bg-gray-800" />
              </div>

              <div className="px-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {selectedStock.ticker}
                      {getCompanyName(selectedStock.ticker) ? (
                        <span className="text-gray-500 dark:text-gray-400 font-normal">
                          {' '}
                          · {getCompanyName(selectedStock.ticker)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                      Price:{' '}
                      <span className="font-mono tabular-nums">${formatPrice(selectedStock.currentPrice)}</span>
                      <span className="mx-2">•</span>
                      Change:{' '}
                      <span className="font-mono tabular-nums">{formatPercent(selectedStock.percentChange)}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                      Value:{' '}
                      <span className="font-mono tabular-nums">
                        {formatCurrencyCompact(calculatePortfolioValue(selectedStock), true)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeDetails}
                    className="w-11 h-11 flex items-center justify-center text-gray-700 dark:text-gray-200"
                    aria-label="Close details"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 w-10">
                    #
                  </div>
                  <PortfolioQuantityInput
                    value={selectedQuantity}
                    onChange={(v) => onUpdateQuantity(selectedStock.ticker, v)}
                    minValue={1}
                    className="w-24 px-2 py-2 text-[16px] rounded-md bg-transparent border border-gray-300/70 dark:border-slate-600/80 font-mono tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Quantity is already updated via onChange in PortfolioQuantityInput
                      // Just close the details sheet immediately
                      closeDetails();
                    }}
                    className="px-3 py-2 rounded-md bg-green-600 text-white text-sm font-semibold"
                    aria-label="Confirm quantity"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveStock(selectedStock.ticker);
                      closeDetails();
                    }}
                    className="ml-auto px-3 py-2 rounded-md bg-red-600 text-white text-sm font-semibold"
                    aria-label={`Remove ${selectedStock.ticker} from portfolio`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden lg:block portfolio-table-wrapper">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th className="portfolio-col-logo">Logo</th>
              <th
                className={`portfolio-col-ticker ${desktopSortKey === 'ticker' ? 'sortable active-sort' : 'sortable'}`}
                onClick={() => {
                  if (desktopSortKey === 'ticker') {
                    setDesktopAscending(v => !v);
                  } else {
                    setDesktopSortKey('ticker');
                    setDesktopAscending(true);
                  }
                }}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Ticker
              </th>
              <th
                className={`portfolio-col-company ${desktopSortKey === 'company' ? 'sortable active-sort' : 'sortable'}`}
                onClick={() => {
                  if (desktopSortKey === 'company') {
                    setDesktopAscending(v => !v);
                  } else {
                    setDesktopSortKey('company');
                    setDesktopAscending(true);
                  }
                }}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Company
              </th>
              <th
                className={`portfolio-col-sector ${desktopSortKey === 'sector' ? 'sortable active-sort' : 'sortable'}`}
                onClick={() => {
                  if (desktopSortKey === 'sector') {
                    setDesktopAscending(v => !v);
                  } else {
                    setDesktopSortKey('sector');
                    setDesktopAscending(true);
                  }
                }}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Sector
              </th>
              <th
                className={`portfolio-col-industry ${desktopSortKey === 'industry' ? 'sortable active-sort' : 'sortable'}`}
                onClick={() => {
                  if (desktopSortKey === 'industry') {
                    setDesktopAscending(v => !v);
                  } else {
                    setDesktopSortKey('industry');
                    setDesktopAscending(true);
                  }
                }}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Industry
              </th>
              <th
                className={`portfolio-col-quantity ${desktopSortKey === 'quantity' ? 'sortable active-sort' : 'sortable'}`}
                onClick={() => {
                  if (desktopSortKey === 'quantity') {
                    setDesktopAscending(v => !v);
                  } else {
                    setDesktopSortKey('quantity');
                    setDesktopAscending(false);
                  }
                }}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                #
              </th>
              <th
                className={`portfolio-col-price ${desktopSortKey === 'price' ? 'sortable active-sort' : 'sortable'}`}
                onClick={() => {
                  if (desktopSortKey === 'price') {
                    setDesktopAscending(v => !v);
                  } else {
                    setDesktopSortKey('price');
                    setDesktopAscending(false);
                  }
                }}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Price
              </th>
              <th
                className={`portfolio-col-change ${desktopSortKey === 'percent' ? 'sortable active-sort' : 'sortable'}`}
                onClick={() => {
                  if (desktopSortKey === 'percent') {
                    setDesktopAscending(v => !v);
                  } else {
                    setDesktopSortKey('percent');
                    setDesktopAscending(false);
                  }
                }}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                % Change
              </th>
              <th
                className={`portfolio-col-value ${desktopSortKey === 'value' ? 'sortable active-sort' : 'sortable'}`}
                onClick={() => {
                  if (desktopSortKey === 'value') {
                    setDesktopAscending(v => !v);
                  } else {
                    setDesktopSortKey('value');
                    setDesktopAscending(false);
                  }
                }}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Value
              </th>
              <th className="portfolio-col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {sortedPortfolioStocksDesktop.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-0 border-none">
                  <div
                    className="flex flex-col items-center justify-center gap-3 py-16 px-4"
                    style={{
                      background: '#0f0f0f',
                    }}
                  >
                    <div
                      className="text-6xl mb-2"
                      style={{
                        opacity: 0.3,
                      }}
                    >
                      📊
                    </div>
                    <span
                      className="text-base font-semibold"
                      style={{
                        color: '#ffffff',
                      }}
                    >
                      Your portfolio is empty
                    </span>
                    <span
                      className="text-sm text-center max-w-xs"
                      style={{
                        color: 'rgba(255, 255, 255, 0.6)',
                      }}
                    >
                      Add stocks to track your investments
                    </span>
                    <button
                      onClick={() => {
                        const input = document.querySelector('.portfolio-search-input') as HTMLInputElement;
                        if (input) {
                          input.focus();
                          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      className="mt-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold transition-colors"
                      style={{
                        WebkitTapHighlightColor: 'transparent',
                        touchAction: 'manipulation',
                      }}
                      onTouchStart={(e) => {
                        e.currentTarget.style.opacity = '0.8';
                      }}
                      onTouchEnd={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      Find stocks to add →
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {sortedPortfolioStocksDesktop.map((stock) => {
                  const quantity = portfolioHoldings[stock.ticker] || 0;
                  const value = calculatePortfolioValue(stock);

                  // Format price without decimals
                  const price = stock.currentPrice ?? 0;
                  const formattedPrice = isFinite(price) ? Math.round(price).toLocaleString('en-US') : '0';

                  // Format percent change with 2 decimal places
                  const percentChange = stock.percentChange ?? 0;
                  const formattedPercent = isFinite(percentChange)
                    ? `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%`
                    : '0.00%';

                  return (
                    <tr key={stock.ticker}>
                      {/* Logo */}
                      <td>
                        <div className="logo-container">
                          <CompanyLogo
                            ticker={stock.ticker}
                            logoUrl={stock.logoUrl || `/logos/${stock.ticker.toLowerCase()}-32.webp`}
                            size={32}
                            priority={true}
                          />
                        </div>
                      </td>

                      {/* Ticker */}
                      <td>
                        <strong>{stock.ticker}</strong>
                      </td>

                      {/* Company */}
                      <td className="company-name">
                        {getCompanyName(stock.ticker)}
                      </td>

                      {/* Sector */}
                      <td>{formatSectorName(stock.sector)}</td>

                      {/* Industry */}
                      <td>{stock.industry || 'N/A'}</td>

                      {/* Quantity */}
                      <td>
                        <PortfolioQuantityInput
                          value={quantity}
                          onChange={(newQuantity) => onUpdateQuantity(stock.ticker, newQuantity)}
                          className="min-w-[100px] w-24"
                        />
                      </td>

                      {/* Price */}
                      <td>${formattedPrice}</td>

                      {/* % Change */}
                      <td className={percentChange >= 0 ? 'positive' : 'negative'}>
                        {formattedPercent}
                      </td>

                      {/* Value */}
                      <td className={value >= 0 ? 'positive' : 'negative'}>
                        {formatCurrencyCompact(value, true)}
                      </td>

                      {/* Actions */}
                      <td>
                        <button
                          className="portfolio-delete-button"
                          onClick={() => onRemoveStock(stock.ticker)}
                          aria-label={`Remove ${stock.ticker} from portfolio`}
                          title="Remove from portfolio"
                        >
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {/* Divider row */}
                <tr>
                  <td colSpan={10} style={{ padding: 0, borderTop: '1px solid var(--clr-border, #e5e7eb)', height: '1px' }}></td>
                </tr>
                {/* Total row */}
                <tr className="portfolio-total-row">
                  <td colSpan={8} style={{ textAlign: 'right', fontWeight: 600, padding: '1rem 0.5rem', verticalAlign: 'middle' }}>
                    Total:
                  </td>
                  <td className={totalPortfolioValue >= 0 ? 'positive' : 'negative'} style={{ fontWeight: 600, padding: '1rem 0.5rem', whiteSpace: 'nowrap', verticalAlign: 'middle', minWidth: '120px' }}>
                    {formatCurrencyCompact(totalPortfolioValue, true)}
                  </td>
                  <td></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
