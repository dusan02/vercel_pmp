import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { evaluateDipIdeaForSymbol } from '@/lib/tradingIdeas/dipEngine';

export const revalidate = 45;
const ITEM_CACHE_TTL = 45;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    const symbol = (ticker || '').toUpperCase().trim();
    if (!/^[A-Z][A-Z.]{0,6}$/.test(symbol)) {
      return NextResponse.json({ success: false, error: 'Invalid symbol' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === '1';
    const cacheKey = `dip:item:v3:${symbol}`;

    if (!forceRefresh) {
      try {
        const cached = await getCachedData(cacheKey);
        if (cached) {
          return NextResponse.json(cached, {
            headers: {
              'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
            },
          });
        }
      } catch {
        /* ignore cache error */
      }
    }

    const item = await evaluateDipIdeaForSymbol(symbol, true);
    if (!item) {
      return NextResponse.json(
        { success: false, error: `Insufficient historical data for ${symbol}` },
        { status: 404 }
      );
    }

    const responseBody = {
      success: true,
      data: item,
    };

    try {
      await setCachedData(cacheKey, responseBody, ITEM_CACHE_TTL);
    } catch {
      /* ignore */
    }

    return NextResponse.json(responseBody, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('[API /api/trading-ideas/[ticker]] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to evaluate ticker dip signal' },
      { status: 500 }
    );
  }
}
