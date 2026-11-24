import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { readSearchIndexSqlite, type ReadonlySearchTickerRow } from '@/lib/db/readonlySqlite';

interface SearchEntry {
  symbol: string;
  symbolUpper: string;
  name: string | null;
  nameLower: string;
  lastPrice: number | null;
  lastChangePct: number | null;
  assetType: string | null;
  lastMarketCap: number;
  tier: number;
}

const INDEX_TTL_MS = 5 * 60 * 1000;
let cachedIndex: { builtAt: number; entries: SearchEntry[] } | null = null;
let inflightLoad: Promise<SearchEntry[]> | null = null;

function toEntries(rows: ReadonlySearchTickerRow[]): SearchEntry[] {
  return rows.map((r) => ({
    symbol: r.symbol,
    symbolUpper: r.symbol.toUpperCase(),
    name: r.name,
    nameLower: (r.name ?? '').toLowerCase(),
    lastPrice: r.lastPrice,
    lastChangePct: r.lastChangePct,
    assetType: r.assetType,
    lastMarketCap: r.lastMarketCap ?? 0,
    tier: r.tier ?? 3,
  }));
}

async function loadSearchIndex(): Promise<SearchEntry[]> {
  if (!inflightLoad) {
    inflightLoad = (async () => {
      const sqliteRes = readSearchIndexSqlite();
      if (sqliteRes.ok) {
        const entries = toEntries(sqliteRes.data);
        cachedIndex = { builtAt: Date.now(), entries };
        return entries;
      }
      const rows = await prisma.ticker.findMany({
        select: {
          symbol: true,
          name: true,
          lastPrice: true,
          lastChangePct: true,
          assetType: true,
          lastMarketCap: true,
          tier: true,
        },
      });
      const entries = toEntries(rows);
      cachedIndex = { builtAt: Date.now(), entries };
      return entries;
    })().finally(() => {
      inflightLoad = null;
    });
  }
  return inflightLoad;
}

async function getSearchIndex(): Promise<SearchEntry[]> {
  if (cachedIndex && Date.now() - cachedIndex.builtAt < INDEX_TTL_MS) {
    return cachedIndex.entries;
  }
  if (cachedIndex) {
    // Stale-while-revalidate: serve immediately, refresh in background
    void loadSearchIndex().catch(() => {});
    return cachedIndex.entries;
  }
  return loadSearchIndex();
}

/**
 * Lightweight ticker autocomplete: GET /api/stocks/search?q=app
 * Uses an in-memory 5-min index read via WAL read-only SQLite (bypassing
 * Prisma's connection_limit=1 queue) so autocomplete stays <5ms under load.
 */
export async function GET(request: NextRequest) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length < 1 || q.length > 40) {
    return NextResponse.json({ data: [] });
  }

  const entries = await getSearchIndex();
  const upper = q.toUpperCase();
  const lower = q.toLowerCase();

  // Rank:
  // 0 = exact symbol match (e.g. "F", "ON", "SO", "CAT")
  // 1 = symbol prefix match (e.g. "SOFI", "SOXL", "FDX")
  // 2 = company name starts with query
  // 3 = symbol contains query
  // 4 = company name contains query
  const matches: Array<SearchEntry & { _rank: number }> = [];
  for (const e of entries) {
    let rank = -1;
    if (e.symbolUpper === upper) rank = 0;
    else if (e.symbolUpper.startsWith(upper)) rank = 1;
    else if (e.nameLower.startsWith(lower)) rank = 2;
    else if (e.symbolUpper.includes(upper)) rank = 3;
    else if (e.nameLower.includes(lower)) rank = 4;
    if (rank >= 0) matches.push({ ...e, _rank: rank });
  }

  matches.sort((a, b) => {
    if (a._rank !== b._rank) return a._rank - b._rank;
    const tierDiff = a.tier - b.tier;
    if (tierDiff !== 0) return tierDiff;
    return b.lastMarketCap - a.lastMarketCap;
  });

  const ranked = matches.slice(0, 8).map(({ symbol, name, lastPrice, lastChangePct, assetType }) => ({
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
