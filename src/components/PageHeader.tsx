/**
 * Page Header Component
 * Contains brand section, market indicators, and section toggles
 */

import React from 'react';
import { BrandLogo } from './BrandLogo';
import { SectionIcon } from './SectionIcon';

interface PageHeaderProps {
  showFavoritesSection: boolean;
  showPortfolioSection: boolean;
  showAllStocksSection: boolean;
  showEarningsSection: boolean;
  onToggleFavorites: (value: boolean) => void;
  onTogglePortfolio: (value: boolean) => void;
  onToggleAllStocks: (value: boolean) => void;
  onToggleEarnings: (value: boolean) => void;
}

export function PageHeader({
  showFavoritesSection,
  showPortfolioSection,
  showAllStocksSection,
  showEarningsSection,
  onToggleFavorites,
  onTogglePortfolio,
  onToggleAllStocks,
  onToggleEarnings
}: PageHeaderProps) {
  return (
    <header className="header">
      <div className="header-top">
        <div className="brand-section">
          <div className="brand-container">
            <BrandLogo size={40} className="brand-logo" />
            <div className="brand-content">
              <h1 className="brand-minimal">
                <span className="brand-name">
                  <span className="brand-premarket">PreMarket</span>
                  <span className="brand-price"> Price</span>
                  <span className="brand-domain">.com</span>
                </span>
              </h1>
              <p className="brand-tagline">
                Market data throughout the day
              </p>
            </div>
          </div>
        </div>

        <div className="market-indicators-section">
          <div className="market-indicators-container">
            <div className="market-indicators">
              <div className="market-indicator">
                <div className="indicator-header">
                  <h3 className="indicator-name">S&P 500</h3>
                  <span className="indicator-symbol">SPY</span>
                </div>
                <div className="indicator-values">
                  <div className="indicator-price">$4,123.45</div>
                  <div className="indicator-change positive">
                    <span>+0.85%</span>
                  </div>
                </div>
              </div>
              
              <div className="market-indicator">
                <div className="indicator-header">
                  <h3 className="indicator-name">NASDAQ</h3>
                  <span className="indicator-symbol">QQQ</span>
                </div>
                <div className="indicator-values">
                  <div className="indicator-price">$3,456.78</div>
                  <div className="indicator-change positive">
                    <span>+1.23%</span>
                  </div>
                </div>
              </div>
              
              <div className="market-indicator">
                <div className="indicator-header">
                  <h3 className="indicator-name">DOW</h3>
                  <span className="indicator-symbol">DIA</span>
                </div>
                <div className="indicator-values">
                  <div className="indicator-price">$32,456.78</div>
                  <div className="indicator-change negative">
                    <span>-0.45%</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="section-toggles-card">
              {/* Portfolio - 1. sekcia */}
              <label className="favorites-toggle-switch">
                <span className="toggle-label-text">
                  <SectionIcon type="pie" size={20} className="toggle-icon" />
                </span>
                <div className="toggle-controls">
                  <input
                    type="checkbox"
                    checked={showPortfolioSection}
                    onChange={(e) => onTogglePortfolio(e.target.checked)}
                    className="toggle-input"
                  />
                </div>
              </label>
              {/* Favorites - 3. sekcia */}
              <label className="favorites-toggle-switch">
                <span className="toggle-label-text">
                  <SectionIcon type="star" size={20} className="toggle-icon" />
                </span>
                <div className="toggle-controls">
                  <input
                    type="checkbox"
                    checked={showFavoritesSection}
                    onChange={(e) => onToggleFavorites(e.target.checked)}
                    className="toggle-input"
                  />
                </div>
              </label>
              {/* Today's Earnings - 4. sekcia */}
              <label className="favorites-toggle-switch">
                <span className="toggle-label-text">
                  <SectionIcon type="calendar" size={20} className="toggle-icon" />
                </span>
                <div className="toggle-controls">
                  <input
                    type="checkbox"
                    checked={showEarningsSection}
                    onChange={(e) => onToggleEarnings(e.target.checked)}
                    className="toggle-input"
                  />
                </div>
              </label>
              {/* All Stocks - 5. sekcia */}
              <label className="favorites-toggle-switch">
                <span className="toggle-label-text">
                  <SectionIcon type="globe" size={20} className="toggle-icon" />
                </span>
                <div className="toggle-controls">
                  <input
                    type="checkbox"
                    checked={showAllStocksSection}
                    onChange={(e) => onToggleAllStocks(e.target.checked)}
                    className="toggle-input"
                  />
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

