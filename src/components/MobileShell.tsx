'use client';

import React from 'react';
import { BottomNavigation } from './BottomNavigation';
import { MarketIndices } from './MarketIndices';
import { LoginButton } from './LoginButton';
import { BrandLogo } from './BrandLogo';

export type MobileView = 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks';

interface MobileShellProps {
  children?: React.ReactNode;
  activeView: MobileView;
  onViewChange: (view: MobileView) => void;
}

/**
 * MobileShell - App-like container for mobile views
 * Replaces scroll-to-sections with view switching
 * 
 * Structure (CSS Grid):
 * - Header row (brand + sign-in)
 * - Indices row
 * - Main content row (flexible, scrollable)
 * - Bottom navigation row
 * 
 * NOTE: Gating is done via CSS (lg:hidden) in parent, not JS detection
 */
export const MobileShell: React.FC<MobileShellProps> = ({
  children,
  activeView,
  onViewChange
}) => {
  return (
    <div className="mobile-shell">
      {/* Sticky Header - Brand + Sign In */}
      <header className="mobile-header">
        <div className="mobile-header-container">
          <div className="flex items-center gap-3">
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
      </header>

      {/* Sticky Market Indices Bar */}
      <div className="mobile-indices-bar">
        <MarketIndices />
      </div>

      {/* Main Content - Single View */}
      <main className="mobile-main-content">
        {children}
      </main>

      {/* Bottom Navigation + Safe Area Spacer */}
      <div className="bottom-navigation-wrapper">
        <BottomNavigation
          activeSection={activeView}
          onSectionChange={onViewChange}
        />
        {/* Safe-area spacer - separate element outside flex flow for predictable layout */}
        <div className="bottom-navigation-safearea" />
      </div>
    </div>
  );
};

