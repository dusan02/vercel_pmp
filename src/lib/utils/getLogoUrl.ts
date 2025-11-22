import { tickerDomains, companyColors } from '@/data/companyInfo';

export function getLogoUrl(ticker: string): string {
  const domain = tickerDomains[ticker];

  // If no domain mapping exists, return ui-avatars directly
  if (!domain) {
    const color = companyColors[ticker] || '0066CC';
    return `https://ui-avatars.com/api/?name=${ticker}&background=${color}&size=32&color=fff&font-size=0.4&bold=true&format=png`;
  }

  // Try multiple logo sources for real company logos
  const logoSources = [
    // Primary: Clearbit (most reliable for real logos)
    `https://logo.clearbit.com/${domain}?size=32`,
    // Fallback: Google Favicon (works for most companies)
    `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
    // Secondary: DuckDuckGo favicon
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    // Last resort: ui-avatars with company colors
    `https://ui-avatars.com/api/?name=${ticker}&background=${companyColors[ticker] || '0066CC'}&size=32&color=fff&font-size=0.4&bold=true&format=png`
  ];

  // Return the first source (Clearbit) - fallback logic is in the component
  return logoSources[0] || `https://ui-avatars.com/api/?name=${ticker}&background=0066CC&size=32&color=fff&font-size=0.4&bold=true&format=png`;
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