/**
 * Page Header Component
 * Single horizontal row: Brand | Market Indices | Navigation
 * All elements in one compact horizontal line
 */

import { BrandLogo } from './BrandLogo';
import { MarketIndices } from './MarketIndices';
import { LoginButton } from './LoginButton';
import { ThemeToggle } from './ThemeToggle';

interface PageHeaderProps {
  navigation?: React.ReactNode;
  onLogoClick?: () => void;
}

export function PageHeader({ navigation, onLogoClick }: PageHeaderProps) {
  return (
    <header className="w-full bg-[var(--clr-surface)] border-b border-[var(--clr-border)] relative z-50 py-2 text-left sticky top-0 lg:static">
      <div className="flex items-center justify-between w-full max-w-[1400px] mx-auto px-2 sm:px-4 gap-2 sm:gap-4 flex-wrap lg:flex-nowrap">
        {/* MOBILE: Simple layout - Brand + Sign In */}
        <div className="lg:hidden flex items-center justify-between w-full">
          <div
            className="flex items-center gap-2 sm:gap-3 cursor-pointer"
            onClick={onLogoClick}
          >
            <BrandLogo size={40} className="flex-shrink-0" />
            <h1 className="font-['Space_Grotesk'] font-bold text-[0.9375rem] leading-[1.125rem] tracking-[-0.02em] m-0 text-[var(--clr-text)] whitespace-nowrap">
              <span className="flex flex-col sm:block justify-center gap-0">
                <span className="text-[var(--clr-text)]">PreMarket</span>
                <span className="text-[var(--clr-primary)]"> Price</span>
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LoginButton />
          </div>
        </div>

        {/* DESKTOP: New 2-row layout */}
        <div className="hidden lg:flex flex-col w-full gap-2">
          {/* TOP ROW: Brand | Indices | Sign In */}
          <div className="flex items-center justify-between w-full border-b border-[var(--clr-border-subtle)] pb-2">
            {/* Branding */}
            <div className="flex-none min-w-[200px] flex items-center">
              <div
                className="flex flex-col justify-center cursor-pointer hover:opacity-80 transition-opacity"
                onClick={onLogoClick}
              >
                <div className="flex items-center gap-3">
                  <BrandLogo size={42} className="flex-shrink-0" />
                  <h1 className="font-['Space_Grotesk'] font-bold text-2xl leading-none tracking-[-0.02em] m-0 text-[var(--clr-text)] whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <span className="text-[var(--clr-text)]">PreMarket</span>
                      <span className="text-blue-600"> Price</span>
                    </span>
                  </h1>
                </div>
                <p className="text-xs font-medium text-[var(--clr-subtext)] pl-[54px] -mt-1 tracking-wide">
                  Trade ahead of the market
                </p>
              </div>
            </div>

            {/* Indices */}
            <div className="flex-1 flex justify-center items-center px-4">
              <MarketIndices />
            </div>

            {/* Login & Theme */}
            <div className="flex-none flex items-center justify-end gap-2">
              <ThemeToggle />
              <LoginButton />
            </div>
          </div>

          {/* BOTTOM ROW: Navigation */}
          <div className="flex items-center justify-start w-full pt-1">
            <div className="w-full">
              {navigation}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
