'use client';

import { useState, useEffect } from 'react';

interface CompanyLogoProps {
  ticker: string;
  size?: number;
  className?: string;
  priority?: boolean;
}

export default function CompanyLogo({
  ticker,
  size = 32,
  className = '',
  priority = false
}: CompanyLogoProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Determine which size variant to use (32 or 64 for retina)
  const logoSize = size <= 32 ? 32 : 64;
  const logoSrc = `/logos/${ticker.toLowerCase()}-${logoSize}.webp`;
  
  // Reset state when ticker changes
  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
    
    // Debug: Log the logo path being requested
    console.log(`🔍 Loading logo for ${ticker}: ${logoSrc}`);
  }, [ticker, logoSrc]);
  
  // Fallback placeholder component
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

  // If logo failed to load, show placeholder
  if (hasError) {
    return <LogoPlaceholder />;
  }

  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <img
        src={logoSrc}
        alt={`${ticker} company logo`}
        width={size}
        height={size}
        className={`rounded-full ${className}`}
        style={{ 
          objectFit: 'contain'
        }}
        onLoad={() => {
          console.log(`✅ Logo loaded successfully for ${ticker}`);
          setIsLoading(false);
        }}
        onError={(e) => {
          console.log(`❌ Logo failed to load for ${ticker} at ${logoSrc}`, e);
          setHasError(true);
          setIsLoading(false);
        }}
      />
      {isLoading && (
        <div 
          className="absolute inset-0 rounded-full bg-gray-200 animate-pulse"
          style={{ width: size, height: size }}
        />
      )}
    </div>
  );
} 