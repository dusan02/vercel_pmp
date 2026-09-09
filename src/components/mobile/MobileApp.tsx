'use client';

import React, { ReactNode, useEffect, useRef } from 'react';

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
  const rafRef = useRef<number>(0);
  const lastHRef = useRef<number>(-1);

  useEffect(() => {
    const setAppHeight = () => {
      // RAF throttle: prevent jank during iOS Safari toolbar animation
      if (rafRef.current) return;

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0;
        // Use visualViewport if available (more accurate on iOS Safari/Chrome)
        // visualViewport excludes browser UI (address bar, toolbar) which innerHeight includes
        const h = Math.floor(window.visualViewport?.height ?? window.innerHeight);
        // Only update if height actually changed (prevents 1px bounce repaints)
        if (h !== lastHRef.current) {
          lastHRef.current = h;
          document.documentElement.style.setProperty('--app-height', `${h}px`);
        }
      });
    };

    // Initial set
    setAppHeight();

    const vv = window.visualViewport;
    // Update on visualViewport resize (iOS Safari toolbar show/hide)
    vv?.addEventListener('resize', setAppHeight);
    vv?.addEventListener('scroll', setAppHeight);
    // Fallback: window resize (desktop, older browsers)
    window.addEventListener('resize', setAppHeight);
    // Also update on orientation change
    window.addEventListener('orientationchange', setAppHeight);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      vv?.removeEventListener('resize', setAppHeight);
      vv?.removeEventListener('scroll', setAppHeight);
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
    };
  }, []);

  return (
    <div
      className="mobile-app flex flex-col w-full overflow-hidden"
      style={{
        height: 'var(--app-height, 100dvh)',
        position: 'fixed',
        inset: 0,
        zIndex: 40 // Below navigation (z-100) to prevent conflicts
      }}
    >
      {children}
    </div>
  );
}
