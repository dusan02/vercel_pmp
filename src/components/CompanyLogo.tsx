'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';

interface CompanyLogoProps {
  ticker: string;
  logoUrl?: string | null;
  size?: number;
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
      <rect width="${width}" height="${height}" fill="${color}" rx="2"/>
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

  const w = width ?? size;
  const h = height ?? size;

  // Generate lightweight placeholder immediately
  const placeholderSrc = useMemo(() => generateLQPlaceholder(ticker, w, h), [ticker, w, h]);

  // Unified strategy:
  // - Prefer *real* provided logoUrl if present
  // - But ignore "text avatar" sources (ui-avatars), because they look like letter-logos in tables
  // - Otherwise use our API endpoint (which prefers local `public/logos/*-32.webp`)
  const sanitizedLogoUrl = useMemo(() => {
    const raw = (logoUrl ?? '').trim();
    if (!raw) return '';
    if (/ui-avatars\.com\/api/i.test(raw)) return '';
    return raw;
  }, [logoUrl]);

  // Request a larger source when we're rendering at >= ~40px to avoid blurry / tiny wordmarks.
  // We only store static files at 32px + 64px, so stick to those.
  const requestSize = Math.min(64, Math.max(16, Math.min(64, (Math.max(w, h) >= 40 ? 64 : 32))));

  // Prefer icon-like sources (polygon icon_url / favicons) for small UI logos
  const logoSrc = sanitizedLogoUrl || `/api/logo/${encodeURIComponent(ticker)}?s=${requestSize}&prefer=icon`;

  // Fallback placeholder component using the generated LQ placeholder (Initials)
  const LogoPlaceholder = () => (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        width: w,
        height: h,
        minWidth: w,
        minHeight: h,
        borderRadius: 2,
        overflow: 'hidden',
        background: 'transparent',
      }}
      title={`${ticker}`}
    >
      <img
        src={placeholderSrc}
        alt={`${ticker} placeholder`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
        aria-hidden="true"
      />
    </div>
  );

  if (hasError) {
    return <LogoPlaceholder />;
  }

  return (
    <div
      data-logo-ticker={ticker}
      style={{
        width: w,
        height: h,
        position: 'relative',
        flexShrink: 0,
        borderRadius: 2, // Sharper corners (was 8)
        overflow: 'hidden',
        background: 'transparent',
      }}
      className={className}
    >
      <Image
        src={logoSrc}
        alt={`${ticker} logo`}
        width={w}
        height={h}
        className="company-logo-img"
        style={{
          objectFit: 'contain',
        }}
        priority={priority}
        loading={priority ? 'eager' : 'lazy'}
        {...(w >= 40 && h >= 40 ? {
          placeholder: 'blur',
          blurDataURL: placeholderSrc
        } : {})}
        onError={() => setHasError(true)}
        unoptimized={logoSrc.toLowerCase().endsWith('.svg') || logoSrc.includes('svg') || logoSrc.startsWith('/api/logo')}
      />
    </div>
  );
}