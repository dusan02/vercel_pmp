/**
 * Portfolio Section Component
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { SectionIcon } from './SectionIcon';
import { SectionLoader } from './SectionLoader';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';
import { StockData } from '@/lib/types';

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
    const currentHoldings = Object.keys(portfolioHoldings).filter(t => portfolioHoldings[t] > 0);
    const results = allStocks
      .filter(stock => 
        stock.ticker.toLowerCase().includes(term) ||
        getCompanyName(stock.ticker).toLowerCase().includes(term)
      )
      .filter(stock => !currentHoldings.includes(stock.ticker))
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
                      <CompanyLogo ticker={stock.ticker} size={24} />
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
                      +
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
            <th>Company Name</th>
            <th>#</th>
            <th>Current Price</th>
            <th>% Change</th>
            <th>Value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {portfolioStocks.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--clr-subtext)' }}>
                No portfolio holdings. Add stocks by entering quantity in the # column.
              </td>
            </tr>
          ) : (
            <>
              {portfolioStocks.map((stock) => {
                const quantity = portfolioHoldings[stock.ticker] || 0;
                const value = calculatePortfolioValue(stock);
                
                return (
                  <tr key={stock.ticker}>
                    <td>
                      <div className="logo-container">
                        <CompanyLogo ticker={stock.ticker} size={32} />
                      </div>
                    </td>
                    <td>
                      <strong>{stock.ticker}</strong>
                    </td>
                    <td className="company-name">
                      {getCompanyName(stock.ticker)}
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={quantity === 0 ? '' : quantity.toString()}
                        onChange={(e) => {
                          let inputValue = e.target.value.trim();
                          inputValue = inputValue.replace(',', '.');
                          
                          if (inputValue === '' || inputValue === '.') {
                            onUpdateQuantity(stock.ticker, 0);
                            return;
                          }
                          
                          let cleanedValue = inputValue;
                          if (/^0+[1-9]/.test(cleanedValue)) {
                            cleanedValue = cleanedValue.replace(/^0+/, '');
                          }
                          
                          const newQuantity = parseFloat(cleanedValue);
                          if (!isNaN(newQuantity) && newQuantity >= 0 && isFinite(newQuantity)) {
                            onUpdateQuantity(stock.ticker, newQuantity);
                          }
                        }}
                        onBlur={(e) => {
                          const inputValue = e.target.value.trim();
                          if (inputValue === '' || inputValue === '.' || inputValue === '0') {
                            onUpdateQuantity(stock.ticker, 0);
                            e.target.value = '';
                          } else {
                            const parsed = parseFloat(inputValue);
                            if (!isNaN(parsed) && parsed >= 0 && isFinite(parsed)) {
                              const formatted = parsed % 1 === 0 
                                ? parsed.toString() 
                                : parsed.toString().replace(/\.?0+$/, '');
                              e.target.value = formatted;
                              onUpdateQuantity(stock.ticker, parsed);
                            } else {
                              onUpdateQuantity(stock.ticker, 0);
                              e.target.value = '';
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          const allowedKeys = [
                            'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 
                            'ArrowUp', 'ArrowDown', 'Tab', 'Enter'
                          ];
                          const isNumber = /[0-9]/.test(e.key);
                          const currentValue = e.currentTarget.value;
                          const hasDecimal = currentValue.includes('.') || currentValue.includes(',');
                          const isDecimal = (e.key === '.' || e.key === ',') && !hasDecimal;
                          if (!isNumber && !isDecimal && !allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                          }
                          if (e.key === ',') {
                            e.preventDefault();
                            const newValue = currentValue + '.';
                            e.currentTarget.value = newValue;
                            e.currentTarget.dispatchEvent(new Event('input', { bubbles: true }));
                          }
                        }}
                        className="portfolio-quantity-input"
                        placeholder="0"
                      />
                    </td>
                    <td>
                      ${(stock.currentPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={stock.percentChange >= 0 ? 'positive' : 'negative'}>
                      {stock.percentChange >= 0 ? '+' : ''}{stock.percentChange?.toFixed(2) || '0.00'}%
                    </td>
                    <td className={value >= 0 ? 'positive' : 'negative'}>
                      {Math.abs(value) < 0.01 
                        ? '$0.00' 
                        : `${value >= 0 ? '+' : '-'}$` + Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600, padding: '1rem 0.5rem' }}>
                  Total:
                </td>
                <td className={totalPortfolioValue >= 0 ? 'positive' : 'negative'} style={{ fontWeight: 600, padding: '1rem 0.5rem' }}>
                  {Math.abs(totalPortfolioValue) < 0.01 
                    ? '$0.00' 
                    : `${totalPortfolioValue >= 0 ? '+' : '-'}$` + Math.abs(totalPortfolioValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

