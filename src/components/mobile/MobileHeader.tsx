'use client';

import React, { useState } from 'react';
import { BrandLogo } from '../BrandLogo';
import { LoginButton } from '../LoginButton';
import { ThemeToggle } from '../ThemeToggle';

/**
 * MobileHeader - Moderný minimalistický header
 * Len logo + brand + sign in
 */
interface MobileHeaderProps {
  onLogoClick?: () => void;
}

export function MobileHeader({ onLogoClick }: MobileHeaderProps) {
  const [isNavigating, setIsNavigating] = useState(false);

  const handleLogoClick = async () => {
    if (!onLogoClick) return;

    setIsNavigating(true);
    try {
      await onLogoClick();
    } finally {
      // Reset after animation completes
      setTimeout(() => setIsNavigating(false), 300);
    }
  };

  return (
    <header className="mobile-app-header">
      <div className="flex items-center justify-between w-full px-4 py-2 h-full">
        {/* Logo with expanded touch target and feedback */}
        <button
          className="flex items-center gap-2 cursor-pointer active:opacity-70 active:scale-95 transition-all p-2 -m-2 rounded-lg"
          onClick={handleLogoClick}
          disabled={isNavigating}
          aria-label="Navigate to heatmap"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          <div className={`transition-opacity ${isNavigating ? 'opacity-50' : ''}`}>
            <BrandLogo size={24} />
            <span className="font-bold text-sm tracking-tight text-white ml-2">
              PreMarketPrice
            </span>
          </div>
        </button>
        <div className="flex-shrink-0 flex items-center gap-2">
          <ThemeToggle className="text-white hover:bg-white/10" />
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
