import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  size = 32, 
  className = '' 
}) => {
  // SVG viewbox is 22x14, so it's wider than it is tall.
  const width = size * (22 / 14);
  
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 22 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PreMarket Price Logo"
    >
      {/* Top Row */}
      <rect x="0" y="0" width="6" height="6" rx="1.5" className="fill-emerald-400 dark:fill-emerald-500" />
      <rect x="8" y="0" width="6" height="6" rx="1.5" className="fill-emerald-600 dark:fill-emerald-600" />
      <rect x="16" y="0" width="6" height="6" rx="1.5" className="fill-red-400 dark:fill-red-500" />
      
      {/* Bottom Row */}
      <rect x="0" y="8" width="6" height="6" rx="1.5" className="fill-red-900 dark:fill-red-800" />
      <rect x="8" y="8" width="6" height="6" rx="1.5" className="fill-emerald-700 dark:fill-emerald-700" />
      <rect x="16" y="8" width="6" height="6" rx="1.5" className="fill-red-600 dark:fill-red-600" />
    </svg>
  );
};
