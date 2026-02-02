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
      <div className="flex items-center justify-between w-full px-4 py-2 h-full">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={onLogoClick}
        >
          <BrandLogo size={24} />
          <span className="font-bold text-sm tracking-tight text-white">PreMarketPrice</span>
        </div>
        <div className="flex-shrink-0">
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
