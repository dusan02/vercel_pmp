import type { CompanyNode, HeatmapMetric, TreemapNode } from '@/lib/heatmap/types';
import { formatMarketCapDiff, formatPercent } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';

/**
 * Calculate sector summary (weighted avg % change or total mcap delta).
 * Uses pre-calculated weighted average from sector meta when available.
 */
export function calculateSectorSummary(sectorNode: TreemapNode, metric: HeatmapMetric): string | null {
  const sectorMeta = sectorNode.data.meta;

  if (metric === 'percent') {
    if (sectorMeta?.weightedAvgPercent !== undefined && !isNaN(sectorMeta.weightedAvgPercent)) {
      return formatPercent(sectorMeta.weightedAvgPercent);
    }
    return null;
  }

  const sectorCompanies = sectorNode.leaves()
    .map((leaf: any) => leaf.data.meta?.companyData)
    .filter((c): c is CompanyNode => c !== undefined && c !== null);

  if (sectorCompanies.length === 0) return null;

  const totalDelta = sectorCompanies.reduce((sum, c) => {
    if (!c || typeof c.marketCapDiff !== 'number') return sum;
    return sum + c.marketCapDiff;
  }, 0);

  if (Math.abs(totalDelta) < 0.01) return null;
  return formatMarketCapDiff(totalDelta);
}

/**
 * Truncate long sector names for display.
 * First formats the sector name to short version, then truncates if still too long.
 */
export function truncateSectorName(name: string, maxLength: number = 20): string {
  const formatted = formatSectorName(name);
  if (formatted.length <= maxLength) return formatted;
  const truncated = formatted.substring(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) {
    return truncated.substring(0, lastSpace) + '...';
  }
  return truncated + '...';
}

/**
 * Calculate maximum characters that fit in available width (rough estimate).
 */
export function calculateMaxCharsForWidth(sectorWidth: number, fontSize: number, padding: number = 12): number {
  const availableWidth = sectorWidth - padding;
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor(availableWidth / charWidth);
  return Math.max(4, maxChars);
}

