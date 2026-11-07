import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { mGetJsonMap } from '@/lib/redis/operations';

export type FavoriteSignalType = 'dip_buy' | 'oversold' | 'overbought' | 'unusual_move';

export interface FavoriteSignalItem {
  symbol: string;
  name: string | null;
  price: number | null;
  changePct: number | null;
  rsi14: number | null;
  zScore: number | null;
  type: FavoriteSignalType;
  label: string;
  tone: 'emerald' | 'amber' | 'rose' | 'blue';
}

const VALID_SYMBOL = /^[A-Z0-9.\-]{1,10}$/;

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get('tickers') ?? '';
    const symbols = Array.from(
      new Set(
        raw
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => VALID_SYMBOL.test(s)),
      ),
    ).slice(0, 30);

    if (symbols.length === 0) {
      return NextResponse.json({ success: true, count: 0, signals: [] });
    }

    const [rows, dipMap] = await Promise.all([
      prisma.ticker.findMany({
        where: { symbol: { in: symbols } },
        select: {
          symbol: true,
          name: true,
          lastPrice: true,
          lastChangePct: true,
          latestMoversZScore: true,
          analysisCache: {
            select: {
              rsi14: true,
              sma200Pct: true,
            },
          },
        },
      }),
      mGetJsonMap<{ data?: { semaphore?: { status?: string; label?: string } } }>(
        symbols.map((s) => `dip:item:v3:${s}`),
      ).catch(() => new Map()),
    ]);

    const signals: FavoriteSignalItem[] = [];

    for (const r of rows) {
      const rsi = r.analysisCache?.rsi14 ?? null;
      const chg = r.lastChangePct ?? null;
      const z = r.latestMoversZScore ?? null;
      const dipEntry = dipMap.get(`dip:item:v3:${r.symbol}`);
      const dipStatus = dipEntry?.data?.semaphore?.status ?? null;

      if (dipStatus === 'BUY_TRANCHE_1') {
        signals.push({
          symbol: r.symbol,
          name: r.name ?? null,
          price: r.lastPrice ?? null,
          changePct: chg,
          rsi14: rsi,
          zScore: z,
          type: 'dip_buy',
          label: 'Buy Tranche 1',
          tone: 'emerald',
        });
        continue;
      }

      if (rsi != null && rsi <= 32) {
        signals.push({
          symbol: r.symbol,
          name: r.name ?? null,
          price: r.lastPrice ?? null,
          changePct: chg,
          rsi14: rsi,
          zScore: z,
          type: 'oversold',
          label: `RSI ${Math.round(rsi)} Oversold`,
          tone: 'emerald',
        });
        continue;
      }

      if ((chg != null && Math.abs(chg) >= 4) || (z != null && Math.abs(z) >= 2.0)) {
        const chgStr = chg != null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%` : '';
        const zStr = z != null && Math.abs(z) >= 1.8 ? ` (${z >= 0 ? '+' : ''}${z.toFixed(1)}σ)` : '';
        signals.push({
          symbol: r.symbol,
          name: r.name ?? null,
          price: r.lastPrice ?? null,
          changePct: chg,
          rsi14: rsi,
          zScore: z,
          type: 'unusual_move',
          label: `${chgStr}${zStr}`.trim() || 'Unusual Move',
          tone: chg != null && chg < 0 ? 'rose' : 'blue',
        });
        continue;
      }

      if (rsi != null && rsi >= 72) {
        signals.push({
          symbol: r.symbol,
          name: r.name ?? null,
          price: r.lastPrice ?? null,
          changePct: chg,
          rsi14: rsi,
          zScore: z,
          type: 'overbought',
          label: `RSI ${Math.round(rsi)} Overbought`,
          tone: 'amber',
        });
      }
    }

    // Order: dip_buy & oversold first, then largest absolute move
    const priority: Record<FavoriteSignalType, number> = {
      dip_buy: 0,
      oversold: 1,
      unusual_move: 2,
      overbought: 3,
    };
    signals.sort((a, b) => {
      if (priority[a.type] !== priority[b.type]) return priority[a.type] - priority[b.type];
      return Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);
    });

    return NextResponse.json(
      {
        success: true,
        count: signals.length,
        signals,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      },
    );
  } catch (error) {
    console.error('Error in /api/favorites/signals:', error);
    return NextResponse.json({ success: false, count: 0, signals: [] }, { status: 500 });
  }
}
