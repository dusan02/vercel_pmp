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

  const upper = q.toUpperCase();
  const selectFields = {
    symbol: true,
    name: true,
    lastPrice: true,
    lastChangePct: true,
    assetType: true,
    lastMarketCap: true,
    tier: true,
  } as const;

  const [symbolPrefixRows, broaderRows] = await Promise.all([
    prisma.ticker.findMany({
      where: {
        symbol: { startsWith: upper },
      },
      orderBy: [{ tier: 'asc' }, { lastMarketCap: 'desc' }],
      take: 12,
      select: selectFields,
    }),
    prisma.ticker.findMany({
      where: {
        NOT: { symbol: { startsWith: upper } },
        OR: [
          { symbol: { contains: upper } },
          { name: { contains: q } },
        ],
      },
      orderBy: [{ tier: 'asc' }, { lastMarketCap: 'desc' }],
      take: 12,
      select: selectFields,
    }),
  ]);

  const combined = [...symbolPrefixRows, ...broaderRows];
  const lowerQ = q.toLowerCase();

  // Rank:
  // 0 = exact symbol match (e.g. "F", "ON", "SO", "CAT")
  // 1 = symbol prefix match (e.g. "SOFI", "SOXL", "FDX")
  // 2 = company name starts with query
  // 3 = symbol contains query
  // 4 = company name contains query
  const ranked = combined
    .map((r) => {
      const nameLower = (r.name ?? '').toLowerCase();
      const rank =
        r.symbol === upper
          ? 0
          : r.symbol.startsWith(upper)
            ? 1
            : nameLower.startsWith(lowerQ)
              ? 2
              : r.symbol.includes(upper)
                ? 3
                : 4;
      return { ...r, _rank: rank };
    })
    .sort((a, b) => {
      if (a._rank !== b._rank) return a._rank - b._rank;
      const tierDiff = (a.tier ?? 3) - (b.tier ?? 3);
      if (tierDiff !== 0) return tierDiff;
      return (b.lastMarketCap ?? 0) - (a.lastMarketCap ?? 0);
    })
    .slice(0, 8)
    .map(({ symbol, name, lastPrice, lastChangePct, assetType }) => ({
      symbol,
      name,
      lastPrice,
      lastChangePct,
      assetType,
    }));

  return NextResponse.json(
    { data: ranked },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
