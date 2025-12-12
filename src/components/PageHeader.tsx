/**
 * Page Header Component
 * Contains brand section and market indicators
 */

import { BrandLogo } from './BrandLogo';
import { MarketIndices } from './MarketIndices';

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

        <MarketIndices />
      </div>
    </header>
  );
}
