'use client';

import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  size = 32, 
  className = '' 
}) => {
  // Candlestick chart dimensions
  const wickWidth = size * 0.06; // Thin wick
  const bodyWidth = size * 0.18; // Body width (slightly smaller to fit 4 candles)
  const spacing = size * 0.08; // Spacing between candles (tighter for 4 candles)
  const startX = size * 0.05;
  const baseY = size * 0.85;
  
  // Four candlesticks with different heights (like market movement)
  // Using blue color matching the heading: rgb(30 58 138)
  const blueColor = 'rgb(30 58 138)';
  
  // Candlesticks with varying heights (simulating market movement)
  // Index 1 and 3 (2nd and 4th) will be fully blue (no white fill)
  const candles = [
    {
      bodyTop: size * 0.5,      // Lower position
      bodyHeight: size * 0.2,   // Shorter
      wickTop: size * 0.4,
      wickHeight: size * 0.1,
      isFilled: false // White with blue border
    },
    {
      bodyTop: size * 0.15,     // Higher position
      bodyHeight: size * 0.55,  // Taller
      wickTop: size * 0.05,
      wickHeight: size * 0.1,
      isFilled: true // Fully blue
    },
    {
      bodyTop: size * 0.4,      // Medium position
      bodyHeight: size * 0.3,   // Medium height
      wickTop: size * 0.3,
      wickHeight: size * 0.1,
      isFilled: false // White with blue border
    },
    {
      bodyTop: size * 0.25,     // Higher position
      bodyHeight: size * 0.45,  // Taller
      wickTop: size * 0.15,
      wickHeight: size * 0.1,
      isFilled: true // Fully blue
    }
  ];
  
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
      {candles.map((candle, index) => {
        const x = startX + index * (bodyWidth + spacing);
        const centerX = x + bodyWidth / 2;
        const wickX = centerX - wickWidth / 2;
        
        // Use CSS variables for colors to support dark mode
        const strokeColor = 'var(--logo-candle-stroke, rgb(30 58 138))';
        const fillColor = candle.isFilled 
          ? strokeColor // Fully blue for 2nd and 4th candle
          : 'var(--logo-candle-fill, #ffffff)'; // White with blue border for 1st and 3rd
        const strokeWidth = size * 0.02; // Thin stroke width
        
        return (
          <g key={index}>
            {/* Top wick (thin vertical line above body) */}
            <rect
              x={wickX}
              y={candle.wickTop}
              width={wickWidth}
              height={candle.wickHeight}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={candle.isFilled ? 0 : strokeWidth}
              rx={wickWidth / 2}
            />
            {/* Body (rectangle) */}
            <rect
              x={x}
              y={candle.bodyTop}
              width={bodyWidth}
              height={candle.bodyHeight}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={candle.isFilled ? 0 : strokeWidth}
              rx={bodyWidth * 0.15}
            />
            {/* Bottom wick (thin vertical line below body) */}
            <rect
              x={wickX}
              y={candle.bodyTop + candle.bodyHeight}
              width={wickWidth}
              height={baseY - (candle.bodyTop + candle.bodyHeight)}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={candle.isFilled ? 0 : strokeWidth}
              rx={wickWidth / 2}
            />
          </g>
        );
      })}
    </svg>
  );
};

