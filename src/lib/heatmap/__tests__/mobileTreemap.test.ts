/**
 * Unit tests for mobile heatmap layout.
 *
 * Detects tile overlaps and out-of-bounds tiles which cause visual glitches
 * on mobile devices.
 */

import { computeMobileTreemapSectors, prepareMobileTreemapData } from '../mobileTreemap';
import type { CompanyNode } from '../types';

function generateSectorData(sectorName: string, count: number, baseMarketCap: number): CompanyNode[] {
  const companies: CompanyNode[] = [];
  for (let i = 0; i < count; i++) {
    const marketCap = baseMarketCap * Math.pow(0.92, i); // decreasing market caps
    // Deterministic pseudo-random based on index + sector name hash
    // (avoids Math.random() which makes tests flaky across CI runs)
    const seed = (sectorName.charCodeAt(0) * 31 + i * 7) % 100;
    const changePercent = ((seed / 100) - 0.5) * 10;
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
    const tiles = sector.tiles;

    for (let i = 0; i < tiles.length; i++) {
      const a = tiles[i]!;

      // Out of bounds relative to sector
      if (a.x0 < sector.x0 || a.y0 < sector.y0 || a.x1 > sector.x1 || a.y1 > sector.y1) {
        outOfBoundsCount++;
        overlapDetails.push(
          `${a.company.symbol}: OOB [${a.x0},${a.y0},${a.x1},${a.y1}] in sector [${sector.x0},${sector.y0},${sector.x1},${sector.y1}]`
        );
      }

      // Overlaps with other tiles
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

describe('mobileTreemap layout', () => {
  it('produces no overlapping or out-of-bounds tiles for realistic mobile viewport', () => {
    const raw = generateMixedData();
    const sorted = prepareMobileTreemapData(raw);

    // Typical mobile viewport: iPhone 12 Pro / similar
    const result = computeMobileTreemapSectors(sorted, { width: 393, height: 720 }, 'percent', {
      sectorChromeHeightPx: 16,
    });

    expect(result.sectors.length).toBeGreaterThan(0);

    const { overlapCount, outOfBoundsCount, overlapDetails } = detectOverlapsAndBounds(result.sectors);

    if (overlapCount > 0 || outOfBoundsCount > 0) {
      console.error('Layout issues:', overlapDetails.slice(0, 20));
    }

    expect(overlapCount).toBe(0);
    expect(outOfBoundsCount).toBe(0);
  });

  it('produces no overlapping or out-of-bounds tiles for mcap metric', () => {
    const raw = generateMixedData();
    const sorted = prepareMobileTreemapData(raw);

    const result = computeMobileTreemapSectors(sorted, { width: 393, height: 720 }, 'mcap', {
      sectorChromeHeightPx: 16,
    });

    const { overlapCount, outOfBoundsCount, overlapDetails } = detectOverlapsAndBounds(result.sectors);

    if (overlapCount > 0 || outOfBoundsCount > 0) {
      console.error('Layout issues (mcap):', overlapDetails.slice(0, 20));
    }

    expect(overlapCount).toBe(0);
    expect(outOfBoundsCount).toBe(0);
  });

  it('produces no overlapping tiles for narrow viewport', () => {
    const raw = generateMixedData();
    const sorted = prepareMobileTreemapData(raw);

    const result = computeMobileTreemapSectors(sorted, { width: 320, height: 568 }, 'percent', {
      sectorChromeHeightPx: 16,
    });

    const { overlapCount, outOfBoundsCount } = detectOverlapsAndBounds(result.sectors);
    expect(overlapCount).toBe(0);
    expect(outOfBoundsCount).toBe(0);
  });
});
