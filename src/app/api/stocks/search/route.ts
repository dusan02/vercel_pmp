import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * Lightweight ticker autocomplete: GET /api/stocks/search?q=app
 * Matches symbol prefix first, then company name substring (SQLite LIKE is
 * case-insensitive for ASCII). Sorted by market cap so liquid names win.
 */
export async function GET(request: NextRequest) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length < 1 || q.length > 40) {
    return NextResponse.json({ data: [] });
  }

  const rows = await prisma.ticker.findMany({
    where: {
      OR: [
        { symbol: { startsWith: q.toUpperCase() } },
        { symbol: { contains: q.toUpperCase() } },
        { name: { contains: q } },
      ],
    },
    orderBy: { lastMarketCap: 'desc' },
    take: 12,
    select: { symbol: true, name: true, lastChangePct: true },
  });

  // Prefer symbol-prefix hits over name hits, then market cap
  const upper = q.toUpperCase();
  const ranked = rows
    .map(r => ({
      ...r,
      _rank: r.symbol.startsWith(upper) ? 0 : r.symbol.includes(upper) ? 1 : 2,
    }))
    .sort((a, b) => a._rank - b._rank) // stable — keeps market-cap order within a rank
    .slice(0, 8)
    .map(({ symbol, name, lastChangePct }) => ({ symbol, name, lastChangePct }));

  return NextResponse.json(
    { data: ranked },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
