import type { CompanyNode } from '@/lib/heatmap/types';
import type { MobileTreemapLeaf } from '@/lib/heatmap/mobileTreemap';

export type MobileHitSlopOptions = {
  /** Max radius (in px) around tap point to accept nearest tile. */
  radiusPx?: number;
};

/**
 * Mobile UX helper: pick a company from a tap point with a small "hit slop".
 * - If the tap is inside a tile, returns that tile's company.
 * - Otherwise picks the nearest tile center, but only if within radius.
 */
export function pickCompanyWithHitSlop(
  leaves: MobileTreemapLeaf[],
  px: number,
  py: number,
  options: MobileHitSlopOptions = {}
): CompanyNode | null {
  if (!Array.isArray(leaves) || leaves.length === 0) return null;

  const radiusPx = options.radiusPx ?? 20;
  const maxD2 = radiusPx * radiusPx;

  // 1) Prefer tile under the tap.
  for (const leaf of leaves) {
    if (px >= leaf.x0 && px <= leaf.x1 && py >= leaf.y0 && py <= leaf.y1) {
      return leaf.company ?? null;
    }
  }

  // 2) Otherwise pick nearest center.
  let best: MobileTreemapLeaf | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const leaf of leaves) {
    const cx = (leaf.x0 + leaf.x1) / 2;
    const cy = (leaf.y0 + leaf.y1) / 2;
    const dx = px - cx;
    const dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      best = leaf;
    }
  }

  if (!best || bestDist > maxD2) return null;
  return best.company ?? null;
}

