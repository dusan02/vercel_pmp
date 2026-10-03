import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ 
  size = 32, 
  className = '' 
}) => {
  const style: React.CSSProperties = { height: size, width: 'auto' };
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand-mark.png" alt="PreMarket Price" style={style} className={`dark:hidden ${className}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand-mark-light.png" alt="PreMarket Price" style={style} className={`hidden dark:block ${className}`} />
    </>
  );
};
