import { NextRequest, NextResponse } from 'next/server';
import { getTickerNews } from '@/lib/analysis/newsService';

/**
 * GET /api/analysis/[ticker]/news — thin HTTP wrapper over getTickerNews
 * (Redis 30-min cache; non-critical endpoint, always 200).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const news = await getTickerNews(symbol);
  return NextResponse.json({ symbol, news });
}
