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

function detectOverlapsAndBounds(rows: ReturnType<typeof computeMobileTreemapSectors>['rows']) {
  let overlapCount = 0;
  let outOfBoundsCount = 0;
  const overlapDetails: string[] = [];

  for (const row of rows) {
    for (const sector of row.sectors) {
      const { width: secW, tilesHeight: secH } = sector;
      const tiles = sector.children;

      for (let i = 0; i < tiles.length; i++) {
        const a = tiles[i]!;

        if (a.x0 < 0 || a.y0 < 0 || a.x1 > secW || a.y1 > secH) {
          outOfBoundsCount++;
          overlapDetails.push(
            `${a.company.symbol}: OOB [${a.x0},${a.y0},${a.x1},${a.y1}] in ${secW}x${secH}`
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
              `${a.company.symbol} vs ${b.company.symbol}: overlap ${xOverlapPx}x${yOverlapPx}px at [${Math.max(a.x0, b.x0)},${Math.max(a.y0, b.y0)}]`
            );
          }
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
    columnGapPx: 3,
  });

  const { overlapCount, outOfBoundsCount, overlapDetails } = detectOverlapsAndBounds(result.rows);

  console.log(`\nMetric: ${metric}`);
  console.log(`Rows: ${result.rows.length}`);
  console.log(`Overlaps: ${overlapCount}`);
  console.log(`Out of bounds: ${outOfBoundsCount}`);
  if (overlapDetails.length > 0) {
    console.log('Details (first 10):');
    overlapDetails.slice(0, 10).forEach((d) => console.log(`  ${d}`));
  }
});
