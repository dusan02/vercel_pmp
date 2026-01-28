'use client';

import React from 'react';
import { BrandLogo } from '../BrandLogo';
import { LoginButton } from '../LoginButton';

/**
 * MobileHeader - Moderný minimalistický header
 * Len logo + brand + sign in
 */
interface MobileHeaderProps {
  onLogoClick?: () => void;
}

export function MobileHeader({ onLogoClick }: MobileHeaderProps) {
  return (
    <header className="mobile-app-header">
      <div className="mobile-app-header-content">
        <div
          className="mobile-app-brand cursor-pointer"
          onClick={onLogoClick}
        >
          <BrandLogo />
          <span className="mobile-app-title">PreMarketPrice</span>
        </div>
        <div className="flex-shrink-0">
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
