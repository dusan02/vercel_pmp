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
        {/* MOBILE: Simple layout - Brand + Sign In */}
        <div className="lg:hidden flex items-center justify-between w-full">
          <div className="brand-container flex items-center gap-3">
            <BrandLogo size={40} className="brand-logo" />
            <h1 className="brand-minimal m-0">
              <span className="brand-name">
                <span className="brand-premarket">PreMarket</span>
                <span className="brand-price"> Price</span>
              </span>
            </h1>
          </div>
          <div className="flex items-center">
            <LoginButton />
          </div>
        </div>

        {/* DESKTOP: Full layout */}
        <div className="hidden lg:flex items-center justify-between w-full">
          {/* LEFT ZONE: Branding */}
          <div className="header-left">
            <div className="brand-container">
              <BrandLogo size={48} className="brand-logo" />
              <div className="brand-content">
                <h1 className="brand-minimal">
                  <span className="brand-name">
                    <span className="brand-premarket">PreMarket</span>
                    <span className="brand-price"> Price</span>
                  </span>
                </h1>
                <p className="brand-tagline">
                  Trade ahead of the market
                </p>
              </div>
            </div>
          </div>

          {/* CENTER ZONE: Market Indices */}
          <div className="header-center desktop-indices">
            <MarketIndices />
          </div>

          {/* RIGHT ZONE: Navigation & Login */}
          <div className="header-right flex items-center gap-4">
            {navigation}
            <div className="border-l pl-4 border-gray-700 h-6 flex items-center">
              <LoginButton />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
