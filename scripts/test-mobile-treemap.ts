/**
 * Standalone test script for mobile heatmap layout.
 * Run: npx tsx scripts/test-mobile-treemap.ts
 */

import { computeMobileTreemapSectors, prepareMobileTreemapData } from '../src/lib/heatmap/mobileTreemap';
import type { CompanyNode } from '../src/lib/heatmap/types';

function generateSectorData(sectorName: string, count: number, baseMarketCap: number): CompanyNode[] {
  const companies: CompanyNode[] = [];
  for (let i = 0; i < count; i++) {
    const marketCap = baseMarketCap * Math.pow(0.92, i);
    const changePercent = (Math.random() - 0.5) * 10;
    companies.push({
      symbol: `${sectorName.slice(0, 3)}${i}`,
      name: `Company ${i}`,
      sector: sectorName,
      industry: `${sectorName} Industry`,
      marketCap,
      changePercent,
      marketCapDiff: marketCap * (changePercent / 100),
      marketCapDiffAbs: Math.abs(marketCap * (changePercent / 100)),
    });
  }
  return companies;
}

function generateMixedData(): CompanyNode[] {
  const data: CompanyNode[] = [];
  data.push(...generateSectorData('Technology', 60, 2_500_000_000_000));
  data.push(...generateSectorData('Financial Services', 40, 800_000_000_000));
  data.push(...generateSectorData('Consumer Cyclical', 35, 600_000_000_000));
  data.push(...generateSectorData('Industrials', 30, 400_000_000_000));
  data.push(...generateSectorData('Healthcare', 35, 500_000_000_000));
  data.push(...generateSectorData('Consumer Defensive', 25, 350_000_000_000));
  data.push(...generateSectorData('Energy', 20, 300_000_000_000));
  data.push(...generateSectorData('Basic Materials', 15, 150_000_000_000));
  data.push(...generateSectorData('Communication Services', 18, 250_000_000_000));
  return data;
}

function detectOverlapsAndBounds(sectors: ReturnType<typeof computeMobileTreemapSectors>['sectors']) {
  let overlapCount = 0;
  let outOfBoundsCount = 0;
  const overlapDetails: string[] = [];

  for (const sector of sectors) {
    const secW = sector.x1 - sector.x0;
    const secH = sector.y1 - sector.y0;
    const tiles = sector.tiles;

    for (let i = 0; i < tiles.length; i++) {
      const a = tiles[i]!;

      // Check out of bounds relative to sector
      if (a.x0 < sector.x0 || a.y0 < sector.y0 || a.x1 > sector.x1 || a.y1 > sector.y1) {
        outOfBoundsCount++;
        overlapDetails.push(
          `${a.company.symbol}: OOB [${a.x0},${a.y0},${a.x1},${a.y1}] in sector [${sector.x0},${sector.y0},${sector.x1},${sector.y1}]`
        );
      }

      for (let j = i + 1; j < tiles.length; j++) {
        const b = tiles[j]!;
        const xOverlap = a.x0 < b.x1 && a.x1 > b.x0;
        const yOverlap = a.y0 < b.y1 && a.y1 > b.y0;
        if (xOverlap && yOverlap) {
          overlapCount++;
          const xOverlapPx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
          const yOverlapPx = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          overlapDetails.push(
            `${a.company.symbol} vs ${b.company.symbol}: overlap ${xOverlapPx}x${yOverlapPx}px`
          );
        }
      }
    }
  }

  return { overlapCount, outOfBoundsCount, overlapDetails };
}

const raw = generateMixedData();
const sorted = prepareMobileTreemapData(raw);

console.log(`Testing with ${sorted.length} companies`);

['percent', 'mcap'].forEach((metric) => {
  const result = computeMobileTreemapSectors(sorted, { width: 393, height: 720 }, metric as any, {
    sectorChromeHeightPx: 16,
  });

  const { overlapCount, outOfBoundsCount, overlapDetails } = detectOverlapsAndBounds(result.sectors);

  console.log(`\nMetric: ${metric}`);
  console.log(`Sectors: ${result.sectors.length}`);
  console.log(`Layout: ${result.width}x${result.height}`);
  console.log(`Overlaps: ${overlapCount}`);
  console.log(`Out of bounds: ${outOfBoundsCount}`);
  if (overlapDetails.length > 0) {
    console.log('Details (first 10):');
    overlapDetails.slice(0, 10).forEach((d) => console.log(`  ${d}`));
  }
});
