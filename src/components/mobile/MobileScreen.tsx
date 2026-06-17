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
 * MobileScreen - Kontajner pre jednotlivé obrazovky s lazy loading.
 * Renderuje children keď je prvýkrát active (alebo prefetch=true).
 * Po prvom mount sa nikdy neodmountuje — zachováva scroll pozíciu a stav.
 */
export function MobileScreen({
  children,
  active = true,
  className = '',
  skeleton,
  prefetch = false,
  screenName = 'Screen'
}: MobileScreenProps) {
  // Single boolean: has this screen been mounted at least once?
  const [mounted, setMounted] = useState(active);

  useEffect(() => {
    if (!mounted && (active || prefetch)) {
      setMounted(true);
    }
  }, [active, prefetch, mounted]);

  const isLoading = !mounted;

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
      {mounted ? (
        <SectionErrorBoundary sectionName={screenName}>
          <Suspense fallback={loadingContent}>
            {children}
          </Suspense>
        </SectionErrorBoundary>
      ) : (
        loadingContent
      )}
    </div>
  );
}
