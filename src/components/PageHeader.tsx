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
  /** Right side of the nav row — stock search + fullscreen heatmap button */
  toolbar?: React.ReactNode;
  onLogoClick?: () => void;
  /** Market-session pill (PRE-MARKET/LIVE/…) — rendered next to auth controls */
  statusBadge?: React.ReactNode;
}

export function PageHeader({ navigation, toolbar, onLogoClick, statusBadge }: PageHeaderProps) {
  return (
    <header className="w-full bg-[var(--clr-surface)] border-b border-[var(--clr-border)] relative z-50 py-2 text-left sticky top-0 lg:static">
      <div className="flex items-center justify-between w-full max-w-screen-2xl mx-auto px-3 sm:px-6 gap-2 sm:gap-4 flex-wrap lg:flex-nowrap">
        {/* MOBILE: Simple layout - Brand + Sign In */}
        <div className="lg:hidden flex items-center justify-between w-full">
          <div
            className="flex items-center gap-2 sm:gap-3 cursor-pointer"
            onClick={onLogoClick}
          >
            <BrandLogo size={40} className="flex-shrink-0" />
            <div className="font-sans font-extrabold text-[1.05rem] leading-[1.125rem] tracking-tight m-0 text-gray-900 dark:text-white whitespace-nowrap">
              <span className="flex flex-col sm:block justify-center gap-0">
                <span>PreMarket</span>
                <span className="text-gray-500 dark:text-gray-400"> Price</span>
              </span>
            </div>
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
                  <div className="font-sans font-extrabold text-2xl leading-none tracking-tight m-0 text-gray-900 dark:text-white whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <span>PreMarket</span>
                      <span className="text-gray-500 dark:text-gray-400">Price</span>
                    </span>
                  </div>
                </div>
                
              </div>
            </div>

            {/* Indices */}
            <div className="flex-[2] flex items-center px-4 min-w-0">
              <MarketIndices />
            </div>

            {/* Session badge + Login & Theme */}
            <div className="flex-none flex items-center justify-end gap-2">
              {statusBadge}
              <ThemeToggle />
              <LoginButton />
            </div>
          </div>

          {/* BOTTOM ROW: Navigation | search + fullscreen toolbar */}
          <div className="flex items-center justify-between w-full pt-1 gap-3">
            <div className="min-w-0">
              {navigation}
            </div>
            {toolbar && (
              <div className="flex items-center gap-2 shrink-0">
                {toolbar}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
