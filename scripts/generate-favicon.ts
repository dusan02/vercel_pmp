/**
 * Script to generate favicon files from BrandLogo component
 * This creates PNG versions for different sizes
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

// SVG template based on BrandLogo component
const generateSVG = (size: number): string => {
  const wickWidth = size * 0.06;
  const bodyWidth = size * 0.18;
  const spacing = size * 0.08;
  const startX = size * 0.05;
  const baseY = size * 0.85;
  const blueColor = 'rgb(30, 58, 138)';
  
  const candles = [
    {
      bodyTop: size * 0.5,
      bodyHeight: size * 0.2,
      wickTop: size * 0.4,
      wickHeight: size * 0.1,
      isFilled: false
    },
    {
      bodyTop: size * 0.15,
      bodyHeight: size * 0.55,
      wickTop: size * 0.05,
      wickHeight: size * 0.1,
      isFilled: true
    },
    {
      bodyTop: size * 0.4,
      bodyHeight: size * 0.3,
      wickTop: size * 0.3,
      wickHeight: size * 0.1,
      isFilled: false
    },
    {
      bodyTop: size * 0.25,
      bodyHeight: size * 0.45,
      wickTop: size * 0.15,
      wickHeight: size * 0.1,
      isFilled: true
    }
  ];
  
  const svgParts = candles.map((candle, index) => {
    const x = startX + index * (bodyWidth + spacing);
    const centerX = x + bodyWidth / 2;
    const wickX = centerX - wickWidth / 2;
    const strokeWidth = size * 0.02;
    const fillColor = candle.isFilled ? blueColor : '#ffffff';
    const stroke = candle.isFilled ? 'none' : blueColor;
    
    return `
      <g>
        <rect x="${wickX}" y="${candle.wickTop}" width="${wickWidth}" height="${candle.wickHeight}" 
              fill="${fillColor}" stroke="${stroke}" stroke-width="${candle.isFilled ? 0 : strokeWidth}" 
              rx="${wickWidth / 2}"/>
        <rect x="${x}" y="${candle.bodyTop}" width="${bodyWidth}" height="${candle.bodyHeight}" 
              fill="${fillColor}" stroke="${stroke}" stroke-width="${candle.isFilled ? 0 : strokeWidth}" 
              rx="${bodyWidth * 0.15}"/>
        <rect x="${wickX}" y="${candle.bodyTop + candle.bodyHeight}" width="${wickWidth}" 
              height="${baseY - (candle.bodyTop + candle.bodyHeight)}" 
              fill="${fillColor}" stroke="${stroke}" stroke-width="${candle.isFilled ? 0 : strokeWidth}" 
              rx="${wickWidth / 2}"/>
      </g>`;
  }).join('');
  
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
    ${svgParts}
  </svg>`;
};

async function main() {
  const publicDir = join(process.cwd(), 'public');
  
  // Generate SVG favicon (32x32)
  const svg32 = generateSVG(32);
  writeFileSync(join(publicDir, 'favicon.svg'), svg32);
  console.log('✅ Generated favicon.svg');
  
  // Note: For PNG/ICO generation, you would need a library like sharp or canvas
  // For now, we'll use the SVG which modern browsers support
  console.log('📝 Note: SVG favicon created. For ICO/PNG, install sharp: npm install sharp');
  console.log('   Then convert SVG to PNG/ICO using image conversion tools.');
}

main().catch(console.error);

