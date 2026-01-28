'use client';

import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';

interface CompanyLogoProps {
  ticker: string;
  logoUrl?: string;
  size?: number;
  /** Optional explicit dimensions (useful for wordmark logos in tables). Defaults to size x size. */
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}

// Generate lightweight SVG placeholder (mini blurhash-like)
function generateLQPlaceholder(ticker: string, width: number, height: number): string {
  const initial = ticker.slice(0, 2).toUpperCase();
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];
  const color = colors[ticker.charCodeAt(0) % colors.length];
  const fontSize = Math.max(8, Math.min(width, height) * 0.3);

  return `data:image/svg+xml,${encodeURIComponent(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${color}" rx="6"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" 
            fill="white" text-anchor="middle" dominant-baseline="central">${initial}</text>
    </svg>`
  )}`;
}

export default function CompanyLogo({
  ticker,
  logoUrl,
  size = 32,
  width,
  height,
  className = '',
  priority = false
}: CompanyLogoProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  const w = width ?? size;
  const h = height ?? size;

  // Generate lightweight placeholder immediately (no layout shift)
  const placeholderSrc = useMemo(() => generateLQPlaceholder(ticker, w, h), [ticker, w, h]);

  // Unified strategy: Prioritize passed logoUrl, otherwise use API endpoint
  // API will try: static file -> Redis cache -> external API -> placeholder
  // Encode ticker to handle special characters like BRK.B
  const logoSrc = logoUrl || `/api/logo/${encodeURIComponent(ticker)}?s=${size}`;

  // Reset error state and loading state when ticker changes
  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
  }, [ticker, w, h]);

  // Check if image is already loaded (from cache) immediately on mount
  useEffect(() => {
    if (imgRef.current?.complete) {
      setIsLoading(false);
    }
  }, []);

  // Intersection Observer for ALL logos (including priority) to handle sorting/reordering
  // This ensures logos load correctly even when table is sorted and rows change position
  // Optimized: Only set up observer for non-priority logos, priority logos load immediately
  useEffect(() => {
    // Priority logos load immediately, no observer needed
    if (priority) {
      if (imgRef.current) {
        // If already complete, ensure loading state is false
        if (imgRef.current.complete) {
          setIsLoading(false);
        }
        // Force eager for priority
        imgRef.current.loading = 'eager';
      }
      return;
    }

    if (!imgRef.current) return;

    const img = imgRef.current;
    let observer: IntersectionObserver | null = null;

    // For non-priority logos, use large rootMargin to preload before visible
    const rootMargin = '2000px';

    // Use Intersection Observer to ensure images load when near viewport
    // This works even when table is sorted and rows change position
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && img && !img.complete) {
              // Force eager loading when visible
              img.loading = 'eager';
              observer?.disconnect();
            }
          });
        },
        {
          rootMargin,
          threshold: 0.01
        }
      );

      observer.observe(img);
    } else {
      // Fallback: check if near viewport and force load
      const checkAndLoad = () => {
        if (img && !img.complete) {
          const rect = img.getBoundingClientRect();
          const isNearViewport = rect.top < window.innerHeight + 2000;

          if (isNearViewport) {
            img.loading = 'eager';
          }
        }
      };

      checkAndLoad();
      const timeout = setTimeout(checkAndLoad, 200);

      return () => clearTimeout(timeout);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [ticker, priority]); // Re-run when priority changes (e.g., after sorting)

  // Fallback placeholder component (used when image fails to load)
  const LogoPlaceholder = () => (
    <div
      className={`flex items-center justify-center text-white font-bold ${className}`}
      style={{
        width: w,
        height: h,
        fontSize: Math.max(8, Math.min(w, h) * 0.3),
        minWidth: w,
        minHeight: h,
        borderRadius: 8,
        background: 'linear-gradient(135deg, #2563eb, #1e40af)',
        boxSizing: 'border-box',
      }}
      title={`${ticker} - Logo not available`}
    >
      {ticker.slice(0, 2).toUpperCase()}
    </div>
  );

  // Handle logo load error
  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // API endpoint should handle all fallbacks internally
    // If it still fails, show placeholder
    setHasError(true);
    setIsLoading(false);
  };

  // Handle successful load
  const handleLoad = () => {
    setIsLoading(false);
  };

  // If logo failed to load after all attempts, show placeholder
  if (hasError) {
    return <LogoPlaceholder />;
  }

  // Always show placeholder while loading
  const showPlaceholder = isLoading;

  return (
    <div
      data-logo-ticker={ticker}
      style={{
        width: w,
        height: h,
        position: 'relative',
        flexShrink: 0, // Prevent layout shift
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--clr-surface)',
        boxSizing: 'border-box',
        padding: 2,
      }}
      className={className}
    >
      {/* Show placeholder if loading */}
      {showPlaceholder && (
        <img
          src={placeholderSrc}
          alt=""
          width={w}
          height={h}
          className="absolute inset-0"
          style={{
            objectFit: 'contain',
            display: 'block',
            zIndex: 1,
            // Respect badge padding/border
            width: '100%',
            height: '100%',
          }}
          aria-hidden="true"
        />
      )}
      {/* Show actual logo - native lazy loading handles visibility */}
      <img
        ref={imgRef}
        src={logoSrc}
        alt={`${ticker} stock logo - ${ticker} company logo`}
        width={w}
        height={h}
        className="company-logo-img"
        style={{
          objectFit: 'contain',
          display: 'block',
          position: 'relative',
          zIndex: 2,
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.2s ease-in-out',
          width: '100%',
          height: '100%',
        }}
        // Native lazy loading: eager for priority (first 50), lazy for others
        // useLayoutEffect will force eager loading for non-priority images near viewport
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}