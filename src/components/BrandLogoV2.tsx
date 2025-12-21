'use client';

import React from 'react';

interface BrandLogoV2Props {
  size?: number;
  className?: string;
  variant?: 'arrow' | 'chart' | 'modern';
}

/**
 * Modern Logo Option 1: Upward Trending Arrow with Chart Line
 * Represents growth, market movement, and forward momentum
 */
export const BrandLogoV2: React.FC<BrandLogoV2Props> = ({ 
  size = 32, 
  className = '',
  variant = 'arrow'
}) => {
  const strokeWidth = size * 0.08;
  const primaryColor = 'var(--logo-primary, rgb(30 58 138))';
  const accentColor = 'var(--logo-accent, rgb(16 185 129))'; // Green for growth
  
  if (variant === 'arrow') {
    // Modern Arrow Chart - Upward trending line with arrow
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="PreMarket Price Logo"
      >
        {/* Chart line - upward trend */}
        <path
          d={`M ${size * 0.15} ${size * 0.75} 
              Q ${size * 0.3} ${size * 0.6}, ${size * 0.5} ${size * 0.45}
              L ${size * 0.7} ${size * 0.3}`}
          stroke={primaryColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        
        {/* Arrow head */}
        <path
          d={`M ${size * 0.7} ${size * 0.3} 
              L ${size * 0.65} ${size * 0.35}
              M ${size * 0.7} ${size * 0.3}
              L ${size * 0.75} ${size * 0.35}`}
          stroke={primaryColor}
          strokeWidth={strokeWidth * 1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points (small circles) */}
        <circle cx={size * 0.15} cy={size * 0.75} r={size * 0.03} fill={primaryColor} />
        <circle cx={size * 0.5} cy={size * 0.45} r={size * 0.03} fill={primaryColor} />
        <circle cx={size * 0.7} cy={size * 0.3} r={size * 0.04} fill={accentColor} />
      </svg>
    );
  }
  
  if (variant === 'chart') {
    // Stylized "P" with Chart Line
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="PreMarket Price Logo"
      >
        {/* Letter P shape with chart line */}
        <path
          d={`M ${size * 0.2} ${size * 0.2} 
              L ${size * 0.2} ${size * 0.8}
              M ${size * 0.2} ${size * 0.2}
              Q ${size * 0.4} ${size * 0.2}, ${size * 0.5} ${size * 0.35}
              Q ${size * 0.4} ${size * 0.5}, ${size * 0.2} ${size * 0.5}
              M ${size * 0.5} ${size * 0.35}
              L ${size * 0.75} ${size * 0.25}`}
          stroke={primaryColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }
  
  // Modern - Enhanced candlestick with gradient
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PreMarket Price Logo"
    >
      {/* Modern candlesticks with better spacing */}
      {[0, 1, 2, 3].map((i) => {
        const x = size * 0.15 + i * (size * 0.25);
        const heights = [0.4, 0.7, 0.5, 0.8] as const;
        const isPositive = i % 2 === 1;
        const bodyHeight = size * (heights[i] ?? 0.5) * 0.4;
        const bodyTop = size * 0.6 - bodyHeight;
        
        return (
          <g key={i}>
            {/* Wick */}
            <line
              x1={x + size * 0.08}
              y1={size * 0.2}
              x2={x + size * 0.08}
              y2={size * 0.9}
              stroke={primaryColor}
              strokeWidth={strokeWidth * 0.5}
              strokeLinecap="round"
            />
            {/* Body */}
            <rect
              x={x}
              y={bodyTop}
              width={size * 0.16}
              height={bodyHeight}
              fill={isPositive ? accentColor : primaryColor}
              rx={size * 0.02}
              opacity={isPositive ? 0.9 : 0.7}
            />
          </g>
        );
      })}
    </svg>
  );
};

