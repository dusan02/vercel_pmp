'use client';

import React, { ReactNode, useEffect } from 'react';

interface MobileAppProps {
  children: ReactNode;
}

/**
 * MobileApp - Moderný hlavný wrapper pre mobilnú aplikáciu
 * Poskytuje čistú štruktúru: header + content + tab bar
 * 
 * CRITICAL: Sets --app-height CSS variable based on visual viewport
 * This fixes iOS Safari issue where 100vh is larger than visible viewport
 */
export function MobileApp({ children }: MobileAppProps) {
  useEffect(() => {
    const setAppHeight = () => {
      // Use visualViewport if available (more accurate on iOS Safari/Chrome)
      // visualViewport excludes browser UI (address bar, toolbar) which innerHeight includes
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${Math.floor(h)}px`);
    };

    // Initial set
    setAppHeight();

    // Update on visualViewport resize (iOS Safari toolbar show/hide)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setAppHeight);
      window.visualViewport.addEventListener('scroll', setAppHeight);
    }

    // Fallback: window resize (desktop, older browsers)
    window.addEventListener('resize', setAppHeight);

    // Also update on orientation change
    window.addEventListener('orientationchange', setAppHeight);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setAppHeight);
        window.visualViewport.removeEventListener('scroll', setAppHeight);
      }
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
    };
  }, []);

  return (
    <div className="mobile-app">
      {children}
    </div>
  );
}
