/**
 * Portfolio Section Component
 */

import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { SectionIcon } from './SectionIcon';
import { SectionLoader } from './SectionLoader';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';
import { StockData } from '@/lib/types';
import { PortfolioQuantityInput } from './PortfolioQuantityInput';
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
  };
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
              type="text"
              placeholder="Search by ticker or company name..."
              value={portfolioSearchTerm}
              onChange={handlePortfolioSearchChange}
              className="portfolio-search-input"
              aria-label="Search stocks to add to portfolio"
            />
            {showPortfolioSearch && portfolioSearchResults.length > 0 && (
              <div className="portfolio-search-results">
                {portfolioSearchResults.map((stock) => (
                  <div
                    key={stock.ticker}
                    className="portfolio-search-result-item"
                    onClick={() => {
                      onAddStock(stock.ticker, 1);
                      setPortfolioSearchTerm('');
                      setPortfolioSearchResults([]);
                      setShowPortfolioSearch(false);
                    }}
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

      <table>
        <thead>
          <tr>
            <th>Logo</th>
            <th>Ticker</th>
            <th>Company</th>
            <th>Sector</th>
            <th>Industry</th>
            <th>#</th>
            <th>Price</th>
            <th>% Change</th>
            <th>Value</th>
            <th></th>
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
                    <td>
                      <strong>{stock.ticker}</strong>
                    </td>
                    <td className="company-name">
                      {getCompanyName(stock.ticker)}
                    </td>
                    <td>{stock.sector || 'N/A'}</td>
                    <td>{stock.industry || 'N/A'}</td>
                    <td>
                      <PortfolioQuantityInput
                        value={quantity}
                        onChange={(newQuantity) => onUpdateQuantity(stock.ticker, newQuantity)}
                      />
                    </td>
                    <td>
                      ${formattedPrice}
                    </td>
                    <td className={percentChange >= 0 ? 'positive' : 'negative'}>
                      {formattedPercent}
                    </td>
                    <td className={value >= 0 ? 'positive' : 'negative'}>
                      {Math.abs(value) < 1
                        ? '$0'
                        : `${value >= 0 ? '+' : '-'}$` + Math.round(Math.abs(value)).toLocaleString('en-US')}
                    </td>
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
                <td colSpan={8} style={{ textAlign: 'right', fontWeight: 600, padding: '1rem 0.5rem' }}>
                  Total:
                </td>
                <td className={totalPortfolioValue >= 0 ? 'positive' : 'negative'} style={{ fontWeight: 600, padding: '1rem 0.5rem' }}>
                  {Math.abs(totalPortfolioValue) < 1
                    ? '$0'
                    : `${totalPortfolioValue >= 0 ? '+' : '-'}$` + Math.round(Math.abs(totalPortfolioValue)).toLocaleString('en-US')}
                </td>
                <td></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </section>
  );
}
