/**
 * Page Header Component
 * Contains brand section and market indicators
 */

import React from 'react';
import { BrandLogo } from './BrandLogo';

export function PageHeader() {
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
          </div>
        </div>
      </div>
    </header>
  );
}
