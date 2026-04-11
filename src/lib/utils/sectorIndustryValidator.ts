/**
 * Sector/Industry Validator
 * 
 * Validates sector/industry combinations to prevent incorrect data
 */

// Valid sectors (from HEATMAP_DATA_STRUCTURE.md)
export const VALID_SECTORS = [
  'Basic Materials',
  'Communication Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Financial Services',
  'Healthcare',
  'Industrials',
  'Other',
  'Real Estate',
  'Technology',
  'Utilities'
] as const;

export type ValidSector = typeof VALID_SECTORS[number];

// Valid industries by sector
export const VALID_INDUSTRIES: Record<ValidSector, string[]> = {
  'Technology': [
    'Communication Equipment',
    'Consumer Electronics',
    'Internet Content & Information',
    'Semiconductor Equipment',
    'Semiconductors',
    'Software',
    'Software—Application',
    'Information Technology Services'
  ],
  'Financial Services': [
    'Asset Management',
    'Banks',
    'Capital Markets',
    'Credit Services',
    'Insurance',
    'Insurance—Diversified'
  ],
  'Consumer Cyclical': [
    'Apparel Retail',
    'Auto Manufacturers',
    'Discount Stores',
    'Footwear & Accessories',
    'Home Improvement Retail',
    'Internet Retail',
    'Lodging',
    'Restaurants',
    'Travel Services',
    'Residential Construction',
    'Auto & Truck Dealerships',
    'Specialty Retail',
    'Packaging & Containers'
  ],
  'Healthcare': [
    'Biotechnology',
    'Diagnostics & Research',
    'Drug Manufacturers',
    'Drug Manufacturers - General',
    'Medical Devices',
    'Healthcare Plans',
    'Medical Care Facilities',
    'Medical Distribution'
  ],
  'Energy': [
    'Oil & Gas Integrated',
    'Oil & Gas E&P',
    'Oil & Gas Refining & Marketing',
    'Oil & Gas Equipment & Services',
    'Oil & Gas Midstream'
  ],
  'Basic Materials': [
    'Chemicals',
    'Specialty Chemicals',
    'Other Industrial Metals & Mining',
    'Gold',
    'Copper'
  ],
  'Industrials': [
    'Aerospace & Defense',
    'Farm & Heavy Construction Machinery',
    'Specialty Industrial Machinery',
    'Integrated Freight & Logistics',
    'Railroads',
    'Trucking',
    'Waste Management',
    'Electrical Equipment & Parts'
  ],
  'Real Estate': [
    'REIT - Retail',
    'REIT - Industrial',
    'REIT - Specialty'
  ],
  'Utilities': [
    'Utilities - Regulated Electric',
    'Utilities - Renewable'
  ],
  'Communication Services': [
    'Telecom Services',
    'Entertainment'
  ],
  'Consumer Defensive': [
    'Packaged Foods',
    'Beverages - Non-Alcoholic',
    'Beverages - Alcoholic',
    'Household & Personal Products',
    'Tobacco',
    'Discount Stores',
    'Food Distribution',
    'Farm Products'
  ],
  'Other': [
    'Uncategorized'
  ]
};

/**
 * Validate sector/industry combination
 * @param sector - Sector name
 * @param industry - Industry name
 * @returns true if valid, false otherwise
 */
export function validateSectorIndustry(sector: string | null, industry: string | null): boolean {
  if (!sector || !industry) {
    return false;
  }

  // Check if sector is valid
  if (!VALID_SECTORS.includes(sector as ValidSector)) {
    return false;
  }

  // Check if industry is valid for this sector
  const validIndustries = VALID_INDUSTRIES[sector as ValidSector];
  if (!validIndustries) {
    return false;
  }

  // Check if industry matches any valid industry (fuzzy match)
  return validIndustries.some(validIndustry => 
    industry.toLowerCase().includes(validIndustry.toLowerCase()) ||
    validIndustry.toLowerCase().includes(industry.toLowerCase())
  );
}

/**
 * Normalize industry name to match valid industry
 * @param sector - Sector name
 * @param industry - Industry name to normalize
 * @returns Normalized industry name or null if no match
 */
