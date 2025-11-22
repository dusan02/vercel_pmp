'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

interface CompanyLogoProps {
  ticker: string;
  size?: number;
  className?: string;
  priority?: boolean;
}

// Generate lightweight SVG placeholder (mini blurhash-like)
function generateLQPlaceholder(ticker: string, size: number): string {
  const initial = ticker.slice(0, 2).toUpperCase();
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];
  const color = colors[ticker.charCodeAt(0) % colors.length];

  return `data:image/svg+xml,${encodeURIComponent(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${color}" rx="4"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${Math.max(8, size * 0.3)}" font-weight="bold" 
            fill="white" text-anchor="middle" dominant-baseline="central">${initial}</text>
    </svg>`
  )}`;
}

export default function CompanyLogo({
  ticker,
  size = 32,
  className = '',
  priority = false
}: CompanyLogoProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(priority); // Start visible if priority
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate lightweight placeholder immediately (no layout shift)
  const placeholderSrc = useMemo(() => generateLQPlaceholder(ticker, size), [ticker, size]);

  // Intersection Observer for lazy loading (only if not priority)
  useEffect(() => {
    if (priority) {
      // Pre priority logá nastav isVisible okamžite (synchronne)
      setIsVisible(true);
      return;
    }

    // Pre non-priority logá použij Intersection Observer
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before visible
        threshold: 0.01
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [priority]);

  // Fetch logo when ticker changes, size changes, visibility changes, or priority changes
  // Zjednodušená logika - jeden useEffect namiesto dvoch
  useEffect(() => {
    // Pre priority logá alebo viditeľné logá nastav logoSrc
    if (priority || isVisible) {
      setHasError(false);
      setIsLoading(true);

      // Strategy: Use API endpoint as primary source
      // API will try: static file -> external API -> placeholder
      // This ensures consistent behavior and proper fallbacks
      const apiSrc = `/api/logo/${ticker}?s=${size}`;
      setLogoSrc(apiSrc);
    } else {
      // Pre non-priority a neviditeľné logá vymaž logoSrc
      setLogoSrc(null);
    }
  }, [ticker, size, isVisible, priority]);

  // Fallback placeholder component (used when image fails to load)
  const LogoPlaceholder = () => (
    <div
      className={`rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, size * 0.3),
        minWidth: size,
        minHeight: size
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

  // Generate srcset for responsive loading (different sizes)
  // Must be called before early return to follow Rules of Hooks
  const srcSet = useMemo(() => {
    if (!logoSrc) return '';
    const sizes = [size - 8, size, size + 8].filter(s => s > 0);
    return sizes.map(s => `${logoSrc.replace(`?s=${size}`, `?s=${s}`)} ${s}w`).join(', ');
  }, [logoSrc, size]);

  // If logo failed to load after all attempts, show placeholder
  // Also check if logoSrc is empty string (should not happen, but safety check)
  if (hasError || !logoSrc || logoSrc.trim() === '') {
    return <LogoPlaceholder />;
  }

  return (
    <div
      ref={containerRef}
      data-logo-ticker={ticker}
      style={{
        width: size,
        height: size,
        position: 'relative',
        flexShrink: 0 // Prevent layout shift
      }}
      className={className}
    >
      {isVisible && logoSrc && (
        <img
          src={logoSrc}
          srcSet={srcSet}
          sizes={`${size}px`}
          alt={`${ticker} company logo`}
          width={size}
          height={size}
          className="rounded-full"
          style={{
            objectFit: 'contain',
            display: 'block' // Remove inline spacing
          }}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'low'}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {isLoading && (
        <img
          src={placeholderSrc}
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 rounded-full"
          style={{
            objectFit: 'contain',
            display: 'block'
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}