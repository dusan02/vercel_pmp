import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

const DETAIL_CACHE_TTL = 3600; // 1 hour Redis cache per symbol
const SYMBOL_RE = /^[A-Z0-9.-]{1,10}$/;

export interface EarningsQuarterHistory {
  period: string;
  quarter: number | null;
  year: number | null;
  actual: number | null;
  estimate: number | null;
  surprise: number | null;
  surprisePercent: number | null;
}

export interface EarningsNewsItem {
  title: string;
  description: string | null;
  url: string;
  publisher: string | null;
  publishedUtc: string;
}

export interface EarningsTickerDetail {
  symbol: string;
  quarters: EarningsQuarterHistory[];
  beatCount: number;
  totalCount: number;
  avgSurprisePct: number | null;
  news: EarningsNewsItem[];
}

interface FinnhubQuarterRaw {
  period?: string;
  quarter?: number;
  year?: number;
  actual?: number | null;
  estimate?: number | null;
  surprise?: number | null;
  surprisePercent?: number | null;
}

interface PolygonNewsRaw {
  title?: string;
  description?: string;
  article_url?: string;
  published_utc?: string;
  publisher?: { name?: string };
}

async function fetchSymbolDetail(symbol: string): Promise<EarningsTickerDetail> {
  const cacheKey = `earnings:detail:v1:${symbol}`;
  try {
    const cached = (await getCachedData(cacheKey)) as EarningsTickerDetail | null;
    if (cached && Array.isArray(cached.quarters)) {
      return cached;
    }
  } catch {}

  const finnhubKey = process.env.FINNHUB_API_KEY || process.env.FINNHUB_TOKEN || '';
  const polygonKey = process.env.POLYGON_API_KEY || '';

  const [quartersRaw, newsRaw] = await Promise.all([
    finnhubKey
      ? fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(symbol)}&limit=4&token=${finnhubKey}`, {
          signal: AbortSignal.timeout(6000),
          next: { revalidate: 0 },
        })
          .then((r) => (r.ok ? (r.json() as Promise<FinnhubQuarterRaw[]>) : []))
          .catch(() => [] as FinnhubQuarterRaw[])
      : Promise.resolve([] as FinnhubQuarterRaw[]),
    polygonKey
      ? fetch(`https://api.polygon.io/v2/reference/news?ticker=${encodeURIComponent(symbol)}&limit=3&apiKey=${polygonKey}`, {
          signal: AbortSignal.timeout(6000),
          next: { revalidate: 0 },
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ results?: PolygonNewsRaw[] }>) : { results: [] }))
          .then((j) => j.results ?? [])
          .catch(() => [] as PolygonNewsRaw[])
      : Promise.resolve([] as PolygonNewsRaw[]),
  ]);

  const quarters: EarningsQuarterHistory[] = (Array.isArray(quartersRaw) ? quartersRaw : [])
    .slice(0, 4)
    .map((q) => {
      const actual = typeof q.actual === 'number' ? q.actual : null;
      const estimate = typeof q.estimate === 'number' ? q.estimate : null;
      const surprise = typeof q.surprise === 'number'
        ? q.surprise
        : actual !== null && estimate !== null ? actual - estimate : null;
      const surprisePercent = typeof q.surprisePercent === 'number'
        ? q.surprisePercent
        : actual !== null && estimate !== null && estimate !== 0
          ? ((actual - estimate) / Math.abs(estimate)) * 100
          : null;
      return {
        period: typeof q.period === 'string' ? q.period : '',
        quarter: typeof q.quarter === 'number' ? q.quarter : null,
        year: typeof q.year === 'number' ? q.year : null,
        actual,
        estimate,
        surprise,
        surprisePercent,
      };
    });

  const comparable = quarters.filter((q) => q.actual !== null && q.estimate !== null);
  const beatCount = comparable.filter((q) => (q.actual ?? 0) >= (q.estimate ?? 0)).length;
  const totalCount = comparable.length;
  const surprises = comparable
    .map((q) => q.surprisePercent)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const avgSurprisePct = surprises.length > 0
    ? surprises.reduce((acc, v) => acc + v, 0) / surprises.length
    : null;

  const news: EarningsNewsItem[] = (Array.isArray(newsRaw) ? newsRaw : [])
    .filter((n) => Boolean(n?.title && n?.article_url))
    .slice(0, 3)
    .map((n) => ({
      title: String(n.title),
      description: typeof n.description === 'string' && n.description.trim().length > 0
        ? n.description.trim()
        : null,
      url: String(n.article_url),
      publisher: typeof n.publisher?.name === 'string' ? n.publisher.name : null,
      publishedUtc: typeof n.published_utc === 'string' ? n.published_utc : '',
    }));

  const detail: EarningsTickerDetail = {
    symbol,
    quarters,
    beatCount,
    totalCount,
    avgSurprisePct,
    news,
  };

  if (quarters.length > 0 || news.length > 0) {
    try { await setCachedData(cacheKey, detail, DETAIL_CACHE_TTL); } catch {}
  }

  return detail;
}

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const single = sp.get('symbol')?.trim().toUpperCase();
  const multi = sp.get('symbols')?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) ?? [];

  const requested = single ? [single] : multi.slice(0, 10);
  const valid = [...new Set(requested)].filter((s) => SYMBOL_RE.test(s));

  if (valid.length === 0) {
    return NextResponse.json({ success: false, error: 'Missing or invalid symbol(s)' }, { status: 400 });
  }

  try {
    const results = await Promise.all(valid.map((sym) => fetchSymbolDetail(sym)));
    const bySymbol: Record<string, EarningsTickerDetail> = {};
    for (const item of results) {
      bySymbol[item.symbol] = item;
    }

    return NextResponse.json(
      {
        success: true,
        data: single ? results[0] : bySymbol,
        bySymbol,
      },
      {
        headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
      },
    );
  } catch (error) {
    console.error('[earnings/detail] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch earnings detail' }, { status: 500 });
  }
}
