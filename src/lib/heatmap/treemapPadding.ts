import type { SectorLabelVariant } from './types';
import { LAYOUT_CONFIG } from '@/lib/utils/heatmapConfig';

export type TreemapNodeType = 'root' | 'sector' | 'industry' | 'company' | undefined;

export interface DesktopTreemapPaddingConfig {
  padding: (type: TreemapNodeType) => number;
  paddingTop: (type: TreemapNodeType) => number;
  paddingBottom: (type: TreemapNodeType) => number;
}

/** Resolve the sector-label height used by the treemap padding. */
export function sectorLabelHeight(variant: SectorLabelVariant): number {
  if (variant === 'none') return 0;
  return variant === 'full'
    ? LAYOUT_CONFIG.SECTOR_LABEL_FULL.HEIGHT
    : LAYOUT_CONFIG.SECTOR_LABEL_COMPACT.HEIGHT;
}

/** Compute uniform padding accessors for desktop D3 treemap layout by label variant. */
export function getDesktopTreemapPadding(variant: SectorLabelVariant): DesktopTreemapPaddingConfig {
  const hideHierarchyChrome = variant === 'none';
  const labelH = sectorLabelHeight(variant);

  return {
    padding: (type) => {
      if (hideHierarchyChrome) return 0;
      if (type === 'sector') return LAYOUT_CONFIG.SECTOR_GAP;
      if (type === 'industry') return 1;
      return 0;
    },
    paddingTop: (type) => {
      if (hideHierarchyChrome) return 0;
      if (type === 'sector') return labelH;
      if (type === 'industry') return 14;
      return 0;
    },
    paddingBottom: (type) => (!hideHierarchyChrome && type === 'sector' ? 2 : 0),
  };
}
