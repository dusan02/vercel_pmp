/**
 * Page Header Component
 * Single horizontal row: Brand | Market Indices | Navigation
 * All elements in one compact horizontal line
 */

import { BrandLogo } from './BrandLogo';
import { MarketIndices } from './MarketIndices';
import { LoginButton } from './LoginButton';

interface PageHeaderProps {
  navigation?: React.ReactNode;
}

export function PageHeader({ navigation }: PageHeaderProps) {
  return (
    <header className="header">
      <div className="header-container">
        {/* LEFT ZONE: Branding */}
        <div className="header-left">
          <div className="brand-container">
            <BrandLogo size={32} className="brand-logo" />
            <div className="brand-content">
              <h1 className="brand-minimal">
                <span className="brand-name">
                  <span className="brand-premarket">PreMarket</span>
                  <span className="brand-price"> Price</span>
                  <span className="brand-domain">.com</span>
                </span>
              </h1>
              <p className="brand-tagline">
                Trade ahead of the market
              </p>
            </div>
          </div>
        </div>

        {/* CENTER ZONE: Market Indices */}
        <div className="header-center">
          <MarketIndices />
        </div>

        {/* RIGHT ZONE: Navigation */}
        <div className="header-right flex items-center gap-4">
          {navigation}
          <div className="border-l pl-4 border-gray-700 h-6 flex items-center">
            <LoginButton />
          </div>
        </div>
      </div>
    </header>
  );
}
