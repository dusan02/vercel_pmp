'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from './PageHeader';
import { BottomNavigation } from './BottomNavigation';
import { MarketIndices } from './MarketIndices';
import { LoginButton } from './LoginButton';
import { BrandLogo } from './BrandLogo';

export type MobileView = 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks';

interface MobileShellProps {
  children?: React.ReactNode;
  activeView: MobileView;
  onViewChange: (view: MobileView) => void;
  navigation?: React.ReactNode;
}

/**
 * MobileShell - App-like container for mobile views
 * Replaces scroll-to-sections with view switching
 * 
 * Structure:
 * - Sticky header (brand + sign-in)
 * - Optional sticky indices bar
 * - Main content (single view)
 * - Fixed bottom navigation
 */
export const MobileShell: React.FC<MobileShellProps> = ({
  children,
  activeView,
  onViewChange,
  navigation
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // Consistent with Tailwind lg breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Only render mobile shell on mobile devices
  if (!isMobile) {
    return <>{children}</>;
  }

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

      {/* Fixed Bottom Navigation */}
      <BottomNavigation
        activeSection={activeView}
        onSectionChange={onViewChange}
      />
    </div>
  );
};

