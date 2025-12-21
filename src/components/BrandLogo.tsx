'use client';

import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * Premium Fintech Logo Symbol
 * 
 * Design Concept:
 * - Abstract geometric mark combining market arrows + heatmap blocks
 * - Subtle motion feeling, sharp contrast, high information density
 * - Designed for investors and data-driven users
 * - Minimalist, Swiss-style design, ultra professional
 * - Flat vector, logo-mark only, no typography
 * 
 * Symbol Elements:
 * - Market arrows: Upward/downward trends (diagonal lines)
 * - Heatmap blocks: Varying sizes representing market cap
 * - Swiss precision: Clean geometric shapes, perfect alignment
 * - High density: Multiple elements in compact space
 * - Motion: Diagonal composition suggesting dynamic movement
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  size = 32, 
  className = '' 
}) => {
  // Premium fintech color palette
  const deepBlue = 'rgb(30 58 138)'; // Primary - trust, stability
  const graphite = 'rgb(51 65 85)'; // Secondary - precision
  const accentGreen = 'rgb(16 185 129)'; // Positive movement
  const accentRed = 'rgb(239 68 68)'; // Negative movement
  const lightGray = 'rgb(148 163 184)'; // Neutral/background
  
  // Dark mode colors
  const deepBlueDark = 'rgb(191 219 254)';
  const graphiteDark = 'rgb(148 163 184)';
  const accentGreenDark = 'rgb(16 185 129)';
  const accentRedDark = 'rgb(248 113 113)';
  const lightGrayDark = 'rgb(71 85 105)';
  
  // Swiss-style grid system
  const unit = size / 8; // 8-unit grid
  const strokeWidth = size * 0.08;
  
  // Heatmap blocks - varying sizes (market cap representation)
  const blockSize1 = unit * 1.2;
  const blockSize2 = unit * 1.8;
  const blockSize3 = unit * 2.4;
  
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
      <defs>
        <style>
          {`
            .logo-primary { fill: ${deepBlue}; stroke: ${deepBlue}; }
            .logo-secondary { fill: ${graphite}; stroke: ${graphite}; }
            .logo-accent-up { fill: ${accentGreen}; stroke: ${accentGreen}; }
            .logo-accent-down { fill: ${accentRed}; stroke: ${accentRed}; }
            .logo-neutral { fill: ${lightGray}; stroke: ${lightGray}; }
            
            .dark .logo-primary { fill: ${deepBlueDark}; stroke: ${deepBlueDark}; }
            .dark .logo-secondary { fill: ${graphiteDark}; stroke: ${graphiteDark}; }
            .dark .logo-accent-up { fill: ${accentGreenDark}; stroke: ${accentGreenDark}; }
            .dark .logo-accent-down { fill: ${accentRedDark}; stroke: ${accentRedDark}; }
            .dark .logo-neutral { fill: ${lightGrayDark}; stroke: ${lightGrayDark}; }
          `}
        </style>
      </defs>
      
      {/* Heatmap blocks - bottom left to top right (diagonal composition) */}
      {/* Large block - bottom left (negative) */}
      <rect
        x={unit * 0.5}
        y={size - unit * 2.5}
        width={blockSize3}
        height={blockSize3}
        className="logo-accent-down"
        rx={size * 0.02}
      />
      
      {/* Medium block - center left (neutral) */}
      <rect
        x={unit * 0.5}
        y={size - unit * 4.5}
        width={blockSize2}
        height={blockSize2}
        className="logo-neutral"
        rx={size * 0.02}
      />
      
      {/* Small block - top left (positive) */}
      <rect
        x={unit * 0.5}
        y={unit * 1}
        width={blockSize1}
        height={blockSize1}
        className="logo-accent-up"
        rx={size * 0.02}
      />
      
      {/* Medium block - center (primary) */}
      <rect
        x={size / 2 - blockSize2 / 2}
        y={size / 2 - blockSize2 / 2}
        width={blockSize2}
        height={blockSize2}
        className="logo-primary"
        rx={size * 0.02}
      />
      
      {/* Small block - top right (positive) */}
      <rect
        x={size - unit * 2.2}
        y={unit * 1}
        width={blockSize1}
        height={blockSize1}
        className="logo-accent-up"
        rx={size * 0.02}
      />
      
      {/* Medium block - bottom right (negative) */}
      <rect
        x={size - unit * 2.8}
        y={size - unit * 2.8}
        width={blockSize2}
        height={blockSize2}
        className="logo-accent-down"
        rx={size * 0.02}
      />
      
      {/* Market arrows - diagonal composition suggesting motion */}
      {/* Upward arrow - top left to center */}
      <path
        d={`M ${unit * 1.5} ${unit * 2}
            L ${size / 2 - unit} ${size / 2 - unit}
            M ${size / 2 - unit * 1.2} ${size / 2 - unit * 1.2}
            L ${size / 2 - unit} ${size / 2 - unit}
            M ${size / 2 - unit * 0.8} ${size / 2 - unit * 1.2}
            L ${size / 2 - unit} ${size / 2 - unit}`}
        className="logo-accent-up"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Downward arrow - center to bottom right */}
      <path
        d={`M ${size / 2 + unit} ${size / 2 + unit}
            L ${size - unit * 1.5} ${size - unit * 2}
            M ${size - unit * 1.7} ${size - unit * 1.8}
            L ${size - unit * 1.5} ${size - unit * 2}
            M ${size - unit * 1.3} ${size - unit * 1.8}
            L ${size - unit * 1.5} ${size - unit * 2}`}
        className="logo-accent-down"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Secondary motion lines - subtle diagonal grid */}
      {/* Top diagonal */}
      <line
        x1={unit * 2}
        y1={unit * 0.5}
        x2={size - unit * 2}
        y2={unit * 2.5}
        className="logo-secondary"
        strokeWidth={strokeWidth * 0.5}
        strokeLinecap="round"
        opacity={0.4}
      />
      
      {/* Bottom diagonal */}
      <line
        x1={unit * 0.5}
        y1={size - unit * 1.5}
        x2={size - unit * 0.5}
        y2={size - unit * 3.5}
        className="logo-secondary"
        strokeWidth={strokeWidth * 0.5}
        strokeLinecap="round"
        opacity={0.4}
      />
      
      {/* Precision dots - Swiss-style detail points */}
      <circle cx={size / 2} cy={size / 2} r={size * 0.015} className="logo-primary" />
      <circle cx={unit * 1.5} cy={unit * 2} r={size * 0.01} className="logo-accent-up" />
      <circle cx={size - unit * 1.5} cy={size - unit * 2} r={size * 0.01} className="logo-accent-down" />
    </svg>
  );
};
