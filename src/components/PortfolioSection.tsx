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
import { formatCurrencyCompact, formatSectorName } from '@/lib/utils/format';
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

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
    searchInputRef.current?.focus();
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
      <div className="section-header">
        <div className="header-main">
          <h2 className="portfolio-header">
            <SectionIcon type="pie" size={20} className="section-icon" />
            <span>Portfolio</span>
          </h2>
        </div>
        <div className="portfolio-search-wrapper">
          <div className="portfolio-search-container">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by ticker or company name..."
              value={portfolioSearchTerm}
              onChange={handlePortfolioSearchChange}
              onKeyDown={handleKeyDown}
              className="portfolio-search-input"
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
                        onAddStock(stock.ticker, 1);
                        setPortfolioSearchTerm('');
                        setPortfolioSearchResults([]);
                        setShowPortfolioSearch(false);
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
      <div className="lg:hidden">
        {portfolioStocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
            <span>Your portfolio is empty.</span>
            <button
              onClick={() => {
                const input = document.querySelector('.portfolio-search-input') as HTMLInputElement;
                if (input) {
                  input.focus();
                  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className={BUTTON_PRIMARY_MD}
            >
              Find stocks to add →
            </button>
          </div>
        ) : (
          <div className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
            {portfolioStocks.map((stock, index) => {
              const quantity = portfolioHoldings[stock.ticker] || 0;
              const value = calculatePortfolioValue(stock);

              return (
                <PortfolioCardMobile
                  key={stock.ticker}
                  stock={stock}
                  quantity={quantity}
                  value={value}
                  onUpdateQuantity={onUpdateQuantity}
                  onRemoveStock={onRemoveStock}
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
        )}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden lg:block portfolio-table-wrapper">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th className="portfolio-col-logo">Logo</th>
              <th className="portfolio-col-ticker">Ticker</th>
              <th className="portfolio-col-company">Company</th>
              <th className="portfolio-col-sector">Sector</th>
              <th className="portfolio-col-industry">Industry</th>
              <th className="portfolio-col-quantity">#</th>
              <th className="portfolio-col-price">Price</th>
              <th className="portfolio-col-change">% Change</th>
              <th className="portfolio-col-value">Value</th>
              <th className="portfolio-col-actions"></th>
            </tr>
          </thead>
        <tbody>
          {portfolioStocks.length === 0 ? (
            <tr>
              <td colSpan={10} className="p-0 border-none">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
                  <span>Your portfolio is empty.</span>
                  <button
                    onClick={() => {
                      const input = document.querySelector('.portfolio-search-input') as HTMLInputElement;
                      if (input) {
                        input.focus();
                        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className={BUTTON_PRIMARY_MD}
                  >
                    Find stocks to add →
                  </button>
                </div>
              </td>
            </tr>
          ) : (
            <>
              {portfolioStocks.map((stock) => {
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
              {/* Total row */}
              <tr className="portfolio-total-row">
                <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600, padding: '1rem 0.5rem', verticalAlign: 'middle' }}>
                  Total:
                </td>
                <td className={totalPortfolioValue >= 0 ? 'positive' : 'negative'} style={{ fontWeight: 600, padding: '1rem 0.5rem', whiteSpace: 'nowrap', verticalAlign: 'middle', minWidth: '120px' }}>
                  {formatCurrencyCompact(totalPortfolioValue, true)}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      </div>
    </section>
  );
}
