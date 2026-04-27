/**
 * Skript pre výpočet plochy normálneho a fullscreen zobrazenia heatmapy
 * 
 * Usage: tsx scripts/calculate-heatmap-area.ts
 */

// Typické rozlíšenia obrazovky
const SCREEN_SIZES = [
  { name: 'Full HD', width: 1920, height: 1080 },
  { name: '2K (QHD)', width: 2560, height: 1440 },
  { name: '4K (UHD)', width: 3840, height: 2160 },
  { name: 'Laptop (1366x768)', width: 1366, height: 768 },
  { name: 'Laptop (1920x1080)', width: 1920, height: 1080 },
  { name: 'Ultrawide (2560x1080)', width: 2560, height: 1080 },
  { name: 'Ultrawide (3440x1440)', width: 3440, height: 1440 },
];

// Konštanty z kódu
const HEADER_HEIGHT = 60; // približná výška headeru (px-2 py-1 + text-xl + text-[9px] + padding)
const EXIT_BUTTON_HEIGHT = 32; // top-2 + button height

console.log('\n📊 Výpočet plochy heatmapy - Normálne vs Fullscreen zobrazenie\n');
console.log('='.repeat(80));

SCREEN_SIZES.forEach(({ name, width, height }) => {
  // Normálne zobrazenie
  const normalWidth = width;
  const normalHeight = height - HEADER_HEIGHT;
  const normalArea = normalWidth * normalHeight;
  
  // Fullscreen zobrazenie
  const fullscreenWidth = width; // 100vw
  const fullscreenHeight = height; // 100vh (Exit button je absolute, neobmedzuje)
  const fullscreenArea = fullscreenWidth * fullscreenHeight;
  
  // Rozdiel
  const areaDifference = fullscreenArea - normalArea;
  const areaIncreasePercent = ((fullscreenArea - normalArea) / normalArea) * 100;
  
  console.log(`\n${name} (${width}x${height}):`);
  console.log(`  Normálne zobrazenie:  ${normalWidth}px × ${normalHeight}px = ${normalArea.toLocaleString()} px²`);
  console.log(`  Fullscreen zobrazenie: ${fullscreenWidth}px × ${fullscreenHeight}px = ${fullscreenArea.toLocaleString()} px²`);
  console.log(`  Rozdiel:              +${areaDifference.toLocaleString()} px² (+${areaIncreasePercent.toFixed(1)}%)`);
});

console.log('\n' + '='.repeat(80));
console.log('\n📐 Detaily:\n');

// Detailnejší výpočet pre Full HD
const exampleWidth = 1920;
const exampleHeight = 1080;
const headerHeight = 60;

const normalArea = exampleWidth * (exampleHeight - headerHeight);
const fullscreenArea = exampleWidth * exampleHeight;
const difference = fullscreenArea - normalArea;
const percentIncrease = (difference / normalArea) * 100;

console.log(`Príklad pre ${exampleWidth}x${exampleHeight} (Full HD):`);
console.log(`  Normálne zobrazenie:`);
console.log(`    - Šírka: ${exampleWidth}px (100% obrazovky)`);
console.log(`    - Výška: ${exampleHeight - headerHeight}px (${exampleHeight}px - ${headerHeight}px header)`);
console.log(`    - Plocha: ${normalArea.toLocaleString()} px²`);
console.log(`    - Percento obrazovky: ${((normalArea / (exampleWidth * exampleHeight)) * 100).toFixed(1)}%`);
console.log(`\n  Fullscreen zobrazenie:`);
console.log(`    - Šírka: ${exampleWidth}px (100vw)`);
console.log(`    - Výška: ${exampleHeight}px (100vh)`);
console.log(`    - Plocha: ${fullscreenArea.toLocaleString()} px²`);
console.log(`    - Percento obrazovky: 100.0%`);
console.log(`\n  Zvýšenie:`);
console.log(`    - Rozdiel: +${difference.toLocaleString()} px²`);
console.log(`    - Percentuálne zvýšenie: +${percentIncrease.toFixed(1)}%`);
console.log(`    - To je ${(difference / (exampleWidth * exampleHeight) * 100).toFixed(1)}% z celkovej obrazovky`);

console.log('\n✅ Výpočet dokončený!\n');