export function normalizeIndustry(sector: string | null, industry: string | null): string | null {
  if (!sector || !industry) {
    return industry;
  }

  const validIndustries = VALID_INDUSTRIES[sector as ValidSector];
  if (!validIndustries) {
    return industry;
  }

  // Find best match (prefer longer/more specific matches)
  const lowerIndustry = industry.toLowerCase();
  let bestMatch: string | null = null;
  let bestMatchLength = 0;

  for (const validIndustry of validIndustries) {
    const lowerValid = validIndustry.toLowerCase();
    if (lowerIndustry.includes(lowerValid) || lowerValid.includes(lowerIndustry)) {
      // Prefer longer/more specific matches
      if (validIndustry.length > bestMatchLength) {
        bestMatch = validIndustry;
        bestMatchLength = validIndustry.length;
      }
    }
  }

  return bestMatch || industry; // Return best match or original if no match found
}

/**
 * Get all valid industries for a sector
 * @param sector - Sector name
 * @returns Array of valid industries or empty array
 */
export function getValidIndustries(sector: string | null): string[] {
  if (!sector || !VALID_SECTORS.includes(sector as ValidSector)) {
    return [];
  }

  return VALID_INDUSTRIES[sector as ValidSector] || [];
}

/**
 * Normalize a raw sector string from DB to a valid sector name.
 *
 * Handles:
 * - CAPS LOCK values: "TECHNOLOGY" → "Technology"
 * - Partial matches: "tech" → "Technology"
 * - Short garbage values: "K", "X" (< 3 chars) → "Other"
 * - Already-valid values: pass through unchanged
 *
 * @param raw - Raw sector value from DB (may be CAPS, partial, garbage)
 * @returns Valid sector name or "Other" as fallback
 */
export function normalizeSector(raw: string | null | undefined): string {
  if (!raw) return 'Other';
  const trimmed = raw.trim();
  if (!trimmed) return 'Other';

  // Too short to be a real sector name (garbage like "K", "X", "NA")
  if (trimmed.length < 3) return 'Other';

  // Exact match (already correct)
  if (VALID_SECTORS.includes(trimmed as ValidSector)) return trimmed;

  // Case-insensitive exact match (handles CAPS LOCK: "TECHNOLOGY" → "Technology")
  const lower = trimmed.toLowerCase();
  const exactCI = VALID_SECTORS.find(s => s.toLowerCase() === lower);
  if (exactCI) return exactCI;

  // Partial / fuzzy match (handles "tech", "financial", "consumer cyc" etc.)
  const partial = VALID_SECTORS.find(s =>
    s.toLowerCase().includes(lower) || lower.includes(s.toLowerCase())
  );
  if (partial) return partial;

  // Unrecognized → "Other"
  return 'Other';
}

/**
 * Normalize a raw industry string. If the industry looks like a garbage value
 * (too short, all caps with no spaces, etc.) returns 'Unknown'.
 * Otherwise passes through the original value since industry names are not
 * in a closed set — we rely on overrides for mis-classified tickers.
 */
export function normalizeRawIndustry(raw: string | null | undefined): string {
  if (!raw) return 'Unknown';
  const trimmed = raw.trim();
  if (!trimmed) return 'Unknown';

  // Too short to be a real industry name
  if (trimmed.length < 3) return 'Unknown';

  // All-uppercase with no spaces = likely a raw DB key/enum (e.g. "INTERNET_RETAIL")
  // Convert to Title Case as a best-effort display fix
  if (trimmed === trimmed.toUpperCase() && !/\s/.test(trimmed)) {
    // e.g. "INTERNET_RETAIL" → "Internet Retail"
    return trimmed
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  return trimmed;
}

/**
 * Apply sector/industry normalization for a ticker that has no override entry.
 * Use this wherever raw DB values are mapped to UI output.
 */
export function normalizeSectorIndustryPair(
  rawSector: string | null | undefined,
  rawIndustry: string | null | undefined
): { sector: string; industry: string } {
  return {
    sector: normalizeSector(rawSector),
    industry: normalizeRawIndustry(rawIndustry),
  };
}
