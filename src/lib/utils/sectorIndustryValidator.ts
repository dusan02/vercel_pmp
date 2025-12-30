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

  // Find best match
  const lowerIndustry = industry.toLowerCase();
  for (const validIndustry of validIndustries) {
    if (lowerIndustry.includes(validIndustry.toLowerCase()) ||
        validIndustry.toLowerCase().includes(lowerIndustry)) {
      return validIndustry;
    }
  }

  return industry; // Return original if no match found
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

