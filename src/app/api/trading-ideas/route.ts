import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { evaluateTradingIdeasBoard } from '@/lib/tradingIdeas/dipEngine';

export const revalidate = 45;
const BOARD_CACHE_TTL = 45;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const extraRaw = searchParams.get('symbols') || '';
    const extraSymbols = extraRaw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z][A-Z.]{0,6}$/.test(s))
      .slice(0, 10);

    const forceRefresh = searchParams.get('refresh') === '1';
    const cacheKey = `dip:board:v2:${extraSymbols.slice().sort().join(',') || 'default'}`;

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

    const board = await evaluateTradingIdeasBoard(extraSymbols);
    const responseBody = {
      success: true,
      ...board,
    };

    try {
      await setCachedData(cacheKey, responseBody, BOARD_CACHE_TTL);
    } catch {
      /* ignore cache error */
    }

    return NextResponse.json(responseBody, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('[API /api/trading-ideas] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to evaluate trading ideas board' },
      { status: 500 }
    );
  }
}
