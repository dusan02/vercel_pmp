'use client';

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pageview } from '@/lib/ga';

/**
 * Internal component that uses useSearchParams (must be in Suspense)
 */
function GAListenerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Build the full URL with query parameters
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    
    // Track page view
    pageview(url);
  }, [pathname, searchParams]);

  return null; // This component doesn't render anything
}

/**
 * Google Analytics listener component
 * 
 * Tracks page views on route changes in Next.js App Router SPA.
 * This component should be mounted globally in the root layout.
 * Wrapped in Suspense to satisfy Next.js 16 requirements for useSearchParams.
 */
export function GAListener() {
  return (
    <Suspense fallback={null}>
      <GAListenerInner />
    </Suspense>
  );
}

