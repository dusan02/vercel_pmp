/**
 * SIC Code to Sector Mapping
 * Maps standard Industrial Classification (SIC) codes to broad market sectors.
 */

/**
 * Converts an ALL CAPS SIC description (e.g. "AIR COURIER SERVICES") to
 * proper Title Case (e.g. "Air Courier Services") for display in the UI.
 */
export function toTitleCase(str: string): string {
  if (!str) return str;
  return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

export function getSectorFromSic(sicCode: string | number | undefined | null): string | null {
  if (!sicCode) return null;
  
  const code = typeof sicCode === 'string' ? parseInt(sicCode, 10) : sicCode;
  if (isNaN(code)) return null;

  // 1. Technology
  if ((code >= 3570 && code <= 3579) || // Computer and Office Equipment
      (code >= 3600 && code <= 3699) || // Electronic & Other Electrical Equipment
      (code >= 3810 && code <= 3829) || // Search, Detection, Navigation, Instruments
      (code >= 4800 && code <= 4899) || // Communications
      (code >= 7370 && code <= 7389) || // Computer Programming, Data Processing, etc.
      (code >= 5060 && code <= 5065) || // Wholesale - Electronic Parts
      code === 8711) {                  // Engineering Services
    return 'Technology';
  }

  // 2. Real Estate (Check before Financial Services to avoid overlap)
  if (code >= 6500 && code <= 6599 || code === 6611 || code === 6798) {
    return 'Real Estate';
  }

  // 3. Financial Services
  if (code >= 6000 && code <= 6799) {
    return 'Financial Services';
  }

  // 4. Healthcare
  if ((code >= 2830 && code <= 2836) || // Drugs
      (code >= 3840 && code <= 3851) || // Medical Instruments
      (code >= 5120 && code <= 5129) || // Wholesale - Drugs
      (code >= 8000 && code <= 8099)) { // Health Services
    return 'Healthcare';
  }

  // 5. Consumer Cyclical (Consumer Discretionary)
  if ((code >= 2300 && code <= 2399) || // Apparel/Garments
      (code >= 3711 && code <= 3716) || // Motor Vehicles
      (code >= 4400 && code <= 4499) || // Water Transportation
      (code >= 4500 && code <= 4599) || // Air Transportation
      (code >= 5200 && code <= 5999) || // Retail Trade
      (code >= 7000 && code <= 7099) || // Hotels & Lodging
      (code >= 7800 && code <= 7999)) { // Motion Pictures/Amusement
    return 'Consumer Cyclical';
  }

  // 6. Consumer Defensive (Consumer Staples)
  if ((code >= 2000 && code <= 2199) || // Food & Tobacco
      (code >= 2840 && code <= 2844) || // Soaps/Cleaners/Toiletries
      (code >= 5140 && code <= 5149) || // Groceries Wholesalers
      (code >= 5400 && code <= 5499)) { // Food Stores
    return 'Consumer Defensive';
  }

  // 7. Energy
  if ((code >= 1300 && code <= 1389) || // Oil and Gas Extraction
      (code >= 2900 && code <= 2999)) { // Petroleum Refining
    return 'Energy';
  }

  // 8. Utilities
  if (code >= 4900 && code <= 4999 && code !== 4953) {
    return 'Utilities';
  }

  // 9. Industrials
  if ((code >= 1500 && code <= 1799) || // Construction
      (code >= 3300 && code <= 3499) || // Fabricated Metal
      (code >= 3500 && code <= 3599) || // Industrial Machinery
      (code >= 3700 && code <= 3799) || // Transportation Equipment
      (code >= 3800 && code <= 3829) || // Search/Detection/Navigation
      (code >= 4000 && code <= 4299) || // Railroads/Trucking
      (code >= 4600 && code <= 4699) || // Pipelines
      (code >= 4700 && code <= 4799) || // Transportation Services
      (code >= 5000 && code <= 5099) || // Wholesale - Durable Goods
      code === 4953) {                  // Refuse Systems (Waste Management)
    return 'Industrials';
  }

  // 10. Basic Materials
  if ((code >= 1000 && code <= 1299) || // Metal Mining
      (code >= 1400 && code <= 1499) || // Nonmetallic Minerals
      (code >= 2400 && code <= 2499) || // Lumber & Wood
      (code >= 2600 && code <= 2699) || // Paper & Allied Products
      (code >= 2800 && code <= 2899) || // Chemicals
      (code >= 3200 && code <= 3299)) { // Stone, Clay, Glass
    return 'Basic Materials';
  }

  // 11. Communication Services
  if (code >= 4800 && code <= 4899) {
    return 'Communication Services';
  }

  return null;
}
