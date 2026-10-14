import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { FINNHUB_API_KEY } from '@/lib/clients/finnhubClient';
import { getCompanyName } from '@/lib/companyNames';

// Cache news for 30 minutes to avoid hitting Finnhub on every page load
const NEWS_CACHE_TTL = 1800; // 30 minutes
const MAX_NEWS = 5;

export interface TickerNewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number; // unix timestamp
  image: string | null;
}

const NAME_STOPWORDS = new Set([
  'inc', 'corp', 'corporation', 'company', 'common', 'stock', 'class',
  'holdings', 'holding', 'group', 'ltd', 'llc', 'plc', 'adr', 'the', 'and',
  'co', 'sa', 'de', 'nv', 'se', 'ag', 'international', 'technologies',
]);

/**
 * Relevance check for Finnhub company-news items. Finnhub tags articles
 * loosely by theme/sector, so `related === symbol` is NOT proof the story
 * is about this company — require the headline to mention the ticker or
 * the company's brand token.
 */
export function isAboutTicker(item: { headline?: string | null }, symbol: string, companyName: string | null): boolean {
  const text = item.headline ?? '';
  if (symbol.length >= 3 && new RegExp(`\\b${symbol}\\b`).test(text)) return true;
  if (!companyName) return false;
  const tokens = companyName
    .split(/[^A-Za-z]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 4 && !NAME_STOPWORDS.has(t));
  const brand = tokens[0];
  if (brand && new RegExp(`\\b${brand}\\b`, 'i').test(text)) return true;
  if (tokens.length >= 2 && text.toLowerCase().includes(tokens.slice(0, 2).join(' '))) return true;
  return false;
}

/**
 * Shared news pipeline — used by /api/analysis/[ticker]/news (HTTP wrapper)
 * and by the analysis page SSR prefetch (top headline context strip, no
 * localhost hop). Redis 30-min cache; non-critical — returns [] on failure.
 */
export async function getTickerNews(symbol: string, companyName?: string | null): Promise<TickerNewsItem[]> {
  const cacheKey = `analysis:news:v2:${symbol}`;

  try {
    const cached = await getCachedData(cacheKey);
    if (cached && Array.isArray(cached)) {
      return cached as TickerNewsItem[];
    }
  } catch {}

  try {
    const toDate = new Date().toISOString().split('T')[0]!;
    const fromDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

    const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) return [];

    const rawNews: any[] = await res.json();
    if (!Array.isArray(rawNews) || rawNews.length === 0) return [];

    const resolvedName = companyName ?? getCompanyName(symbol) ?? null;
    const relevant = rawNews.filter((n: any) => n?.headline && isAboutTicker(n, symbol, resolvedName));

    const news: TickerNewsItem[] = relevant
      .slice(0, MAX_NEWS)
      .map((n: any) => ({
        id: n.id,
        headline: n.headline,
        summary: n.summary?.substring(0, 200) || '',
        source: n.source,
        url: n.url,
        datetime: n.datetime,
        image: n.image || null,
      }));

    try {
      await setCachedData(cacheKey, news, NEWS_CACHE_TTL);
    } catch {}

    return news;
  } catch (error) {
    console.error(`[news] Error fetching news for ${symbol}:`, error);
    return [];
  }
}
