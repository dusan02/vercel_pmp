// Simplified utility for frontend/legacy use
// Note: The main logo logic is now in @/lib/services/logoFetcher and the API route.

export function getLogoCandidates(ticker: string, size: number = 32): string[] {
  const guessedDomain = `${ticker.toLowerCase()}.com`;
  const avatarUrl = `https://ui-avatars.com/api/?name=${ticker}&background=0066CC&color=fff&size=${size}&font-size=0.4&bold=true&format=png`;

  return [
    `https://logo.clearbit.com/${guessedDomain}?size=${size}`,
    `https://www.google.com/s2/favicons?domain=${guessedDomain}&sz=${size}`,
    `https://icons.duckduckgo.com/ip3/${guessedDomain}.ico`,
    avatarUrl
  ];
}

export function getLogoUrl(ticker: string): string {
  const candidates = getLogoCandidates(ticker, 32);
  return candidates[0] || '';
}
