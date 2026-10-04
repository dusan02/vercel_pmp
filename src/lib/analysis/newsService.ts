import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { FINNHUB_API_KEY } from '@/lib/clients/finnhubClient';

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

/**
 * Shared news pipeline — used by /api/analysis/[ticker]/news (HTTP wrapper)
 * and by the analysis page SSR prefetch (top headline context strip, no
 * localhost hop). Redis 30-min cache; non-critical — returns [] on failure.
 */
export async function getTickerNews(symbol: string): Promise<TickerNewsItem[]> {
  const cacheKey = `analysis:news:${symbol}`;

  try {
    const cached = await getCachedData(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
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

    const news: TickerNewsItem[] = rawNews
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
