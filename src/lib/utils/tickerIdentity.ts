/**
 * Single place where a ticker's display identity (name/sector/industry) is
 * resolved. Curated SECTOR_INDUSTRY_OVERRIDES win over raw DB values so every
 * surface (/api/stocks, heatmap, movers, earnings) shows the same label even
 * when the DB record hasn't been corrected yet.
 *
 * Sector/industry fall back to normalizeSectorIndustryPair canonicalization;
 * name falls back to the DB name, then the symbol itself.
 */

import { SECTOR_INDUSTRY_OVERRIDES } from '@/data/sectorIndustryOverrides';
import { normalizeSectorIndustryPair } from '@/lib/utils/sectorIndustryValidator';

export interface TickerIdentity {
  name: string;
  sector: string;
  industry: string;
}

export function resolveTickerIdentity(
  symbol: string,
  name: string | null | undefined,
  sector: string | null | undefined,
  industry: string | null | undefined
): TickerIdentity {
  const ov = SECTOR_INDUSTRY_OVERRIDES[symbol];
  const normalized = normalizeSectorIndustryPair(sector, industry);
  return {
    name: ov?.name || (name && name.trim() !== '' ? name : symbol),
    sector: ov?.sector ?? normalized.sector,
    industry: ov?.industry ?? normalized.industry,
  };
}
