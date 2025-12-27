'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pageview } from '@/lib/ga';

/**
 * Google Analytics listener component
 * 
 * Tracks page views on route changes in Next.js App Router SPA.
 * This component should be mounted globally in the root layout.
 */
export function GAListener() {
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

