'use client';

import React, { ReactNode, useState, useEffect, Suspense } from 'react';

interface MobileScreenProps {
  children: ReactNode;
  active?: boolean;
  className?: string;
  skeleton?: ReactNode;
  prefetch?: boolean; // Prefetch content even when not active
}

/**
 * MobileScreen - Kontajner pre jednotlivé obrazovky s lazy loading
 * - Renderuje children len keď je active (alebo prefetch je true)
 * - Zobrazuje skeleton počas načítania
 * - Podporuje smooth transitions
 */
export function MobileScreen({ 
  children, 
  active = true, 
  className = '',
  skeleton,
  prefetch = false
}: MobileScreenProps) {
  const [shouldRender, setShouldRender] = useState(active || prefetch);
  const [hasRendered, setHasRendered] = useState(false);

  // Lazy load: render len keď je active alebo prefetch
  useEffect(() => {
    if (active || prefetch) {
      setShouldRender(true);
      // Označ ako rendered po prvom načítaní
      if (!hasRendered) {
        // Prefetch: oneskorenie 1s (neblokuje initial load)
        // Active: okamžité renderovanie
        const delay = prefetch && !active ? 1000 : 50;
        const timer = setTimeout(() => setHasRendered(true), delay);
        return () => clearTimeout(timer);
      }
    }
  }, [active, prefetch, hasRendered]);

  return (
    <div className={`mobile-app-screen ${active ? 'active' : ''} ${className}`}>
      {shouldRender ? (
        <Suspense fallback={skeleton || <div className="p-4 text-center text-gray-500">Loading...</div>}>
          {hasRendered ? children : (skeleton || <div className="p-4 text-center text-gray-500">Loading...</div>)}
        </Suspense>
      ) : (
        skeleton || null
      )}
    </div>
  );
}
