'use client';

import React from 'react';
import { BrandLogo } from '../BrandLogo';
import { LoginButton } from '../LoginButton';

/**
 * MobileHeader - Moderný minimalistický header
 * Len logo + brand + sign in
 */
export function MobileHeader() {
  return (
    <header className="mobile-app-header">
      <div className="mobile-app-header-content">
        <div className="mobile-app-brand">
          <BrandLogo />
          <span className="mobile-app-title">PreMarketPrice</span>
        </div>
        <LoginButton />
      </div>
    </header>
  );
}
