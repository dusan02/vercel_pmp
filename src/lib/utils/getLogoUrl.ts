import { tickerDomains, companyColors } from '@/data/companyInfo';

export function getLogoCandidates(ticker: string, size: number = 32): string[] {
  const domain = tickerDomains[ticker];
  const color = companyColors[ticker] || '0066CC';
  const avatarUrl = `https://ui-avatars.com/api/?name=${ticker}&background=${color}&size=${size}&color=fff&font-size=0.4&bold=true&format=png`;

  // If no domain mapping exists, return only ui-avatars
  if (!domain) {
    return [avatarUrl];
  }

  // Return priority list of sources
  return [
    // Primary: Clearbit (high quality)
    `https://logo.clearbit.com/${domain}?size=${size}`,
    // Secondary: Google Favicon (very reliable)
    `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`,
    // Tertiary: DuckDuckGo (good coverage)
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    // Fallback: Default avatar
    avatarUrl
  ];
}

// Deprecated: Kept for backward compatibility if used elsewhere, but prefers candidates
export function getLogoUrl(ticker: string): string {
  const candidates = getLogoCandidates(ticker, 32);
  return candidates[0] || '';
}

// Helper function to get just the domain
export function getDomain(ticker: string): string {
  const domain = tickerDomains[ticker];
  if (!domain) {
    throw new Error(`No domain mapping found for ticker: ${ticker}`);
  }
  return domain;
}

// Alternative function for Clearbit (if needed in future)
export function getClearbitLogoUrl(ticker: string): string {
  const domain = tickerDomains[ticker] ?? `${ticker.toLowerCase()}.com`;
  return `https://logo.clearbit.com/${domain}?size=32`;
}