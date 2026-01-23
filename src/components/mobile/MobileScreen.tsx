'use client';

import React, { ReactNode, useState, useEffect, Suspense } from 'react';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';

interface MobileScreenProps {
  children: ReactNode;
  active?: boolean;
  className?: string;
  skeleton?: ReactNode;
  prefetch?: boolean; // Prefetch content even when not active
  screenName?: string; // For error boundary
}

/**
 * MobileScreen - Kontajner pre jednotlivé obrazovky s lazy loading
 * - Renderuje children len keď je active (alebo prefetch je true)
 * - Zobrazuje skeleton počas načítania
 * - Podporuje smooth transitions
 * - Error boundary pre každý screen
 * 
 * Vylepšenia:
 * - Error boundary pre lepšiu error handling
 * - Lepšie loading states
 * - Accessibility improvements
 */
export function MobileScreen({ 
  children, 
  active = true, 
  className = '',
  skeleton,
  prefetch = false,
  screenName = 'Screen'
}: MobileScreenProps) {
  const [shouldRender, setShouldRender] = useState(active || prefetch);
  const [hasRendered, setHasRendered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Lazy load: render len keď je active alebo prefetch
  useEffect(() => {
    if (active || prefetch) {
      setShouldRender(true);
      // Označ ako rendered po prvom načítaní
      if (!hasRendered) {
        // Prefetch: oneskorenie 1s (neblokuje initial load)
        // Active: okamžité renderovanie
        const delay = prefetch && !active ? 1000 : 50;
        const timer = setTimeout(() => {
          setHasRendered(true);
          setIsLoading(false);
        }, delay);
        return () => clearTimeout(timer);
      } else {
        setIsLoading(false);
      }
    } else {
      setIsLoading(true);
    }
  }, [active, prefetch, hasRendered]);

  // Default skeleton loader - REFAKTOROVANÝ pre dark theme mobile
  const defaultSkeleton = (
    <div 
      className="p-4 space-y-3" 
      role="status" 
      aria-live="polite" 
      aria-label="Loading content"
      style={{
        background: '#0f0f0f',
      }}
    >
      <div 
        className="h-4 rounded animate-pulse" 
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
        }}
      />
      <div 
        className="h-4 rounded animate-pulse w-3/4" 
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
        }}
      />
      <div 
        className="h-4 rounded animate-pulse w-1/2" 
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
        }}
      />
    </div>
  );

  const loadingContent = skeleton || defaultSkeleton;

  return (
    <div 
      className={`mobile-app-screen ${active ? 'active' : ''} ${className}`}
      role="tabpanel"
      aria-hidden={!active}
      aria-busy={isLoading}
    >
      {shouldRender ? (
        <SectionErrorBoundary sectionName={screenName}>
          <Suspense fallback={loadingContent}>
            {hasRendered ? children : loadingContent}
          </Suspense>
        </SectionErrorBoundary>
      ) : (
        loadingContent
      )}
    </div>
  );
}
