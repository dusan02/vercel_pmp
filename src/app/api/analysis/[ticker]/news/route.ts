import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { FINNHUB_API_KEY } from '@/lib/clients/finnhubClient';

// Cache news for 30 minutes to avoid hitting Finnhub on every page load
const NEWS_CACHE_TTL = 1800; // 30 minutes
const MAX_NEWS = 5;

interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number; // unix timestamp
  image: string | null;
}

/**
 * GET /api/analysis/[ticker]/news
 * Fetches recent company news from Finnhub, cached in Redis for 30 minutes.
 * Falls back to in-memory cache if Redis is unavailable.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const cacheKey = `analysis:news:${symbol}`;

  // 1. Try Redis cache
  try {
    const cached = await getCachedData(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return NextResponse.json({ symbol, news: cached, cached: true });
    }
  } catch {}

  // 2. Fetch from Finnhub
  try {
    const toDate = new Date().toISOString().split('T')[0]!;
    const fromDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

    const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json(
        { symbol, news: [], error: `Finnhub returned ${res.status}` },
        { status: 200 } // Return 200 with empty array — news is non-critical
      );
    }

    const rawNews: any[] = await res.json();

    if (!Array.isArray(rawNews) || rawNews.length === 0) {
      return NextResponse.json({ symbol, news: [] });
    }

    // Map and limit
    const news: NewsItem[] = rawNews
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

    // 3. Cache in Redis
    try {
      await setCachedData(cacheKey, news, NEWS_CACHE_TTL);
    } catch {}

    return NextResponse.json({ symbol, news, cached: false });
  } catch (error) {
    console.error(`[news] Error fetching news for ${symbol}:`, error);
    return NextResponse.json(
      { symbol, news: [], error: 'Failed to fetch news' },
      { status: 200 } // Non-critical — return empty
    );
  }
}
